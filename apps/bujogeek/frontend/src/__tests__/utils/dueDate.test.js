import { describe, it, expect, afterEach } from 'vitest';
import { hasDueTime, dueDayKey, dueDayStart } from '../../utils/dueDate';

/**
 * `Task.dueDate` is the one field in the suite that is both a calendar date
 * and an instant, depending on the task — UTC midnight means "no particular
 * hour", anything else carries a due time. That is the gateway's own rule
 * (`graphql/bujogeek/reminderService.hasDueTime`), and until the going-over on
 * 2026-09-05 the client did not implement it: every read site used local
 * accessors, which is right for the timed half and exactly one day early for
 * the date-only half anywhere west of UTC.
 *
 * BURN_REVIEW #8 fixed the other direction (a 9pm task grouping under
 * tomorrow's UTC day). Both directions are asserted here so neither fix can be
 * undone by re-fixing the other.
 *
 * Node re-reads `process.env.TZ` on every date operation, so the host timezone
 * is driven from inside the test.
 */
const REAL_TZ = process.env.TZ;
function withTZ(tz, fn) {
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (REAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = REAL_TZ;
  }
}
afterEach(() => {
  if (REAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = REAL_TZ;
});

describe('hasDueTime', () => {
  it('is false at UTC midnight — the gateway’s definition of date-only', () => {
    expect(hasDueTime('2026-09-05T00:00:00.000Z')).toBe(false);
    expect(hasDueTime(new Date(Date.UTC(2026, 8, 5)))).toBe(false);
  });

  it('is true for any non-zero UTC time component', () => {
    expect(hasDueTime('2026-09-05T14:00:00.000Z')).toBe(true);
    expect(hasDueTime('2026-09-05T00:30:00.000Z')).toBe(true);
    expect(hasDueTime('2026-09-05T00:00:01.000Z')).toBe(true);
    expect(hasDueTime('2026-09-05T00:00:00.001Z')).toBe(true);
  });

  it('does not depend on the reader’s timezone', () => {
    const value = '2026-09-05T00:00:00.000Z';
    expect(withTZ('America/Chicago', () => hasDueTime(value))).toBe(false);
    expect(withTZ('Pacific/Kiritimati', () => hasDueTime(value))).toBe(false);
  });

  it('is false for a missing or unparseable value', () => {
    expect(hasDueTime(null)).toBe(false);
    expect(hasDueTime(undefined)).toBe(false);
    expect(hasDueTime('')).toBe(false);
    expect(hasDueTime('not a date')).toBe(false);
  });
});

describe('dueDayKey', () => {
  it('reads a date-only due date as the day it names, west of UTC', () =>
    withTZ('America/Chicago', () => {
      // UTC midnight on the 5th is 7pm on the 4th in Chicago. Reading it
      // locally is what put a task due today under yesterday's heading.
      expect(dueDayKey('2026-09-05T00:00:00.000Z')).toBe('2026-09-05');
    }));

  it('reads a date-only due date as the day it names, east of UTC', () =>
    withTZ('Pacific/Kiritimati', () => {
      expect(dueDayKey('2026-09-05T00:00:00.000Z')).toBe('2026-09-05');
    }));

  it('reads a timed due date as the LOCAL day (BURN_REVIEW #8)', () =>
    withTZ('America/Chicago', () => {
      // 23:30 on the 5th in Chicago is 04:30 on the 6th in UTC. It belongs to
      // the 5th, which is the day the user is living in.
      expect(dueDayKey('2026-09-06T04:30:00.000Z')).toBe('2026-09-05');
    }));

  it('returns ‘’ for a missing or unparseable value', () => {
    expect(dueDayKey(null)).toBe('');
    expect(dueDayKey(undefined)).toBe('');
    expect(dueDayKey('')).toBe('');
    expect(dueDayKey('not a date')).toBe('');
  });
});

describe('dueDayStart', () => {
  it('gives local midnight of the day a date-only value names', () =>
    withTZ('America/Chicago', () => {
      const d = dueDayStart('2026-09-05T00:00:00.000Z');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(8);
      expect(d.getDate()).toBe(5);
      expect(d.getHours()).toBe(0);
    }));

  it('gives local midnight of the LOCAL day a timed value falls on', () =>
    withTZ('America/Chicago', () => {
      const d = dueDayStart('2026-09-06T04:30:00.000Z'); // 23:30 on the 5th
      expect(d.getDate()).toBe(5);
      expect(d.getHours()).toBe(0);
    }));

  it('is what makes differenceInCalendarDays read "today" as today', () =>
    withTZ('America/Chicago', () => {
      // The failing scenario, in one assertion: Review files a task for today
      // by sending a bare yyyy-MM-dd, which the Date scalar parses to UTC
      // midnight. Read raw, that is yesterday evening locally.
      const raw = new Date('2026-09-05T00:00:00.000Z');
      expect(raw.getDate()).toBe(4);          // the bug
      expect(dueDayStart(raw).getDate()).toBe(5); // the fix
    }));

  it('returns null for a missing or unparseable value', () => {
    expect(dueDayStart(null)).toBeNull();
    expect(dueDayStart('')).toBeNull();
    expect(dueDayStart('not a date')).toBeNull();
  });
});
