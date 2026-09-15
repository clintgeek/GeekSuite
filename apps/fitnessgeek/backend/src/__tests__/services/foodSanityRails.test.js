/**
 * foodSanityRails — the arithmetic that stops nonsense reaching the log.
 *
 * The bar is deliberately loose. Chef's standard is "reasonable for the
 * description", not accurate to ±10 calories, so an estimate being merely
 * imprecise must pass. Only absurdity fails.
 *
 * Plan: DOCS/THE_DESCRIBE_AND_LOG_PLAN.md §3.
 */

import { describe, test, expect } from '@jest/globals';
import { checkEntry, caloriesFromMacros, isClean, needsJudge } from '../../services/foodSanityRails.js';

const entry = (overrides = {}) => ({
  name: 'Nachos with beef and cheese',
  servings: 1,
  unit: 'plate',
  nutrition: { calories_per_serving: 1150, protein_grams: 52, carbs_grams: 92, fat_grams: 62 },
  ...overrides
});

describe('the screenshot bug', () => {
  test('"Beef flautas x41" does not reach the log silently', () => {
    // 41 x 220 = 9,020 calories on one plate.
    const result = checkEntry(entry({
      name: 'Beef flautas',
      servings: 41,
      nutrition: { calories_per_serving: 220, protein_grams: 15, carbs_grams: 20, fat_grams: 12 }
    }));

    expect(result.severity).not.toBe('pass');
    expect(result.flags).toContain('high-servings');
    expect(result.totals.calories).toBe(9020);
  });
});

describe('ordinary estimates pass', () => {
  test('a plausible nacho plate is clean', () => {
    const result = checkEntry(entry());
    expect(isClean(result)).toBe(true);
    expect(result.flags).toEqual([]);
  });

  test('being imprecise is not being wrong', () => {
    // 960 vs 1,220 for the same plate: both pass. This is the whole philosophy.
    expect(isClean(checkEntry(entry({ nutrition: { calories_per_serving: 960, protein_grams: 45, carbs_grams: 78, fat_grams: 50 } })))).toBe(true);
    expect(isClean(checkEntry(entry({ nutrition: { calories_per_serving: 1220, protein_grams: 55, carbs_grams: 98, fat_grams: 66 } })))).toBe(true);
  });

  test('a dozen eggs is a legitimate quantity', () => {
    const result = checkEntry(entry({
      name: 'Egg, whole',
      servings: 12,
      nutrition: { calories_per_serving: 72, protein_grams: 6, carbs_grams: 0.4, fat_grams: 5 }
    }));
    expect(isClean(result)).toBe(true);
  });
});

describe('macros vs calories — only the impossible direction', () => {
  test('a real model answer that is merely sloppy is NOT flagged', () => {
    // An actual estimate for nachos, 2026-09-15: stated 1,200, macros compute
    // to 1,520. Usable. Flagging this would mark most entries suspect.
    const result = checkEntry(entry({
      nutrition: { calories_per_serving: 1200, protein_grams: 50, carbs_grams: 150, fat_grams: 80 }
    }));
    expect(result.flags).not.toContain('macros-exceed-calories');
  });

  test('macros that cannot fit inside the calories are suspect', () => {
    // 50g fat alone is 450 cal; claiming 100 total is arithmetically impossible.
    const result = checkEntry(entry({
      nutrition: { calories_per_serving: 100, protein_grams: 10, carbs_grams: 10, fat_grams: 50 }
    }));
    expect(result.flags).toContain('macros-exceed-calories');
    expect(needsJudge(result)).toBe(true);
  });

  test('a beer is NOT flagged, because alcohol is not a macro', () => {
    // P1/C13/F0 computes to 56 against a stated 150. Honest, and common.
    const result = checkEntry(entry({
      name: 'Beer',
      nutrition: { calories_per_serving: 150, protein_grams: 1, carbs_grams: 13, fat_grams: 0 }
    }));
    expect(isClean(result)).toBe(true);
  });

  test('missing calories are derived from the macros rather than rejected', () => {
    const result = checkEntry(entry({
      nutrition: { calories_per_serving: 0, protein_grams: 20, carbs_grams: 30, fat_grams: 10 }
    }));
    expect(result.corrected).not.toBeNull();
    expect(result.corrected.nutrition.calories_per_serving).toBe(290);
    expect(result.flags).toContain('calories-derived-from-macros');
  });
});

describe('calorie density', () => {
  test('nothing edible beats pure fat', () => {
    const result = checkEntry(entry({
      name: 'Mystery',
      serving: { size: 100, unit: 'g' },
      nutrition: { calories_per_serving: 1400, protein_grams: 10, carbs_grams: 10, fat_grams: 10 }
    }));
    expect(result.flags).toContain('impossible-calorie-density');
  });

  test('olive oil sits just under the ceiling and passes', () => {
    const result = checkEntry(entry({
      name: 'Olive oil',
      serving: { size: 100, unit: 'g' },
      nutrition: { calories_per_serving: 884, protein_grams: 0, carbs_grams: 0, fat_grams: 100 }
    }));
    expect(result.flags).not.toContain('impossible-calorie-density');
  });

  test('a serving not measured in grams is simply not density-checked', () => {
    const result = checkEntry(entry({
      serving: { size: 1, unit: 'plate' },
      nutrition: { calories_per_serving: 1150, protein_grams: 52, carbs_grams: 92, fat_grams: 62 }
    }));
    expect(result.flags).not.toContain('impossible-calorie-density');
  });
});

describe('totals', () => {
  test('a big restaurant plate is written but looked at', () => {
    const result = checkEntry(entry({
      nutrition: { calories_per_serving: 2800, protein_grams: 90, carbs_grams: 250, fat_grams: 140 }
    }));
    expect(needsJudge(result)).toBe(true);
    expect(result.flags).toContain('high-total-calories');
  });

  test('a five-figure meal is a parse error, not a meal', () => {
    const result = checkEntry(entry({ servings: 20, nutrition: { calories_per_serving: 1150, protein_grams: 52, carbs_grams: 92, fat_grams: 62 } }));
    expect(result.severity).toBe('reject');
    expect(result.flags).toContain('absurd-total-calories');
  });
});

describe('corrupt input', () => {
  test.each([
    ['negative calories', { nutrition: { calories_per_serving: -100, protein_grams: 0, carbs_grams: 0, fat_grams: 0 } }],
    ['zero servings', { servings: 0 }],
    ['no name', { name: '' }]
  ])('%s is rejected', (_label, overrides) => {
    expect(checkEntry(entry(overrides)).severity).toBe('reject');
  });

  test.each([null, undefined, 'nachos', 42])('%p is rejected without throwing', (input) => {
    expect(() => checkEntry(input)).not.toThrow();
    expect(checkEntry(input).severity).toBe('reject');
  });

  test('non-numeric macros are treated as zero, not NaN', () => {
    const result = checkEntry(entry({
      nutrition: { calories_per_serving: 200, protein_grams: 'lots', carbs_grams: null, fat_grams: undefined }
    }));
    expect(Number.isFinite(result.totals.calories)).toBe(true);
    expect(result.totals.calories).toBe(200);
  });
});

describe('caloriesFromMacros', () => {
  test('uses Atwater factors', () => {
    expect(caloriesFromMacros({ protein_grams: 10, carbs_grams: 10, fat_grams: 10 })).toBe(170);
  });

  test('an empty object is zero, not NaN', () => {
    expect(caloriesFromMacros()).toBe(0);
    expect(caloriesFromMacros({})).toBe(0);
  });
});
