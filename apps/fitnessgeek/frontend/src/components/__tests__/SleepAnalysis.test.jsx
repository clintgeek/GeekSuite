/**
 * The sleep panel, after the stage-code fix.
 *
 * The backend decoded Garmin's sleep stages with the wrong mapping until
 * 2026-09-22 and scored nights "POOR" that the watch scored in the 80s. The
 * score is now Garmin's own, and three figures that could not be right are
 * gone or renamed: a fragmentation index that read 92% every night, an HR dip
 * that compared a stage against a time of night, and SpO2 "apnea events" that
 * were really one-a-minute samples.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const getSleepAnalysis = vi.fn();
vi.mock('../../services/influxService', () => ({
  influxService: { getSleepAnalysis: (...a) => getSleepAnalysis(...a) },
}));

const { default: SleepAnalysis } = await import('../SleepAnalysis.jsx');

// The real night of 2026-09-22, as the fixed backend reports it.
const analysis = (over = {}) => ({
  date: '2026-09-22',
  available: true,
  qualityScore: 82,
  qualityLabel: 'GOOD',
  scoreSource: 'garmin',
  metrics: {
    architecture: {
      totalMinutes: 566, asleepMinutes: 527, awakeMinutes: 39,
      lightMinutes: 325, deepMinutes: 71, remMinutes: 131,
      awakePercent: 7, lightPercent: 62, deepPercent: 13, remPercent: 25, sleepEfficiency: 93,
    },
    continuity: { transitionsPerHour: 2.7, wakeAfterSleepOnset: 19, awakenings: 2, stageTransitions: 24 },
    cardiovascular: { avgHeartRate: 68, restingHeartRate: 64, hrDipPercent: null, avgDeepSleepHR: 71, hrVariability: 4 },
    hrvRecovery: { avgHRV: 26, baselineHRV: 24.9, baselineNights: 7, hrvDeviation: 4, hrvStatus: 'BALANCED' },
    respiration: {
      avgRespirationRate: 20, respirationVariability: 2.3, avgSpO2: 93, minSpO2: 83,
      spo2Dips: 28, spo2SamplesBelow90: 80, longestDipMinutes: 27,
    },
    stress: { avgStress: 19, stressSpikes: 0, bodyBatteryStart: 37, bodyBatteryEnd: 83, bodyBatteryChange: 46 },
  },
  recommendations: [],
  warnings: [],
  ...over,
});

beforeEach(() => getSleepAnalysis.mockReset());

describe('the headline', () => {
  it("shows Garmin's score and label", async () => {
    getSleepAnalysis.mockResolvedValue(analysis());
    render(<SleepAnalysis date="2026-09-22" />);
    expect(await screen.findByText('82/100')).toBeInTheDocument();
    expect(screen.getByText(/GOOD/)).toBeInTheDocument();
  });

  it('says there is no score rather than printing a blank or a zero', async () => {
    getSleepAnalysis.mockResolvedValue(analysis({ qualityScore: null, qualityLabel: null, scoreSource: null }));
    const { container } = render(<SleepAnalysis date="2026-09-22" />);
    expect(await screen.findByText(/no score from the watch yet/i)).toBeInTheDocument();
    // The headline and the metric cards all render as h4; only the headline
    // ever carried "/100", so no h4 may carry it when there is no score.
    const headlines = [...container.querySelectorAll('h4')].map((h) => h.textContent);
    expect(headlines.some((t) => /\/100/.test(t))).toBe(false);
    expect(headlines.some((t) => /null|NaN|undefined/.test(t))).toBe(false);
  });

  it('total sleep is time asleep, not time in bed', async () => {
    // 527 min asleep = 8h 47m. Time in bed (566 = 9h 26m) was shown here before.
    getSleepAnalysis.mockResolvedValue(analysis());
    render(<SleepAnalysis date="2026-09-22" />);
    await screen.findByText('82/100');
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('h 47m')).toBeInTheDocument();
  });
});

describe('figures that could not be right are gone', () => {
  it('has no fragmentation index and no HR-dip card', async () => {
    getSleepAnalysis.mockResolvedValue(analysis());
    render(<SleepAnalysis date="2026-09-22" />);
    await screen.findByText('82/100');
    expect(screen.queryByText(/fragmentation index/i)).toBeNull();
    expect(screen.queryByText(/^HR Dip$/)).toBeNull();
    expect(screen.queryByText(/limited HR recovery/i)).toBeNull();
  });

  it('calls SpO2 readings dips, not apnea events', async () => {
    getSleepAnalysis.mockResolvedValue(analysis());
    render(<SleepAnalysis date="2026-09-22" />);
    await screen.findByText('82/100');
    expect(screen.getByText('SpO2 dips')).toBeInTheDocument();
    expect(screen.queryByText(/apnea events/i)).toBeNull();
  });
});

describe('HRV against a real baseline', () => {
  it('shows the baseline it compared against, and the difference', async () => {
    getSleepAnalysis.mockResolvedValue(analysis());
    render(<SleepAnalysis date="2026-09-22" />);
    await screen.findByText('82/100');
    expect(screen.getByText(/24\.9 ms/)).toBeInTheDocument();
    expect(screen.getByText(/\+4%/)).toBeInTheDocument();
    expect(screen.queryByText(/recovery score/i)).toBeNull();
  });

  it('says there is no baseline yet rather than printing "BALANCED"', async () => {
    // Every night used to read "0%, BALANCED, recovery 50" — the baseline it
    // compared against was never computed.
    getSleepAnalysis.mockResolvedValue(analysis({
      metrics: {
        ...analysis().metrics,
        hrvRecovery: { avgHRV: 26, baselineHRV: null, baselineNights: 2, hrvDeviation: null, hrvStatus: 'NO_BASELINE' },
      },
    }));
    render(<SleepAnalysis date="2026-09-22" />);
    await screen.findByText('82/100');
    expect(screen.getByText(/no baseline yet/i)).toBeInTheDocument();
    expect(screen.getByText(/have 2/)).toBeInTheDocument();
    expect(screen.queryByText('BALANCED')).toBeNull();
  });

  it('a strong HRV night is not shown as a red arrow', async () => {
    getSleepAnalysis.mockResolvedValue(analysis({
      metrics: {
        ...analysis().metrics,
        hrvRecovery: { avgHRV: 27, baselineHRV: 24.1, baselineNights: 7, hrvDeviation: 12, hrvStatus: 'HIGH' },
      },
    }));
    render(<SleepAnalysis date="2026-09-16" />);
    await screen.findByText('82/100');
    const up = screen.getByTestId('TrendingUpIcon');
    expect(up.getAttribute('class')).toMatch(/colorSuccess/);
  });
});
