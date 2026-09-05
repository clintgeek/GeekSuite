/**
 * Shared date utilities for GeekSuite.
 *
 * ## The two kinds of date
 *
 * Every date in the suite is one of two things, and almost every timezone bug
 * we have shipped came from treating one as the other:
 *
 * 1. **A calendar date** — "the day the eggs were collected", "the day this
 *    task is due", "the day this weight was logged". It has no time of day.
 *    The suite stores these as **UTC midnight** (`2026-02-26T00:00:00.000Z`),
 *    which is the convention already used by FitnessGeek's `FoodLog` and
 *    FlockGeek's egg production. Anything that reads one back must use UTC
 *    accessors, and anything that *displays* one must pass
 *    `{ timeZone: 'UTC' }` — otherwise a browser west of UTC renders the
 *    previous day. Use `toUtcMidnight`, `utcMidnightToday`, `utcDayRange`,
 *    `utcDateString`, `displayCalendarDate`.
 *
 * 2. **An instant** — `createdAt`, `completedAt`, "right now". It is a real
 *    moment on the timeline and should be read in whatever timezone the
 *    reader is sitting in. Use `localDateString` and `startOfLocalDay`.
 *
 * ## Why the two families never mix
 *
 * The failure mode is always the same shape. A user in America/Chicago
 * (UTC-6) acts at 11pm on Feb 26:
 *
 * - `new Date().toISOString().split('T')[0]` → `"2026-02-27"`. Their day is
 *   already over in UTC, so "today" is tomorrow. That is what
 *   `localDateString()` exists to prevent.
 * - Conversely, a stored calendar date of `2026-02-26T00:00:00.000Z` read
 *   with `new Date(v).toLocaleDateString()` renders `"2/25/2026"`, because
 *   UTC midnight is 6pm the previous day locally. That is what
 *   `displayCalendarDate` and `utcDateString` exist to prevent.
 *
 * Nothing here uses `getTimezoneOffset()` arithmetic. The offset-subtraction
 * trick (`new Date(t - offset * 60000).toISOString()`) that appears in
 * several apps is correct, but only accidentally: it works because the offset
 * is sampled *at* `t`, so it happens to survive DST. Reading the local
 * calendar fields directly (`getFullYear`/`getMonth`/`getDate`) needs no such
 * reasoning and cannot drift across a DST boundary.
 *
 * Zero dependencies, ESM only. Safe in a browser bundle and in Node.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n) => String(n).padStart(2, '0');

/**
 * Normalize a calendar date to UTC midnight — the suite's storage form.
 *
 * A bare `YYYY-MM-DD` is read as the calendar day it names, never re-parsed
 * through the host timezone. Anything else (a `Date`, a full ISO instant, a
 * timestamp) is reduced to the UTC calendar day it falls on.
 *
 * Note the asymmetry, and that it is deliberate: `'2026-02-26'` means "the
 * 26th" no matter who is asking, while an *instant* only has a UTC day. If
 * you want an instant's **local** day instead, take `localDateString()` first
 * and pass that string in.
 *
 * @param {string|Date|number} value
 * @returns {Date} the same calendar day at `00:00:00.000Z`
 */
export function toUtcMidnight(value) {
  if (typeof value === 'string' && YMD.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return date; // propagate Invalid Date
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Today's calendar date at UTC midnight.
 *
 * The default for a calendar-date field the caller did not supply. A bare
 * `new Date()` would stamp it with the current time of day, which rolls to
 * the next UTC day for anyone west of UTC in the evening.
 *
 * Caveat, stated plainly: "today" here is *UTC's* today. A server has no idea
 * what timezone its user is in, so for anything the user will read back as
 * "today" the frontend should send `localDateString()` and let the server
 * take that. This is the fallback for when nothing was sent at all.
 *
 * @returns {Date}
 */
export function utcMidnightToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The inclusive UTC instant range covering one calendar day.
 *
 * Query calendar-date fields with `{ $gte: start, $lte: end }`. Using
 * `setHours(0,0,0,0)` here instead would give you the *server's* local day —
 * which in a UTC Docker container silently looks correct until the day the
 * container gets a `TZ`.
 *
 * @param {string|Date|number} value
 * @returns {{ start: Date, end: Date }}
 */
export function utcDayRange(value) {
  const start = toUtcMidnight(value);
  const end = new Date(start.getTime());
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * `YYYY-MM-DD` for a stored calendar date, read in UTC.
 *
 * The safe replacement for `value.toISOString().split('T')[0]` — same result
 * for a well-formed UTC-midnight value, but it normalizes first, so a value
 * that picked up a time of day somewhere still yields its own day rather
 * than the day before.
 *
 * @param {string|Date|number} value
 * @returns {string} `YYYY-MM-DD`, or `''` for a missing/invalid value
 */
export function utcDateString(value) {
  if (value === null || value === undefined || value === '') return '';
  const d = toUtcMidnight(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Render a stored calendar date for a human, without the off-by-one.
 *
 * Forces `timeZone: 'UTC'` so a UTC-midnight value shows as the day it names
 * in every browser. **Only for calendar dates.** An instant (`createdAt`)
 * should be rendered with a plain `toLocaleDateString()` so it reads in the
 * viewer's own timezone — that is the whole point of an instant.
 *
 * @param {string|Date|number} value
 * @param {string|string[]} [locale] passed straight to `toLocaleDateString`
 * @param {Intl.DateTimeFormatOptions} [options] merged over the UTC timezone
 * @returns {string} the formatted date, or `''` for a missing/invalid value
 */
export function displayCalendarDate(value, locale = undefined, options = undefined) {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { ...options, timeZone: 'UTC' });
}

/**
 * `YYYY-MM-DD` for the *local* calendar day an instant falls on.
 *
 * This is what a frontend sends when it means "today": it keeps the user's
 * day their own, where `new Date().toISOString().split('T')[0]` would hand
 * the server tomorrow's date every evening west of UTC (and yesterday's every
 * morning east of it).
 *
 * Reads the local calendar fields directly, so it is exact across DST
 * transitions — there is no intermediate UTC value to shift.
 *
 * @param {string|Date|number} [value=new Date()]
 * @returns {string} `YYYY-MM-DD`, or `''` for a missing/invalid value
 */
export function localDateString(value = new Date()) {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Local midnight for the day an instant falls on.
 *
 * For comparing instants by day in the browser — "was this created before
 * today?" — where the answer must match what the user sees on their own wall
 * clock. Do not use it to build query boundaries for stored calendar dates;
 * that is `utcDayRange`.
 *
 * DST note: on a spring-forward day in a zone that skips midnight itself
 * (Lord Howe, some of Brazil historically), `setHours(0,0,0,0)` lands on the
 * first existing instant of that day, which is the useful answer.
 *
 * @param {string|Date|number} [value=new Date()]
 * @returns {Date}
 */
export function startOfLocalDay(value = new Date()) {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) return d;
  d.setHours(0, 0, 0, 0);
  return d;
}
