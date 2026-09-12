#!/usr/bin/env node
/**
 * mint-api-key.js — mint a baseGeek service key for one backend.
 *
 * Routing and usage attribution in aiGeek are keyed by the caller's
 * credential, not by a body field (see src/services/callerIdentity.js). That
 * only works if every backend that calls aiGeek holds its own key, so this is
 * the host-side way to create one and drop it straight into that app's env
 * file — the raw key is shown once at creation and never again, and copying it
 * through a terminal, a clipboard and an editor is three chances to leak it.
 *
 * Usage
 * -----
 *   node scripts/mint-api-key.js \
 *     --app storygeek \
 *     --name "storygeek backend" \
 *     --permissions ai:call,ai:director \
 *     --write-env ../../../storygeek/.env.production \
 *     --var AI_GEEK_API_KEY
 *
 *   Options:
 *     --app <id>            app the key belongs to (required). This is the id
 *                           routing and usage group on; it is normalized to
 *                           lowercase, and a `:feature` suffix is refused —
 *                           features are per-call, not per-key.
 *     --name <text>         human label for the key (required)
 *     --description <text>  optional note stored on the key
 *     --permissions a,b     default: ai:call,ai:models,ai:providers,ai:usage,ai:stats
 *     --rate-limit <spec>   per-minute[,per-hour[,per-day]] — e.g. 120,4000,40000
 *     --owner <username>    userGeek username or email to attribute the key to;
 *                           default: the first admin
 *     --expires <ISO date>  optional expiry
 *     --write-env <path>    env file to write VAR=key into (relative to CWD)
 *     --var <NAME>          env var name, default AI_GEEK_API_KEY
 *     --replace             allow overwriting an existing value for that var
 *     --dry-run             validate and report, mint nothing
 *
 * Who may run this
 * ----------------
 * Anyone with shell access to the box and read access to
 * `apps/basegeek/.env.production` — which is a strictly stronger credential
 * than any admin session, so this script deliberately does **not** reproduce
 * the HTTP mint gate. `POST /api/api-keys` requires the caller to be an admin,
 * or to already hold an active key for an app in VALID_APPS (Q62, 2026-09-06,
 * see DOCS/API_KEYS.md); this script mints for any app name that passes
 * `normalizeAppArg`, which is how an app gets its *first* key.
 *
 * Env
 * ---
 * Connection strings are read from `apps/basegeek/.env.production` via dotenv
 * (AIGEEK_MONGODB_URI for the key, USERGEEK_MONGODB_URI for the owner lookup).
 * They are never printed.
 *
 * Output
 * ------
 * keyId, keyPrefix, appName, permissions, and the env path written. The raw
 * key goes to stdout ONLY when --write-env was not given, with a warning.
 *
 * Everything below the CLI block is pure or model-injectable so it can be
 * tested against in-memory Mongo — see src/__tests__/mintApiKey.test.js.
 */

import fs from 'fs';
import path from 'path';

/* ───────────────────────────── argument parsing ─────────────────────────── */

const FLAGS = new Set(['--replace', '--dry-run', '--help', '-h']);

// Kept in step with models/APIKey.js's DEFAULT_KEY_PERMISSIONS — the schema,
// routes/apiKeys.js and the GraphQL resolver all read that constant, but this
// script must not import a Mongoose model to know what it is minting, so the
// one deliberate copy lives here. `ai:usage` joined 2026-09-06 (Q49),
// `ai:stats` 2026-09-11 (a StartGeek glance card reads /api/ai/status).
export const DEFAULT_PERMISSIONS = ['ai:call', 'ai:models', 'ai:providers', 'ai:usage', 'ai:stats'];
export const VALID_PERMISSIONS = [
  'ai:call', 'ai:models', 'ai:providers', 'ai:stats', 'ai:director', 'ai:usage'
];

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {object} parsed options
 */
