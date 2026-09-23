/**
 * bodyComp.js — the smoothing rule, as code.
 *
 * Bioimpedance swings 1–2 % body fat day to day with hydration alone, and a
 * scale weight 2–3 lb with water and food. A single scan, or the difference
 * between two scans, is mostly that noise. So every body-composition number
 * the app shows or reasons about comes through here, and this module only
 * ever answers with AVERAGES over windows (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md
 * §0):
 *
 *   - "current" = the mean of the scans in the 14 days ending at the latest;
 *   - a change  = 7-day mean vs 7-day mean, window centres ≥ 14 days apart —
 *                 and before that exists, WHEN it will, never a number;
 *   - a chart   = a 7-day trailing mean per point.
 *
 * Inputs are plain points, already derived by the caller (the gateway runs
 * `@geeksuite/schemas`' `derive()`, which the frontend deliberately does not
 * depend on):
 *
 *   { date, weight_lb, fat_mass_lb, lean_mass_lb, body_fat_pct,
 *     skeletal_muscle_lb, body_water_pct, visceral_fat_index, bmr_kcal }
 *
 * `date` is a CALENDAR date — the scan's `log_date` (UTC midnight) or a
 * `YYYY-MM-DD` string — never an instant; see dates.js for why the two
 * families never mix. Pure: the only clock is the `now` a caller passes.
 */

import { toUtcMidnight } from './dates.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fields averaged in a window. Anything missing on a scan is skipped for that field only. */
export const BODY_COMP_FIELDS = Object.freeze([
  'weight_lb',
  'fat_mass_lb',
  'lean_mass_lb',
  'body_fat_pct',
  'skeletal_muscle_lb',
  'body_water_pct',
  'visceral_fat_index',
  'bmr_kcal',
]);

/** "Current" spans this many days ending at the latest scan. */
export const CURRENT_WINDOW_DAYS = 14;
/** A change compares two windows of this many days… */
export const CHANGE_WINDOW_DAYS = 7;
/** …whose centres are at least this far apart. */
export const CHANGE_MIN_GAP_DAYS = 14;
/** Lean mass older than this no longer sets a target. */
export const TARGET_MAX_SCAN_AGE_DAYS = 30;

const finite = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/** Fat-free mass from a stored scan: weight less fat mass, or null. */
export function leanMassLb(scan) {
  const w = finite(Number(scan?.weight_value ?? scan?.weight_lb));
  const f = finite(Number(scan?.body_fat_mass_lb ?? scan?.fat_mass_lb));
  if (w === null || f === null || w <= 0 || f < 0 || f >= w) return null;
  return w - f;
}

/** Day number (UTC calendar) for a calendar date, or null. */
function dayNumber(value) {
  const d = toUtcMidnight(value);
  const t = d.getTime();
  return Number.isNaN(t) ? null : Math.round(t / DAY_MS);
}

const dayToDate = (n) => new Date(n * DAY_MS);

/** Points with a usable date, as `[day, point]`, oldest first. */
function dated(points) {
  return (points || [])
    .map((p) => [dayNumber(p?.date), p])
    .filter(([d]) => d !== null)
    .sort((a, b) => a[0] - b[0]);
}

