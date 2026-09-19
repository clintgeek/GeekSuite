/**
 * FITNESSGEEK_REVIEW: weight log dates rendered one day early west of UTC.
 *
 * `log_date` is a CALENDAR date — the day the weight was logged — stored at
 * UTC midnight (`@geeksuite/utils`, `toUtcMidnight`). `WeightLogList`
 * rendered it with `new Date(dateString)` then `.toDateString()` /
 * `.toLocaleDateString()`, both of which read UTC midnight back in the
 * viewer's own zone: 6pm/7pm the previous day in Central. That broke two
 * things at once — the printed date was a day early, and
 * `date.toDateString() === today.toDateString()` (also local accessors)
 * never matched, so today's own entry never showed "Today".
 *
 * Same class of bug as BPLogList (see `bpCalendarDates.test.jsx`), fixed the
 * same way: compare calendar-day strings with `utcDateString`/
 * `localDateString`, and render with `displayCalendarDate` (forces
 * `timeZone: 'UTC'`).
 *
 * Runs under TZ=America/Chicago (set below, before the component is
 * imported) so the off-by-one is actually reachable.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

process.env.TZ = 'America/Chicago';

const { default: WeightLogList } = await import('../WeightLogList.jsx');

// A weight logged on Feb 26, stored the way the backend stores it.
const FEB_26 = '2026-02-26T00:00:00.000Z';

describe('WeightLogList renders the calendar day it was given', () => {
  beforeAll(() => {
    // Sanity: the environment really is west of UTC, or none of this proves
    // anything.
    expect(new Date(FEB_26).getDate()).toBe(25);
  });

  it('shows Feb 26, not Feb 25', () => {
    render(
      <WeightLogList
        logs={[{ id: 'w1', weight_value: 180.4, log_date: FEB_26 }]}
        onDelete={() => {}}
      />
    );

    expect(screen.getByText('Feb 26, 2026')).toBeInTheDocument();
    expect(screen.queryByText('Feb 25, 2026')).toBeNull();
  });

  it('marks the entry logged on the viewer\'s own today as "Today"', () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayUtcMidnight = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00:00.000Z`;

    render(
      <WeightLogList
        logs={[{ id: 'w1', weight_value: 180.4, log_date: todayUtcMidnight }]}
        onDelete={() => {}}
      />
    );

    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('does not mark yesterday as today', () => {
    render(
      <WeightLogList
        logs={[{ id: 'w1', weight_value: 180.4, log_date: FEB_26 }]}
        onDelete={() => {}}
      />
    );

    expect(screen.queryByText('Today')).toBeNull();
  });

  it('marks the day before today as "Yesterday", using the local calendar', () => {
    const now = new Date();
    const yesterdayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const pad = (n) => String(n).padStart(2, '0');
    const yesterdayUtcMidnight = `${yesterdayLocal.getFullYear()}-${pad(yesterdayLocal.getMonth() + 1)}-${pad(yesterdayLocal.getDate())}T00:00:00.000Z`;

    render(
      <WeightLogList
        logs={[{ id: 'w1', weight_value: 180.4, log_date: yesterdayUtcMidnight }]}
        onDelete={() => {}}
      />
    );

    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });
});
