// utils/recipeMath.js is a mirror of the shared CommonJS module the gateway
// runs. If they ever drift, the builder's preview would disagree with what the
// server stores — so every export is compared against the real thing.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mirror from '../recipeMath.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = createRequire(import.meta.url)(
  path.resolve(here, '../../../../../../packages/schemas/fitnessgeek/recipe.js')
);

const recipe = {
  yield_servings: 6,
  ingredients: [
    { servings: 2.5, nutrition: { calories_per_serving: 190, protein_grams: 7, carbs_grams: 6, fat_grams: 17, sodium_mg: 110 } },
    { servings: 0.4, nutrition: { calories_per_serving: 333, protein_grams: 1.23, carbs_grams: 70, fat_grams: 0.5, fiber_grams: 3, sugar_grams: 9 } },
    { servings: 0, nutrition: { calories_per_serving: 999 } },
  ],
};

describe('recipeMath mirrors the shared module', () => {
  it('exports the same nutrient keys and unit tables', () => {
    expect(mirror.NUTRIENT_KEYS).toEqual(shared.NUTRIENT_KEYS);
    expect(mirror.MASS_UNITS).toEqual(shared.MASS_UNITS);
    expect(mirror.VOLUME_UNITS).toEqual(shared.VOLUME_UNITS);
  });

  it('computes identical totals and per-serving nutrition', () => {
    expect(mirror.recipeTotals(recipe)).toEqual(shared.recipeTotals(recipe));
    expect(mirror.recipeNutrition(recipe)).toEqual(shared.recipeNutrition(recipe));
    expect(mirror.recipeNutrition({ ...recipe, yield_servings: 2.5 }))
      .toEqual(shared.recipeNutrition({ ...recipe, yield_servings: 2.5 }));
  });

  it('rejects a bad yield the same way', () => {
    expect(() => mirror.recipeNutrition({ ...recipe, yield_servings: 0 })).toThrow(RangeError);
    expect(() => shared.recipeNutrition({ ...recipe, yield_servings: 0 })).toThrow(RangeError);
  });

  it('converts and lists units identically', () => {
    const cases = [
      [2, 'lb', { size: 100, unit: 'g' }],
      [1, 'cup', { size: 240, unit: 'ml' }],
      [1, 'cup', { size: 100, unit: 'g' }],
      [3, 'serving', { size: 100, unit: 'g' }],
      [1.5, 'Tbsp', { size: 15, unit: 'ml' }],
      ['x', 'g', { size: 1, unit: 'g' }],
    ];
    for (const [a, u, s] of cases) {
      expect(mirror.amountToServings(a, u, s)).toEqual(shared.amountToServings(a, u, s));
    }
    for (const s of [{ unit: 'g' }, { unit: 'ml' }, { unit: 'slice' }, undefined]) {
      expect(mirror.unitsFor(s)).toEqual(shared.unitsFor(s));
    }
    expect(mirror.canonicalUnit('Pounds')).toBe(shared.canonicalUnit('Pounds'));
  });
});
