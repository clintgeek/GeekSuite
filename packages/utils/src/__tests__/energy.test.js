/**
 * The pounds-and-inches bug, pinned.
 *
 * Until 2026-09-20 both copies of Mifflin-St Jeor in this monorepo applied the
 * kg/cm formula to lb/in values. These tests assert the CORRECTED numbers, and
 * several of them assert explicitly that the result is NOT the old wrong one —
 * because the failure mode here is a plausible-looking number, not a crash.
 * "It returns a number" was true the entire time the app was wrong.
 */
import { describe, it, expect } from 'vitest';
import {
  mifflinStJeorBMR,
  tdeeFromBMR,
  ACTIVITY_MULTIPLIERS,
  isPlanCalculationStale,
  lbToKg,
  inToCm,
  KG_PER_LB,
  CM_PER_IN,
  BMR_CALC_VERSION,
} from '../energy.js';

// The formula, written out independently of the implementation so this is a
// real check rather than a restatement of the code under test.
const expectedBMR = (lb, inches, age, gender) =>
  Math.round(
    10 * (lb * 0.45359237) + 6.25 * (inches * 2.54) - 5 * age + (gender === 'male' ? 5 : -161)
  );

// What the buggy version produced, for the "must not equal" assertions.
const buggyBMR = (lb, inches, age, gender) =>
  Math.round(10 * lb + 6.25 * inches - 5 * age + (gender === 'male' ? 5 : -161));

describe('conversion constants', () => {
  it('uses the exact international definitions', () => {
    expect(KG_PER_LB).toBe(0.45359237);
    expect(CM_PER_IN).toBe(2.54);
    expect(lbToKg(200)).toBeCloseTo(90.718474, 6);
    expect(inToCm(70)).toBeCloseTo(177.8, 6);
  });
});

describe('mifflinStJeorBMR — the corrected formula', () => {
  const CASES = [
    { label: 'M 40y 200lb 5\'10"', weightLb: 200, heightIn: 70, age: 40, gender: 'male', bmr: 1823, wrong: 2243 },
    { label: 'M 45y 320lb 5\'11"', weightLb: 320, heightIn: 71, age: 45, gender: 'male', bmr: 2359, wrong: 3424 },
    { label: 'F 30y 140lb 5\'4"', weightLb: 140, heightIn: 64, age: 30, gender: 'female', bmr: 1340, wrong: 1489 },
  ];

  it.each(CASES)('$label -> $bmr kcal, not the old $wrong', (c) => {
    const got = mifflinStJeorBMR(c);
    expect(got).toBe(c.bmr);
    expect(got).toBe(expectedBMR(c.weightLb, c.heightIn, c.age, c.gender));
    // The point of the whole change: the old number was a number too.
    expect(got).not.toBe(c.wrong);
    expect(got).not.toBe(buggyBMR(c.weightLb, c.heightIn, c.age, c.gender));
  });

  it('overstates worse as the person gets heavier — the reason this mattered', () => {
    const light = mifflinStJeorBMR({ weightLb: 140, heightIn: 64, age: 30, gender: 'female' });
    const heavy = mifflinStJeorBMR({ weightLb: 320, heightIn: 71, age: 45, gender: 'male' });
    const lightErr = (buggyBMR(140, 64, 30, 'female') - light) / light;
    const heavyErr = (buggyBMR(320, 71, 45, 'male') - heavy) / heavy;
    expect(lightErr).toBeGreaterThan(0.1);
    expect(heavyErr).toBeGreaterThan(0.4);
    expect(heavyErr).toBeGreaterThan(lightErr);
  });

  it('applies the two published sex constants', () => {
    const m = mifflinStJeorBMR({ weightLb: 180, heightIn: 68, age: 35, gender: 'male' });
    const f = mifflinStJeorBMR({ weightLb: 180, heightIn: 68, age: 35, gender: 'female' });
    expect(m - f).toBe(166); // +5 vs -161
  });

  it('returns null — not 0 — for missing or unusable input', () => {
    // 0 would read as a real, very safe plan. That distinction is the whole
    // reason the caller has a three-way contract.
    for (const bad of [
      { weightLb: 0, heightIn: 70, age: 40, gender: 'male' },
      { weightLb: 200, heightIn: 0, age: 40, gender: 'male' },
      { weightLb: 200, heightIn: 70, age: 0, gender: 'male' },
      { weightLb: -200, heightIn: 70, age: 40, gender: 'male' },
      { weightLb: 'abc', heightIn: 70, age: 40, gender: 'male' },
      { weightLb: undefined, heightIn: 70, age: 40, gender: 'male' },
      { weightLb: NaN, heightIn: 70, age: 40, gender: 'male' },
    ]) {
      expect(mifflinStJeorBMR(bad)).toBeNull();
    }
  });

  it('returns null when individually-valid inputs produce a nonsense result', () => {
    // Each field is finite and positive; the combination is not a metabolism.
    expect(mifflinStJeorBMR({ weightLb: 80, heightIn: 60, age: 400, gender: 'female' })).toBeNull();
  });

  it('accepts numeric strings, since these come from text fields', () => {
    expect(mifflinStJeorBMR({ weightLb: '200', heightIn: '70', age: '40', gender: 'male' })).toBe(1823);
  });
});

