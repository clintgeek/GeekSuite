/**
 * The arithmetic validation gate, checked against a real scan.
 *
 * The fixture below is not invented. It is the complete primary field set from
 * an actual 2026-09-16 Arboleaf report, together with every derived value that
 * report printed alongside them. That pairing is the whole point: if `derive()`
 * reproduces the printed column from the stored column, the identities the gate
 * relies on are real, and a transcription that satisfies them is almost
 * certainly correct.
 *
 * Treat the fixture as frozen evidence. If a future change makes these tests
 * fail, the change is wrong — this is what the device actually printed.
 */
import {
  derive,
  validate,
  segmentalDrift,
  TOLERANCES,
} from '@geeksuite/schemas/fitnessgeek/bodyCompositionDerivation';

/** The stored primaries, exactly as the report gives them. */
const SCAN = Object.freeze({
  weight_value: 317.2,
  body_fat_mass_lb: 140.2,
  body_water_l: 59.4,
  protein_lb: 33.6,
  bone_mass_lb: 12.4,
  skeletal_muscle_lb: 102.4,
  subcutaneous_fat_lb: 112,
  visceral_fat_index: 20,
  // 180 cm, not the 5'11" the report displays. The report's imperial rendering
  // is lossy (180 cm is really 5'10.87"); recomputing BMI from 5'11" gives
  // 44.24 against a printed 44.4 and fails the gate for no reason.
  height_cm: 180,
  left_arm: { muscle_lb: 11, fat_lb: 13 },
  right_arm: { muscle_lb: 12.4, fat_lb: 12.6 },
  trunk: { muscle_lb: 86.4, fat_lb: 74.8 },
  left_leg: { muscle_lb: 28.6, fat_lb: 17.8 },
  right_leg: { muscle_lb: 28.8, fat_lb: 17.8 },
});

/** The derived values as PRINTED on that same report. */
const PRINTED = Object.freeze({
  fat_free_mass_lb: 177,
  muscle_mass_lb: 164.6,
  body_fat_pct: 44.2,
  body_water_pct: 41.3,
  protein_pct: 10.6,
  bone_mass_pct: 3.9,
  skeletal_muscle_pct: 32.3,
  subcutaneous_fat_pct: 35.3,
  muscle_mass_pct: 51.9,
  bmr_kcal: 2105,
  bmi: 44.4,
  smi: 11.3,
});

describe('derive() reproduces the real report', () => {
  const d = derive(SCAN);

  test.each(Object.keys(PRINTED))('%s matches what the device printed', (key) => {
    const tolerance = { bmr_kcal: 15, bmi: 0.2, smi: 0.15 }[key] ?? 0.15;
    expect(Math.abs(d[key] - PRINTED[key])).toBeLessThanOrEqual(tolerance);
  });

  test('the two exact identities are exact, not merely close', () => {
    // These are subtraction, not regression — they should land dead on.
    expect(d.fat_free_mass_lb).toBeCloseTo(177.0, 10);
    expect(d.muscle_mass_lb).toBeCloseTo(164.6, 10);
  });

  test('BMR is Katch-McArdle off lean mass, not Mifflin-St Jeor', () => {
    // Mifflin would give ~2331 for this person; the device printed 2105.
    expect(d.bmr_kcal).toBeGreaterThan(2090);
    expect(d.bmr_kcal).toBeLessThan(2120);
  });

  test('SMI uses the four limbs only — including the trunk roughly doubles it', () => {
    expect(d.appendicular_muscle_lb).toBeCloseTo(11 + 12.4 + 28.6 + 28.8, 10);
    expect(d.smi).toBeGreaterThan(11);
    expect(d.smi).toBeLessThan(11.6);
  });
});

