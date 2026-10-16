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

  // ── The program is the window (Chef, 2026-10-14: "seeing 2050 as a
  // projection before I ever start a program is a bit discouraging"). ──

  it('weigh-ins before the program start never unlock a projection', () => {
    // Two months of flat pre-program weigh-ins, then one week into the program.
    const before = Array.from({ length: 60 }, (_, i) => ({ log_date: `${day(i)}T00:00:00.000Z`, weight_value: 222 }));
    const goal = { ...GOAL, startDate: day(60) };
    const week = logs(7).map((l, i) => ({ ...l, log_date: `${day(60 + i)}T00:00:00.000Z` }));
    const m = buildWeightTrend([...before, ...week], { goal, today: day(66) });
    expect(m.projection).toBeNull();
    expect(m.pace).toMatchObject({ phase: 'too-early' });
  });

  it('weigh-ins before the program start never bend the pace', () => {
    // Flat 222 for two months, then losing 0.2/day for 30 days. The old
    // last-6-weeks rate mixed the flat stretch in and crawled toward 2050.
    const before = Array.from({ length: 60 }, (_, i) => ({ log_date: `${day(i)}T00:00:00.000Z`, weight_value: 222 }));
    const goal = { ...GOAL, startDate: day(60), goalDate: '2027-03-31' };
    const program = logs(30).map((l, i) => ({ ...l, log_date: `${day(60 + i)}T00:00:00.000Z` }));
    const m = buildWeightTrend([...before, ...program], { goal, today: day(89) });
    // ±0.1: the ±1.5 lb alternating water noise leaves a little residual.
    expect(Math.abs(m.pace.slopePerWeek + 1.4)).toBeLessThan(0.1);
    expect(m.projection.slopePerWeek).toBe(m.pace.slopePerWeek);
    // Pre-program readings still draw as context dots…
    expect(m.readings.some((r) => r.x < day(60))).toBe(true);
    // …but the program's average line starts from program weigh-ins only.
    expect(m.trend.find((p) => p.x === day(60)).y).toBeCloseTo(program[0].weight_value, 5);
  });

});

describe('buildWeightTrend — after the goal date has passed', () => {
  it('still draws the weigh-ins made since, instead of an empty chart', () => {
    const goal = {
      enabled: true,
      startWeight: 230,
      targetWeight: 220,
      startDate: '2026-01-01',
      goalDate: '2026-03-01',
    };
    // Every reading is after the goal date: the old window (start → goal
    // date) dropped them all, and the chart said "No weight data".
    const logs = [
      { weight_value: 221, log_date: '2026-10-10T00:00:00.000Z' },
      { weight_value: 220.4, log_date: '2026-10-12T00:00:00.000Z' },
      { weight_value: 220.1, log_date: '2026-10-15T00:00:00.000Z' },
    ];
    const model = buildWeightTrend(logs, { goal, today: '2026-10-16' });
    expect(model.readings).toHaveLength(3);
    expect(model.trend.length).toBeGreaterThan(0);
    expect(model.trend[model.trend.length - 1].x).toBe('2026-10-15');
  });
});