describe('tdeeFromBMR', () => {
  it('applies the conventional multipliers', () => {
    expect(tdeeFromBMR(1823, 'sedentary')).toBe(2188);
    expect(tdeeFromBMR(1823, 'moderate')).toBe(2826);
    expect(tdeeFromBMR(1823, 'very')).toBe(3145);
    expect(tdeeFromBMR(1823, 'extra')).toBe(3464);
  });

  it('covers exactly the five activity keys the app offers', () => {
    // Guards the rename that would silently demote every active user to
    // sedentary; these five strings are the `MenuItem` values in
    // AIGoalPlanner and the keys in the backend's own table.
    expect(Object.keys(ACTIVITY_MULTIPLIERS).sort()).toEqual(
      ['extra', 'light', 'moderate', 'sedentary', 'very'].sort()
    );
  });

  it('falls back to sedentary — the SMALLEST factor — for an unknown level', () => {
    // An unrecognised activity level must not inflate the allowance; that is
    // the same class of error as the unit bug.
    expect(tdeeFromBMR(1823, 'bogus')).toBe(tdeeFromBMR(1823, 'sedentary'));
    expect(tdeeFromBMR(1823, undefined)).toBe(2188);
  });

  it('propagates null rather than inventing an expenditure', () => {
    expect(tdeeFromBMR(null, 'sedentary')).toBeNull();
    expect(tdeeFromBMR(0, 'sedentary')).toBeNull();
  });
});

describe('isPlanCalculationStale', () => {
  it('flags a plan saved before the fix — it has no version stamp', () => {
    expect(isPlanCalculationStale({ bmr: 3314, tdee: 3977, daily_calorie_target: 2977 })).toBe(true);
  });

  it('flags an explicitly v1 plan', () => {
    expect(isPlanCalculationStale({ bmr: 3314, bmr_calc_version: 1 })).toBe(true);
  });

  it('accepts a plan calculated at the current version', () => {
    expect(isPlanCalculationStale({ bmr: 2359, bmr_calc_version: BMR_CALC_VERSION })).toBe(false);
  });

  it('does not flag "no plan" or "nothing calculated yet" as stale', () => {
    // A user who has never run the planner has nothing to recalculate, and
    // telling them their plan is wrong would be its own kind of lie.
    expect(isPlanCalculationStale(null)).toBe(false);
    expect(isPlanCalculationStale(undefined)).toBe(false);
    expect(isPlanCalculationStale({})).toBe(false);
    expect(isPlanCalculationStale({ daily_calorie_target: 2000 })).toBe(false);
  });
});
