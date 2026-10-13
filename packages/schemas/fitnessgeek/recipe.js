'use strict';

/**
 * Recipes — a custom FoodItem that remembers its ingredients.
 *
 * Spec: apps/fitnessgeek/DOCS/RECIPES_PLAN.md. A recipe is a `FoodItem` with a
 * `recipe` sub-document; the food's own `nutrition` is per serving of the
 * recipe, i.e. Σ(ingredient nutrition × ingredient servings) ÷ yield_servings.
 *
 * Ingredient nutrition is a SNAPSHOT per ONE serving of that ingredient, taken
 * when it was added — a shared catalog row changing later must not silently
 * rewrite a recipe, for the same reason FoodLog snapshots its nutrition.
 *
 * Plain functions, no mongoose: the gateway (which computes the stored
 * totals) and the FitnessGeek frontend (which previews them) must agree to the
 * gram, so both run this exact code.
 */

const NUTRIENT_KEYS = Object.freeze([
  'calories_per_serving',
  'protein_grams',
  'carbs_grams',
  'fat_grams',
  'fiber_grams',
  'sugar_grams',
  'sodium_mg',
]);

// Units a person can measure an ingredient in, by the dimension of that
// ingredient's own serving. Factors convert to the BASE unit (g or ml).
// No volume↔weight guessing: a food served in grams cannot be measured in
// cups, because a cup of flour and a cup of honey differ threefold.
const MASS_UNITS = Object.freeze({ g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 });
const VOLUME_UNITS = Object.freeze({
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

function canonicalUnit(unit) {
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

/**
 * Units offered for an ingredient whose ONE serving is `serving`
 * ({ size, unit }). Always 'serving'; plus the matching dimension's units
 * when the serving is itself measured in one.
 */
function unitsFor(serving) {
  const dim = dimensionOf(serving?.unit);
  if (dim === 'mass') return ['serving', ...Object.keys(MASS_UNITS)];
  if (dim === 'volume') return ['serving', ...Object.keys(VOLUME_UNITS)];
  return ['serving'];
}

/**
 * `amount` of `unit`, expressed in servings of an ingredient whose serving is
 * `serving`. Returns null when the unit can't be converted (a cup of a food
 * served in grams) — the caller must say so rather than guess.
 */
function amountToServings(amount, unit, serving) {
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

/**
 * The whole batch's nutrition: Σ(ingredient nutrition × servings).
 */
function recipeTotals(recipe) {
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

/**
 * Per-serving nutrition for the recipe — what the FoodItem stores in
 * `nutrition`. Calories to the whole kcal, grams to 0.1, sodium to the mg.
 * Throws on a missing or non-positive yield: dividing by it is the point.
 */
function recipeNutrition(recipe) {
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

/**
 * Mongoose sub-document definition for `FoodItem.recipe`. Takes the caller's
 * mongoose for the same reason foodItemDefinition does (two copies of mongoose
 * in a workspace make ObjectId instanceof checks lie).
 */
function recipeDefinition(mongoose) {
  const nutrition = Object.fromEntries(
    NUTRIENT_KEYS.map((k) => [k, { type: Number, default: 0, min: 0 }])
  );
  return {
    type: new mongoose.Schema(
      {
        yield_servings: { type: Number, required: true, min: 0.1 },
        ingredients: [
          new mongoose.Schema(
            {
              food_item_id: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', default: null },
              name: { type: String, required: true, trim: true },
              amount: { type: Number, required: true, min: 0 },
              unit: { type: String, default: 'serving', trim: true },
              servings: { type: Number, required: true, min: 0 },
              // Serving the amount was converted against — kept so an edit
              // can offer the same units without refetching the catalog row.
              serving: { size: { type: Number }, unit: { type: String } },
              nutrition,
              estimated: { type: Boolean, default: false },
            },
            { _id: false }
          ),
        ],
      },
      { _id: false }
    ),
    default: undefined,
  };
}

module.exports = {
  NUTRIENT_KEYS,
  MASS_UNITS,
  VOLUME_UNITS,
  canonicalUnit,
  unitsFor,
  amountToServings,
  recipeTotals,
  recipeNutrition,
  recipeDefinition,
};
