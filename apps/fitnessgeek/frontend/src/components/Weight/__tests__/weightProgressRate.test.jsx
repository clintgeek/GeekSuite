/**
 * The "Current Rate" is a rate of 7-day means, not of two raw weigh-ins.
 *
 * Its caption said "6-week average" while it subtracted the first reading in
 * the window from the last — so a water day at either end moved the rate by
 * ~0.4 lb/week (BODY_DATA_PLAN §0).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

process.env.TZ = 'America/Chicago';
const { default: WeightProgress } = await import('../WeightProgress.jsx');

const GOAL = {
  enabled: true, startWeight: 230, targetWeight: 190,
  startDate: '2026-06-01T00:00:00.000Z', goalDate: '2026-12-31T00:00:00.000Z', ratePerWeek: -1,
};

// Daily from 20 Jul to 19 Sep: a true -1 lb/week trend, ±2 lb alternating
// water noise, arranged so the first reading in the 6-week window is a LOW
// day and the last is a HIGH day. Raw endpoints then understate the loss.
const logs = [];
for (let i = 0; i <= 61; i += 1) {
  const d = new Date(Date.UTC(2026, 6, 20 + i));
  logs.push({
    id: `l${i}`,
    log_date: d.toISOString(),
    weight_value: Math.round((220 - i / 7 + (i % 2 ? 2 : -2)) * 10) / 10,
  });
}

describe('WeightProgress current rate', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T12:00:00-05:00'));
  });
  afterAll(() => vi.useRealTimers());

  it('follows the smoothed trend (~1 lb/week), not the noisy endpoints', () => {
    render(<WeightProgress weightLogs={logs} goal={GOAL} currentWeight={212} unit="lbs" />);
    const card = screen.getByTestId('weight-pace');
    const rate = Number(card.textContent.match(/losing (\d+\.\d) lb a week/)[1]);
    // Raw endpoints give ~0.4; the 7-day means give ~1.1 (whole-week divisor).
    expect(rate).toBeGreaterThanOrEqual(0.9);
    expect(rate).toBeLessThanOrEqual(1.4);
  });
});

// Chef, 2026-10-14: "Seeing 2050 as a projection before I ever start a
// program is a bit discouraging." The card's rate was the last 6 weeks of
// logs whatever the goal said — flat pre-program weight, remaining ÷ ~0.
describe('WeightProgress — pace is measured from the program start', () => {
  const ymd = (base, n) => {
    const d = new Date(`${base}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const today = new Date().toISOString().slice(0, 10);
  const flatBefore = (startYmd, days) =>
    Array.from({ length: days }, (_, i) => ({ log_date: `${ymd(startYmd, -days + i)}T00:00:00.000Z`, weight_value: 222 }));

  it('before the program starts: the plan date, no measured rate, no 2050', () => {
    const start = ymd(today, 7);
    const goal = { enabled: true, startDate: start, goalDate: ymd(start, 180), startWeight: 222, targetWeight: 195, ratePerWeek: -1 };
    render(<WeightProgress weightLogs={flatBefore(today, 60)} goal={goal} currentWeight={222} unit="lbs" />);
    expect(screen.getByText(/the program starts/i)).toBeInTheDocument();
    // No measured pace yet: only the pace the dates need.
    expect(screen.getByTestId('weight-pace')).not.toHaveTextContent(/You're (losing|gaining)/);
    expect(screen.queryByText(/20[4-9]\d/)).toBeNull();
  });

  it('ten days in, after months of flat weigh-ins: still the plan, not a forecast', () => {
    const start = ymd(today, -10);
    const goal = { enabled: true, startDate: start, goalDate: ymd(start, 180), startWeight: 222, targetWeight: 195, ratePerWeek: -1 };
    const program = Array.from({ length: 11 }, (_, i) => ({ log_date: `${ymd(start, i)}T00:00:00.000Z`, weight_value: 222 - 0.15 * i }));
    render(<WeightProgress weightLogs={[...flatBefore(start, 60), ...program]} goal={goal} currentWeight={220.5} unit="lbs" />);
    expect(screen.getByText(/until there are two weeks of weigh-ins/i)).toBeInTheDocument();
    expect(screen.queryByText(/20[4-9]\d/)).toBeNull();
  });

  it('five weeks in: the rate is the program’s, and the date is a real one', () => {
    const start = ymd(today, -35);
    const goal = { enabled: true, startDate: start, goalDate: ymd(start, 180), startWeight: 222, targetWeight: 195, ratePerWeek: -1 };
    const program = Array.from({ length: 36 }, (_, i) => ({ log_date: `${ymd(start, i)}T00:00:00.000Z`, weight_value: Math.round((222 - 0.15 * i) * 10) / 10 }));
    render(<WeightProgress weightLogs={[...flatBefore(start, 60), ...program]} goal={goal} currentWeight={216.8} unit="lbs" />);
    // 0.15 lb/day = 1.05/week, measured since start — not diluted by the flat months.
    expect(screen.getByTestId('weight-pace')).toHaveTextContent(/You’re losing 1\.[01] lb a week\./);
    expect(screen.getByTestId('weight-projection')).toHaveTextContent(/^At this pace: (early|mid|late) /);
    expect(screen.queryByText(/20[4-9]\d/)).toBeNull();
  });
});
