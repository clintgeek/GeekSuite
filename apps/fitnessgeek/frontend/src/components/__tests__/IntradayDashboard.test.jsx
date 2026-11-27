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
import { render, screen, fireEvent } from '@testing-library/react';

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
    await screen.findByText('Heart rate');
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

  it('a measure with no readings shows a dash, not a zero', async () => {
    getIntraday.mockResolvedValue({ heartRate: rising, stress: [], bodyBattery: [], breathing: [] });
    render(<IntradayDashboard date="2026-09-21" />);
    await screen.findByText('Heart rate');
    // Stress and Body Battery have nothing; heart rate has its reading.
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getAllByText('No readings for this day')).toHaveLength(2);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('a day with nothing at all is one sentence, not three empty cards', async () => {
    getIntraday.mockResolvedValue({ heartRate: [], stress: [], bodyBattery: [], breathing: [] });
    render(<IntradayDashboard date="2026-09-21" />);
    expect(await screen.findByTestId('intraday-empty')).toHaveTextContent('No readings for this day');
    expect(screen.queryByText('Stress')).toBeNull();
    expect(screen.queryByText('Body Battery')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('says what Stress and Body Battery are, in words on the card (not in a hover)', async () => {
    getIntraday.mockResolvedValue({
      heartRate: rising, breathing: [],
      stress: [{ time: '2026-09-21T22:00:00Z', stressLevel: 31 }],
      bodyBattery: [{ time: '2026-09-21T22:00:00Z', BodyBatteryLevel: 62 }],
    });
    render(<IntradayDashboard date="2026-09-21" />);
    await screen.findByText('Body Battery');
    expect(screen.getByText('Garmin’s 0–100 estimate from your heart rate. Lower is calmer.')).toBeInTheDocument();
    expect(screen.getByText('Garmin’s 0–100 energy estimate. Rest charges it; activity and stress drain it.')).toBeInTheDocument();
    // One chart per measure, always on the card: no "Show the charts" mode.
    expect(screen.queryByRole('button', { name: /charts/i })).toBeNull();
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

describe('a failed read is not an empty day', () => {
  it('a rejected request says so, with a retry that asks again', async () => {
    getIntraday.mockRejectedValueOnce(new Error('Request failed with status code 502'));
    getIntraday.mockResolvedValue({ heartRate: rising, stress: [], bodyBattery: [], breathing: [] });
    render(<IntradayDashboard date="2026-09-21" />);
    expect(await screen.findByText('Couldn’t load this day')).toBeInTheDocument();
    expect(screen.queryByText('No readings for this day')).toBeNull();
    expect(screen.queryByText(/status code/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('84')).toBeInTheDocument();
  });

  it('"the data server is down" (a 200 that says so) is a failure too, and never names the database', async () => {
    getIntraday.mockResolvedValue({ available: false, reason: 'influx_unavailable', message: 'InfluxDB is unavailable' });
    render(<IntradayDashboard date="2026-09-21" />);
    expect(await screen.findByText('Couldn’t load this day')).toBeInTheDocument();
    expect(screen.queryByTestId('intraday-empty')).toBeNull();
    expect(document.body.textContent).not.toMatch(/InfluxDB/);
  });
});