describe('validate() — the gate', () => {
  test('a correct transcription passes, with every check actually run', () => {
    const result = validate(SCAN, PRINTED);
    expect(result.passed).toBe(true);
    expect(result.mismatches).toHaveLength(0);
    expect(result.checked).toBe(12);
    expect(result.skipped).toBe(0);
  });

  test.each([
    ['a transposed digit in the primary', { body_fat_mass_lb: 104.2 }],
    ['a dropped decimal point', { bone_mass_lb: 124 }],
    ['a single wrong digit in weight', { weight_value: 317.9 }],
    ['an off-by-ten skeletal muscle', { skeletal_muscle_lb: 10.24 }],
  ])('catches %s', (_label, corruption) => {
    const result = validate({ ...SCAN, ...corruption }, PRINTED);
    expect(result.passed).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  test('a misread digit breaks more than one identity — that redundancy is the point', () => {
    // Body fat mass feeds fat-free mass, muscle mass, body fat % AND BMR.
    const result = validate({ ...SCAN, body_fat_mass_lb: 149.2 }, PRINTED);
    expect(result.mismatches.length).toBeGreaterThanOrEqual(3);
  });

  test('a missing printed value is SKIPPED, not failed', () => {
    const { bmr_kcal, ...partial } = PRINTED;
    const result = validate(SCAN, partial);
    expect(result.passed).toBe(true);
    expect(result.skipped).toBe(1);
    expect(result.checks.find((c) => c.key === 'bmr_kcal')).toMatchObject({
      skipped: true,
      reason: 'not read from the report',
    });
  });

  test('no height skips BMI and SMI but still runs the other ten', () => {
    const { height_cm, ...noHeight } = SCAN;
    const result = validate(noHeight, PRINTED);
    expect(result.passed).toBe(true);
    expect(result.checked).toBe(10);
    expect(result.checks.filter((c) => c.skipped && c.heightDependent)).toHaveLength(2);
  });

  test('height in metres rather than centimetres is caught by the gate', () => {
    // The schema's bounds reject 1.8 outright, but if it ever got through,
    // BMI would be absurd and the gate must not wave it past.
    const result = validate({ ...SCAN, height_cm: 1.8 }, PRINTED);
    expect(result.passed).toBe(false);
    expect(result.mismatches.some((m) => m.key === 'bmi')).toBe(true);
  });

  test('an all-empty document passes vacuously — callers must read `checked`', () => {
    const result = validate({}, {});
    expect(result.passed).toBe(true);
    expect(result.checked).toBe(0);
  });

  test('tolerances are tight enough that a 1% error in a primary fails', () => {
    const result = validate({ ...SCAN, body_fat_mass_lb: 140.2 * 1.01 }, PRINTED);
    expect(result.passed).toBe(false);
  });

  test('tolerances are loose enough to absorb the report own rounding', () => {
    // Every printed value carries one decimal; nudging within half of that
    // must not trip the gate.
    const jittered = Object.fromEntries(
      Object.entries(PRINTED).map(([k, v]) => [k, k === 'bmr_kcal' ? v + 4 : v + 0.04]),
    );
    expect(validate(SCAN, jittered).passed).toBe(true);
  });
});

describe('segmentalDrift() — a sanity note, not a gate criterion', () => {
  test('the real scan drifts a few percent and that is normal', () => {
    const drift = segmentalDrift(SCAN);
    // 167.2 segmental muscle against 164.6 whole-body; 136.0 fat against 140.2.
    // The head and neck are not segmented, so these never reconcile exactly.
    expect(Math.abs(drift.muscle.driftPct)).toBeLessThan(10);
    expect(Math.abs(drift.fat.driftPct)).toBeLessThan(10);
    expect(drift.muscle.exceedsWarn).toBe(false);
    expect(drift.fat.exceedsWarn).toBe(false);
  });

  test('a segment off by an order of magnitude does exceed the warning band', () => {
    const drift = segmentalDrift({ ...SCAN, trunk: { muscle_lb: 864, fat_lb: 74.8 } });
    expect(drift.muscle.exceedsWarn).toBe(true);
  });
});

describe('null handling', () => {
  test('a missing primary yields null, never NaN or zero', () => {
    const { body_fat_mass_lb, ...missing } = SCAN;
    const d = derive(missing);
    expect(d.fat_free_mass_lb).toBeNull();
    expect(d.body_fat_pct).toBeNull();
    expect(d.bmr_kcal).toBeNull();
    // Values that do not depend on the missing one survive.
    expect(d.protein_pct).toBeCloseTo(10.59, 1);
  });

  test('a zero weight produces no Infinity and no NaN anywhere', () => {
    // Weight is the denominator of every percentage, so a zero has to come
    // back as `null` rather than `Infinity` — a chart will happily plot
    // Infinity and a JSON encoder will turn it into `null` much later, where
    // it is far harder to trace.
    const d = derive({ ...SCAN, weight_value: 0 });
    expect(d.body_fat_pct).toBeNull();
    expect(d.body_water_pct).toBeNull();
    for (const [key, value] of Object.entries(d)) {
      expect([key, value === null || Number.isFinite(value)]).toEqual([key, true]);
    }
  });

  test('TOLERANCES is frozen so a caller cannot widen the gate in place', () => {
    expect(Object.isFrozen(TOLERANCES)).toBe(true);
  });
});
