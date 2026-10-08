import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  calendarDayToIso,
  isoToCalendarDay,
  shelfMoveInput,
  todayAsCalendarIso,
} from '../../utils/lastRead';
import { formatReadingDate } from '../../views/detail/bookFacts';

// The rule is about the viewer's timezone, so pin one west of UTC, where
// the evening is already "tomorrow" in UTC. Node honours a runtime TZ change
// for Dates created afterwards (same trick as bookFacts.test.js).
let savedTz;
beforeAll(() => { savedTz = process.env.TZ; process.env.TZ = 'America/Chicago'; });
afterAll(() => { process.env.TZ = savedTz; });

describe('todayAsCalendarIso — the viewer\'s local today, stored as UTC midnight', () => {
  it('at 9 PM Central on Oct 8 it is Oct 8, not Oct 9 (UTC says 02:00 on the 9th)', () => {
    const ninePmCentral = new Date('2026-10-09T02:00:00.000Z');
    expect(ninePmCentral.getDate()).toBe(8); // sanity: the runner really is in Central
    expect(todayAsCalendarIso(ninePmCentral)).toBe('2026-10-08T00:00:00.000Z');
  });

  it('just after local midnight it is the new local day', () => {
    // 00:30 CDT on Oct 9 = 05:30 UTC on Oct 9.
    expect(todayAsCalendarIso(new Date('2026-10-09T05:30:00.000Z'))).toBe('2026-10-09T00:00:00.000Z');
  });

  it('shows on the same day it was set, through formatReadingDate', () => {
    const iso = todayAsCalendarIso(new Date('2026-10-09T02:00:00.000Z'));
    expect(formatReadingDate(iso, { month: 'short', day: 'numeric', year: 'numeric' }))
      .toBe(new Date(2026, 9, 8).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));
  });
});

describe('calendarDayToIso — a chosen day', () => {
  it('is that day\'s UTC midnight', () => {
    expect(calendarDayToIso('2026-10-08')).toBe('2026-10-08T00:00:00.000Z');
    expect(calendarDayToIso('2024-03-01')).toBe('2024-03-01T00:00:00.000Z');
  });

  it('clears to null on blank, and refuses a day that does not exist', () => {
    expect(calendarDayToIso('')).toBeNull();
    expect(calendarDayToIso(null)).toBeNull();
    expect(calendarDayToIso('2026-02-31')).toBeNull();
    expect(calendarDayToIso('Oct 8')).toBeNull();
  });
});

describe('isoToCalendarDay — the date input\'s value', () => {
  it('reads a UTC-midnight day in UTC (the imported dates)', () => {
    expect(isoToCalendarDay('2024-03-01T00:00:00.000Z')).toBe('2024-03-01');
  });

  it('reads a genuine instant locally, the day formatReadingDate shows', () => {
    expect(isoToCalendarDay('2026-10-09T02:00:00.000Z')).toBe('2026-10-08');
  });

  it('round-trips a chosen day', () => {
    expect(isoToCalendarDay(calendarDayToIso('2026-10-08'))).toBe('2026-10-08');
  });

  it('is blank for nothing', () => {
    expect(isoToCalendarDay(null)).toBe('');
    expect(isoToCalendarDay('nope')).toBe('');
  });
});

describe('shelfMoveInput — moving to Read fills today in the same update', () => {
  const now = new Date('2026-10-09T02:00:00.000Z'); // 9 PM Central, Oct 8

  it('fills today when the book has no last-read date', () => {
    expect(shelfMoveInput({ shelf: 'reading', dateFinished: null }, 'read', undefined, now)).toEqual({
      input: { shelf: 'read', dateFinished: '2026-10-08T00:00:00.000Z' },
      autoFilled: true,
    });
  });

  it('leaves an existing date alone (a re-read asks instead)', () => {
    expect(shelfMoveInput({ shelf: 'reading', dateFinished: '2024-03-01T00:00:00.000Z' }, 'read', undefined, now))
      .toEqual({ input: { shelf: 'read' }, autoFilled: false });
  });

  it('never touches the date for any other shelf', () => {
    expect(shelfMoveInput({ shelf: 'read', dateFinished: null }, 'reading', undefined, now))
      .toEqual({ input: { shelf: 'reading' }, autoFilled: false });
  });

  it('an explicit dateFinished (Undo) wins, including null', () => {
    expect(shelfMoveInput({ shelf: 'want-to-read' }, 'read', { dateFinished: null }, now))
      .toEqual({ input: { shelf: 'read', dateFinished: null }, autoFilled: false });
  });
});
