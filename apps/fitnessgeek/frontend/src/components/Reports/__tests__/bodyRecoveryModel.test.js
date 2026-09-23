/**
 * The Body & recovery model under the smoothing rule (FITNESSGEEK_BODY_DATA_PLAN
 * §0; FITNESSGEEK_TRENDS_PLAN D2): 7-day means only, a change only when the
 * windows are ≥ 14 days apart (and otherwise the date it appears), and
 * sparklines that break across long gaps. All numbers are invented.
 */
import { describe, it, expect } from 'vitest';
import {
  addDays,
  bpModel,
  describeTrendChange,
  fitnessAgeGap,
  fitnessAgeModel,
  garminCards,
  intensityMinutes,
  metricTrend,
  pointsOf,
  sparkRange,
  weightModel,
  windowCaption,
} from '../bodyRecoveryModel.js';

const END = '2026-09-23';

/** `n` daily points ending `endOffset` days before END, value from `f(daysAgo)`. */
const daily = (n, f, endOffset = 0) =>
  Array.from({ length: n }, (_, i) => {
    const ago = endOffset + (n - 1 - i);
    return { date: addDays(END, -ago), value: f(ago) };
  });

describe('metricTrend — current', () => {
  it('is the mean of the 7 days ending at the latest reading', () => {
    // Last 7 days read 50; everything before reads 70. A mean over anything
    // longer than 7 days would not be 50.
    const t = metricTrend(daily(40, (ago) => (ago <= 6 ? 50 : 70)), { end: END });
    expect(t.current.mean).toBe(50);
    expect(t.current.count).toBe(7);
    expect(t.current).toMatchObject({ from: '2026-09-17', to: END });
  });

  it('never a single reading when the week has several', () => {
    const t = metricTrend(daily(7, (ago) => (ago === 0 ? 90 : 60)), { end: END });
    expect(t.current.mean).toBeCloseTo((90 + 6 * 60) / 7, 1);
  });

  it('scales a daily mean to a weekly total', () => {
    const t = metricTrend(daily(10, () => 20), { end: END, scale: 7 });
    expect(t.current.mean).toBe(140);
  });
});

describe('metricTrend — change', () => {
  it('compares this week with the week ~30 days earlier', () => {
    // Days 36–30 ago read 60; last week reads 55; the days between read 99,
    // which must appear in neither window.
    const f = (ago) => (ago <= 6 ? 55 : ago >= 30 ? 60 : 99);
    const t = metricTrend(daily(60, f), { end: END });
    expect(t.change.available).toBe(true);
    expect(t.change.delta).toBe(-5);
    expect(t.change.baseline).toMatchObject({ from: '2026-08-18', to: '2026-08-24', mean: 60 });
  });

  it('says WHEN, not a number, before the windows are 14 days apart', () => {
    // Ten days of data: the two 7-day windows overlap.
    const t = metricTrend(daily(10, (ago) => 50 + ago), { end: END });
    expect(t.change.available).toBe(false);
    expect(t.change.delta).toBeUndefined();
    // Baseline Sep 14–20 (centre Sep 17) + 14 days + half a window → Oct 4.
    expect(t.change.availableFrom).toBe('2026-10-04');
    expect(describeTrendChange(t.change)).toEqual({ kind: 'pending', text: 'Change from Oct 4' });
  });

  it('no change at all when the latest reading predates the comparison range', () => {
    const t = metricTrend(daily(10, () => 50, 60), { end: END });
    expect(t.current).not.toBeNull();
    expect(t.change).toBeNull();
  });
});

describe('metricTrend — sparkline', () => {
  it('is the 7-day rolling mean, one point per reading day, within 90 days', () => {
    const t = metricTrend(daily(120, (ago) => (ago % 2 ? 40 : 60)), { end: END });
    const pts = t.segments.flat();
    expect(pts[0].x).toBe(addDays(END, -89));
    expect(pts[pts.length - 1].x).toBe(END);
    // Alternating raw readings; the rolling mean never swings to either extreme.
    for (const p of pts) expect(p.y).toBeGreaterThan(45), expect(p.y).toBeLessThan(55);
  });

  it('leaves out a "mean" of fewer than 4 readings — the spike at a run\'s start', () => {
    // Day one reads 90, then 50s: a line that began at 90 would be a raw reading.
    const t = metricTrend(daily(10, (ago) => (ago === 9 ? 90 : 50)), { end: END });
    const pts = t.segments.flat();
    expect(pts[0].x).toBe(addDays(END, -6));
    expect(Math.max(...pts.map((p) => p.y))).toBeLessThan(65);
  });

  it('breaks across a gap longer than 14 days instead of joining it', () => {
    const pts = [...daily(10, () => 50, 40), ...daily(10, () => 52)];
    const t = metricTrend(pts, { end: END });
    expect(t.segments).toHaveLength(2);
  });
});

