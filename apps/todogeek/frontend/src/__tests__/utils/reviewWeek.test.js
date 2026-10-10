import { describe, it, expect } from 'vitest';
import { currentWeekStart, weekStartKey, weekLabel } from '../../utils/reviewWeek';

/**
 * The gateway rejects a `weekStart` that is not a Monday, so the client has
 * exactly one job here and it must never be wrong. Run under
 * `TZ=America/Chicago` (vitest inherits the shell's zone) — the case that
 * matters is west of UTC, where a `toISOString()` on local midnight is still
 * the previous day.
 */
describe('reviewWeek', () => {
  it('lands on Monday from every day of the week', () => {
    // 2026-08-31 is a Monday; walk the whole week off it.
    for (let i = 0; i < 7; i += 1) {
      const someDay = new Date(2026, 7, 31 + i, 13, 45);
      const monday = currentWeekStart(someDay);
      expect(monday.getDay()).toBe(1);
      expect(weekStartKey(monday)).toBe('2026-08-31');
    }
  });

  it('a Sunday belongs to the week that started six days earlier, not the next one', () => {
    // Sunday 2026-09-06, late in the evening.
    expect(weekStartKey(currentWeekStart(new Date(2026, 8, 6, 23, 30)))).toBe('2026-08-31');
    // Monday 2026-09-07 rolls over.
    expect(weekStartKey(currentWeekStart(new Date(2026, 8, 7, 0, 5)))).toBe('2026-09-07');
  });

  it('the key is the LOCAL Monday, which is what the gateway validates', () => {
    // Local midnight on the Monday: `toISOString()` would say 2026-08-30 in
    // any zone west of UTC, and the gateway would reject it as a Sunday.
    const monday = currentWeekStart(new Date(2026, 7, 31, 0, 0));
    expect(weekStartKey(monday)).toBe('2026-08-31');
  });

  it('names the week Monday through Sunday', () => {
    expect(weekLabel(new Date(2026, 7, 31))).toBe('31 Aug – 6 Sep');
  });
});
