import { z } from 'zod';

/**
 * Recursively strips Mongo's `_id` / `__v` from a plain-object/array payload.
 *
 * Why this exists: every nested object literal in
 * `@geeksuite/schemas/fitnessgeek/userSettings.js` (dashboard, garmin,
 * nutrition_goal, nutrition_goal.keto, keto.macro_split, weight_goal, units,
 * ai, ai.features, household...) is a Mongoose *single-nested subdocument*,
 * and subdocuments get their own `_id` by default — same as top-level
 * documents. `GET /api/settings` therefore returns those ids inline, and the
 * frontend routinely spreads that response straight back into a PUT body
 * (SettingsContext's `updateDashboardSetting`, FoodLog's "today's calorie
 * goal" edit which spreads `...nutrition_goal`). None of that is an attempt
 * to set `_id` — it is Mongo's own field round-tripping through a client
 * that doesn't know to strip it. Dropping it before validation keeps the
 * `.strict()` schemas below honest about *application* fields without
 * breaking that round trip.
 */
function stripMongoMeta(value) {
  if (Array.isArray(value)) return value.map(stripMongoMeta);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (key === '_id' || key === '__v') continue;
      out[key] = stripMongoMeta(v);
    }
    return out;
  }
  return value;
}

/**
 * A date-only `YYYY-MM-DD` string OR a full ISO date-time string.
 *
 * Every date-only field this backend accepts over REST (weight/BP `log_date`,
 * medication `supply_start_date`) is produced client-side by
 * `@geeksuite/utils`' `localDateString()` (a plain `YYYY-MM-DD`), and is fed
 * straight into `toUtcMidnight()` in the weight/BP controllers, which also
 * tolerates a full ISO string as a fallback. Accept both so we don't reject
 * anything the controller itself would have parsed.
 */
const dateOnlyOrIso = z.string().refine((val) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return true;
  const d = new Date(val);
  return !Number.isNaN(d.getTime());
}, { message: 'Must be a YYYY-MM-DD date or an ISO date-time string' });

// How far into the future a logged date may be. Generous enough to absorb a
// caller whose local calendar day is already "tomorrow" in UTC.
const MAX_FUTURE_DAYS = 1;

function notFarFuture(val) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(val)
    ? new Date(`${val}T00:00:00Z`)
    : new Date(val);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() + MAX_FUTURE_DAYS);
  cutoff.setUTCHours(23, 59, 59, 999);
  return d.getTime() <= cutoff.getTime();
}

/** A log-style date: `YYYY-MM-DD` or ISO, and not further than tomorrow. */
const logDateSchema = dateOnlyOrIso.refine(notFarFuture, {
  message: `Date cannot be more than ${MAX_FUTURE_DAYS} day(s) in the future`,
});

export { stripMongoMeta, dateOnlyOrIso, logDateSchema, MAX_FUTURE_DAYS };
export default { stripMongoMeta, dateOnlyOrIso, logDateSchema, MAX_FUTURE_DAYS };
