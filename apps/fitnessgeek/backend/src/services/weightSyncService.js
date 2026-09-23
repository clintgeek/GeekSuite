// weightSyncService — turn verified Arboleaf scale readings into `Weight` rows.
//
// Before this existed an xlsx import wrote only `BodyComposition`: the weight
// sat in that row's `weight_value` and the weight history never saw it. The
// rules below are DOCS/BODY_COMPOSITION_INTAKE.md §11.5; the short version:
//
//   - One `Weight` per UTC day, `log_date` = UTC midnight. That is the rule
//     both writers already follow (weightController.js refuses a second row
//     for a day with a 409), so an import must not be the thing that breaks it.
//   - Several scans on one day -> the FIRST scan of that day. A later scan the
//     same evening cannot move the day's value.
//   - A day that already has a weight -> THE IMPORT WINS (Chef, 2026-09-22).
//     The row is overwritten with the scale value and marked `arboleaf_xlsx`;
//     its notes are kept. Extra rows for the same day (the gateway's
//     `addFitnessWeight` doesn't enforce one-per-day) are removed so the day
//     ends with exactly one.
//
// The caller decides which readings are trustworthy — only rows that passed
// the arithmetic gate reach here. This module never throws for one bad day: a
// failure is counted and logged and the rest of the history keeps syncing,
// same contract as `importBodyCompXlsxRows`.

import { toUtcMidnight, utcDayRange } from '@geeksuite/utils';
import Weight from '../models/Weight.js';
import logger from '../config/logger.js';

export const IMPORTED_WEIGHT_SOURCE = 'arboleaf_xlsx';

/**
 * Reduce readings to the first one per UTC day.
 *
 * @param {Array<{weight_value: number, measuredAt: Date}>} readings
 * @returns {Array<{day: Date, weight_value: number}>} sorted by day, oldest first.
 */
export function firstReadingPerDay(readings) {
  const byDay = new Map();
  for (const { weight_value, measuredAt } of readings) {
    if (!Number.isFinite(weight_value) || !(measuredAt instanceof Date) || Number.isNaN(measuredAt.getTime())) {
      continue;
    }
    const day = toUtcMidnight(measuredAt);
    const key = day.getTime();
    const current = byDay.get(key);
    if (!current || measuredAt < current.measuredAt) {
      byDay.set(key, { day, measuredAt, weight_value });
    }
  }
  return [...byDay.values()]
    .sort((a, b) => a.day - b.day)
    .map(({ day, weight_value }) => ({ day, weight_value }));
}

/**
 * Write one `Weight` per day for a user's verified scale readings.
 *
 * @param {Array<{weight_value: number, measuredAt: Date}>} readings
 * @param {string} userId
 * @returns {Promise<{created: number, replaced: number, unchanged: number, removed: number, failed: number}>}
 *   `replaced` counts days where an existing value (manual or an older
 *   import) was overwritten; `removed` counts surplus same-day rows deleted.
 */
export async function syncImportedWeights(readings, userId) {
  const summary = { created: 0, replaced: 0, unchanged: 0, removed: 0, failed: 0 };

  for (const { day, weight_value: raw } of firstReadingPerDay(readings)) {
    // Same one-decimal rounding the manual path applies (weightController.js).
    const weight_value = Math.round(raw * 10) / 10;
    try {
      const { start, end } = utcDayRange(day);
      const existing = await Weight.find({ userId, log_date: { $gte: start, $lte: end } })
        .sort({ created_at: 1 });

      if (existing.length === 0) {
        await Weight.create({ userId, weight_value, log_date: day, source: IMPORTED_WEIGHT_SOURCE });
        summary.created += 1;
        continue;
      }

      const [keep, ...surplus] = existing;
      if (keep.weight_value === weight_value && keep.source === IMPORTED_WEIGHT_SOURCE) {
        summary.unchanged += 1;
      } else {
        await Weight.updateOne(
          { _id: keep._id },
          { $set: { weight_value, source: IMPORTED_WEIGHT_SOURCE, log_date: day, updated_at: new Date() } },
        );
        summary.replaced += 1;
      }

      if (surplus.length > 0) {
        await Weight.deleteMany({ _id: { $in: surplus.map((w) => w._id) } });
        summary.removed += surplus.length;
      }
    } catch (error) {
      summary.failed += 1;
      logger.error({ err: error, userId, day: day.toISOString() }, 'weight sync: failed to write an imported weight');
    }
  }

  return summary;
}

export default { syncImportedWeights, firstReadingPerDay, IMPORTED_WEIGHT_SOURCE };
