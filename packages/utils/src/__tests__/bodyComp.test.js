/**
 * The smoothing rule (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md §0), pinned. The
 * failure this guards against is not a crash — it is a confident number built
 * from one or two noisy scans. So several tests assert that NO number comes
 * back where the rule says none should.
 */
import { describe, it, expect } from 'vitest';
import {
  leanMassLb,
  bodyCompCurrent,
  bodyCompChange,
  leanMassForTargets,
  rollingMean,
} from '../bodyComp.js';

const scan = (date, fields = {}) => ({
  date,
  weight_lb: 320,
  fat_mass_lb: 140,
  lean_mass_lb: 180,
  body_fat_pct: 43.8,
  skeletal_muscle_lb: 102,
  body_water_pct: 41,
  visceral_fat_index: 20,
  bmr_kcal: 2134,
  ...fields,
});

const iso = (d) => d.toISOString().slice(0, 10);

describe('leanMassLb', () => {
  it('is weight less fat mass, from either field naming', () => {
    expect(leanMassLb({ weight_value: 317.2, body_fat_mass_lb: 140.2 })).toBeCloseTo(177.0, 5);
    expect(leanMassLb({ weight_lb: 320, fat_mass_lb: 140 })).toBe(180);
  });

  it('refuses nonsense rather than returning a plausible number', () => {
    expect(leanMassLb({ weight_value: 317.2 })).toBeNull();
    expect(leanMassLb({ weight_value: 100, body_fat_mass_lb: 120 })).toBeNull();
    expect(leanMassLb({ weight_value: 0, body_fat_mass_lb: 0 })).toBeNull();
  });
});

describe('bodyCompCurrent — the 14 days ending at the latest scan', () => {
  it('averages only scans inside the window', () => {
    const current = bodyCompCurrent([
      scan('2026-08-01', { fat_mass_lb: 999 }), // outside: 14+ days before the latest
      scan('2026-09-10', { fat_mass_lb: 140 }),
      scan('2026-09-22', { fat_mass_lb: 142 }),
    ]);
    expect(current.scans).toBe(2);
    expect(current.fat_mass_lb).toBe(141);
    expect(iso(current.from)).toBe('2026-09-10');
    expect(iso(current.to)).toBe('2026-09-22');
  });

  it('skips a missing field on one scan without dropping the scan', () => {
    const current = bodyCompCurrent([
      scan('2026-09-21', { visceral_fat_index: null }),
      scan('2026-09-22', { visceral_fat_index: 20 }),
    ]);
    expect(current.scans).toBe(2);
    expect(current.visceral_fat_index).toBe(20);
  });

  it('accepts log_date Dates as well as YYYY-MM-DD strings, in any order', () => {
    const current = bodyCompCurrent([
      scan(new Date('2026-09-22T00:00:00Z'), { weight_lb: 318 }),
      scan('2026-09-20', { weight_lb: 320 }),
    ]);
    expect(current.weight_lb).toBe(319);
    expect(iso(current.to)).toBe('2026-09-22');
  });

  it('nothing in, nothing out', () => {
    expect(bodyCompCurrent([])).toBeNull();
    expect(bodyCompCurrent(null)).toBeNull();
  });
});

