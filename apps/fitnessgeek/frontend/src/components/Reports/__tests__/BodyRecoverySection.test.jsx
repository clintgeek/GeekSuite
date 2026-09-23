/**
 * Reports › Body & recovery, end to end through its hook with the services
 * mocked: each source lands or fails on its own, a user without Influx (403)
 * still gets the body cards, and every change obeys the smoothing rule.
 * All numbers are invented.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

process.env.TZ = 'America/Chicago';
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-09-23T15:00:00-05:00'));

// Nivo cannot paint in jsdom; the sparkline is lazy anyway.
vi.mock('../BodyRecoverySparkline.jsx', () => ({
  default: ({ label, segments }) => <div data-testid="spark" data-segments={segments.length} aria-label={label} />,
}));

const influx = { getTrends: vi.fn() };
const bodyComp = { getSummary: vi.fn() };
const weights = { getWeightLogs: vi.fn(), getWeightStats: vi.fn() };
const bp = { getBPLogs: vi.fn() };
vi.mock('../../../services/influxService.js', () => ({ influxService: influx }));
vi.mock('../../../services/bodyCompService.js', () => ({ bodyCompService: bodyComp }));
vi.mock('../../../services/weightService.js', () => ({ weightService: weights }));
vi.mock('../../../services/bpService.js', () => ({ bpService: bp }));
vi.mock('../../../utils/logger.js', () => ({ default: { error: vi.fn(), debug: vi.fn() } }));

const { default: BodyRecoverySection } = await import('../BodyRecoverySection.jsx');

const END = '2026-09-23';
const ymd = (ago) => {
  const d = new Date(Date.UTC(2026, 8, 23 - ago));
  return d.toISOString().slice(0, 10);
};

/** 60 dense days: resting HR 60 a month ago, 56 this week. */
const TRENDS = {
  available: true,
  days: Array.from({ length: 60 }, (_, i) => {
    const ago = 59 - i;
    return {
      date: ymd(ago),
      restingHR: ago <= 6 ? 56 : ago >= 30 ? 60 : 58,
      overnightHRV: 40,
      sleepScore: 75,
      sleepHours: 7,
      steps: 8000,
      moderateMin: 20,
      vigorousMin: 5,
      activeKcal: 400,
      stressMean: 30,
      bodyBatteryHigh: 80,
      bodyBatteryLow: 20,
      spo2: 95,
      fitnessAge: ago === 3 ? 40 : null,
    };
  }),
  fitnessAge: { current: 40, chronological: 46, achievable: 37 },
};

const SUMMARY = {
  total_scans: 9,
  current: { from: '2026-09-10T00:00:00.000Z', to: '2026-09-23T00:00:00.000Z', scans: 9, body_fat_pct: 30.1, fat_mass_lb: 60.2, lean_mass_lb: 139.8 },
  change: { available: false, available_from: '2026-10-06T00:00:00.000Z' },
};

beforeEach(() => {
  influx.getTrends.mockReset().mockResolvedValue(TRENDS);
  bodyComp.getSummary.mockReset().mockResolvedValue({ success: true, data: SUMMARY });
  weights.getWeightLogs.mockReset().mockResolvedValue({ success: true, data: [{ log_date: END, weight_value: 200 }] });
  weights.getWeightStats.mockReset().mockResolvedValue({
    success: true, data: { currentMean: 200.4, latestDate: END, totalChange: null, availableFrom: '2026-10-20' },
  });
  bp.getBPLogs.mockReset().mockResolvedValue({
    success: true, data: [{ log_date: `${END}T00:00:00.000Z`, systolic: 121, diastolic: 79 }, { log_date: `${ymd(20)}T00:00:00.000Z`, systolic: 131, diastolic: 85 }],
  });
});

const renderSection = () => render(<MemoryRouter><BodyRecoverySection /></MemoryRouter>);

