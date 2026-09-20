#!/usr/bin/env node
/**
 * backfillBloodPressureMeasuredAt.js — migration for the `measured_at` field
 * and its `(userId, measured_at)` unique index added to `bloodpressures`
 * (packages/schemas/fitnessgeek/bloodPressure.js).
 *
 * WHY THIS MUST RUN BEFORE THE NEXT DEPLOY, NOT AFTER
 * -----------------------------------------------------
 * `measured_at` is now `required`, and the collection carries a new unique
 * compound index on `(userId, measured_at)`. Mongoose's autoIndex (on by
 * default) builds that index the moment either app boots against
 * `bloodpressures`. Every row written before this change has NO
 * `measured_at` at all, and MongoDB's unique index treats a missing field as
 * `null` — so any single user with more than one historical reading (the
 * ordinary case) has multiple documents that all look like `(userId, null)`
 * to that index, and the FIRST autoIndex build after this schema ships fails
 * outright, mid-boot, for every such user's data.
 *
 * Run this against the live database BEFORE the deploy that carries the new
 * schema lands — not after, and not "whenever." See the runbook's normal
 * migration procedure.
 *
 * WHAT IT DOES
 * ------------
 * Backfills `measured_at` from each row's own `log_date` — the closest thing
 * history actually contains to "when was this taken": calendar-day
 * resolution, UTC midnight, no time-of-day ever recorded. This is a stated
 * choice, not a discovery: retrofitting a fake time-of-day would be
 * inventing data the app never had, not recovering it. Old rows read back
 * with a `measured_at` that is honestly "some time on this calendar day,"
 * which is exactly what was always known about them.
 *
 * A user's own rows are processed in `log_date` order, and any WOULD-BE
 * collision under the new unique index — two rows for the same user that the
 * app's own one-per-day rule should have prevented, but the GraphQL writer
 * (`addBloodPressure` in basegeek's resolvers.js) never enforced — is nudged
 * forward by one second per collision, so every row keeps its OWN
 * `measured_at` instead of two rows racing to become the same value. See
 * `planBackfill`'s own comment for the exact rule.
 *
 * IDEMPOTENT: only rows where `measured_at` doesn't already exist are
 * touched, and it prints counts only, never document data.
 *
 * Usage (inside the running container, same convention as
 * fixBarcodeUniqueIndex.js):
 *
 *   node scripts/backfillBloodPressureMeasuredAt.js --dry-run
 *   node scripts/backfillBloodPressureMeasuredAt.js
 *
 * Env: MONGODB_URI (same default as src/config/database.js).
 *
 * `planBackfill()` is exported and takes the row list as a plain array
 * (`{_id, userId, log_date}`), so the jest suite can drive it with no Mongo
 * connection at all. Only `main()` touches the network.
 */

import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/fitnessgeek?authSource=admin';

/**
 * Pure planning function: given every row missing `measured_at`, assign each
 * a collision-free value seeded from its own `log_date`.
 *
 * Rule: group by `userId`, walk each user's rows in `log_date` order, and
 * for each row start a candidate at that row's own `log_date`; if this
 * user has already been assigned that exact instant, add one second and try
 * again. This guarantees every plan entry is unique per user even when the
 * source data already had same-day duplicates the old app never should have
 * allowed to exist.
 *
 * @param {Array<{_id: any, userId: string, log_date: Date|string}>} rows
 * @returns {Array<{_id: any, measured_at: Date}>}
 */
export function planBackfill(rows) {
  const byUser = new Map();
  for (const row of rows) {
    const key = String(row.userId);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(row);
  }

  const plan = [];
  for (const userRows of byUser.values()) {
    const sorted = [...userRows].sort(
      (a, b) => new Date(a.log_date).getTime() - new Date(b.log_date).getTime()
    );
    const used = new Set();
    for (const row of sorted) {
      let candidate = new Date(row.log_date);
      while (used.has(candidate.getTime())) {
        candidate = new Date(candidate.getTime() + 1000);
      }
      used.add(candidate.getTime());
      plan.push({ _id: row._id, measured_at: candidate });
    }
  }
  return plan;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(process.env.MONGODB_URI || DEFAULT_MONGODB_URI);
  console.log(`Connected to MongoDB (db: ${mongoose.connection.name})`);
  console.log(dryRun ? 'Mode: DRY RUN — nothing will be written' : 'Mode: WRITE');

  try {
    const collection = mongoose.connection.collection('bloodpressures');

    const rows = await collection
      .find({ measured_at: { $exists: false } })
      .project({ userId: 1, log_date: 1 })
      .toArray();

    console.log(`Found ${rows.length} row(s) with no measured_at.`);

    if (rows.length === 0) {
      console.log('Nothing to do.');
      return;
    }

    const plan = planBackfill(rows);
    const byId = new Map(rows.map((r) => [String(r._id), r]));
    const nudged = plan.filter(
      (p) => p.measured_at.getTime() !== new Date(byId.get(String(p._id)).log_date).getTime()
    );

    console.log(
      `Plan: backfill ${plan.length} row(s); ${nudged.length} nudged forward one second (or ` +
      'more) to avoid a same-user collision on the new unique index.'
    );

    if (dryRun) {
      console.log('WOULD update the above rows. Re-run without --dry-run to apply.');
      return;
    }

    let updated = 0;
    for (const { _id, measured_at } of plan) {
      await collection.updateOne({ _id }, { $set: { measured_at } });
      updated += 1;
    }
    console.log(`Updated ${updated} row(s).`);

    console.log(
      'Building the (userId, measured_at) unique index now, so any remaining problem ' +
      'surfaces here instead of at the next app boot...'
    );
    await collection.createIndex({ userId: 1, measured_at: 1 }, { unique: true });
    console.log('Index build succeeded.');
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