describe('bodyCompChange — 7-day mean vs 7-day mean, centres ≥ 14 days apart', () => {
  // Chef's real history on 2026-09-22: scans on 09-15, 09-16 ×4, 09-18,
  // 09-19, 09-22. One week of data.
  const oneWeek = [
    scan('2026-09-15'), scan('2026-09-16'), scan('2026-09-16'), scan('2026-09-16'),
    scan('2026-09-16'), scan('2026-09-18'), scan('2026-09-19'), scan('2026-09-22'),
  ];

  it('one week of scans gives NO change — and says when it will', () => {
    const change = bodyCompChange(oneWeek);
    expect(change.available).toBe(false);
    expect(change.fat_change_lb).toBeNull();
    expect(change.lean_change_lb).toBeNull();
    expect(change.weight_change_lb).toBeNull();
    // Baseline centre ≈ 09-16.6; + 14 days + half a window ≈ 10-04.
    expect(iso(change.available_from)).toBe('2026-10-04');
  });

  it('two scans a day apart never produce a change, however different', () => {
    const change = bodyCompChange([
      scan('2026-09-21', { fat_mass_lb: 140 }),
      scan('2026-09-22', { fat_mass_lb: 150 }),
    ]);
    expect(change.available).toBe(false);
    expect(change.fat_change_lb).toBeNull();
  });

  it('far-apart windows give fat and lean change from window MEANS', () => {
    const change = bodyCompChange([
      scan('2026-09-01', { weight_lb: 320, fat_mass_lb: 140, lean_mass_lb: 180 }),
      scan('2026-09-03', { weight_lb: 322, fat_mass_lb: 142, lean_mass_lb: 180 }),
      scan('2026-09-29', { weight_lb: 314, fat_mass_lb: 135, lean_mass_lb: 179 }),
      scan('2026-10-01', { weight_lb: 312, fat_mass_lb: 133, lean_mass_lb: 179 }),
    ]);
    expect(change.available).toBe(true);
    expect(change.baseline.scans).toBe(2);
    expect(change.latest.scans).toBe(2);
    expect(change.weight_change_lb).toBe(-8);
    expect(change.fat_change_lb).toBe(-7);
    expect(change.lean_change_lb).toBe(-1);
    expect(change.gap_days).toBe(28);
  });

  it('a single outlier inside a window is diluted, not reported', () => {
    const base = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map((d) => scan(d, { fat_mass_lb: 140 }));
    const late = ['2026-10-01', '2026-10-02', '2026-10-03'].map((d) => scan(d, { fat_mass_lb: 140 }));
    const change = bodyCompChange([...base, ...late, scan('2026-10-04', { fat_mass_lb: 148 })]);
    expect(change.available).toBe(true);
    expect(change.fat_change_lb).toBe(2); // one +8 reading among four is +2, not +8
  });

  it('`since` moves the baseline to the first scan on or after it', () => {
    const change = bodyCompChange([
      scan('2026-06-01', { fat_mass_lb: 200 }),
      scan('2026-09-01', { fat_mass_lb: 140 }),
      scan('2026-10-01', { fat_mass_lb: 135 }),
    ], { since: '2026-08-15' });
    expect(change.available).toBe(true);
    expect(change.fat_change_lb).toBe(-5);
  });
});

describe('leanMassForTargets — the lean mass a target may be built on', () => {
  const recent = [scan('2026-09-15', { lean_mass_lb: 176 }), scan('2026-09-22', { lean_mass_lb: 178 })];

  it('the 14-day mean while the latest scan is recent', () => {
    expect(leanMassForTargets(recent, { today: '2026-09-23' })).toMatchObject({
      lean_mass_lb: 177, scans: 2, age_days: 1,
    });
  });

  it('nothing once the latest scan is more than 30 days old', () => {
    expect(leanMassForTargets(recent, { today: '2026-10-22' })).not.toBeNull();
    expect(leanMassForTargets(recent, { today: '2026-10-23' })).toBeNull();
  });

  it('nothing without scans, or without a lean mass', () => {
    expect(leanMassForTargets([], { today: '2026-09-23' })).toBeNull();
    expect(leanMassForTargets([scan('2026-09-22', { lean_mass_lb: null })], { today: '2026-09-23' })).toBeNull();
  });
});

describe('rollingMean — the chart line', () => {
  it('each point averages the 7 calendar days ending on it', () => {
    const out = rollingMean([
      { date: '2026-09-01', value: 320 },
      { date: '2026-09-02', value: 322 },
      { date: '2026-09-08', value: 316 }, // 09-02..09-08 window: drops 09-01
    ]);
    expect(out.map((p) => p.mean)).toEqual([320, 321, 319]);
    expect(out.map((p) => p.count)).toEqual([1, 2, 2]);
  });

  it('skips points without a value, keeps order oldest first', () => {
    const out = rollingMean([
      { date: '2026-09-03', value: 318 },
      { date: '2026-09-01', value: null },
      { date: '2026-09-02', value: 320 },
    ]);
    expect(out.map((p) => iso(p.date))).toEqual(['2026-09-02', '2026-09-03']);
  });
});
