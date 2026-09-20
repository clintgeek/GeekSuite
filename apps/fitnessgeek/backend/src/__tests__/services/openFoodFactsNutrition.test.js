/**
 * The two OpenFoodFacts bugs, pinned with real product shapes.
 *
 * Both were invisible under the one condition a developer is most likely to
 * test with: a product whose serving size is 100 g, where the scaling is a
 * no-op. These cases deliberately use serving sizes that are not 100.
 */
import {
  normalizeOpenFoodFactsNutrition,
  perServing,
} from '../../services/openFoodFactsNutrition.js';

describe('sodium: grams in, milligrams out', () => {
  test('a tin of soup at 0.89 g/100g is 890 mg, not 0.9', () => {
    // The search path stored 0.9 mg — a thousandth of the truth — while the
    // barcode path stored 890 for the same tin.
    const { sodium_mg } = normalizeOpenFoodFactsNutrition({ sodium_100g: 0.89 }, 100);
    expect(sodium_mg).toBe(890);
  });

  test('converts on the per-serving field too', () => {
    const { sodium_mg } = normalizeOpenFoodFactsNutrition({ sodium_serving: 0.46 }, 30);
    expect(sodium_mg).toBe(460);
  });

  test('absent sodium is 0, not NaN', () => {
    expect(normalizeOpenFoodFactsNutrition({}, 50).sodium_mg).toBe(0);
  });
});

describe('per-100g values are scaled to the serving', () => {
  // The canonical case: a spread with no *_serving fields and a small serving.
  const SPREAD = {
    'energy-kcal_100g': 539,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
    proteins_100g: 6.3,
    sugars_100g: 56.3,
  };

  test('a 15 g serving is 15% of the 100 g figures', () => {
    const n = normalizeOpenFoodFactsNutrition(SPREAD, 15);
    expect(n.calories_per_serving).toBe(81); // 539 * 0.15 = 80.85
    expect(n.carbs_grams).toBe(8.6); // 57.5 * 0.15 = 8.625
    expect(n.fat_grams).toBe(4.6);
    expect(n.protein_grams).toBe(0.9);
  });

  test('the old behaviour would have been 6.7x over on calories', () => {
    const n = normalizeOpenFoodFactsNutrition(SPREAD, 15);
    expect(n.calories_per_serving).not.toBe(539);
    expect(539 / n.calories_per_serving).toBeGreaterThan(6);
  });

  test('a 49 g pouch is a bit over 2x under the old behaviour', () => {
    const n = normalizeOpenFoodFactsNutrition({ 'energy-kcal_100g': 200 }, 49);
    expect(n.calories_per_serving).toBe(98);
  });

  test('a 100 g serving is unchanged — the case that hid the bug', () => {
    const n = normalizeOpenFoodFactsNutrition(SPREAD, 100);
    expect(n.calories_per_serving).toBe(539);
    expect(n.carbs_grams).toBe(57.5);
  });
});

describe('per-serving values are used as-is', () => {
  test('a *_serving field is NOT scaled again', () => {
    // Double-scaling would be the mirror-image bug.
    const n = normalizeOpenFoodFactsNutrition(
      { 'energy-kcal_serving': 120, carbohydrates_serving: 14 },
      30
    );
    expect(n.calories_per_serving).toBe(120);
    expect(n.carbs_grams).toBe(14);
  });

  test('a serving field wins over the 100 g field for the same nutrient', () => {
    const n = normalizeOpenFoodFactsNutrition(
      { carbohydrates_serving: 14, carbohydrates_100g: 57.5 },
      30
    );
    expect(n.carbs_grams).toBe(14);
  });

  test('fields are decided independently — one may be per-serving, another per-100g', () => {
    // Real OFF products are frequently partial like this, and it is what makes
    // a whole-object "did the contributor fill in servings?" check wrong.
    const n = normalizeOpenFoodFactsNutrition(
      { 'energy-kcal_serving': 120, carbohydrates_100g: 50 },
      20
    );
    expect(n.calories_per_serving).toBe(120); // used as-is
    expect(n.carbs_grams).toBe(10); // 50 * 0.2, scaled
  });
});

describe('energy fallbacks', () => {
  test('falls back to the kJ field, converted AND scaled', () => {
    // 2000 kJ/100g = 478 kcal/100g; a 50 g serving is 239.
    const n = normalizeOpenFoodFactsNutrition({ energy_100g: 2000 }, 50);
    expect(n.calories_per_serving).toBe(239);
  });

  test('a zero-calorie product stays zero rather than falling through', () => {
    // `||` chains treat a genuine 0 as absent; this is why the normalizer
    // tests for finiteness instead.
    const n = normalizeOpenFoodFactsNutrition(
      { 'energy-kcal_serving': 0, sugars_serving: 0 },
      100
    );
    expect(n.calories_per_serving).toBe(0);
    expect(n.sugar_grams).toBe(0);
  });
});

describe('perServing', () => {
  test('a genuine 0 in the serving field is honoured, not skipped', () => {
    expect(perServing(0, 57.5, 0.15)).toBe(0);
  });

  test('missing everything is 0', () => {
    expect(perServing(undefined, undefined, 0.15)).toBe(0);
    expect(perServing(null, null, 1)).toBe(0);
  });

  test('a non-numeric value does not become NaN', () => {
    expect(perServing('abc', 'def', 0.5)).toBe(0);
  });
});

describe('degenerate serving sizes', () => {
  test('a zero or missing serving size scales by 1 rather than wiping the food out', () => {
    // A 0 g serving would multiply every nutrient to zero — a silently empty
    // food, which is worse than an unscaled one.
    expect(normalizeOpenFoodFactsNutrition({ 'energy-kcal_100g': 200 }, 0).calories_per_serving).toBe(200);
    expect(normalizeOpenFoodFactsNutrition({ 'energy-kcal_100g': 200 }, null).calories_per_serving).toBe(200);
  });
});
