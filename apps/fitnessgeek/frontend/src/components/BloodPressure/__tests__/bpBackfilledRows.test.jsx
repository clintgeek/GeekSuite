/**
 * The 79 rows the migration touched.
 *
 * `scripts/backfillBloodPressureMeasuredAt.js` seeded every legacy row's
 * `measured_at` from its own `log_date` — UTC midnight — because a calendar
 * day is genuinely all those rows ever recorded. Honest in Mongo, misleading
 * on screen: in Central, UTC midnight is 7:00 PM on the PREVIOUS day.
 *
 * Two distinct failures follow, and this file pins both:
 *
 *   1. DISPLAY — every historical reading would show a precise evening time
 *      nobody measured. `BPLogList` was written to show no time when
 *      `measured_at` is missing, but after the backfill it is never missing.
 *   2. SILENT DATA CHANGE — opening such a row in the edit dialog would
 *      pre-fill the previous day, so an edit that touched only the numbers
 *      would move the reading's date on Save.
 *
 * TZ is pinned to America/Chicago BEFORE the imports, so a UTC test machine
 * can't make these pass by accident — under UTC the bug is invisible.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

process.env.TZ = 'America/Chicago';

const { default: BPLogList } = await import('../BPLogList.jsx');
const { splitInstantToLocal, formatLocalTime, isDayResolutionInstant } = await import(
  '../bpTimeUtils.js'
);

// Exactly what the migration wrote: measured_at === log_date === UTC midnight.
const BACKFILLED = {
  id: 'bp-legacy',
  systolic: 128,
  diastolic: 78,
  pulse: 61,
  log_date: '2026-10-07T00:00:00.000Z',
  measured_at: '2026-10-07T00:00:00.000Z',
  notes: '',
};

// A reading actually taken at 8:01 AM Central on the same day.
const REAL = {
  id: 'bp-real',
  systolic: 120,
  diastolic: 80,
  pulse: 64,
  log_date: '2026-10-07T00:00:00.000Z',
  measured_at: '2026-10-07T13:01:00.000Z',
  notes: '',
};

describe('backfilled rows are day-resolution, not 7:00 PM the day before', () => {
  it('recognises a UTC-midnight instant as day-resolution and a real one as not', () => {
    expect(isDayResolutionInstant(BACKFILLED.measured_at)).toBe(true);
    expect(isDayResolutionInstant(REAL.measured_at)).toBe(false);
  });

  it('shows no time for a backfilled reading', () => {
    // Without the guard this is '7:00 PM' — a measurement that never happened.
    expect(formatLocalTime(BACKFILLED.measured_at)).toBe('');
  });

  it('still shows the real time for a reading that has one', () => {
    // The guard must not swallow genuine times; 13:01Z is 8:01 AM in Chicago.
    expect(formatLocalTime(REAL.measured_at)).toBe('8:01 AM');
  });

  it('pre-fills the edit dialog with the reading OWN day, not the day before', () => {
    // The data-loss case: local conversion of 2026-10-07T00:00Z yields
    // 2026-10-06 in Chicago, and saving would move the reading back a day.
    const { date, time } = splitInstantToLocal(BACKFILLED.measured_at);
    expect(date).toBe('2026-10-07');
    expect(time).toBe('');
  });

  it('renders a backfilled row without inventing a time in the list', () => {
    render(<BPLogList logs={[BACKFILLED]} onDelete={() => {}} onEdit={() => {}} />);
    // `*All*` queries throughout: the list renders each value in more than one
    // place (a compact and a wide variant), so the single-element queries
    // throw on the count rather than on the thing under test.
    expect(screen.queryAllByText(/7:00\s*PM/i)).toHaveLength(0);
    expect(screen.getAllByText(/128/).length).toBeGreaterThan(0);
  });

  it('still renders the time for a real reading in the list', () => {
    render(<BPLogList logs={[REAL]} onDelete={() => {}} onEdit={() => {}} />);
    expect(screen.getAllByText(/8:01\s*AM/i).length).toBeGreaterThan(0);
  });
});
