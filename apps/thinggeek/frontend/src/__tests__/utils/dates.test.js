import { describe, expect, it } from 'vitest';
import {
  calendarDateToUtcIso,
  daysUntilPurge,
  dueDateOf,
  dueText,
  formatCalendarDate,
  recurText,
  relativeDay,
  relativeInstant,
  utcIsoToInputValue,
} from '../../utils/dates';

describe('calendar days (UTC midnight) under a Chicago clock', () => {
  it('runs in America/Chicago', () => {
    expect(new Date('2026-03-01T00:00:00.000Z').getDate()).toBe(28); // Feb 28 locally
  });

  it('round-trips a picked day without slipping', () => {
    expect(calendarDateToUtcIso('2026-03-01')).toBe('2026-03-01T00:00:00.000Z');
    expect(utcIsoToInputValue('2026-03-01T00:00:00.000Z')).toBe('2026-03-01');
    expect(calendarDateToUtcIso('03/01/2026')).toBeNull();
    expect(utcIsoToInputValue('')).toBe('');
  });

  it('formats in UTC, not the local day before', () => {
    expect(formatCalendarDate('2026-03-01T00:00:00.000Z')).toBe('Mar 1, 2026');
  });

  it('prefers occursOn over the stored anchor', () => {
    expect(dueDateOf({ date: '2020-03-03T00:00:00.000Z', occursOn: '2027-03-03T00:00:00.000Z' })).toBe('2027-03-03T00:00:00.000Z');
    expect(dueDateOf({ date: '2020-03-03T00:00:00.000Z' })).toBe('2020-03-03T00:00:00.000Z');
    expect(dueDateOf(null)).toBeNull();
  });
});

describe('instants read locally', () => {
  it('an evening instant is still today in Chicago', () => {
    const now = new Date('2026-09-26T03:30:00.000Z'); // 10:30 PM Sep 25 in Chicago
    expect(relativeInstant('2026-09-26T01:00:00.000Z', now)).toBe('Today');
    expect(relativeInstant('2026-09-25T02:00:00.000Z', now)).toBe('Yesterday');
    expect(relativeInstant('2026-09-22T15:00:00.000Z', now)).toBe('3 days ago');
  });
});

describe('due wording from daysUntil', () => {
  it('dueText', () => {
    expect(dueText(0)).toBe('Due today');
    expect(dueText(1)).toBe('Due tomorrow');
    expect(dueText(12)).toBe('Due in 12 days');
    expect(dueText(-1)).toBe('Overdue by a day');
    expect(dueText(-3)).toBe('Overdue by 3 days');
    expect(dueText(150)).toBe('Due in 5 months');
    expect(dueText(900)).toBe('Due in 2 years');
    expect(dueText(NaN)).toBe('');
  });

  it('relativeDay', () => {
    expect(relativeDay(-3)).toBe('3 days overdue');
    expect(relativeDay(-1)).toBe('1 day overdue');
    expect(relativeDay(0)).toBe('Today');
    expect(relativeDay(12)).toBe('in 12 days');
  });

  it('recurText', () => {
    expect(recurText(12)).toBe('Every year');
    expect(recurText(24)).toBe('Every 2 years');
    expect(recurText(6)).toBe('Every 6 months');
    expect(recurText(1)).toBe('Every month');
    expect(recurText(null)).toBe('');
  });

  it('days left in the Trash', () => {
    const now = new Date('2026-09-25T12:00:00.000Z');
    expect(daysUntilPurge('2026-09-15T12:00:00.000Z', 30, now)).toBe(20);
    expect(daysUntilPurge('2026-08-01T12:00:00.000Z', 30, now)).toBe(0);
    expect(daysUntilPurge(null, 30, now)).toBe(30);
  });
});
