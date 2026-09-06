#!/usr/bin/env node
/**
 * fixBarcodeUniqueIndex.js — Q40 migration.
 *
 * `FoodItem.barcode` carries a `unique: true, sparse: true` index that is
 * NOT filtered by `is_deleted` (packages/schemas/fitnessgeek/foodItem.js).
 * A soft-deleted row still owns its barcode, so re-adding the same product
 * after a soft delete collides on insert (`E11000`) instead of getting a
 * fresh row — every rung of `findOrCreateFoodItem`'s dedupe ladder already
 * skips soft-deleted rows, but the index doesn't know that. See
 * `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md` §11 "Found by consolidating: a
 * soft-deleted row still owns its barcode" (follow-up #3 in §12).
 *
 * The schema now declares the index as a PARTIAL unique index —
 * `partialFilterExpression: { is_deleted: false, barcode: { $type: 'string' } }`
 * — instead of `sparse`, scoping the uniqueness constraint to live rows that
 * actually carry a barcode. Mongoose's automatic index creation (`autoIndex`,
 * on by default) builds the new index the next time either app boots against
 * the `fooditems` collection — but it will NOT drop the stale one for you,
 * and a unique index with the same keys but different options can make
 * mongoose's own `createIndexes` call on boot fail loudly (the same
 * `IndexOptionsConflict` class documented in
 * `packages/user/src/server/createUserModel.js`). This script's only job is
 * to drop the stale index first, so the next boot's autoIndex creates the
 * correct one from a clean slate.
 *
 * IDEMPOTENT. It inspects the live index before doing anything:
 *   - no single-key index on `barcode` at all      -> nothing to do
 *   - an index already carrying the expected
 *     `partialFilterExpression`                    -> nothing to do (already migrated)
 *   - any other single-key index on `barcode`       -> dropped by name
 *
 * Prints index names/options only — never document data.
 *
 * Usage (inside the running container, same convention as
 * encryptGarminPasswords.js):
 *
 *   node scripts/fixBarcodeUniqueIndex.js --dry-run   # report, drop nothing
 *   node scripts/fixBarcodeUniqueIndex.js             # drop the stale index
 *
 * Env: MONGODB_URI (same default as src/config/database.js).
 *
 * Do NOT run this against production — Sage runs it, per the runbook's
 * normal migration procedure. Both apps must be redeployed together once
 * this lands (the release pipeline already does this on every push to
 * main), per the "redeploy rule" in the module header of
 * `packages/schemas/fitnessgeek/foodItem.js` — a stale process still
 * expecting the old sparse-only contract while the new partial index is
 * live is the same race class as any other `unique`-flag change on a shared
 * schema.
 *
 * `planIndexChange()` is exported and takes the index list as a plain array
 * (the shape `collection.indexes()` returns), so the jest suite can drive it
 * with no Mongo connection at all. Only `main()` touches the network.
 */

import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/fitnessgeek?authSource=admin';

// Must match packages/schemas/fitnessgeek/foodItem.js's createFoodItemSchema().
const EXPECTED_PARTIAL_FILTER = { is_deleted: false, barcode: { $type: 'string' } };

function sameFilter(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Decide what, if anything, needs dropping.
 *
 * @param {Array<object>} indexes - as returned by `collection.indexes()`
 * @returns {{ action: 'none'|'drop', name?: string, reason: string }}
 */
export function planIndexChange(indexes) {
  const barcodeIndexes = indexes.filter(
    (ix) => ix.key && Object.keys(ix.key).length === 1 && ix.key.barcode === 1
  );

  if (barcodeIndexes.length === 0) {
    return { action: 'none', reason: 'no single-key index on barcode exists' };
  }

  const alreadyMigrated = barcodeIndexes.find((ix) =>
    sameFilter(ix.partialFilterExpression, EXPECTED_PARTIAL_FILTER)
  );
  if (alreadyMigrated) {
    return { action: 'none', reason: `already migrated (${alreadyMigrated.name})` };
  }

  // Any other single-key barcode index (the old unique+sparse one, or a
  // hand-built variant) is stale and must be dropped so autoIndex can
  // rebuild it from the current schema.
  const stale = barcodeIndexes[0];
  return {
    action: 'drop',
    name: stale.name,
    reason: `stale index "${stale.name}" (unique=${!!stale.unique}, sparse=${!!stale.sparse}, ` +
      `partialFilterExpression=${JSON.stringify(stale.partialFilterExpression || null)})`
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(process.env.MONGODB_URI || DEFAULT_MONGODB_URI);
  console.log(`Connected to MongoDB (db: ${mongoose.connection.name})`);
  console.log(dryRun ? 'Mode: DRY RUN — nothing will be dropped' : 'Mode: WRITE');

  try {
    const collection = mongoose.connection.collection('fooditems');
    const indexes = await collection.indexes();
    const plan = planIndexChange(indexes);

    console.log(`Plan: ${plan.action} — ${plan.reason}`);

    if (plan.action === 'drop') {
      if (dryRun) {
        console.log(`WOULD drop index "${plan.name}". Re-run without --dry-run to apply.`);
      } else {
        await collection.dropIndex(plan.name);
        console.log(
          `Dropped index "${plan.name}". The next app boot (autoIndex) builds the partial ` +
          'index from the current schema.'
        );
      }
    } else {
      console.log('Nothing to do.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

// Run only when invoked as a CLI, so the suite can import the helper above.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`✗ Migration aborted: ${err.message}`);
    process.exitCode = 1;
    mongoose.disconnect().catch(() => {});
  });
}