export function parseArgs(argv) {
  const opts = {
    permissions: [...DEFAULT_PERMISSIONS],
    varName: 'AI_GEEK_API_KEY',
    replace: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} requires a value`);
      return v;
    };

    switch (arg) {
      case '--app': opts.app = next(); break;
      case '--name': opts.name = next(); break;
      case '--description': opts.description = next(); break;
      case '--permissions': opts.permissions = splitList(next()); break;
      case '--rate-limit': opts.rateLimit = parseRateLimit(next()); break;
      case '--owner': opts.owner = next(); break;
      case '--expires': opts.expires = next(); break;
      case '--write-env': opts.writeEnv = next(); break;
      case '--var': opts.varName = next(); break;
      case '--replace': opts.replace = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--help':
      case '-h': opts.help = true; break;
      default:
        if (arg.startsWith('-') && !FLAGS.has(arg)) {
          throw new Error(`Unknown option: ${arg}`);
        }
        throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return opts;
}

function splitList(value) {
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * "60" | "60,1000" | "60,1000,10000" → { requestsPerMinute, ... }
 * @param {string} spec
 */
export function parseRateLimit(spec) {
  const parts = splitList(spec).map(Number);
  if (parts.length === 0 || parts.some(n => !Number.isInteger(n) || n < 1)) {
    throw new Error(`Invalid --rate-limit "${spec}" — expected 1-3 positive integers, e.g. 120,4000,40000`);
  }
  const [perMinute, perHour, perDay] = parts;
  const out = { requestsPerMinute: perMinute };
  if (perHour !== undefined) out.requestsPerHour = perHour;
  if (perDay !== undefined) out.requestsPerDay = perDay;
  return out;
}

/**
 * Validate the app id. A key belongs to one app; the `:feature` suffix is a
 * per-call thing (see callerIdentity.js) and a key that carried one would
 * simply have it stripped at auth time, so refuse it loudly instead.
 *
 * @param {string} value
 * @returns {string} normalized id
 */
export function normalizeAppArg(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('--app is required');
  if (raw.includes(':')) {
    throw new Error(
      `--app "${raw}" carries a ":" suffix. A key belongs to an app, not a feature — ` +
      `mint it for "${raw.split(':')[0]}" and send { feature: "${raw.split(':').slice(1).join(':')}" } per call.`
    );
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(raw)) {
    throw new Error(`--app "${raw}" may contain only letters, numbers, hyphens and underscores`);
  }
  return raw.toLowerCase();
}

/**
 * @param {string[]} permissions
 */
export function validatePermissions(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new Error('--permissions must name at least one permission');
  }
  const bad = permissions.filter(p => !VALID_PERMISSIONS.includes(p));
  if (bad.length) {
    throw new Error(
      `Invalid permission(s): ${bad.join(', ')}. Valid: ${VALID_PERMISSIONS.join(', ')}`
    );
  }
  return permissions;
}

/* ───────────────────────────── env file upsert ──────────────────────────── */

/**
 * Upsert `VAR=value` into env-file text.
 *
 * Rules, in the order they bite:
 *   - An existing NON-EMPTY value is refused unless `replace` — rotating a
 *     live key is a deliberate act, and clobbering one silently breaks a
 *     running app in a way that looks like an aiGeek outage.
 *   - An existing EMPTY value (`VAR=`) is filled in; that is a placeholder,
 *     not a secret.
 *   - Every other line is preserved byte for byte, comments included.
 *   - A commented-out `#VAR=...` is left alone and the real line appended;
 *     guessing that a comment meant to be uncommented is how you resurrect a
 *     value someone deliberately retired.
 *
 * @param {string} contents  current file text ('' for a new file)
 * @param {string} varName
 * @param {string} value
 * @param {{replace?: boolean}} [opts]
 * @returns {{contents: string, action: 'created'|'filled'|'replaced'|'appended'}}
 */
export function upsertEnvVar(contents, varName, value, { replace = false } = {}) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) {
    throw new Error(`Invalid env var name "${varName}"`);
  }

  const text = contents ?? '';
  const lines = text.length ? text.split('\n') : [];
  const pattern = new RegExp(`^(\\s*(?:export\\s+)?)${varName}\\s*=(.*)$`);

  let index = -1;
  let existingValue = '';
  let prefix = '';
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(pattern);
    if (m) {
      index = i;
      prefix = m[1];
      existingValue = m[2].trim();
      break;
    }
  }

  if (index === -1) {
    const needsNewline = text.length > 0 && !text.endsWith('\n');
    const body = text.length === 0
      ? `${varName}=${value}\n`
      : `${text}${needsNewline ? '\n' : ''}${varName}=${value}\n`;
    return { contents: body, action: text.length === 0 ? 'created' : 'appended' };
  }

  if (existingValue && !replace) {
    throw new Error(
      `${varName} already has a value — refusing to overwrite. ` +
      `Pass --replace to rotate it (the old key keeps working until you revoke it).`
    );
  }

  lines[index] = `${prefix}${varName}=${value}`;
  let out = lines.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  return { contents: out, action: existingValue ? 'replaced' : 'filled' };
}