describe('Body & recovery', () => {
  it('says it is a 90-day view, independent of the page range', async () => {
    renderSection();
    expect(screen.getByText(/90-day trends/)).toBeInTheDocument();
    expect(screen.getByText(/applies to the food report only/)).toBeInTheDocument();
    await screen.findByTestId('trend-restingHR');
  });

  it('asks for 90 days ending on the local calendar day', async () => {
    renderSection();
    await screen.findByTestId('trend-restingHR');
    expect(influx.getTrends).toHaveBeenCalledWith({ days: 90, end: END });
  });

  it('resting HR: the 7-day mean, and the change against the week ~30 days earlier', async () => {
    renderSection();
    const card = await screen.findByTestId('trend-restingHR');
    expect(within(card).getByText('56')).toBeInTheDocument();
    expect(within(card).getByText('−4 bpm')).toBeInTheDocument();
    expect(within(card).getByText('vs Aug 18–24')).toBeInTheDocument();
    expect(within(card).getByText(/Lower is better/)).toBeInTheDocument();
  });

  it('intensity minutes are weekly, moderate + 2 × vigorous, against 150', async () => {
    renderSection();
    const card = await screen.findByTestId('trend-intensity');
    // (20 + 2 × 5) × 7 = 210
    expect(within(card).getByText('210')).toBeInTheDocument();
    expect(within(card).getByText(/At or above the 150-minute guideline/)).toBeInTheDocument();
    expect(within(card).getByText(/Moderate \+ 2 × vigorous/)).toBeInTheDocument();
  });

  it('fitness age against actual age, dated', async () => {
    renderSection();
    const card = await screen.findByTestId('trend-fitness-age');
    expect(within(card).getByText('6 years younger than your age (46)')).toBeInTheDocument();
    expect(within(card).getByText(/as of Sep 20/)).toBeInTheDocument();
  });

  it('weight and body composition say WHEN a change appears, never a number', async () => {
    renderSection();
    const w = await screen.findByTestId('trend-weight');
    expect(within(w).getByText('Change from Oct 20')).toBeInTheDocument();
    const bc = screen.getByTestId('trend-body-comp');
    expect(within(bc).getByText('Change from Oct 6')).toBeInTheDocument();
    expect(within(bc).queryByText(/[−+]\d/)).toBeNull();
  });

  it('blood pressure: 7- and 30-day averages', async () => {
    renderSection();
    const card = await screen.findByTestId('trend-bp');
    expect(within(card).getByText('121/79')).toBeInTheDocument();
    expect(within(card).getByText('126/82')).toBeInTheDocument();
  });

  it('never shows SpO2 or breathing', async () => {
    renderSection();
    await screen.findByTestId('trend-restingHR');
    expect(screen.queryByText(/spo2|pulse ox|breathing|respiration/i)).toBeNull();
  });

  it('without Influx (200 not_enabled, what the endpoint now sends): the quiet line, not the outage message', async () => {
    influx.getTrends.mockResolvedValue({ available: false, reason: 'not_enabled', days: [], fitnessAge: null, activeKcal30: null });
    renderSection();
    expect(await screen.findByTestId('garmin-not-connected')).toHaveTextContent(/Health Dashboard connection/);
    expect(screen.queryByText(/aren't available right now/)).toBeNull();
  });

  it('without Influx (403): the body cards stay, and one quiet line replaces the Garmin cards', async () => {
    influx.getTrends.mockRejectedValue(Object.assign(new Error('Forbidden'), { response: { status: 403 } }));
    renderSection();
    expect(await screen.findByTestId('garmin-not-connected')).toHaveTextContent(/Health Dashboard connection/);
    expect(screen.queryByTestId('trend-restingHR')).toBeNull();
    expect(screen.getByTestId('trend-weight')).toBeInTheDocument();
    expect(screen.getByTestId('trend-bp')).toBeInTheDocument();
  });

  it('one failed source never blanks the others', async () => {
    bp.getBPLogs.mockRejectedValue(new Error('boom'));
    bodyComp.getSummary.mockRejectedValue(new Error('boom'));
    renderSection();
    expect(await screen.findByTestId('bp-error')).toBeInTheDocument();
    expect(screen.getByTestId('body-comp-error')).toBeInTheDocument();
    expect(screen.getByTestId('trend-restingHR')).toBeInTheDocument();
    expect(screen.getByTestId('trend-weight')).toBeInTheDocument();
  });

  it('an Influx outage (available: false) is its own quiet state, not a blank', async () => {
    influx.getTrends.mockResolvedValue({ available: false, days: [] });
    renderSection();
    expect(await screen.findByTestId('garmin-unavailable')).toHaveTextContent(/aren’t available right now/);
    expect(screen.getByTestId('trend-weight')).toBeInTheDocument();
  });

  it('breaks the sparkline across a long gap', async () => {
    const gapped = {
      ...TRENDS,
      days: TRENDS.days.map((d, i) => (i >= 20 && i < 40 ? { ...d, restingHR: null } : d)),
    };
    influx.getTrends.mockResolvedValue(gapped);
    renderSection();
    const card = await screen.findByTestId('trend-restingHR');
    expect(await within(card).findByTestId('spark')).toHaveAttribute('data-segments', '2');
  });
});
