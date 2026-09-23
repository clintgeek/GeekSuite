/**
 * planMath — the Calorie Wizard's schedule arithmetic, pure so it can be
 * tested directly.
 *
 * Why it moved out of AIGoalPlanner (2026-09-23): Chef chose a Weekender plan
 * and got the same target every day. The arithmetic was right — at 2 lb/week
 * his target sat BELOW the safety floor (80% of BMR), was clamped UP to it,
 * and a Weekender only moves calories to Fri/Sat by cutting other days, which
 * can't go under the floor either. Zero room, so seven equal days. What was
 * wrong was saying nothing, and a second thing the same clamp hid: a plan
 * pinned at the floor can't deliver the rate the user asked for, yet the
 * timeline and the tracker's pace were both built on it.
 */

/** 1 lb of body fat ≈ 3,500 kcal, so 1 lb/week ≈ 500 kcal/day. */
export const KCAL_PER_LB_PER_WEEK_DAY = 500;
/** Weekender: Fri and Sat each get up to this much more than the base target. */
export const WEEKENDER_INCREASE = 0.15;
/** No day moves further than this from the base target. */
export const SCHEDULE_CAP = 0.2;
/** The rates the wizard offers, in lb/week. */
export const RATE_OPTIONS = [0.5, 1, 1.5, 2, 2.5];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Minimum recommended calories: max(1200, BMR − 20%). */
export const minSafeCalories = (bmr) => Math.max(1200, Math.round(bmr * 0.8));

/**
 * The seven-day schedule for a plan type. Identical arithmetic to the
 * wizard's original inline version.
 *
 * @param {'standard'|'weekender'|'auto'} planType
 * @param {number} baseTarget the daily target
 * @param {number} minSafe the safety floor
 */
export function computeWeeklySchedule(planType, baseTarget, minSafe) {
  const maxCals = Math.round(baseTarget * (1 + SCHEDULE_CAP));
  const floor = Math.max(minSafe, Math.round(baseTarget * (1 - SCHEDULE_CAP)));

  if (planType === 'weekender') {
    // Extra on Fri/Sat, paid for by the other five days, which can't go
    // under the floor — so the increase is whatever those days can give up.
    const wanted = baseTarget * WEEKENDER_INCREASE * 2;
    const available = Math.max(baseTarget - floor, 0) * 5;
    const increase = Math.min(wanted, available);
    return DAYS.map((day, idx) => {
      const raw = idx === 4 || idx === 5 ? baseTarget + increase / 2 : baseTarget - increase / 5;
      return { day, calories: Math.round(Math.min(maxCals, Math.max(floor, raw))) };
    });
  }
  // 'standard', 'auto' (adjusts at runtime), and anything unknown.
  return DAYS.map((day) => ({ day, calories: Math.round(baseTarget) }));
}

/**
 * The daily target and the rate it actually delivers.
 *
 * @returns {{ dailyCalories: number, floored: boolean, requestedRate: number,
 *   effectiveRate: number }} `effectiveRate` is lb/week to one decimal; it
 *   equals the requested rate unless the floor clamped the target.
 */
export function planTarget({ tdee, requestedRate, minSafe }) {
  const requested = Number(requestedRate);
  const wanted = tdee - requested * KCAL_PER_LB_PER_WEEK_DAY;
  const floored = wanted < minSafe;
  const dailyCalories = floored ? minSafe : wanted;
  const effectiveRate = floored
    ? Math.max(0, Math.round(((tdee - dailyCalories) / KCAL_PER_LB_PER_WEEK_DAY) * 10) / 10)
    : requested;
  return { dailyCalories: Math.round(dailyCalories), floored, requestedRate: requested, effectiveRate };
}

/** True when a Weekender schedule actually gives Fri/Sat more than other days. */
export const weekenderHasRoom = (schedule) => {
  if (!Array.isArray(schedule) || schedule.length !== 7) return false;
  return schedule[4].calories > schedule[0].calories;
};

/**
 * The fastest offered rate, slower than `currentRate`, at which a Weekender
 * has room — and what that schedule would be. Null if even the slowest has
 * none.
 */
export function weekenderSuggestion({ tdee, minSafe, currentRate }) {
  const slower = RATE_OPTIONS.filter((r) => r < Number(currentRate)).sort((a, b) => b - a);
  for (const rate of slower) {
    const { dailyCalories } = planTarget({ tdee, requestedRate: rate, minSafe });
    const schedule = computeWeeklySchedule('weekender', dailyCalories, minSafe);
    if (weekenderHasRoom(schedule)) {
      return { rate, weekday: schedule[0].calories, weekend: schedule[4].calories };
    }
  }
  return null;
}
