/**
 * buildWeightTrend — the smoothing rule for the weight chart (§0, F7).
 *
 * The old projection took the last four logs whatever their span; two
 * readings a day apart set the finish date. Now: no projection until the logs
 * span 14 days, and when there is one it follows the slope of the 7-day
 * means over the last 28 days.
 */
import { describe, it, expect } from 'vitest';

// West of UTC, so reading a UTC-midnight log_date in local time is the day before.
process.env.TZ = 'America/Chicago';
const { buildWeightTrend } = await import('../weightTrend.js');

const day = (n) => {
  const d = new Date(Date.UTC(2026, 7, 1 + n));
  return d.toISOString().slice(0, 10);
};
// Daily logs, a steady `perDay` trend with ±1.5 lb alternating water noise.
const logs = (days, { start = 220, perDay = -0.2, noise = 1.5 } = {}) =>
  Array.from({ length: days }, (_, i) => ({
    log_date: `${day(i)}T00:00:00.000Z`,
    weight_value: Math.round((start + perDay * i + (i % 2 ? noise : -noise)) * 10) / 10,
  }));

const GOAL = {
  enabled: true,
  startDate: '2026-08-01',
  goalDate: '2026-12-31',
  startWeight: 220,
  targetWeight: 195,
};

describe('buildWeightTrend', () => {
  it('reads log_date as a calendar day, whatever the viewer zone', () => {
    const m = buildWeightTrend([{ log_date: '2026-08-05T00:00:00.000Z', weight_value: 200 }]);
    expect(m.readings[0].x).toBe('2026-08-05');
  });

  it('smooths: the trend is a 7-day trailing mean, one point per day', () => {
    const m = buildWeightTrend(logs(10, { perDay: 0, noise: 1.5 }));
    // Raw readings swing 3 lb day to day…
    expect(m.readings[1].y - m.readings[0].y).toBeCloseTo(3, 5);
    // …the 7-day mean on day 7 does not (4 low + 3 high over 7 days).
    expect(m.trend[6].y).toBeCloseTo(220 - 1.5 / 7, 1);
    expect(m.trend).toHaveLength(10);
  });

  it('collapses same-day readings to one trend point', () => {
    const m = buildWeightTrend([
      { log_date: '2026-08-01', weight_value: 200 },
      { log_date: '2026-08-01', weight_value: 202 },
    ]);
    expect(m.readings).toHaveLength(2);
    expect(m.trend).toEqual([{ x: '2026-08-01', y: 201 }]);
  });

  it('draws no projection before the logs span 14 days', () => {
    expect(buildWeightTrend(logs(14), { goal: GOAL }).projection).toBeNull(); // 13-day span
    expect(buildWeightTrend(logs(15), { goal: GOAL }).projection).not.toBeNull(); // 14-day span
  });

  it('draws no projection without a goal', () => {
    expect(buildWeightTrend(logs(40)).projection).toBeNull();
  });

  it('projects from the smoothed slope, not the last readings', () => {
    // Last reading is a +1.5 water day; the true trend is -0.2 lb/day.
    const m = buildWeightTrend(logs(40), { goal: GOAL });
    expect(m.projection.slopePerWeek).toBeCloseTo(-1.4, 1);
    // Starts at the latest 7-day mean, not the latest (noisy) reading.
    expect(m.projection.points[0].y).toBe(m.trend[m.trend.length - 1].y);
    expect(m.projection.points[0].y).not.toBe(m.readings[m.readings.length - 1].y);
    expect(m.projection.onTrack).toBe(true);
    // It stops at the target rather than sailing past it.
    expect(m.projection.points[1].y).toBe(195);
    expect(m.projection.points[1].x < '2026-12-31').toBe(true);
  });

  it('is off track when the trend points away from the target', () => {
    const m = buildWeightTrend(logs(30, { perDay: 0.1 }), { goal: GOAL });
    expect(m.projection.onTrack).toBe(false);
    expect(m.projection.points[1].x).toBe('2026-12-31');
  });

  it('needs 14 days of means inside the 28-day fit window, not just a long history', () => {
    // A long-ago log, a 60-day gap, then one week of logs: span ≥ 14 but the
    // fit window holds only 6 days of means.
    const recent = logs(7).map((l, i) => ({ ...l, log_date: day(70 + i) }));
    const m = buildWeightTrend([{ log_date: day(0), weight_value: 222 }, ...recent], { goal: GOAL });
    expect(m.spanDays).toBeGreaterThanOrEqual(14);
    expect(m.projection).toBeNull();
  });
});
