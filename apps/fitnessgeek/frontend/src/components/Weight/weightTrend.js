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
 *   - `projection` — from `programPace` (below): only once the PROGRAM has
 *                  two weeks of weigh-ins, from the least-squares slope of
 *                  every weigh-in since the program started, extended from
 *                  the latest 7-day mean toward the goal date.
 *                  It stops where it reaches the target.
 *
 * THE PROGRAM IS THE WINDOW (Chef, 2026-10-14: "seeing 2050 as a projection
 * before I ever start a program is a bit discouraging"). The rate used to be
 * the last 6 weeks / 28 days of logs whatever the goal said, so before a
 * program — or in its first weeks — it was measuring the flat weight of
 * life before the program, and remaining ÷ ~0 put the finish decades out.
 * Now pace, average and projection count only weigh-ins on or after the
 * goal's start date; readings before it still show as dots, for context.
 *
 * Every date is a CALENDAR day (`YYYY-MM-DD`, read in UTC via
 * `utcDateString`), never `parseISO(log_date)` — that reads a UTC-midnight
 * `log_date` in the browser's zone, which is the day before for anyone west
 * of UTC.
 */
import { rollingMean, utcDateString } from '@geeksuite/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The PROGRAM's weigh-ins must span this many days before a pace is measured. */
export const PROJECTION_MIN_SPAN_DAYS = 14;
/**
 * A projected finish later than this many plan-lengths past the start is not
 * shown as a date — "June 2050" is a division by a near-zero early slope, not
 * a forecast. The cards say how far behind plan instead.
 */
export const PROJECTION_MAX_PLAN_MULTIPLE = 2;
/**
 * Two trend points further apart than this are not joined: the line breaks.
 * A 7-day mean restarts after a week with no readings anyway, and a line drawn
 * across months with no weigh-ins (Chef: Dec 2025 → Sep 2026) invents a
 * smooth history nobody measured.
 */
export const LINE_BREAK_DAYS = 14;
/**
 * The "current run" of weigh-ins: walking back from the latest reading, the
 * run ends at the first gap longer than this. With a goal, the chart starts at
 * whichever is earlier — the goal's start or the run's — so the readings that
 * led up to a newly set goal are not hidden behind its start date.
 */
export const RUN_GAP_DAYS = 30;

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
/**
 * Split a run of points into the stretches a line may join: a new stretch
 * starts wherever two neighbours are more than `LINE_BREAK_DAYS` apart.
 *
 * Not done with `y: null` points: for an unstacked line nivo (0.99) passes a
 * null y through the linear scale, which turns it into a real position at 0 —
 * the line would dive off the chart instead of breaking.
 *
 * @template T
 * @param {T[]} items oldest first
 * @param {(item: T) => string} ymdOf the item's calendar day, `YYYY-MM-DD`
 * @returns {T[][]}
 */
export function splitAtGaps(items, ymdOfItem) {
  const out = [];
  let prevDay = null;
  for (const item of items || []) {
    const ymd = ymdOfItem(item);
    const day = ymd ? dayOf(ymd) : null;
    if (!out.length || (day !== null && prevDay !== null && day - prevDay > LINE_BREAK_DAYS)) out.push([]);
    out[out.length - 1].push(item);
    if (day !== null) prevDay = day;
  }
  return out;
}

const toPoints = (logs) => (logs || [])
  .map((l) => ({ x: utcDateString(l?.log_date), y: Number(l?.weight_value) }))
  .filter((p) => p.x && Number.isFinite(p.y) && p.y > 0)
  .sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0));

/** One 7-day trailing mean per calendar day, over `points` only. */
function dailyMeans(points) {
  const byDay = new Map();
  for (const m of rollingMean(points.map((p) => ({ date: p.x, value: p.y })), { windowDays: 7 })) {
    byDay.set(utcDateString(m.date), m.mean);
  }
  return [...byDay.entries()].map(([x, y]) => ({ x, y }));
}

/**
 * How the PROGRAM is going, measured from its start — the one rule the chart
 * and the progress cards share.
 *
 * @param {Array<{log_date: string, weight_value: number}>} logs
 * @param {{enabled?: boolean, startDate: any, goalDate: any, startWeight: number, targetWeight: number}|null} goal
 * @param {{today?: string}} [opts] `today` as YYYY-MM-DD (tests); defaults to the UTC calendar day
 * @returns {{
 *   phase: 'none'|'not-started'|'too-early'|'measured',
 *   startDate: string|null, goalDate: string|null,
 *   programDays: number,          // days of weigh-ins inside the program so far
 *   trend: Array<{x: string, y: number}>,   // 7-day means of program weigh-ins only
 *   slopePerWeek: number|null,    // signed, unit/week, since the start
 *   projectedDate: string|null,   // YYYY-MM-DD the trend reaches the target
 *   heading: 'toward'|'away'|'flat'|'done'|null,
 *   onTrack: boolean|null,        // projected on or before the goal date
 *   tooFar: boolean,              // projected past PROJECTION_MAX_PLAN_MULTIPLE plans
 * }}
 */
