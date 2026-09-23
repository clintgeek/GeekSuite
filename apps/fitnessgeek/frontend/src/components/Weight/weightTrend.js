/**
 * weightTrend — what the weight chart draws, as pure data.
 *
 * The smoothing rule (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md §0) says a weight
 * chart's LINE is a 7-day trailing mean and the raw readings are dots. The
 * old chart connected raw points, so a salty dinner drew a cliff; and it
 * projected from the last four logs whatever their span, so two readings a
 * day apart set the finish date (F7).
 *
 * So:
 *   - `readings` — every log, one dot each;
 *   - `trend`    — `rollingMean` over ALL logs (a mean near the start of the
 *                  goal window still includes the days before it — that is
 *                  what "trailing" means), one point per calendar day;
 *   - `projection` — only when the logs span ≥ 14 days, and only from the
 *                  smoothed trend: the least-squares slope of the 7-day means
 *                  over the last 28 days, extended from the latest mean
 *                  toward the goal date. It stops where it reaches the target.
 *
 * Every date is a CALENDAR day (`YYYY-MM-DD`, read in UTC via
 * `utcDateString`), never `parseISO(log_date)` — that reads a UTC-midnight
 * `log_date` in the browser's zone, which is the day before for anyone west
 * of UTC.
 */
import { rollingMean, utcDateString } from '@geeksuite/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The logs must span this many days before a projection is drawn. */
export const PROJECTION_MIN_SPAN_DAYS = 14;
/** The slope is fitted over this many days of 7-day means… */
export const PROJECTION_FIT_DAYS = 28;
/** …which themselves must span at least this long. */
export const PROJECTION_MIN_FIT_SPAN_DAYS = 14;

const dayOf = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
const ymdOf = (day) => utcDateString(new Date(day * DAY_MS));

/** Least-squares slope (value per day) of `[day, value]` pairs, or null. */
function slopeOf(pairs) {
  if (pairs.length < 2) return null;
  const n = pairs.length;
  const mx = pairs.reduce((a, [x]) => a + x, 0) / n;
  const my = pairs.reduce((a, [, y]) => a + y, 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/**
 * @param {Array<{log_date: string, weight_value: number}>} logs
 * @param {Object} [opts]
 * @param {Object|null} [opts.goal] `{ enabled, startDate, goalDate, startWeight, targetWeight }`
 * @returns {{
 *   readings: Array<{x: string, y: number}>,
 *   trend: Array<{x: string, y: number}>,
 *   goalLine: Array<{x: string, y: number}>|null,
 *   projection: {points: Array<{x: string, y: number}>, onTrack: boolean, slopePerWeek: number}|null,
 *   spanDays: number,
 * }}
 */
export function buildWeightTrend(logs = [], { goal = null } = {}) {
  const valid = (logs || [])
    .map((l) => ({ x: utcDateString(l?.log_date), y: Number(l?.weight_value) }))
    .filter((p) => p.x && Number.isFinite(p.y) && p.y > 0)
    .sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0));

  const empty = { readings: [], trend: [], goalLine: null, projection: null, spanDays: 0 };
  if (!valid.length) return empty;

  // One trend point per day: same-day readings share a window, so they share
  // a mean — keep the last, which is the same number.
  const byDay = new Map();
  for (const m of rollingMean(valid.map((p) => ({ date: p.x, value: p.y })), { windowDays: 7 })) {
    byDay.set(utcDateString(m.date), m.mean);
  }
  const allTrend = [...byDay.entries()].map(([x, y]) => ({ x, y }));

  const firstDay = dayOf(valid[0].x);
  const lastDay = dayOf(valid[valid.length - 1].x);
  const spanDays = lastDay - firstDay;

  const goalOn = Boolean(goal && goal.enabled);
  const gStart = goalOn ? utcDateString(goal.startDate) : '';
  const gEnd = goalOn ? utcDateString(goal.goalDate) : '';
  const hasGoalLine = goalOn && gStart && gEnd && goal.startWeight && goal.targetWeight;

  // With a goal the chart is the goal's window; without one, everything.
  const inWindow = (p) => !hasGoalLine || (p.x >= gStart && p.x <= gEnd);
  const readings = valid.filter(inWindow);
  const trend = allTrend.filter(inWindow);

  const goalLine = hasGoalLine
    ? [{ x: gStart, y: goal.startWeight }, { x: gEnd, y: goal.targetWeight }]
    : null;

  let projection = null;
  if (hasGoalLine && trend.length && spanDays >= PROJECTION_MIN_SPAN_DAYS) {
    const fit = allTrend
      .map((p) => [dayOf(p.x), p.y])
      .filter(([d]) => d > lastDay - PROJECTION_FIT_DAYS);
    const fitSpan = fit.length ? fit[fit.length - 1][0] - fit[0][0] : 0;
    const slope = fitSpan >= PROJECTION_MIN_FIT_SPAN_DAYS ? slopeOf(fit) : null;
    const goalDay = dayOf(gEnd);
    const lastMean = allTrend[allTrend.length - 1].y;

    if (slope !== null && goalDay > lastDay) {
      const target = goal.targetWeight;
      const toGo = target - lastMean;
      // Heading toward the target: stop the line where it gets there.
      const towards = toGo !== 0 && Math.sign(slope) === Math.sign(toGo);
      const daysToTarget = towards ? toGo / slope : Infinity;
      const onTrack = toGo === 0 || daysToTarget <= goalDay - lastDay;
      const endDay = onTrack && toGo !== 0 ? lastDay + Math.max(1, Math.round(daysToTarget)) : goalDay;
      const endY = onTrack ? target : lastMean + slope * (goalDay - lastDay);
      projection = {
        points: [
          { x: ymdOf(lastDay), y: lastMean },
          { x: ymdOf(endDay), y: Math.round(endY * 10) / 10 },
        ],
        onTrack,
        slopePerWeek: Math.round(slope * 7 * 100) / 100,
      };
    }
  }

  return { readings, trend, goalLine, projection, spanDays };
}

export default buildWeightTrend;