describe('describeTrendChange', () => {
  const change = (delta) => ({ available: true, delta, baseline: { from: '2026-08-18', to: '2026-08-24', mean: 60 } });

  it('signs with a true minus and names the baseline week', () => {
    expect(describeTrendChange(change(-3.4), { unit: 'bpm' })).toEqual({ kind: 'delta', amount: '−3 bpm', text: 'vs Aug 18–24' });
    expect(describeTrendChange(change(2), { unit: 'ms' }).amount).toBe('+2 ms');
  });

  it('calls a change inside the noise "about level"', () => {
    expect(describeTrendChange(change(0.6), { unit: 'bpm', steady: 1 })).toEqual({ kind: 'level', text: 'About level with Aug 18–24' });
  });
});

describe('windowCaption', () => {
  it('names the end of a stale window', () => {
    expect(windowCaption({ to: END }, END)).toBe('7-day average');
    expect(windowCaption({ to: '2026-09-22' }, END)).toBe('7-day average');
    expect(windowCaption({ to: '2026-09-15' }, END)).toBe('7-day average to Sep 15');
    expect(windowCaption({ to: END, count: 3 }, END)).toBe('7-day average · 3 days');
  });
});

describe('intensity minutes', () => {
  it('counts vigorous twice (WHO equivalence); null only when neither is known', () => {
    expect(intensityMinutes({ moderateMin: 20, vigorousMin: 10 })).toBe(40);
    expect(intensityMinutes({ moderateMin: 20, vigorousMin: null })).toBe(20);
    expect(intensityMinutes({ moderateMin: null, vigorousMin: null })).toBeNull();
  });

  it('the card is a weekly total', () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(END, -i), moderateMin: 10, vigorousMin: 5 }));
    const cards = garminCards({ days }, { end: END });
    expect(cards.intensity.current.mean).toBe(140);
  });
});

describe('pointsOf', () => {
  it('drops missing readings rather than reading them as zero', () => {
    const pts = pointsOf([{ date: END, restingHR: null }, { date: '2026-09-22', restingHR: 58 }], (d) => d.restingHR);
    expect(pts).toEqual([{ date: '2026-09-22', value: 58 }]);
  });
});

describe('fitness age', () => {
  it('latest estimate with the day it was last reported', () => {
    const m = fitnessAgeModel({
      fitnessAge: { current: 41, chronological: 45, achievable: 38 },
      days: [{ date: '2026-09-01', fitnessAge: 42 }, { date: '2026-09-15', fitnessAge: 41 }, { date: END, fitnessAge: null }],
    });
    expect(m).toEqual({ current: 41, chronological: 45, achievable: 38, asOf: '2026-09-15' });
    expect(fitnessAgeGap(m)).toBe('4 years younger than your age');
    expect(fitnessAgeGap({ ...m, current: 46 })).toBe('1 year older than your age');
  });

  it('null without an estimate', () => {
    expect(fitnessAgeModel({ fitnessAge: null, days: [] })).toBeNull();
  });
});

describe('weightModel', () => {
  it('uses the smoothed stats and never phrases a pending change as a number', () => {
    const m = weightModel([], { currentMean: 201.3, latestDate: END, totalChange: null, availableFrom: '2026-10-09' }, { end: END });
    expect(m.current.mean).toBe(201.3);
    expect(m.change).toEqual({ kind: 'pending', text: 'Change from Oct 9' });
  });

  it('a change vs the week to the reference date', () => {
    const m = weightModel([], { currentMean: 201.3, latestDate: END, totalChange: -3.2, referenceDate: '2026-08-24' }, { end: END });
    expect(m.change).toEqual({ kind: 'delta', amount: '−3.2 lb', text: 'vs the week to Aug 24' });
  });
});

describe('bpModel', () => {
  const log = (daysAgo, systolic, diastolic) => ({ log_date: `${addDays(END, -daysAgo)}T00:00:00.000Z`, systolic, diastolic });

  it('7- and 30-day averages over whole calendar days ending today', () => {
    const m = bpModel([log(0, 120, 80), log(6, 124, 78), log(7, 140, 90), log(29, 132, 84), log(30, 180, 110)], { end: END });
    expect(m.avg7).toEqual({ systolic: 122, diastolic: 79, count: 2 });
    expect(m.avg30).toEqual({ systolic: 129, diastolic: 83, count: 4 });
    expect(m.categoryOf).toBe('7-day');
  });

  it('nothing in 30 days: no averages, but the latest day', () => {
    const m = bpModel([log(45, 120, 80)], { end: END });
    expect(m.avg30).toBeNull();
    expect(m.latest).toBe(addDays(END, -45));
  });
});

describe('sparkRange', () => {
  it('holds a minimum span so noise does not fill the box', () => {
    const [lo, hi] = sparkRange([{ y: 55 }, { y: 56 }], 6);
    expect(hi - lo).toBe(6);
    expect((lo + hi) / 2).toBe(55.5);
  });
});
