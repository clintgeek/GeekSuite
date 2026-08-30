#!/usr/bin/env node
/**
 * migrate-bujogeek-recurrence.js — one-time (idempotent) migration that
 * unifies BuJoGeek's two recurrence systems onto RRULE.
 *
 * Background
 * ----------
 * BuJoGeek used to carry two parallel recurrence mechanisms:
 *   (A) LEGACY  Task.recurrencePattern ('none'|'daily'|'weekly'|'monthly').
 *               On completion the service auto-spawned the next occurrence.
 *   (B) RRULE   Task.recurrenceRule + seriesId + isSeriesMaster + exdates,
 *               with occurrences expanded virtually per view window.
 *
 * (B) is the keeper. The auto-spawn branch has been removed from the service,
 * so any task still carrying only a legacy `recurrencePattern` would silently
 * stop recurring. This script converts them.
 *
 * What it does
 * ------------
 *   PENDING legacy tasks (status 'pending' or 'migrated_*', recurrencePattern
 *   != 'none', no recurrenceRule) become RRULE series masters:
 *       recurrenceRule  = DTSTART:<dueDate|originalDate>\nRRULE:FREQ=<FREQ>
 *       isSeriesMaster  = true
 *       recurrencePattern = 'none'
 *   Ownership (`createdBy`) and every other field are preserved untouched.
 *
 *   COMPLETED legacy occurrences are NOT turned into series — they are
 *   historical records. Their inert `recurrencePattern` is cleared to 'none'
 *   so they remain plain completed tasks.
 *
 * Idempotency
 * -----------
 * Converted tasks have a `recurrenceRule` and `recurrencePattern: 'none'`, so
 * they no longer match the selection query. Re-running is a no-op. A task that
 * already has a recurrenceRule is never touched.
 *
 * Usage
 * -----
 *   node scripts/migrate-bujogeek-recurrence.js              # dry run, no writes
 *   node scripts/migrate-bujogeek-recurrence.js --yes        # apply changes
 *   node scripts/migrate-bujogeek-recurrence.js --help
 *
 * Required env (same values the API uses):
 *   MONGO_BASE_URI — e.g. mongodb://user:pass@host:27017  (db `bujogeek` is
 *                    appended by graphql/shared/appConnections.js)
 *
 * NOTE: run this manually at deploy time, after the code that removes the
 * legacy auto-spawn is live.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

import Task from '../src/graphql/bujogeek/models/Task.js';
import { recurrencePatternToRRule } from '../src/graphql/bujogeek/services/taskService.js';

const LEGACY_PATTERNS = ['daily', 'weekly', 'monthly'];
const ACTIVE_STATUSES = ['pending', 'migrated_back', 'migrated_future'];

const hasNoRule = [
  { recurrenceRule: null },
  { recurrenceRule: '' },
  { recurrenceRule: { $exists: false } },
];

/**
 * Convert legacy-recurrence tasks in place.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.dryRun=true]  when true nothing is written
 * @param {Function}[opts.log]          logger (defaults to console.log)
 * @returns {Promise<{converted: number, cleared: number, skipped: number, dryRun: boolean}>}
 */
export async function migrateBujogeekRecurrence({ dryRun = true, log = console.log } = {}) {
  const stats = { converted: 0, cleared: 0, skipped: 0, dryRun };

  // ── 1. Pending legacy recurrences → RRULE series masters ──────────────────
  const candidates = await Task.find({
    recurrencePattern: { $in: LEGACY_PATTERNS },
    status: { $in: ACTIVE_STATUSES },
    $or: hasNoRule,
  });

  for (const task of candidates) {
    const start = task.dueDate || task.originalDate;
    const rule = recurrencePatternToRRule(task.recurrencePattern, start);
    if (!rule) {
      stats.skipped += 1;
      log(`  skip  ${ task._id } — cannot derive DTSTART (pattern=${ task.recurrencePattern })`);
      continue;
    }

    log(`  conv  ${ task._id } "${ task.content }" ${ task.recurrencePattern } → ${ rule.replace('\n', ' | ') }`);
    stats.converted += 1;

    if (!dryRun) {
      await Task.updateOne(
        { _id: task._id, createdBy: task.createdBy },
        {
          $set: {
            recurrenceRule: rule,
            isSeriesMaster: true,
            recurrencePattern: 'none',
            updatedAt: new Date(),
          },
        }
      );
    }
  }

  // ── 2. Completed legacy occurrences → plain completed tasks ───────────────
  const completedFilter = {
    recurrencePattern: { $in: LEGACY_PATTERNS },
    status: 'completed',
    $or: hasNoRule,
  };
  const completedCount = await Task.countDocuments(completedFilter);
  stats.cleared = completedCount;
  if (completedCount > 0) {
    log(`  clear ${ completedCount } completed legacy occurrence(s) → recurrencePattern 'none'`);
    if (!dryRun) {
      await Task.updateMany(completedFilter, { $set: { recurrencePattern: 'none' } });
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
migrate-bujogeek-recurrence.js

  node scripts/migrate-bujogeek-recurrence.js         dry run (default)
  node scripts/migrate-bujogeek-recurrence.js --yes   apply changes

Converts pending tasks with a legacy recurrencePattern into RRULE series
masters and clears the inert pattern from completed occurrences. Idempotent.
`);
    process.exit(0);
  }

  const dryRun = !args.includes('--yes');

  try {
    await Task.db.asPromise();
    console.log(dryRun ? '[DRY RUN] no writes will be performed' : '[APPLY] writing changes');
    const stats = await migrateBujogeekRecurrence({ dryRun });
    console.log(
      `\nDone. converted=${ stats.converted } cleared=${ stats.cleared } skipped=${ stats.skipped }` +
      (dryRun ? '  (dry run — re-run with --yes to apply)' : '')
    );
    process.exitCode = 0;
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await Task.db.close().catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  }
}
