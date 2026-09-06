// Going-over 2026-09-05 — two Home-screen bugs, both about *when*.
//
// 1. `useHomeData` computed its rolling 14-day window at module load:
//
//      const now = new Date();
//      const todayStr = localDateString(now);
//
//    HomePage is the eager index route, so "today" was frozen at page load. A
//    tab left open overnight — a coop tablet, a wall dashboard — kept asking
//    the gateway for yesterday's window, so this morning's harvest never
//    showed and the 14-day average silently lagged a day.
//
// 2. `RecentActivity` rendered every row as an elapsed time. A bird's
//    `createdAt` is a real instant, so "20m ago" is right; a harvest `date`
//    and a hatch `setDate` are calendar days stored at UTC midnight, and
//    subtracting one of those from `now` measures the distance to UTC
//    midnight — a made-up precision, and a day out west of UTC.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MockedProvider } from '@apollo/client/testing';
import { createFlockTheme } from '../theme/theme';
import RecentActivity from '../components/home/RecentActivity';
import useHomeData from '../hooks/useHomeData';
import { GET_BIRDS, GET_FLOCK_GROUPS, GET_EGG_PRODUCTIONS, GET_HATCH_EVENTS } from '../graphql/queries';

const theme = createFlockTheme('dark');

const REAL_TZ = process.env.TZ;
afterEach(() => {
  vi.useRealTimers();
  if (REAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = REAL_TZ;
});

function freezeClockAt(iso) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(iso));
}

describe('useHomeData — the rolling window follows the clock', () => {
  it('asks for a window ending on today, not on the day the module was loaded', async () => {
    process.env.TZ = 'America/Chicago';

    // First render on one day...
    freezeClockAt('2026-09-05T15:00:00.000Z');
    const dayOne = renderWindow();

    // ...and again after the clock has rolled past local midnight.
    freezeClockAt('2026-09-08T15:00:00.000Z');
    const dayFour = renderWindow();

    expect(dayOne.endDate).toBe('2026-09-05');
    expect(dayFour.endDate).toBe('2026-09-08');
    expect(dayOne.startDate).toBe('2026-08-22');
    expect(dayFour.startDate).toBe('2026-08-25');
  });

  /** Render the hook once and return the egg query's variables. */
  function renderWindow() {
    let variables = null;

    function Probe() {
      useHomeData();
      return null;
    }

    const mocks = [
      { request: { query: GET_BIRDS, variables: {} }, result: { data: { birds: [] } } },
      { request: { query: GET_FLOCK_GROUPS, variables: {} }, result: { data: { flockGroups: [] } } },
      { request: { query: GET_HATCH_EVENTS, variables: {} }, result: { data: { hatchEvents: [] } } },
      {
        request: { query: GET_EGG_PRODUCTIONS },
        variableMatcher: (vars) => { variables = vars; return true; },
        result: { data: { eggProductions: [] } },
      },
    ];

    const { unmount } = render(
      <MockedProvider mocks={mocks}>
        <ThemeProvider theme={theme}><Probe /></ThemeProvider>
      </MockedProvider>
    );
    unmount();
    return variables ?? {};
  }
});

describe('RecentActivity — a calendar day is not an elapsed time', () => {
  const renderItems = (items) =>
    render(
      <ThemeProvider theme={theme}>
        <RecentActivity items={items} />
      </ThemeProvider>
    );

  it('shows a harvest date as its own day, not as hours ago', () => {
    process.env.TZ = 'America/Chicago';
    // 2026-09-05 14:00 local. The harvest's UTC-midnight value is 19 hours
    // behind this instant, which is what the old code printed.
    freezeClockAt('2026-09-05T19:00:00.000Z');

    renderItems([
      {
        id: 'egg-1',
        type: 'egg',
        text: '6 eggs logged',
        occurredAt: '2026-09-05T00:00:00.000Z',
        calendarDay: true,
      },
    ]);

    expect(screen.getByText('Sep 5')).toBeInTheDocument();
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
  });

  it('still shows a real instant as an elapsed time', () => {
    process.env.TZ = 'America/Chicago';
    freezeClockAt('2026-09-05T19:00:00.000Z');

    renderItems([
      {
        id: 'bird-1',
        type: 'bird',
        text: 'New bird: Clucky',
        occurredAt: '2026-09-05T18:30:00.000Z',
        calendarDay: false,
      },
    ]);

    expect(screen.getByText('30m ago')).toBeInTheDocument();
  });
});
