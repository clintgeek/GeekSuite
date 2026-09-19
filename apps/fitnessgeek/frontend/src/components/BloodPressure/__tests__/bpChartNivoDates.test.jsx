/**
 * FITNESSGEEK_REVIEW: the BP trend chart's x-axis/tooltip labels rendered one
 * day early west of UTC.
 *
 * `log_date` is a CALENDAR date stored at UTC midnight (`@geeksuite/utils`,
 * `toUtcMidnight`) — same convention as `BPLogList` (see
 * `bpCalendarDates.test.jsx`). `BPChartNivo` built its `date` field (used for
 * both the x-axis tick labels and, via `point.data.x`, the tooltip title)
 * with `new Date(item.log_date).toLocaleDateString(...)`, which reads UTC
 * midnight back in the viewer's own zone — 6pm/7pm the previous day in
 * Central — so every point on the primary `/blood-pressure` visual was
 * labeled a day early. `displayCalendarDate` (forces `timeZone: 'UTC'`)
 * fixes it the same way `BPLogList` was fixed.
 *
 * `@nivo/line`'s `ResponsiveLine` is mocked (as in `BPChartNivo.test.jsx`)
 * purely to capture the `data` prop the component computes — jsdom can't
 * paint the chart, so this never needs to.
 *
 * Runs under TZ=America/Chicago (set below, before the component is
 * imported) so the off-by-one is actually reachable.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';

process.env.TZ = 'America/Chicago';

let capturedProps;
vi.mock('@nivo/line', () => ({
  ResponsiveLine: (props) => {
    capturedProps = props;
    return null;
  },
}));

const { default: BPChartNivo } = await import('../BPChartNivo.jsx');

// A reading taken on Feb 26, stored the way the backend stores it.
const FEB_26 = '2026-02-26T00:00:00.000Z';

describe('BPChartNivo labels points with the calendar day they were given', () => {
  beforeAll(() => {
    // Sanity: the environment really is west of UTC, or none of this proves
    // anything.
    expect(new Date(FEB_26).getDate()).toBe(25);
  });

  it('labels the Feb 26 reading "Feb 26", not "Feb 25"', () => {
    render(<BPChartNivo data={[{ log_date: FEB_26, systolic: 118, diastolic: 76 }]} />);

    const systolicSeries = capturedProps.data.find((s) => s.id === 'Systolic');
    expect(systolicSeries.data[0].x).toBe('Feb 26');
    expect(systolicSeries.data[0].x).not.toBe('Feb 25');
  });
});
