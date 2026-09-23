// planMath — Chef's real case on 2026-09-23: TDEE 2,537, BMR 2,114 (floor
// 1,691), 2 lb/week, Weekender — and got seven equal days.
import { describe, it, expect } from 'vitest';
import {
  computeWeeklySchedule, planTarget, weekenderHasRoom, weekenderSuggestion, minSafeCalories,
} from '../planMath.js';

const TDEE = 2537;
const FLOOR = minSafeCalories(2114);

// The wizard's schedule arithmetic before it moved here, written out again —
// moving it must not change a single number.
const legacyWeekender = (base, minCals) => {
  const maxCals = Math.round(base * 1.2);
  const floor = Math.max(minCals, Math.round(base * 0.8));
  const inc = Math.min(base * 0.15 * 2, Math.max(base - floor, 0) * 5);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => Math.round(Math.min(maxCals, Math.max(floor, i === 4 || i === 5 ? base + inc / 2 : base - inc / 5))));
};

describe('computeWeeklySchedule', () => {
  it.each([[2000, 1400], [1787, 1691], [2600, 1700], [1691, 1691]])('weekender at %i over floor %i matches the old arithmetic', (base, floor) => {
    expect(computeWeeklySchedule('weekender', base, floor).map((d) => d.calories)).toEqual(legacyWeekender(base, floor));
  });
  it('standard is seven equal days', () => {
    expect(new Set(computeWeeklySchedule('standard', 2000, 1400).map((d) => d.calories))).toEqual(new Set([2000]));
  });
});

describe('planTarget — the rate a plan actually delivers', () => {
  it('Chef: 2 lb/week is below the floor, so the target clamps to 1,691 and delivers ~1.7', () => {
    expect(FLOOR).toBe(1691);
    expect(planTarget({ tdee: TDEE, requestedRate: 2, minSafe: FLOOR })).toEqual({
      dailyCalories: 1691, floored: true, requestedRate: 2, effectiveRate: 1.7,
    });
  });
  it('above the floor the requested rate stands', () => {
    expect(planTarget({ tdee: TDEE, requestedRate: 1, minSafe: FLOOR })).toEqual({
      dailyCalories: 2037, floored: false, requestedRate: 1, effectiveRate: 1,
    });
  });
});

describe('Weekender room', () => {
  it('Chef at 2 lb/week: no room — every day at the floor', () => {
    const { dailyCalories } = planTarget({ tdee: TDEE, requestedRate: 2, minSafe: FLOOR });
    const schedule = computeWeeklySchedule('weekender', dailyCalories, FLOOR);
    expect(new Set(schedule.map((d) => d.calories))).toEqual(new Set([1691]));
    expect(weekenderHasRoom(schedule)).toBe(false);
  });
  it('suggests the fastest slower rate that makes room, with its real numbers', () => {
    expect(weekenderSuggestion({ tdee: TDEE, minSafe: FLOOR, currentRate: 1.7 })).toEqual({ rate: 1.5, weekday: 1691, weekend: 2027 });
  });
  it('null when even the slowest rate has no room', () => {
    expect(weekenderSuggestion({ tdee: 1500, minSafe: 1500, currentRate: 2 })).toBeNull();
  });
});
