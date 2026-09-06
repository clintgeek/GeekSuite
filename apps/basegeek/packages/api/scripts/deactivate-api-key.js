#!/usr/bin/env node
/**
 * deactivate-api-key — retire an aiGeek API key by name (or keyId) without
 * deleting its row, so usage history and audit stay intact.
 *
 *   node scripts/deactivate-api-key.js --name LocalApps
 *   node scripts/deactivate-api-key.js --key-id <id>
 *   node scripts/deactivate-api-key.js --name LocalApps --dry-run
 *
 * Connection strings come from apps/basegeek/.env.production via dotenv and are
 * never printed. Output is the key's name, prefix, app and lastUsed only.
 */
import path from 'node:path';

function parseArgs(argv) {
  const o = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name') o.name = argv[++i];
    else if (a === '--key-id') o.keyId = argv[++i];
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

export async function deactivateApiKey({ name, keyId }, { APIKey }) {
  const filter = keyId ? { keyId } : { name };
  const keys = await APIKey.find(filter);
  if (keys.length === 0) throw new Error(`no key matches ${JSON.stringify(filter)}`);
  if (keys.length > 1) throw new Error(`${keys.length} keys match ${JSON.stringify(filter)} — use --key-id`);
  const key = keys[0];
  const wasActive = key.isActive;
  key.isActive = false;
  await key.save();
  return { keyId: key.keyId, name: key.name, keyPrefix: key.keyPrefix, appName: key.appName, lastUsed: key.lastUsed, wasActive };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let closers = [];
  let exitCode = 0;
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help || (!opts.name && !opts.keyId)) {
      console.log('usage: deactivate-api-key.js (--name <name> | --key-id <id>) [--dry-run]');
      process.exit(opts.help ? 0 : 1);
    }
    const here = path.dirname(new URL(import.meta.url).pathname);
    const envPath = path.resolve(here, '../../../.env.production');
    const { default: dotenv } = await import('dotenv');
    const loaded = dotenv.config({ path: envPath });
    if (loaded.error) throw new Error(`Could not read ${envPath} — run this on the baseGeek host`);

    const { default: APIKey } = await import('../src/models/APIKey.js');
    const { getAIGeekConnection } = await import('../src/config/database.js');
    const aiGeekConn = getAIGeekConnection();
    closers = [aiGeekConn];
    if (aiGeekConn.readyState === 0) await aiGeekConn.asPromise();

    if (opts.dryRun) {
      const filter = opts.keyId ? { keyId: opts.keyId } : { name: opts.name };
      const keys = await APIKey.find(filter).select('keyId name keyPrefix appName isActive lastUsed');
      for (const k of keys) console.log(`would deactivate ${k.name} (${k.keyPrefix}…) app=${k.appName} active=${k.isActive} lastUsed=${k.lastUsed?.toISOString?.() || 'never'}`);
      if (!keys.length) console.log('no match');
    } else {
      const r = await deactivateApiKey(opts, { APIKey });
      console.log(`deactivated ${r.name} (${r.keyPrefix}…) app=${r.appName} wasActive=${r.wasActive} lastUsed=${r.lastUsed?.toISOString?.() || 'never'}`);
    }
  } catch (err) {
    console.error(err.message);
    exitCode = 1;
  } finally {
    for (const c of closers) { try { await c.close(); } catch { /* ignore */ } }
    process.exit(exitCode);
  }
}
