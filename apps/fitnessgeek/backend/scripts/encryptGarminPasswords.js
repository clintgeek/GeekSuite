#!/usr/bin/env node
/**
 * encryptGarminPasswords.js — one-time backfill for DOCS/SUITE_TODO.md #20 step 2.
 *
 * Encrypts every legacy plaintext `garmin.password` in the `usersettings`
 * collection with `@geeksuite/crypto-vault` (AES-256-GCM, `KEY_VAULT_SECRET`,
 * packed as `v1:{iv}:{tag}:{ciphertext}`).
 *
 * New writes are already encrypted by the schema hooks in
 * `@geeksuite/schemas/fitnessgeek/userSettings` — this only catches documents
 * written before that landed.
 *
 * IDEMPOTENT. Every value is checked with `isEncrypted()` and skipped if it is
 * already packed, so a second run reports 0 encrypted and changes nothing.
 * Safe to re-run after a partial failure.
 *
 * It reads and writes through the RAW driver collection, deliberately: going
 * through the model would run the decrypt-on-read getter and the
 * encrypt-on-write hooks, which is exactly the layer being backfilled.
 *
 * It prints COUNTS ONLY. No password, ciphertext or user id is ever logged.
 *
 * Usage (inside the running container — see apps/fitnessgeek/DOCS/CONTEXT.md):
 *
 *   node scripts/encryptGarminPasswords.js --dry-run   # report, write nothing
 *   node scripts/encryptGarminPasswords.js             # encrypt in place
 *
 * Env: MONGODB_URI (same default as src/config/database.js), KEY_VAULT_SECRET.
 *
 * `runBackfill()` is exported and takes its collection and vault as arguments
 * so the jest suite can drive it against an in-memory double — this app's
 * suite is hermetic (no Mongo, no network). Only `main()` touches the network.
 */

import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { checkKeyVaultSecret } from '../src/config/keyVault.js';

const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/fitnessgeek?authSource=admin';

/**
 * Walk every document that carries a `garmin.password` and encrypt the ones
 * that are not packed yet.
 *
 * @param {object}   opts
 * @param {object}   opts.collection  raw driver collection (find/updateOne)
 * @param {object}   opts.vault       { isEncrypted, encrypt }
 * @param {boolean}  [opts.dryRun]    count only, write nothing
 * @param {function} [opts.log]       line sink; defaults to console.error for
 *                                    per-document failures only
 * @returns {Promise<{scanned:number, alreadyEncrypted:number, encrypted:number,
 *                    skippedEmpty:number, failed:number}>}
 */
export async function runBackfill({ collection, vault, dryRun = false, log = console.error }) {
  const counts = {
    scanned: 0,
    alreadyEncrypted: 0,
    encrypted: 0,
    skippedEmpty: 0,
    failed: 0
  };

  // Only documents that actually carry a password. The empty-string case is
  // handled in the loop rather than in the query so it shows up in the counts
  // instead of vanishing.
  const cursor = collection.find(
    { 'garmin.password': { $exists: true, $ne: null } },
    { projection: { _id: 1, 'garmin.password': 1 } }
  );

  for await (const doc of cursor) {
    counts.scanned += 1;
    const value = doc?.garmin?.password;

    if (typeof value !== 'string' || value === '') {
      counts.skippedEmpty += 1;
      continue;
    }
    if (vault.isEncrypted(value)) {
      counts.alreadyEncrypted += 1;
      continue;
    }
    if (dryRun) {
      counts.encrypted += 1;
      continue;
    }

    try {
      await collection.updateOne(
        { _id: doc._id },
        { $set: { 'garmin.password': vault.encrypt(value) } }
      );
      counts.encrypted += 1;
    } catch (err) {
      // Message only — the driver's error never carries the value.
      counts.failed += 1;
      log(`  update failed for one document: ${err.message}`);
    }
  }

  return counts;
}

/** Render the counts. Counts only — never a value. */
export function formatCounts(counts, dryRun) {
  return [
    '',
    `  documents with a garmin.password : ${counts.scanned}`,
    `  already encrypted (skipped)      : ${counts.alreadyEncrypted}`,
    `  empty / non-string (skipped)     : ${counts.skippedEmpty}`,
    `  ${(dryRun ? 'WOULD encrypt' : 'encrypted').padEnd(32)} : ${counts.encrypted}`,
    `  failed                           : ${counts.failed}`,
    '',
    dryRun
      ? 'Dry run complete — no documents were modified.'
      : 'Backfill complete. Re-running is a no-op.'
  ].join('\n');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const keyCheck = checkKeyVaultSecret();
  if (!keyCheck.ok) {
    console.error(`✗ ${keyCheck.message}`);
    process.exitCode = 1;
    return;
  }

  // Imported after the key check so a missing key produces the message above
  // rather than crypto-vault's raw load-time throw.
  const vault = await import('@geeksuite/crypto-vault');
  const { default: UserSettings } = await import('../src/models/UserSettings.js');

  await mongoose.connect(process.env.MONGODB_URI || DEFAULT_MONGODB_URI);
  console.log(`Connected to MongoDB (db: ${mongoose.connection.name})`);
  console.log(dryRun ? 'Mode: DRY RUN — nothing will be written' : 'Mode: WRITE');

  try {
    const counts = await runBackfill({
      collection: UserSettings.collection,
      vault,
      dryRun
    });
    console.log(formatCounts(counts, dryRun));
    if (counts.failed > 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

// Run only when invoked as a CLI, so the suite can import the helpers above.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`✗ Backfill aborted: ${err.message}`);
    process.exitCode = 1;
    mongoose.disconnect().catch(() => {});
  });
}
