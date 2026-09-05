/**
 * mintApiKey.test.js — the host-side script that gives each backend its own key.
 *
 * Routing and usage attribution now key on the caller's credential, which only
 * works if every backend holds a key of its own. The script that mints them
 * touches two things that are unpleasant to get wrong:
 *
 *   1. **An env file it did not write.** It has to add one line to a file full
 *      of other people's secrets without disturbing them, and must refuse to
 *      overwrite a value that is already there — clobbering a live key breaks
 *      a running app in a way that looks like an aiGeek outage. Rotation is a
 *      deliberate act (`--replace`), not a default.
 *   2. **The APIKey document.** It must come out the same shape POST
 *      /api/api-keys produces, or the auth middleware won't recognize it.
 *
 * Both are exercised here against a temp file and in-memory Mongo. Nothing in
 * this file reads or writes a real `.env*`, and no key value is ever printed —
 * assertions are on shape and prefix, never on the secret.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { default: mongoose } = await import('mongoose');
const { User, userGeekConn } = await import('../models/user.js');
const { default: APIKey } = await import('../models/APIKey.js');
const {
  upsertEnvVar,
  writeEnvVar,
  mintApiKey,
  resolveOwner,
  parseArgs,
  parseRateLimit,
  normalizeAppArg,
  validatePermissions,
  DEFAULT_PERMISSIONS,
} = await import('../../scripts/mint-api-key.js');

let tmpDir;

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mint-api-key-test-'));
}, 60000);

afterEach(async () => {
  await User.deleteMany({});
  await APIKey.deleteMany({});
});

afterAll(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ────────────────────────────── argument parsing ────────────────────────────

describe('parseArgs', () => {
  it('reads the documented invocation', () => {
    const opts = parseArgs([
      '--app', 'storygeek',
      '--name', 'storygeek backend',
      '--permissions', 'ai:call,ai:director',
      '--write-env', '../../../storygeek/.env.production',
      '--var', 'AI_GEEK_API_KEY',
    ]);
    expect(opts).toMatchObject({
      app: 'storygeek',
      name: 'storygeek backend',
      permissions: ['ai:call', 'ai:director'],
      writeEnv: '../../../storygeek/.env.production',
      varName: 'AI_GEEK_API_KEY',
      replace: false,
    });
  });

  it('defaults the permissions and the env var name', () => {
    const opts = parseArgs(['--app', 'notegeek', '--name', 'n']);
    expect(opts.permissions).toEqual(DEFAULT_PERMISSIONS);
    expect(opts.varName).toBe('AI_GEEK_API_KEY');
  });

  it('refuses an option it does not know rather than ignoring it', () => {
    expect(() => parseArgs(['--aap', 'storygeek'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['--app'])).toThrow(/requires a value/);
  });

  it('parses a 1-3 part rate limit and rejects nonsense', () => {
    expect(parseRateLimit('120')).toEqual({ requestsPerMinute: 120 });
    expect(parseRateLimit('120,4000,40000')).toEqual({
      requestsPerMinute: 120, requestsPerHour: 4000, requestsPerDay: 40000,
    });
    expect(() => parseRateLimit('0')).toThrow(/Invalid --rate-limit/);
    expect(() => parseRateLimit('fast')).toThrow(/Invalid --rate-limit/);
  });
});

describe('normalizeAppArg', () => {
  it('normalizes to the one spelling routing uses', () => {
    expect(normalizeAppArg('StoryGeek')).toBe('storygeek');
  });

  it('refuses a :feature suffix instead of minting a key that loses it', () => {
    // A key's appName is stripped at the colon by the resolver, so a key minted
    // for "fitnessGeek:mealPlan" would silently be a fitnessgeek key. Say so.
    expect(() => normalizeAppArg('fitnessGeek:mealPlan'))
      .toThrow(/mint it for "fitnessGeek"/);
  });

  it('refuses characters the API-key route would also refuse', () => {
    expect(() => normalizeAppArg('story geek')).toThrow(/letters, numbers/);
    expect(() => normalizeAppArg('')).toThrow(/--app is required/);
  });
});

describe('validatePermissions', () => {
  it('accepts the model\'s enum and rejects anything else', () => {
    expect(validatePermissions(['ai:call', 'ai:director'])).toEqual(['ai:call', 'ai:director']);
    expect(() => validatePermissions(['ai:everything'])).toThrow(/Invalid permission/);
    expect(() => validatePermissions([])).toThrow(/at least one/);
  });
});

// ───────────────────────────── env file upsert ──────────────────────────────

describe('upsertEnvVar', () => {
  it('creates the line in an empty file', () => {
    const { contents, action } = upsertEnvVar('', 'AI_GEEK_API_KEY', 'bg_value');
    expect(contents).toBe('AI_GEEK_API_KEY=bg_value\n');
    expect(action).toBe('created');
  });

  it('appends without disturbing a line of the existing file', () => {
    const before = '# storygeek\nMONGODB_URI=mongodb://x\nJWT_SECRET=abc\n';
    const { contents, action } = upsertEnvVar(before, 'AI_GEEK_API_KEY', 'bg_value');
    expect(contents).toBe(before + 'AI_GEEK_API_KEY=bg_value\n');
    expect(action).toBe('appended');
  });

  it('adds the missing final newline before appending', () => {
    const { contents } = upsertEnvVar('JWT_SECRET=abc', 'AI_GEEK_API_KEY', 'bg_value');
    expect(contents).toBe('JWT_SECRET=abc\nAI_GEEK_API_KEY=bg_value\n');
  });

  it('fills in an empty placeholder — that is not a secret', () => {
    const { contents, action } = upsertEnvVar(
      'JWT_SECRET=abc\nAI_GEEK_API_KEY=\n', 'AI_GEEK_API_KEY', 'bg_value'
    );
    expect(contents).toBe('JWT_SECRET=abc\nAI_GEEK_API_KEY=bg_value\n');
    expect(action).toBe('filled');
  });

  it('REFUSES to overwrite an existing value', () => {
    expect(() => upsertEnvVar(
      'AI_GEEK_API_KEY=bg_already_there\n', 'AI_GEEK_API_KEY', 'bg_new'
    )).toThrow(/refusing to overwrite/);
  });

  it('overwrites only when told to, and only that line', () => {
    const { contents, action } = upsertEnvVar(
      '# c\nAI_GEEK_API_KEY=bg_old\nJWT_SECRET=abc\n',
      'AI_GEEK_API_KEY', 'bg_new', { replace: true }
    );
    expect(contents).toBe('# c\nAI_GEEK_API_KEY=bg_new\nJWT_SECRET=abc\n');
    expect(action).toBe('replaced');
  });

  it('preserves an export prefix', () => {
    const { contents } = upsertEnvVar(
      'export AI_GEEK_API_KEY=\n', 'AI_GEEK_API_KEY', 'bg_value'
    );
    expect(contents).toBe('export AI_GEEK_API_KEY=bg_value\n');
  });

  it('leaves a commented-out line commented and appends the real one', () => {
    // Uncommenting is how you resurrect a value someone deliberately retired.
    const before = '#AI_GEEK_API_KEY=bg_retired\n';
    const { contents, action } = upsertEnvVar(before, 'AI_GEEK_API_KEY', 'bg_new');
    expect(contents).toBe(before + 'AI_GEEK_API_KEY=bg_new\n');
    expect(action).toBe('appended');
  });

  it('does not match a variable that merely shares a prefix', () => {
    const before = 'AI_GEEK_API_KEY_OLD=bg_old\n';
    const { contents } = upsertEnvVar(before, 'AI_GEEK_API_KEY', 'bg_new');
    expect(contents).toBe(before + 'AI_GEEK_API_KEY=bg_new\n');
  });

  it('rejects a var name that is not one', () => {
    expect(() => upsertEnvVar('', 'not a var', 'x')).toThrow(/Invalid env var name/);
  });
});

describe('writeEnvVar', () => {
  it('writes the file at mode 600', () => {
    const target = path.join(tmpDir, 'new.env');
    const result = writeEnvVar(target, 'AI_GEEK_API_KEY', 'bg_value');

    expect(result.action).toBe('created');
    expect(fs.readFileSync(target, 'utf8')).toBe('AI_GEEK_API_KEY=bg_value\n');
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  });

  it('refuses to clobber a live value and leaves the file untouched', () => {
    const target = path.join(tmpDir, 'existing.env');
    const before = 'AI_GEEK_API_KEY=bg_live\nOTHER=1\n';
    fs.writeFileSync(target, before);

    expect(() => writeEnvVar(target, 'AI_GEEK_API_KEY', 'bg_new'))
      .toThrow(/refusing to overwrite/);
    expect(fs.readFileSync(target, 'utf8')).toBe(before);

    const result = writeEnvVar(target, 'AI_GEEK_API_KEY', 'bg_new', { replace: true });
    expect(result.action).toBe('replaced');
    expect(fs.readFileSync(target, 'utf8')).toBe('AI_GEEK_API_KEY=bg_new\nOTHER=1\n');
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  });
});

// ───────────────────────────── document creation ────────────────────────────

describe('resolveOwner', () => {
  it('accepts a username or an email', async () => {
    const user = await User.create({
      username: 'chef', email: 'chef@example.com', passwordHash: 'x',
    });
    expect((await resolveOwner('chef', { User })).id).toBe(user._id.toString());
    expect((await resolveOwner('chef@example.com', { User })).id).toBe(user._id.toString());
  });

  it('defaults to an admin, and says so when there is none', async () => {
    await User.create({ username: 'plain', passwordHash: 'x' });
    await expect(resolveOwner(null, { User })).rejects.toThrow(/No admin user found/);

    const admin = await User.create({ username: 'boss', passwordHash: 'x', role: 'admin' });
    expect((await resolveOwner(null, { User })).id).toBe(admin._id.toString());
  });

  it('refuses to invent a user that does not exist', async () => {
    await expect(resolveOwner('nobody', { User })).rejects.toThrow(/No user found/);
  });
});

describe('mintApiKey', () => {
  it('creates a key the auth middleware can recognize', async () => {
    const owner = await User.create({ username: 'boss', passwordHash: 'x', role: 'admin' });

    const result = await mintApiKey({
      app: 'StoryGeek',
      name: 'storygeek backend',
      permissions: ['ai:call', 'ai:director'],
      ownerId: owner._id.toString(),
    }, { APIKey });

    // Shape only — the secret itself is never asserted on or logged.
    expect(result.apiKey.startsWith('bg_')).toBe(true);
    expect(result.apiKey).toHaveLength(67);
    expect(result.appName).toBe('storygeek');
    expect(result.permissions).toEqual(['ai:call', 'ai:director']);

    // The stored document holds a hash, never the key.
    const doc = await APIKey.findOne({ keyId: result.keyId });
    expect(doc.keyHash).toBe(APIKey.hashAPIKey(result.apiKey));
    expect(doc.keyPrefix).toBe(result.apiKey.slice(0, 11));
    expect(doc.isActive).toBe(true);
    expect(doc.createdBy).toBe(owner._id.toString());
    expect(JSON.stringify(doc.toObject())).not.toContain(result.apiKey);
  });

  it('applies the documented rate-limit defaults', async () => {
    const owner = await User.create({ username: 'boss', passwordHash: 'x', role: 'admin' });
    const result = await mintApiKey({
      app: 'fitnessgeek', name: 'fitnessgeek backend', ownerId: owner._id.toString(),
    }, { APIKey });

    expect(result.permissions).toEqual(DEFAULT_PERMISSIONS);
    expect(result.rateLimit.requestsPerMinute).toBe(60);
    expect(result.rateLimit.requestsPerHour).toBe(1000);
    expect(result.rateLimit.requestsPerDay).toBe(10000);
  });

  it('honours an explicit rate limit', async () => {
    const owner = await User.create({ username: 'boss', passwordHash: 'x', role: 'admin' });
    const result = await mintApiKey({
      app: 'fitnessgeek',
      name: 'fitnessgeek backend',
      rateLimit: parseRateLimit('120,4000,40000'),
      ownerId: owner._id.toString(),
    }, { APIKey });

    expect(result.rateLimit.requestsPerMinute).toBe(120);
    expect(result.rateLimit.requestsPerDay).toBe(40000);
  });

  it('mints a distinct key each time', async () => {
    const owner = await User.create({ username: 'boss', passwordHash: 'x', role: 'admin' });
    const a = await mintApiKey({ app: 'storygeek', name: 'a', ownerId: owner._id.toString() }, { APIKey });
    const b = await mintApiKey({ app: 'storygeek', name: 'b', ownerId: owner._id.toString() }, { APIKey });
    expect(a.apiKey).not.toBe(b.apiKey);
    expect(a.keyId).not.toBe(b.keyId);
  });

  it('refuses without a name or an owner', async () => {
    await expect(mintApiKey({ app: 'storygeek', ownerId: 'x' }, { APIKey }))
      .rejects.toThrow(/--name is required/);
    await expect(mintApiKey({ app: 'storygeek', name: 'n' }, { APIKey }))
      .rejects.toThrow(/owner is required/);
  });
});
