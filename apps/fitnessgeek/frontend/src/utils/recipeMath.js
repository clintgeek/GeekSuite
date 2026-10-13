/**
 * Recipe math for the builder's live preview.
 *
 * MIRRORS packages/schemas/fitnessgeek/recipe.js (which the gateway runs to
 * compute the stored totals). It is a copy rather than an import because that
 * file is CommonJS living outside node_modules, which Vite's production build
 * does not run through its CJS transform. recipeMath.test.js asserts the two
 * give identical output — change both together.
 */

export const NUTRIENT_KEYS = Object.freeze([
  'calories_per_serving',
  'protein_grams',
  'carbs_grams',
  'fat_grams',
  'fiber_grams',
  'sugar_grams',
  'sodium_mg',
]);

export const MASS_UNITS = Object.freeze({ g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 });
export const VOLUME_UNITS = Object.freeze({
  ml: 1, l: 1000, tsp: 4.92892159375, tbsp: 14.78676478125,
  'fl oz': 29.5735295625, cup: 236.5882365,
});

const UNIT_ALIASES = Object.freeze({
  gram: 'g', grams: 'g', gr: 'g',
  kilogram: 'kg', kilograms: 'kg',
  ounce: 'oz', ounces: 'oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', mL: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp', tbl: 'tbsp',
  floz: 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  cups: 'cup', c: 'cup',
  servings: 'serving',
});

export function canonicalUnit(unit) {
  if (unit == null) return 'serving';
  const u = String(unit).trim();
  if (!u) return 'serving';
  return UNIT_ALIASES[u] || UNIT_ALIASES[u.toLowerCase()] || u.toLowerCase();
}

function dimensionOf(unit) {
  const u = canonicalUnit(unit);
  if (u in MASS_UNITS) return 'mass';
  if (u in VOLUME_UNITS) return 'volume';
  return null;
}

export function unitsFor(serving) {
  const dim = dimensionOf(serving?.unit);
  if (dim === 'mass') return ['serving', ...Object.keys(MASS_UNITS)];
  if (dim === 'volume') return ['serving', ...Object.keys(VOLUME_UNITS)];
  return ['serving'];
}

export function amountToServings(amount, unit, serving) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  const u = canonicalUnit(unit);
  if (u === 'serving') return n;
  const servingUnit = canonicalUnit(serving?.unit);
  const size = Number(serving?.size);
  if (!(size > 0)) return null;
  const table = u in MASS_UNITS ? MASS_UNITS : u in VOLUME_UNITS ? VOLUME_UNITS : null;
  if (!table || !(servingUnit in table)) return null;
  return (n * table[u]) / (size * table[servingUnit]);
}

const round = (value, places) => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

export function recipeTotals(recipe) {
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
  for (const ing of recipe?.ingredients || []) {
    const servings = Number(ing?.servings);
    if (!Number.isFinite(servings) || servings <= 0) continue;
    for (const key of NUTRIENT_KEYS) {
      const v = Number(ing?.nutrition?.[key]);
      if (Number.isFinite(v) && v > 0) totals[key] += v * servings;
    }
  }
  return totals;
}

export function recipeNutrition(recipe) {
  const yieldServings = Number(recipe?.yield_servings);
  if (!Number.isFinite(yieldServings) || yieldServings <= 0) {
    throw new RangeError('recipe.yield_servings must be a positive number');
  }
  const totals = recipeTotals(recipe);
  const out = {};
  for (const key of NUTRIENT_KEYS) {
    const per = totals[key] / yieldServings;
    out[key] = key === 'calories_per_serving' || key === 'sodium_mg' ? Math.round(per) : round(per, 1);
  }
  return out;
}
