#!/usr/bin/env node
/**
 * migrate-appprefs-to-map.js — one-time (idempotent) normalisation that puts
 * every User's `appPreferences` into the one on-disk shape the Map schema
 * reads cleanly.
 *
 * Background
 * ----------
 * `User.appPreferences` is now typed `Map<string, Mixed>`. MongoDB has no Map
 * BSON type, so a MongooseMap serialises to a plain sub-document — meaning a
 * well-formed plain object IS the canonical on-disk shape, and Mongoose 8
 * hydrates it straight back into a Map. Documents written before the Map
 * schema therefore need no data change.
 *
 * What still bites is the *container* being the wrong kind of value: some old
 * documents carry `appPreferences` as `null`, as a missing field, or (from a
 * long-ago bug) as a non-object such as an array or a JSON string. Those cast
 * badly or drop preferences. This script rewrites only those containers to a
 * clean plain object so the Map cast is always well defined; every per-app
 * value inside a healthy object is preserved untouched.
 *
 * What it does
 * ------------
 *   For each user whose raw `appPreferences` is NOT a plain object:
 *     - null / missing / non-object (array, string, number)  → {}
 *     - a JSON string that parses to a plain object          → the parsed object
 *   A user whose `appPreferences` is already a plain object is left exactly as
 *   is (no-op). Per-app entries and their values are never modified.
 *
 * Idempotency
 * -----------
 * After a run every appPreferences is a plain object, so the selection no
 * longer matches anything. Re-running is a no-op.
 *
 * Usage
 * -----
 *   node scripts/migrate-appprefs-to-map.js            # dry run, no writes
 *   node scripts/migrate-appprefs-to-map.js --yes      # apply changes
 *   node scripts/migrate-appprefs-to-map.js --help
 *
 * Required env (same value the API uses):
 *   USERGEEK_MONGODB_URI — e.g. mongodb://user:pass@host:27017/userGeek?authSource=admin
 *
 * NOTE: run this manually at deploy time. It only touches malformed containers,
 * so it is safe to run against a live DB, but always eyeball the dry run first.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

import { User, userGeekConn } from '../src/models/user.js';

/** True for a plain JSON object (not null, not an array). */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Decide the normalised container for a raw appPreferences value, or return
 * `undefined` when the value is already canonical (nothing to do).
 *
 * @param {*} raw
 * @returns {Record<string, any> | undefined}
 */
function normalisedContainer(raw) {
  if (isPlainObject(raw)) return undefined; // already canonical
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) return parsed;
    } catch {
      // fall through to {}
    }
  }
  return {}; // null / missing / array / number / unparseable string
}

/**
 * Normalise malformed appPreferences containers in place.
 *
 * Works against the raw driver collection (not the Mongoose model) so it sees
 * the true on-disk value rather than an already-cast Map.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.dryRun=true]  when true nothing is written
 * @param {Function}[opts.log]          logger (defaults to console.log)
 * @returns {Promise<{normalised: number, scanned: number, dryRun: boolean}>}
 */
export async function migrateAppPrefsToMap({ dryRun = true, log = console.log } = {}) {
  const stats = { normalised: 0, scanned: 0, dryRun };
  const collection = User.collection;

  // Only inspect docs whose appPreferences is missing or not an "object" BSON
  // type (Mongo treats embedded documents as type 'object'; arrays are 'array').
  const cursor = collection.find({
    $or: [
      { appPreferences: { $exists: false } },
      { appPreferences: { $not: { $type: 'object' } } },
    ],
  });

  for await (const doc of cursor) {
    stats.scanned += 1;
    const next = normalisedContainer(doc.appPreferences);
    if (next === undefined) continue; // defensive — shouldn't match the query

    const rawDesc = Array.isArray(doc.appPreferences)
      ? 'array'
      : doc.appPreferences === undefined
        ? 'missing'
        : doc.appPreferences === null
          ? 'null'
          : typeof doc.appPreferences;

    log(`  fix   ${ doc._id } — appPreferences ${ rawDesc } → ${ JSON.stringify(next) }`);
    stats.normalised += 1;

    if (!dryRun) {
      await collection.updateOne(
        { _id: doc._id },
        { $set: { appPreferences: next } }
      );
    }
  }

  return stats;
}

/* ─────────────────────────── CLI entrypoint ─────────────────────────────── */

const isMain = process.argv[1] && import.meta.url === `file://${ process.argv[1] }`;

if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
migrate-appprefs-to-map.js

  node scripts/migrate-appprefs-to-map.js         dry run (default)
  node scripts/migrate-appprefs-to-map.js --yes   apply changes

Normalises malformed User.appPreferences containers (null / missing / array /
non-object) to a plain object so the Map schema casts cleanly. Well-formed
objects are left untouched. Idempotent.
`);
    process.exit(0);
  }

  const dryRun = !args.includes('--yes');

  try {
    if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
    console.log(dryRun ? '[DRY RUN] no writes will be performed' : '[APPLY] writing changes');
    const stats = await migrateAppPrefsToMap({ dryRun });
    console.log(
      `\nDone. scanned=${ stats.scanned } normalised=${ stats.normalised }` +
      (dryRun ? '  (dry run — re-run with --yes to apply)' : '')
    );
    process.exitCode = 0;
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await userGeekConn.close().catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  }
}
