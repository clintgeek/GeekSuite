/**
 * `npm run set-paywalls [-- --dry-run]` — sets `access.paywall` on the five
 * starter sources whose paywall was confirmed on 2026-10-10
 * (src/seed/data.js PAYWALL_BY_SLUG), in an existing database. Touches that
 * one field on those slugs and nothing else; safe to run twice.
 *
 * In production, inside the running container (MONGODB_URI from its env):
 *
 *   docker exec newsgeek node scripts/set-paywalls.js --dry-run
 *   docker exec newsgeek node scripts/set-paywalls.js
 *
 * Prints slug → old → new; never the connection string.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

const { setPaywalls } = await import('../src/seed/setPaywalls.js');
const { default: Source } = await import('../src/models/Source.js');

const dryRun = process.argv.includes('--dry-run');

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGODB_URI);
  const rows = await setPaywalls({ Source, dryRun });
  for (const r of rows) console.log(`${r.slug}: ${r.from ?? '(no such source)'} → ${r.to}  [${r.action}]`);
  if (dryRun) console.log('dry run: nothing written');
} catch (err) {
  console.error(`set-paywalls failed: ${err?.name || 'Error'}${err?.code ? ` (${err.code})` : ''}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
