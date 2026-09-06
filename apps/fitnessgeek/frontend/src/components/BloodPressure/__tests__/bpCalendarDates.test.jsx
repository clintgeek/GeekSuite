/**
 * BURN_REVIEW P2 (c): blood-pressure dates rendered one day early west of UTC,
 * and the "time" column was always 7:00 PM.
 *
 * `log_date` is a CALENDAR date — the day the reading was taken — stored at
 * UTC midnight (`@geeksuite/utils`, `toUtcMidnight`). `BPLogList` rendered it
 * with a plain `toLocaleDateString()`, which reads UTC midnight in the viewer's
 * own zone: 6pm the previous day in Central. The `toLocaleTimeString()` beside
 * it printed that 6/7pm as if it were the time of the reading.
 *
 * `BPReport` had the same class one level up: it derived the ISO week from
 * `date.getDay()` / `setDate()` — LOCAL accessors on a UTC-midnight value — so
 * every reading was bucketed into the previous day's week west of UTC, and a
 * Sunday reading landed in the week before.
 *
 * These run under TZ=America/Chicago (set below, before the components are
 * imported) so the off-by-one is actually reachable.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

process.env.TZ = 'America/Chicago';

const { default: BPLogList } = await import('../BPLogList.jsx');

// A reading taken on Feb 26. Stored the way both writers store it.
const FEB_26 = '2026-02-26T00:00:00.000Z';

describe('BPLogList renders the calendar day it was given', () => {
  beforeAll(() => {
    // Sanity: the environment really is west of UTC, or none of this proves
    // anything.
    expect(new Date(FEB_26).getDate()).toBe(25);
  });

  it('shows Feb 26, not Feb 25', () => {
    render(
      <BPLogList
        logs={[{ id: 'bp1', systolic: 118, diastolic: 76, pulse: 62, log_date: FEB_26 }]}
        onDelete={() => {}}
      />
    );

    // Rendered twice (mobile + desktop layouts); both must say the 26th.
    const matches = screen.getAllByText(/Feb 26, 2026/);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.queryByText(/Feb 25, 2026/)).toBeNull();
  });

  it('never prints a time of day for a date that has none', () => {
    const { container } = render(
      <BPLogList
        logs={[{ id: 'bp1', systolic: 118, diastolic: 76, log_date: FEB_26 }]}
        onDelete={() => {}}
      />
    );

    // The old render put "6:00 PM" / "7:00 PM" here — UTC midnight in Central,
    // not a time anybody logged.
    expect(container.textContent).not.toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);
  });

  it('marks the reading logged on the viewer\'s own today', () => {
    // Build "today" the way the app does, then store it the way the API does.
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayUtcMidnight = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00:00.000Z`;

    render(
      <BPLogList
        logs={[{ id: 'bp1', systolic: 118, diastolic: 76, log_date: todayUtcMidnight }]}
        onDelete={() => {}}
      />
    );

    expect(screen.getAllByText(/Today/).length).toBeGreaterThan(0);
  });

  it('does not mark yesterday as today', () => {
    render(
      <BPLogList
        logs={[{ id: 'bp1', systolic: 118, diastolic: 76, log_date: FEB_26 }]}
        onDelete={() => {}}
      />
    );

    expect(screen.queryByText(/Today/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BPReport — the ISO-week grouping.
//
// Same class, one level up: `weekStart` was derived with `date.getDay()` /
// `setDate()` / `setHours()`, the LOCAL accessors, on a UTC-midnight value.
// West of UTC that reads the previous day, so a Sunday reading was bucketed
// into the week BEFORE its own and the report showed two weeks where there
// was one.
// ---------------------------------------------------------------------------
const { default: BPReport } = await import('../BPReport.jsx');

// 2026-03-01 is a Sunday; 2026-03-07 is the Saturday of the same week.
const SUNDAY = '2026-03-01T00:00:00.000Z';
const SATURDAY = '2026-03-07T00:00:00.000Z';

describe('BPReport groups by the UTC calendar week', () => {
  it('puts a Sunday and the following Saturday in ONE week', () => {
    render(
      <BPReport
        bpLogs={[
          { id: 'a', systolic: 118, diastolic: 76, log_date: SUNDAY },
          { id: 'b', systolic: 122, diastolic: 78, log_date: SATURDAY },
        ]}
        onClose={() => {}}
      />
    );

    // The phone and desktop layouts each render the range once.
    expect(screen.getAllByText('Mar 1 - Mar 7, 2026').length).toBeGreaterThan(0);
    // The bug's tell: the Sunday reading landing in the week starting Feb 22.
    expect(screen.queryByText(/Feb 22 - Feb 28/)).toBeNull();
  });

  it('prints the reporting period as calendar days, not raw ISO instants', () => {
    render(
      <BPReport
        bpLogs={[{ id: 'a', systolic: 118, diastolic: 76, log_date: SUNDAY }]}
        onClose={() => {}}
      />
    );

    expect(screen.getAllByText(/2026-03-01 - 2026-03-01/).length).toBeGreaterThan(0);
  });
});
