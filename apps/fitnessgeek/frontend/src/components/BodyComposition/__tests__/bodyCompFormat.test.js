/**
 * bodyCompFormat — phrasing the server's smoothed body-composition numbers.
 * Nothing here may compute a change (FITNESSGEEK_BODY_DATA_PLAN §0).
 */
import { describe, it, expect } from 'vitest';
import { formatSpan, formatDay, signedLb, describeChange, bodyCompTrendSeries } from '../bodyCompFormat.js';

const ch = (weight, fat, lean) => ({
  available: true, weight_change_lb: weight, fat_change_lb: fat, lean_change_lb: lean,
});

describe('formatSpan / formatDay', () => {
  it('names a same-month window compactly', () => {
    expect(formatSpan('2026-09-16T00:00:00.000Z', '2026-09-22T00:00:00.000Z')).toBe('16–22 Sep');
  });
  it('names a window across months and years', () => {
    expect(formatSpan('2026-08-28', '2026-09-03')).toBe('28 Aug – 3 Sep');
    expect(formatSpan('2025-12-29', '2026-01-04')).toBe('29 Dec 2025 – 4 Jan 2026');
  });
  it('reads a UTC-midnight date as its own day west of UTC', () => {
    // formatDay forces UTC; a local read would say 3 Oct in the Americas.
    expect(formatDay('2026-10-04T00:00:00.000Z')).toBe('4 Oct');
  });
  it('collapses a one-day window', () => {
    expect(formatSpan('2026-09-22', '2026-09-22')).toBe('22 Sep');
  });
});

describe('signedLb', () => {
  it('uses a true minus and one decimal', () => {
    expect(signedLb(-7)).toBe('−7.0 lb');
    expect(signedLb(1)).toBe('+1.0 lb');
    expect(signedLb(0.02)).toBe('0.0 lb');
  });
});

describe('describeChange', () => {
  it('returns nothing when the comparison does not exist yet', () => {
    expect(describeChange({ available: false, available_from: '2026-10-04' })).toBeNull();
  });
  it('splits a loss into fat and lean (the brief\'s example)', () => {
    expect(describeChange(ch(-8, -7, -1))).toBe("Of the 8.0 lb you've lost, about 7.0 lb was fat and 1.0 lb lean.");
  });
  it('says lean held when only fat moved', () => {
    expect(describeChange(ch(-5, -4.8, -0.2))).toBe("Of the 5.0 lb you've lost, about 4.8 lb was fat; lean mass held steady.");
  });
  it('is honest when a loss was mostly lean', () => {
    expect(describeChange(ch(-3, 0.5, -3.5))).toBe("You've lost 3.0 lb: about 3.5 lb of lean mass lost, while fat rose 0.5 lb.");
  });
  it('is honest about a gain', () => {
    expect(describeChange(ch(3, 2, 1))).toBe("Of the 3.0 lb you've gained, about 2.0 lb was fat and 1.0 lb lean.");
  });
  it('names a recomposition hiding behind a flat scale', () => {
    expect(describeChange(ch(0.2, -1.5, 1.7))).toBe(
      'Your weight is about the same, but about 1.5 lb of fat has given way to 1.7 lb of lean mass.'
    );
  });
  it('falls back to weight alone without the parts', () => {
    expect(describeChange(ch(-2, null, null))).toBe("You've lost about 2.0 lb.");
  });
});

describe('bodyCompTrendSeries', () => {
  const scan = (d, w, f, lean) => ({
    log_date: `${d}T00:00:00.000Z`, weight_value: w, body_fat_mass_lb: f,
    derived: lean === undefined ? null : { fat_free_mass_lb: lean },
  });

  it('draws the line as a 7-day trailing mean and keeps each scan as a dot', () => {
    const m = bodyCompTrendSeries([
      scan('2026-09-15', 317, 141),
      scan('2026-09-16', 316, 139),
      scan('2026-09-17', 318, 140),
    ]);
    expect(m.fat.readings.map((p) => p.y)).toEqual([141, 139, 140]);
    expect(m.fat.trend.map((p) => p.y)).toEqual([141, 140, 140]);
    // Lean falls back to weight less fat when `derived` is absent.
    expect(m.lean.readings.map((p) => p.y)).toEqual([176, 177, 178]);
    expect(m.lean.trend.map((p) => p.y)).toEqual([176, 176.5, 177]);
  });

  it('prefers derived.fat_free_mass_lb, and gives same-day scans one trend point', () => {
    const m = bodyCompTrendSeries([
      scan('2026-09-16', 317, 141, 176.2),
      scan('2026-09-16', 316, 139, 176.8),
    ]);
    expect(m.lean.readings.map((p) => p.y)).toEqual([176.2, 176.8]);
    expect(m.lean.trend).toEqual([{ x: '2026-09-16', y: 176.5 }]);
    expect(m.days).toBe(1);
  });
});