export function programPace(logs = [], goal = null, { today } = {}) {
  const base = {
    phase: 'none', startDate: null, goalDate: null, programDays: 0, trend: [],
    slopePerWeek: null, projectedDate: null, heading: null, onTrack: null, tooFar: false,
  };
  const startDate = goal && goal.enabled !== false ? utcDateString(goal.startDate) : '';
  const goalDate = startDate ? utcDateString(goal.goalDate) : '';
  const target = Number(goal?.targetWeight);
  if (!startDate || !goalDate || !Number.isFinite(target)) return base;

  const todayYmd = today || utcDateString(new Date());
  const out = { ...base, startDate, goalDate };
  if (todayYmd < startDate) return { ...out, phase: 'not-started' };

  const program = toPoints(logs).filter((p) => p.x >= startDate && p.x <= todayYmd);
  const trend = dailyMeans(program);
  const programDays = program.length ? dayOf(program[program.length - 1].x) - dayOf(program[0].x) : 0;
  if (programDays < PROJECTION_MIN_SPAN_DAYS) return { ...out, phase: 'too-early', programDays, trend };

  // Pace = least-squares slope through every program weigh-in. Not through
  // the 7-day means: near the start those average fewer days, which biases
  // the slope; water noise in the raw readings cancels out in the fit.
  const slope = slopeOf(program.map((p) => [dayOf(p.x), p.y]));
  const measured = { ...out, phase: 'measured', programDays, trend };
  if (slope === null) return measured;

  const lastDay = dayOf(trend[trend.length - 1].x);
  const lastMean = trend[trend.length - 1].y;
  const toGo = target - lastMean;
  const slopePerWeek = Math.round(slope * 7 * 100) / 100;
  const goalDay = dayOf(goalDate);

  if (Math.abs(toGo) < 0.05) {
    return { ...measured, slopePerWeek, heading: 'done', projectedDate: ymdOf(lastDay), onTrack: true };
  }
  if (Math.abs(slope) < 1e-6) return { ...measured, slopePerWeek, heading: 'flat', onTrack: false, tooFar: true };
  if (Math.sign(slope) !== Math.sign(toGo)) return { ...measured, slopePerWeek, heading: 'away', onTrack: false };

  const finishDay = lastDay + Math.max(1, Math.round(toGo / slope));
  const planDays = Math.max(1, goalDay - dayOf(startDate));
  const tooFar = finishDay > dayOf(startDate) + PROJECTION_MAX_PLAN_MULTIPLE * planDays;
  return {
    ...measured,
    slopePerWeek,
    heading: 'toward',
    projectedDate: tooFar ? null : ymdOf(finishDay),
    onTrack: finishDay <= goalDay,
    tooFar,
  };
}

export function buildWeightTrend(logs = [], { goal = null, today } = {}) {
  const valid = toPoints(logs);

  const empty = { readings: [], trend: [], goalLine: null, projection: null, spanDays: 0 };
  if (!valid.length) return empty;

  // One trend point per day: same-day readings share a window, so they share
  // a mean — keep the last, which is the same number.
  const allTrend = dailyMeans(valid);

  const lastDay = dayOf(valid[valid.length - 1].x);

  // The current run: back from the latest reading until a gap > RUN_GAP_DAYS.
  let runStartIdx = valid.length - 1;
  while (runStartIdx > 0 && dayOf(valid[runStartIdx].x) - dayOf(valid[runStartIdx - 1].x) <= RUN_GAP_DAYS) {
    runStartIdx -= 1;
  }
  const runStart = valid[runStartIdx].x;
  // Span for the projection gate is the CURRENT run's: nine months of history
  // before a gap say nothing about this month's slope.
  const spanDays = lastDay - dayOf(runStart);

  const goalOn = Boolean(goal && goal.enabled);
  const gStart = goalOn ? utcDateString(goal.startDate) : '';
  const gEnd = goalOn ? utcDateString(goal.goalDate) : '';
  const hasGoalLine = goalOn && gStart && gEnd && goal.startWeight && goal.targetWeight;

  // With a goal the chart is the goal's window — widened back to the start of
  // the current run when that is earlier, and forward to the latest reading
  // once the goal date has passed; without one, everything. The end used to
  // stop at the goal date, so the day after it every new weigh-in fell
  // outside the window and the chart said "No weight data" over a page of
  // weights.
  const lastX = valid[valid.length - 1].x;
  const windowStart = hasGoalLine && runStart < gStart ? runStart : gStart;
  const windowEnd = hasGoalLine && lastX > gEnd ? lastX : gEnd;
  const inWindow = (p) => !hasGoalLine || (p.x >= windowStart && p.x <= windowEnd);
  const readings = valid.filter(inWindow);
  const trend = allTrend.filter(inWindow);

  const goalLine = hasGoalLine
    ? [{ x: gStart, y: goal.startWeight }, { x: gEnd, y: goal.targetWeight }]
    : null;

  // Pace, average and projection are the PROGRAM's (programPace): readings
  // from before the start still show as dots, but the 7-day line inside the
  // goal window is built from program weigh-ins only.
  let projection = null;
  let programTrend = trend;
  let pace = null;
  if (hasGoalLine) {
    pace = programPace(logs, goal, { today });
    programTrend = [
      ...trend.filter((p) => p.x < gStart),
      ...pace.trend.filter((p) => p.x <= windowEnd),
    ];
    if (pace.phase === 'measured' && pace.slopePerWeek !== null && pace.trend.length) {
      const last = pace.trend[pace.trend.length - 1];
      const lastDay = dayOf(last.x);
      const goalDay = dayOf(gEnd);
      if (goalDay > lastDay) {
        // Reaches the target before the goal date: stop there. Otherwise run
        // to the goal date, showing where the trend lands by then.
        const endX = pace.heading === 'toward' && pace.onTrack && pace.projectedDate ? pace.projectedDate : gEnd;
        const endY = endX === gEnd && !(pace.heading === 'toward' && pace.onTrack)
          ? last.y + (pace.slopePerWeek / 7) * (goalDay - lastDay)
          : goal.targetWeight;
        projection = {
          points: [
            { x: last.x, y: last.y },
            { x: endX, y: Math.round(endY * 10) / 10 },
          ],
          onTrack: Boolean(pace.onTrack),
          slopePerWeek: pace.slopePerWeek,
        };
      }
    }
  }

  return { readings, trend: programTrend, goalLine, projection, spanDays, pace };
}

export default buildWeightTrend;
