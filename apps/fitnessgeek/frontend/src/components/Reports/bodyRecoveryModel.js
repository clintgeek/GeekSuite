/**
 * bodyRecoveryModel — what the Reports "Body & recovery" section shows, as
 * pure data (DOCS/FITNESSGEEK_TRENDS_PLAN.md D1–D3).
 *
 * Every number obeys the smoothing rule (FITNESSGEEK_BODY_DATA_PLAN §0):
 *
 *   - "current" is a 7-day mean — the readings in the 7 calendar days ending
 *     at the latest one;
 *   - a change is that mean against the 7-day mean starting ~36 days before
 *     today (so ~30 days earlier), computed by `bodyCompChange`, which only
 *     answers when the two windows' centres are ≥ 14 days apart. Before that
 *     it says WHEN ("Change from Oct 15"), never a number;
 *   - a sparkline is the 7-day trailing mean (`rollingMean`), broken wherever
 *     two readings are more than 14 days apart (`splitAtGaps`), so a month
 *     without data is empty space, not an invented line.
 *
 * There is never a day-over-day or reading-over-reading delta here.
 *
 * `bodyCompChange` averages body-composition fields; any series is fed to it
 * as `weight_lb`, the one field that is rounded to a tenth and otherwise
 * unused here. That is the whole trick — the windowing, the gap rule and the
 * "available from" date are the shared code, not a copy.
 *
 * Dates are calendar days (`YYYY-MM-DD`). `end` is the viewer's local today
 * (`localDateString()`), the same day the trends request sends.
 */
import { bodyCompChange, rollingMean, utcDateString } from '@geeksuite/utils';
import { categorizeBP } from '../../utils/bpUtils.js';
import { buildWeightTrend, splitAtGaps } from '../Weight/weightTrend.js';
import { formatDay, formatSpan, signedLb, STEADY_LB } from '../BodyComposition/bodyCompFormat.js';

/** The section always shows this many days of trend, whatever the page's range. */
export const TREND_DAYS = 90;
/** A mean spans this many days… */
export const WINDOW_DAYS = 7;
/** …and a change compares it with the one about this many days earlier. */
export const PERIOD_DAYS = 30;
/**
 * A sparkline point needs more than half its week read (4 of 7 days). At the
 * start of a run (or after a gap) the trailing "mean" of one or two readings
 * is a raw value in disguise, and it draws the spike the rule exists to hide.
 */
export const MIN_SPARK_COUNT = 4;
/** The WHO guideline: 150 minutes of moderate activity (or 75 vigorous) a week. */
export const WEEKLY_INTENSITY_GUIDELINE = 150;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUS = '−';

const dayOf = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
const ymdOf = (day) => utcDateString(new Date(day * DAY_MS));

/** `ymd` moved by `n` calendar days. */
export const addDays = (ymd, n) => ymdOf(dayOf(ymd) + n);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const roundTo = (n, places) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * Daily rows → `[{ date, value }]`, oldest first, missing readings dropped
 * (null is "no reading", never zero).
 */
