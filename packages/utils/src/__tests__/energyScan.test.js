/**
 * Katch-McArdle and the BMR source choice (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md D1).
 */
import { describe, it, expect } from 'vitest';
import { katchMcArdleBMR, resolveBmr, mifflinStJeorBMR } from '../energy.js';

describe('katchMcArdleBMR', () => {
  it('reproduces the scale\'s own printed BMR from lean mass', () => {
    // 2026-09-16 scan: 317.2 lb, 140.2 lb fat → 177.0 lb lean; printed 2105.
    expect(katchMcArdleBMR({ leanMassLb: 177.0 })).toBe(2104);
  });

  it('is written out independently: 370 + 21.6 × kg', () => {
    expect(katchMcArdleBMR({ leanMassLb: 150 })).toBe(Math.round(370 + 21.6 * 150 * 0.45359237));
  });

  it('null, never 0, for missing or nonsense input', () => {
    expect(katchMcArdleBMR({ leanMassLb: null })).toBeNull();
    expect(katchMcArdleBMR({ leanMassLb: -5 })).toBeNull();
    expect(katchMcArdleBMR({})).toBeNull();
  });

  it('for a high-body-fat body, is well under Mifflin-St Jeor on the same person', () => {
    const mifflin = mifflinStJeorBMR({ weightLb: 317.2, heightIn: 70.9, age: 45, gender: 'male' });
    expect(katchMcArdleBMR({ leanMassLb: 177 })).toBeLessThan(mifflin - 150);
  });
});

describe('resolveBmr', () => {
  const mifflin = { weightLb: 318, heightIn: 71, age: 45, gender: 'male' };

  it('a usable lean mass wins, and says so', () => {
    expect(resolveBmr({ leanMassLb: 176.96, mifflin })).toEqual({ bmr: 2104, source: 'scan', lean_mass_lb: 177 });
  });

  it('falls back to Mifflin-St Jeor without one', () => {
    expect(resolveBmr({ leanMassLb: null, mifflin })).toEqual({
      bmr: mifflinStJeorBMR(mifflin), source: 'mifflin', lean_mass_lb: null,
    });
  });

  it('never claims "scan" when nothing was calculable', () => {
    expect(resolveBmr({})).toEqual({ bmr: null, source: 'mifflin', lean_mass_lb: null });
  });
});
