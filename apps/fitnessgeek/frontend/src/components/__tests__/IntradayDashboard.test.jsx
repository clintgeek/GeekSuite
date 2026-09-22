/**
 * The Overview cards.
 *
 * Each card showed a "trend" chip that compared the last ten data points with
 * the ten before — on a minute-by-minute series, so it measured the last few
 * minutes, presented beside what reads as the day's figure, and coloured any
 * rise red (backwards for body battery). The headline was the day's last
 * sample under a "real-time" tooltip, and a day with no readings showed 0.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// nivo needs a real layout engine; the charts are not what is under test.
vi.mock('@nivo/line', () => ({ ResponsiveLine: () => null }));

const getIntraday = vi.fn();
vi.mock('../../services/influxService', () => ({
  influxService: { getIntraday: (...a) => getIntraday(...a) },
}));

const { default: IntradayDashboard } = await import('../IntradayDashboard.jsx');

// Twenty-five minutes of rising heart rate — enough samples that the old
// chip (last 10 vs previous 10) would have rendered.
const rising = Array.from({ length: 25 }, (_, i) => ({
  time: new Date(Date.UTC(2026, 8, 21, 23, i)).toISOString(),
  HeartRate: 60 + i,
}));

beforeEach(() => getIntraday.mockReset());

describe('the Overview cards', () => {
  it('shows no minutes-long "trend" chip', async () => {
    getIntraday.mockResolvedValue({ heartRate: rising, stress: [], bodyBattery: [], breathing: [] });
    render(<IntradayDashboard date="2026-09-21" />);
    await screen.findByText('Heart Rate');
    // The old chip rendered |last10avg - prev10avg| = 10 as a bare number.
    expect(screen.queryByText('10')).toBeNull();
    expect(screen.queryByTestId('TrendingUpIcon')).toBeNull();
  });

  it('says when the reading was taken', async () => {
    getIntraday.mockResolvedValue({ heartRate: rising, stress: [], bodyBattery: [], breathing: [] });
    render(<IntradayDashboard date="2026-09-21" />);
    expect(await screen.findByText('84')).toBeInTheDocument();
    expect(screen.getAllByText(/^Latest reading, /).length).toBeGreaterThan(0);
  });

  it('shows a dash, not a zero, for a day with no readings', async () => {
    getIntraday.mockResolvedValue({ heartRate: [], stress: [], bodyBattery: [], breathing: [] });
    render(<IntradayDashboard date="2026-09-21" />);
    await screen.findByText('Heart Rate');
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.getAllByText('No readings for this day')).toHaveLength(3);
    expect(screen.queryByText('0')).toBeNull();
  });

  it("never headlines Garmin's -1/-2 stress code", async () => {
    getIntraday.mockResolvedValue({
      heartRate: [], bodyBattery: [], breathing: [],
      stress: [
        { time: '2026-09-21T22:00:00Z', stressLevel: 31 },
        { time: '2026-09-21T22:03:00Z', stressLevel: -2 },
      ],
    });
    render(<IntradayDashboard date="2026-09-21" />);
    expect(await screen.findByText('31')).toBeInTheDocument();
    expect(screen.queryByText('-2')).toBeNull();
  });
});