export function pointsOf(days, pick) {
  return (days || [])
    .map((d) => ({ date: utcDateString(d?.date), value: num(pick(d)) }))
    .filter((p) => p.date && p.value !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Weekly intensity minutes for one day's row: moderate + 2 × vigorous, the
 * WHO equivalence (75 vigorous minutes count as 150 moderate) that Garmin's
 * own intensity-minute total also uses. Null when the day has neither.
 */
export const intensityMinutes = (d) => {
  const m = num(d?.moderateMin);
  const v = num(d?.vigorousMin);
  if (m === null && v === null) return null;
  return (m ?? 0) + 2 * (v ?? 0);
};

/**
 * One metric's smoothed trend.
 *
 * @param {Array<{date: string, value: number}>} points oldest first
 * @param {Object} opts
 * @param {string} opts.end the viewer's local today, YYYY-MM-DD
 * @param {number} [opts.scale=1] multiply every mean (7 turns a daily mean into a weekly total)
 * @returns {{
 *   current: {mean: number, count: number, from: string, to: string}|null,
 *   change: {available: true, delta: number, baseline: {from: string, to: string, mean: number}}
 *         | {available: false, availableFrom: string|null}
 *         | null,
 *   segments: Array<Array<{x: string, y: number}>>,
 * }}
 */
export function metricTrend(points, { end, scale = 1, windowDays = WINDOW_DAYS, periodDays = PERIOD_DAYS } = {}) {
  const empty = { current: null, change: null, segments: [] };
  const pts = (points || []).filter((p) => p?.date && num(p.value) !== null);
  if (!pts.length || !end) return empty;

  const smoothed = rollingMean(pts, { windowDays });
  const last = smoothed[smoothed.length - 1];
  const lastYmd = utcDateString(last.date);
  const windowFrom = addDays(lastYmd, -(windowDays - 1));
  const inWindow = pts.filter((p) => p.date >= windowFrom && p.date <= lastYmd);
  const current = {
    mean: roundTo(last.mean * scale, 1),
    count: last.count,
    from: inWindow[0].date,
    to: lastYmd,
  };

  // Baseline: the first week of readings on/after ~36 days ago, so a dense
  // series compares this week with the week that ended 30 days earlier.
  const since = addDays(end, -(periodDays + windowDays - 1));
  let change = null;
  if (lastYmd >= since) {
    const c = bodyCompChange(pts.map((p) => ({ date: p.date, weight_lb: p.value })), {
      since,
      windowDays,
    });
    change = c.available
      ? {
        available: true,
        delta: roundTo((c.latest.weight_lb - c.baseline.weight_lb) * scale, 1),
        baseline: {
          from: utcDateString(c.baseline.from),
          to: utcDateString(c.baseline.to),
          mean: roundTo(c.baseline.weight_lb * scale, 1),
        },
      }
      : { available: false, availableFrom: c.available_from ? utcDateString(c.available_from) : null };
  }

  const from = addDays(end, -(TREND_DAYS - 1));
  const series = smoothed
    .filter((m) => m.count >= MIN_SPARK_COUNT)
    .map((m) => ({ x: utcDateString(m.date), y: roundTo(m.mean * scale, 1) }))
    .filter((p) => p.x >= from && p.x <= end);

  return { current, change, segments: series.length ? splitAtGaps(series, (p) => p.x) : [] };
}

/** "−3 bpm" / "+1.5 h" / "0 ms" with a true minus sign. */
export function signedValue(n, { decimals = 0, unit = '' } = {}) {
  if (num(n) === null) return '—';
  const v = roundTo(n, decimals);
  const body = `${Math.abs(v).toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
  if (v === 0) return body;
  return `${v < 0 ? MINUS : '+'}${body}`;
}

/**
 * The change line under a card's number, in words. Neutral on purpose: which
 * way is "good" depends on the metric (and, for weight, on the goal), so the
 * direction is said, not graded.
 *
 * @returns {{kind: 'delta'|'level'|'pending', amount?: string, text: string}|null}
 */
export function describeTrendChange(change, { decimals = 0, unit = '', steady = 0 } = {}) {
  if (!change) return null;
  if (!change.available) {
    return change.availableFrom
      ? { kind: 'pending', text: `Change from ${formatDay(change.availableFrom)}` }
      : null;
  }
  const span = formatSpan(change.baseline.from, change.baseline.to);
  const rounded = roundTo(change.delta, decimals);
  // Judge "level" on the unrounded mean difference: 0.6 bpm is inside the
  // noise even though it prints as 1.
  if (Math.abs(change.delta) < steady || rounded === 0) {
    return { kind: 'level', text: `About level with ${span}` };
  }
  return { kind: 'delta', amount: signedValue(rounded, { decimals, unit }), text: `vs ${span}` };
}

/**
 * "7-day average", "7-day average to Sep 20" once the latest reading isn't
 * today or yesterday, and "· 2 days" when the week is thin — an average of
 * two readings should not pass for a week's.
 */
export function windowCaption(current, end, { lead = '7-day average' } = {}) {
  if (!current) return '';
  const thin = typeof current.count === 'number' && current.count < MIN_SPARK_COUNT
    ? ` · ${current.count} ${current.count === 1 ? 'day' : 'days'}`
    : '';
  if (current.to >= addDays(end, -1)) return `${lead}${thin}`;
  return `${lead} to ${formatDay(current.to)}${thin}`;
}

/**
 * The Garmin cards, from `influxService.getTrends()`'s payload. Each is the
 * same shape, so one card component draws them all; per-metric knobs:
 *   `steady`   — a smaller change than this reads as "about level" (inside
 *                the wobble of a 7-day mean);
 *   `minSpan`  — the sparkline's smallest y-range, so a week of noise does
 *                not fill the box and look like a cliff.
 */
export function garminCards(payload, { end }) {
  const days = payload?.days || [];
  const card = (key, label, pick, opts) => ({
    key,
    label,
    ...opts,
    ...metricTrend(pointsOf(days, pick), { end, scale: opts.scale || 1 }),
  });

  return {
    restingHR: card('restingHR', 'Resting heart rate', (d) => d.restingHR, {
      unit: 'bpm', deltaUnit: 'bpm', decimals: 0, steady: 1, minSpan: 6,
      meaning: 'Lower is better. It tends to fall over weeks as fitness improves.',
    }),
    hrv: card('hrv', 'Overnight HRV', (d) => d.overnightHRV, {
      unit: 'ms', deltaUnit: 'ms', decimals: 0, steady: 2, minSpan: 10,
      meaning: 'Higher usually means better recovered. Compare it with your own, not anyone else’s.',
    }),
    sleepScore: card('sleepScore', 'Sleep score', (d) => d.sleepScore, {
      unit: '/ 100', deltaUnit: 'points', decimals: 0, steady: 2, minSpan: 10,
      meaning: 'Garmin’s nightly score, 0–100.',
    }),
    sleepHours: card('sleepHours', 'Sleep', (d) => d.sleepHours, {
      unit: 'h / night', deltaUnit: 'h', decimals: 1, steady: 0.2, minSpan: 1.5,
      meaning: 'Time asleep, per night.',
    }),
    intensity: card('intensity', 'Intensity minutes', intensityMinutes, {
      unit: 'min / week', deltaUnit: 'min', decimals: 0, steady: 15, minSpan: 60, scale: 7,
      meaning: `Moderate + 2 × vigorous minutes (the WHO equivalence), per week. The guideline is ${WEEKLY_INTENSITY_GUIDELINE}.`,
    }),
    steps: card('steps', 'Steps', (d) => d.steps, {
      unit: '/ day', deltaUnit: 'steps', decimals: 0, steady: 300, minSpan: 2000,
      meaning: null,
    }),
    stress: card('stress', 'Stress', (d) => d.stressMean, {
      unit: '/ 100', deltaUnit: 'points', decimals: 0, steady: 2, minSpan: 10,
      meaning: null,
    }),
    bodyBatteryHigh: card('bodyBatteryHigh', 'Body Battery high', (d) => d.bodyBatteryHigh, {
      unit: '', decimals: 0, steady: 3, minSpan: 10, meaning: null,
    }),
    bodyBatteryLow: card('bodyBatteryLow', 'Body Battery low', (d) => d.bodyBatteryLow, {
      unit: '', decimals: 0, steady: 3, minSpan: 10, meaning: null,
    }),
  };
}

/**
 * Fitness age: Garmin's latest estimate, the user's actual age, and the day
 * it was last reported. Null when Garmin has none.
 */
export function fitnessAgeModel(payload) {
  const fa = payload?.fitnessAge;
  const current = num(fa?.current);
  if (current === null) return null;
  const dated = pointsOf(payload?.days, (d) => d.fitnessAge);
  return {
    current,
    chronological: num(fa?.chronological),
    achievable: num(fa?.achievable),
    asOf: dated.length ? dated[dated.length - 1].date : null,
  };
}

/** "8 years younger than your age" / "2 years older…" / "the same as your age". */
export function fitnessAgeGap(model) {
  if (!model || model.chronological === null) return null;
  const gap = Math.round(model.chronological - model.current);
  if (gap === 0) return 'The same as your age';
  const n = Math.abs(gap);
  return `${n} ${n === 1 ? 'year' : 'years'} ${gap > 0 ? 'younger' : 'older'} than your age`;
}

/**
 * The weight card: the same numbers the dashboard's weight stat shows
 * (`weightService.getWeightStats()` — 7-day mean now vs the 7-day mean ~30
 * days earlier), plus the sparkline from `buildWeightTrend`'s 7-day line.
 */
export function weightModel(logs, stats, { end }) {
  const trend = buildWeightTrend(logs || []).trend;
  const from = addDays(end, -(TREND_DAYS - 1));
  const series = trend.filter((p) => p.x >= from && p.x <= end);
  const s = stats || {};
  const current = num(s.currentMean) === null
    ? null
    : { mean: s.currentMean, to: s.latestDate || null };

  let change = null;
  if (num(s.totalChange) !== null) {
    const v = roundTo(s.totalChange, 1);
    change = Math.abs(v) < STEADY_LB
      ? { kind: 'level', text: `About level with the week to ${formatDay(s.referenceDate)}` }
      : { kind: 'delta', amount: signedLb(v), text: `vs the week to ${formatDay(s.referenceDate)}` };
  } else if (s.availableFrom) {
    change = { kind: 'pending', text: `Change from ${formatDay(s.availableFrom)}` };
  }

  return {
    current,
    change,
    segments: series.length ? splitAtGaps(series, (p) => p.x) : [],
  };
}

/**
 * Blood pressure: the 7- and 30-day averages BP Insights shows, over whole
 * calendar days ending today (a reading's `log_date` is its calendar day).
 * Two overlapping averages, not a change — the 30-day one is the steadier
 * reference, the 7-day one the recent read.
 */
export function bpModel(logs, { end }) {
  const rows = (logs || [])
    .map((l) => ({ day: utcDateString(l?.log_date), sys: num(Number(l?.systolic)), dia: num(Number(l?.diastolic)) }))
    .filter((r) => r.day && r.sys !== null && r.dia !== null && r.sys > 0 && r.dia > 0);

  const over = (days) => {
    const from = addDays(end, -(days - 1));
    const inside = rows.filter((r) => r.day >= from && r.day <= end);
    if (!inside.length) return null;
    const mean = (f) => Math.round(inside.reduce((a, r) => a + r[f], 0) / inside.length);
    return { systolic: mean('sys'), diastolic: mean('dia'), count: inside.length };
  };

  const avg7 = over(7);
  const avg30 = over(30);
  const lead = avg7 || avg30;
  const latest = rows.reduce((a, r) => (a === null || r.day > a ? r.day : a), null);
  return {
    avg7,
    avg30,
    category: lead ? categorizeBP(lead.systolic, lead.diastolic) : null,
    categoryOf: avg7 ? '7-day' : avg30 ? '30-day' : null,
    latest,
    total: rows.length,
  };
}

/** Smallest y-range for a sparkline, centred on the data. */
export function sparkRange(points, minSpan = 0) {
  const ys = (points || []).map((p) => p.y).filter((y) => Number.isFinite(y));
  if (!ys.length) return [0, 1];
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = Math.max(hi - lo, minSpan, 1e-6);
  const mid = (lo + hi) / 2;
  return [mid - span / 2, mid + span / 2];
}