function round(n, places) {
  if (n === null) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function meanOf(entries, field) {
  const values = entries.map(([, p]) => finite(p?.[field])).filter((v) => v !== null);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Means over the scans whose day lies in [fromDay, toDay].
 * @returns window object, or null when no scan falls inside.
 */
function windowOver(entries, fromDay, toDay) {
  const inside = entries.filter(([d]) => d >= fromDay && d <= toDay);
  if (!inside.length) return null;
  const out = {
    from: dayToDate(inside[0][0]),
    to: dayToDate(inside[inside.length - 1][0]),
    scans: inside.length,
    // Mean scan day — the honest "centre" of the window for gap arithmetic.
    centreDay: inside.reduce((a, [d]) => a + d, 0) / inside.length,
  };
  for (const field of BODY_COMP_FIELDS) {
    const m = meanOf(inside, field);
    // kcal and the unitless index are whole numbers on the report; masses
    // and percentages carry one decimal, like the scale.
    out[field] = field === 'bmr_kcal' ? round(m, 0) : round(m, 1);
  }
  return out;
}

const publicWindow = (w) => {
  if (!w) return null;
  const { centreDay, ...rest } = w;
  return rest;
};

/**
 * "Current" body composition: the mean of the scans in the
 * `CURRENT_WINDOW_DAYS` ending at the latest scan.
 *
 * @param {Array} points
 * @returns {Object|null} `{ from, to, scans, weight_lb, fat_mass_lb, … }`
 */
export function bodyCompCurrent(points, { windowDays = CURRENT_WINDOW_DAYS } = {}) {
  const entries = dated(points);
  if (!entries.length) return null;
  const last = entries[entries.length - 1][0];
  return publicWindow(windowOver(entries, last - (windowDays - 1), last));
}

/**
 * Change between the first and the latest `windowDays` of scans.
 *
 * Available only when the two windows' centres are `minGapDays` apart —
 * otherwise the "change" is two noisy averages of nearly the same days.
 * When unavailable it says WHEN it will be (assuming scanning continues),
 * which is the thing a user can act on.
 *
 * @param {Array} points
 * @param {Object} [opts]
 * @param {string|Date} [opts.since] baseline starts at the first scan on/after this date
 * @returns {{available: boolean, available_from: Date|null, gap_days: number|null,
 *   baseline: Object|null, latest: Object|null, weight_change_lb: number|null,
 *   fat_change_lb: number|null, lean_change_lb: number|null}}
 */
export function bodyCompChange(points, {
  windowDays = CHANGE_WINDOW_DAYS,
  minGapDays = CHANGE_MIN_GAP_DAYS,
  since = null,
} = {}) {
  const sinceDay = since ? dayNumber(since) : null;
  const entries = dated(points).filter(([d]) => sinceDay === null || d >= sinceDay);
  const none = {
    available: false, available_from: null, gap_days: null, baseline: null, latest: null,
    weight_change_lb: null, fat_change_lb: null, lean_change_lb: null,
  };
  if (!entries.length) return none;

  const first = entries[0][0];
  const last = entries[entries.length - 1][0];
  const baseline = windowOver(entries, first, first + (windowDays - 1));
  const latest = windowOver(entries, last - (windowDays - 1), last);
  const gap = latest.centreDay - baseline.centreDay;

  // Windows that overlap, or sit closer than the minimum, are one noisy
  // average compared with itself. Report when the comparison will exist: the
  // latest window's centre must reach baseline centre + minGapDays, and with
  // regular scanning a window ending on day X is centred half a window
  // earlier — so X is that far past the target centre. An estimate (it
  // assumes scanning continues), which is why it is phrased as a date the
  // comparison APPEARS, not a promise.
  if (last - first < windowDays || gap < minGapDays) {
    const earliestEnd = Math.ceil(baseline.centreDay + minGapDays + (windowDays - 1) / 2);
    return {
      ...none,
      available_from: dayToDate(Math.max(earliestEnd, first + windowDays)),
      gap_days: Math.round(gap),
      baseline: publicWindow(baseline),
    };
  }

  const delta = (field) =>
    baseline[field] === null || latest[field] === null ? null : round(latest[field] - baseline[field], 1);

  return {
    available: true,
    available_from: null,
    gap_days: Math.round(gap),
    baseline: publicWindow(baseline),
    latest: publicWindow(latest),
    weight_change_lb: delta('weight_lb'),
    fat_change_lb: delta('fat_mass_lb'),
    lean_change_lb: delta('lean_mass_lb'),
  };
}

/**
 * The lean mass a calorie or protein target may be built on, or null.
 *
 * The 14-day mean ending at the latest scan, and only while that scan is no
 * more than `maxAgeDays` old: an old scan describes a body that has since
 * changed, and a target built on it would quietly stop tracking.
 *
 * @param {Array} points
 * @param {Object} opts
 * @param {string|Date} opts.today the caller's calendar day (a client's
 *   `localDateString()`, or a server's UTC day when it has nothing better —
 *   30 days of tolerance make the difference immaterial)
 * @returns {{lean_mass_lb: number, scans: number, latest: Date, age_days: number}|null}
 */
export function leanMassForTargets(points, { today, maxAgeDays = TARGET_MAX_SCAN_AGE_DAYS } = {}) {
  const current = bodyCompCurrent(points);
  if (!current || current.lean_mass_lb === null) return null;
  const todayDay = dayNumber(today ?? new Date());
  const latestDay = dayNumber(current.to);
  const age = todayDay === null ? 0 : todayDay - latestDay;
  if (age > maxAgeDays) return null;
  return { lean_mass_lb: current.lean_mass_lb, scans: current.scans, latest: current.to, age_days: Math.max(0, age) };
}

/**
 * A trailing mean per point, for charts: each point's `mean` is the average of
 * every value in the `windowDays` calendar days ending on its date.
 *
 * @param {Array<{date: string|Date, value: number}>} points
 * @returns {Array<{date: Date, value: number, mean: number, count: number}>} oldest first
 */
export function rollingMean(points, { windowDays = CHANGE_WINDOW_DAYS } = {}) {
  const entries = dated(points).filter(([, p]) => finite(p?.value) !== null);
  return entries.map(([day, p]) => {
    const inWindow = entries.filter(([d]) => d <= day && d > day - windowDays);
    const sum = inWindow.reduce((a, [, q]) => a + q.value, 0);
    return { date: dayToDate(day), value: p.value, mean: round(sum / inWindow.length, 1), count: inWindow.length };
  });
}