/**
 * Read → upsert → write, at mode 600.
 *
 * @param {string} filePath
 * @param {string} varName
 * @param {string} value
 * @param {{replace?: boolean, fsImpl?: typeof fs}} [opts]
 * @returns {{path: string, action: string}}
 */
export function writeEnvVar(filePath, varName, value, { replace = false, fsImpl = fs } = {}) {
  const resolved = path.resolve(filePath);

  let current = '';
  try {
    current = fsImpl.readFileSync(resolved, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const { contents, action } = upsertEnvVar(current, varName, value, { replace });
  fsImpl.writeFileSync(resolved, contents, { encoding: 'utf8', mode: 0o600 });
  // writeFileSync's mode applies only on create; chmod covers an existing file.
  try { fsImpl.chmodSync(resolved, 0o600); } catch { /* best effort */ }

  return { path: resolved, action };
}

/* ────────────────────────────── key creation ────────────────────────────── */

/**
 * Resolve the owner (`createdBy`) for the key.
 *
 * Keys carry an owner because the identity resolver falls back to it when a
 * service key calls without naming a user, and because a key with no human
 * behind it is a key nobody rotates.
 *
 * @param {string|null} username  username or email; null → first admin
 * @param {{User: import('mongoose').Model}} deps
 * @returns {Promise<{id: string, username: string}>}
 */
export async function resolveOwner(username, { User }) {
  if (username) {
    const user = await User.findOne({ $or: [{ username }, { email: username }] })
      .select('_id username').lean();
    if (!user) throw new Error(`No user found with username or email "${username}"`);
    return { id: String(user._id), username: user.username };
  }

  const admin = await User.findOne({ role: 'admin' })
    .select('_id username').sort({ createdAt: 1 }).lean();
  if (!admin) {
    throw new Error('No admin user found — pass --owner <username> to name one explicitly');
  }
  return { id: String(admin._id), username: admin.username };
}

/**
 * Create the APIKey document — the same shape POST /api/api-keys creates.
 *
 * @param {object} spec
 * @param {{APIKey: import('mongoose').Model}} deps
 * @returns {Promise<{apiKey: string, keyId: string, keyPrefix: string, appName: string, permissions: string[]}>}
 */
export async function mintApiKey(spec, { APIKey }) {
  const appName = normalizeAppArg(spec.app);
  const name = String(spec.name ?? '').trim();
  if (!name) throw new Error('--name is required');
  const permissions = validatePermissions(spec.permissions ?? [...DEFAULT_PERMISSIONS]);
  const rateLimit = spec.rateLimit || {};

  if (!spec.ownerId) throw new Error('owner is required');

  const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();

  const doc = new APIKey({
    keyHash,
    keyPrefix,
    name,
    appName,
    description: spec.description ? String(spec.description).trim() : undefined,
    permissions,
    rateLimit: {
      requestsPerMinute: rateLimit.requestsPerMinute || 60,
      requestsPerHour: rateLimit.requestsPerHour || 1000,
      requestsPerDay: rateLimit.requestsPerDay || 10000
    },
    expiresAt: spec.expires ? new Date(spec.expires) : null,
    createdBy: spec.ownerId
  });

  await doc.save();

  return {
    apiKey,
    keyId: doc.keyId,
    keyPrefix: doc.keyPrefix,
    appName: doc.appName,
    permissions: doc.permissions.slice(),
    rateLimit: doc.rateLimit
  };
}

const HELP = `
mint-api-key.js — mint a baseGeek service key for one backend

  node scripts/mint-api-key.js --app <id> --name "<label>" [options]

  --app <id>            app the key belongs to (required, no ":" suffix)
  --name <text>         human label for the key (required)
  --description <text>  note stored on the key
  --permissions a,b     default: ${DEFAULT_PERMISSIONS.join(',')}
                        valid: ${VALID_PERMISSIONS.join(', ')}
  --rate-limit <spec>   perMinute[,perHour[,perDay]] (default 60,1000,10000)
  --owner <username>    userGeek username/email; default: first admin
  --expires <ISO date>  optional expiry
  --write-env <path>    env file to write the key into
  --var <NAME>          env var name (default AI_GEEK_API_KEY)
  --replace             allow overwriting an existing value
  --dry-run             validate and report, mint nothing

Example

  node scripts/mint-api-key.js \\
    --app storygeek --name "storygeek backend" \\
    --permissions ai:call,ai:director \\
    --write-env ../../../storygeek/.env.production --var AI_GEEK_API_KEY

Connection strings come from apps/basegeek/.env.production and are never printed.
Without --write-env the raw key is printed once; it cannot be recovered later.
`;

/* ─────────────────────────── CLI entrypoint ─────────────────────────────── */

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  let exitCode = 0;
  let closers = [];

  try {
    const opts = parseArgs(process.argv.slice(2));

    if (opts.help || (!opts.app && !opts.name)) {
      console.log(HELP);
      process.exit(opts.help ? 0 : 1);
    }

    const appName = normalizeAppArg(opts.app);
    validatePermissions(opts.permissions);
    if (!opts.name?.trim()) throw new Error('--name is required');

    if (opts.dryRun) {
      console.log(`dry run — would mint a key for app "${appName}"`);
      console.log(`  name:        ${opts.name}`);
      console.log(`  permissions: ${opts.permissions.join(', ')}`);
      if (opts.writeEnv) console.log(`  env target:  ${path.resolve(opts.writeEnv)} (${opts.varName})`);
      process.exit(0);
    }

    // dotenv first, then the models — both connections read their URI at
    // import time, so this order is load-bearing.
    const here = path.dirname(new URL(import.meta.url).pathname);
    const envPath = path.resolve(here, '../../../.env.production');
    const { default: dotenv } = await import('dotenv');
    const loaded = dotenv.config({ path: envPath });
    if (loaded.error) {
      throw new Error(`Could not read ${envPath} — run this on the baseGeek host`);
    }

    const { default: APIKey } = await import('../src/models/APIKey.js');
    const { User, userGeekConn } = await import('../src/models/user.js');
    const { getAIGeekConnection } = await import('../src/config/database.js');
    const aiGeekConn = getAIGeekConnection();
    closers = [userGeekConn, aiGeekConn];

    if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
    if (aiGeekConn.readyState === 0) await aiGeekConn.asPromise();

    const owner = await resolveOwner(opts.owner || null, { User });

    const result = await mintApiKey({
      app: appName,
      name: opts.name,
      description: opts.description,
      permissions: opts.permissions,
      rateLimit: opts.rateLimit,
      expires: opts.expires,
      ownerId: owner.id,
    }, { APIKey });

    console.log(`minted key for ${result.appName}`);
    console.log(`  keyId:       ${result.keyId}`);
    console.log(`  keyPrefix:   ${result.keyPrefix}`);
    console.log(`  appName:     ${result.appName}`);
    console.log(`  permissions: ${result.permissions.join(', ')}`);
    console.log(`  owner:       ${owner.username}`);

    if (opts.writeEnv) {
      const written = writeEnvVar(opts.writeEnv, opts.varName, result.apiKey, {
        replace: opts.replace,
      });
      console.log(`  env:         ${written.path} (${opts.varName} ${written.action}, mode 600)`);
      console.log('\nThe key was written to that file and is NOT printed here. Restart the app to pick it up.');
    } else {
      console.log(`\n  ${opts.varName}=${result.apiKey}\n`);
      console.log('WARNING: that is the only time this key is shown. It is now in your');
      console.log('terminal scrollback and shell history — prefer --write-env next time.');
    }
  } catch (err) {
    console.error(`mint-api-key failed: ${err.message}`);
    exitCode = 1;
  } finally {
    for (const conn of closers) {
      await conn?.close?.().catch(() => {});
    }
    process.exitCode = exitCode;
  }
}
