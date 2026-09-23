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
    const card = screen.getByText('Current Rate').closest('div').parentElement;
    const rate = Number(card.textContent.match(/(\d+\.\d) lbs\/week/)[1]);
    // Raw endpoints give ~0.4; the 7-day means give ~1.1 (whole-week divisor).
    expect(rate).toBeGreaterThanOrEqual(0.9);
    expect(rate).toBeLessThanOrEqual(1.4);
  });
});
