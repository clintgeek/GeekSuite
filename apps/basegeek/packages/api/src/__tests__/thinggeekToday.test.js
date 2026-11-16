/**
 * thinggeekToday.test.js — SUITE_REVIEW_2026-11 ThingGeek finding 2 / S-D4.
 *
 * "Today" for ThingGeek's due/expiring rules is the household's calendar day
 * (HOUSEHOLD_TIME_ZONE, default America/Chicago), not the UTC day. At 7 PM
 * Central the UTC day is already tomorrow, and a warranty due today read
 * "Overdue by a day".
 *
 * Only `Date` is faked here; nothing in this file touches Mongo.
 */
import { describe, test, expect, jest, afterEach } from '@jest/globals';

const { householdToday, householdTimeZone, DEFAULT_HOUSEHOLD_TIME_ZONE } = await import('../graphql/shared/householdToday.js');
const { daysUntil, renderDate, nextDueOf, todayLocal, dueBucketClause, occurrenceStages } = await import('../graphql/thinggeek/dates.js');
const { resolvers } = await import('../graphql/thinggeek/resolvers.js');

const day = (s) => new Date(`${s}T00:00:00.000Z`);
// 7:00 PM CST on Sunday 2026-11-15 — the UTC date is already the 16th.
const EVENING_CENTRAL = new Date('2026-11-16T01:00:00.000Z');

function freezeAt(instant) {
  jest.useFakeTimers({
    now: instant,
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance'],
  });
}

afterEach(() => jest.useRealTimers());

describe('householdToday (shared/householdToday.js)', () => {
  test('is the Chicago calendar day by default, as UTC midnight', () => {
    expect(householdToday(EVENING_CENTRAL, 'America/Chicago')).toEqual(day('2026-11-15'));
    expect(householdToday(new Date('2026-11-16T06:30:00.000Z'), 'America/Chicago')).toEqual(day('2026-11-16'));
    // summer (CDT, UTC-5): 11:30 PM local is still the 15th
    expect(householdToday(new Date('2026-07-16T04:30:00.000Z'), 'America/Chicago')).toEqual(day('2026-07-15'));
  });

  test('one setting: HOUSEHOLD_TIME_ZONE, default America/Chicago, bad values fall back to the default', () => {
    expect(DEFAULT_HOUSEHOLD_TIME_ZONE).toBe('America/Chicago');
    expect(householdTimeZone({})).toBe('America/Chicago');
    expect(householdTimeZone({ HOUSEHOLD_TIME_ZONE: '' })).toBe('America/Chicago');
    expect(householdTimeZone({ HOUSEHOLD_TIME_ZONE: 'Not/AZone' })).toBe('America/Chicago');
    expect(householdTimeZone({ HOUSEHOLD_TIME_ZONE: 'Europe/London' })).toBe('Europe/London');
    expect(householdToday(EVENING_CENTRAL, 'Europe/London')).toEqual(day('2026-11-16'));
    expect(householdToday(EVENING_CENTRAL, 'Not/AZone')).toEqual(day('2026-11-15'));
  });
});

describe('ThingGeek dates at 7 PM Central', () => {
  test('todayLocal and every default "today" are the household day', () => {
    freezeAt(EVENING_CENTRAL);
    expect(todayLocal()).toEqual(day('2026-11-15'));
    expect(daysUntil(day('2026-11-15'))).toBe(0);
    expect(daysUntil(day('2026-11-16'))).toBe(1);
    expect(renderDate({ date: day('2026-11-15') }).status).toBe('soon');
    expect(nextDueOf([{ date: day('2026-11-15') }]).daysUntil).toBe(0);
    expect(dueBucketClause('overdue')).toEqual({ __occ: { $elemMatch: { $lt: day('2026-11-15') } } });
    expect(JSON.stringify(occurrenceStages())).toContain('2026-11-15T00:00:00.000Z');
  });

  test('Thing.dates: a warranty due today is due today, not "Overdue by a day"', () => {
    freezeAt(EVENING_CENTRAL);
    const [today, tomorrow] = resolvers.Thing.dates({
      dates: [{ kind: 'warranty', date: day('2026-11-15') }, { kind: 'registration', date: day('2026-11-16') }],
    });
    expect(today).toMatchObject({ daysUntil: 0, status: 'soon' });
    expect(tomorrow).toMatchObject({ daysUntil: 1, status: 'soon' });
  });
});
