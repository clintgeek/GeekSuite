/**
 * Recipe writes — the client's `recipe` input, made safe to store, and the
 * per-serving nutrition the food row carries because of it.
 *
 * Spec: apps/fitnessgeek/DOCS/RECIPES_PLAN.md. The SERVER owns the totals:
 * whenever a write carries `recipe`, the food's `nutrition` is recomputed here
 * from the ingredients and any client-sent `nutrition` is ignored, so a stale
 * preview can never be what gets logged. The math is the shared
 * `recipeNutrition` the frontend previews with.
 */
import recipeModule from '@geeksuite/schemas/fitnessgeek/recipe';
import { isValidObjectId } from './ownership.js';

const { NUTRIENT_KEYS, recipeNutrition } = recipeModule;

export const MAX_RECIPE_INGREDIENTS = 100;

const finiteNonNegative = (value, label) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number ≥ 0`);
  return n;
};

/**
 * `FitnessRecipeInput` → the `FoodItem.recipe` sub-document, validated.
 * Throws a person-readable Error on anything that would make the totals lie.
 */
export function normalizeRecipeInput(input) {
  if (!input || typeof input !== 'object') throw new Error('Recipe is required');
  const yieldServings = Number(input.yield_servings);
  if (!Number.isFinite(yieldServings) || yieldServings < 0.1) {
    throw new Error('A recipe must make at least 0.1 servings');
  }
  const raw = Array.isArray(input.ingredients) ? input.ingredients : [];
  if (raw.length === 0) throw new Error('A recipe needs at least one ingredient');
  if (raw.length > MAX_RECIPE_INGREDIENTS) {
    throw new Error(`A recipe can have at most ${MAX_RECIPE_INGREDIENTS} ingredients`);
  }

  const ingredients = raw.map((ing, i) => {
    const label = `Ingredient ${i + 1}`;
    const name = String(ing?.name ?? '').trim();
    if (!name) throw new Error(`${label} needs a name`);
    const nutrition = {};
    for (const key of NUTRIENT_KEYS) {
      nutrition[key] = ing?.nutrition?.[key] == null ? 0 : finiteNonNegative(ing.nutrition[key], `${label} ${key}`);
    }
    // Only a real catalog id is kept. Search mints synthetic ids
    // ('usda_1234') for rows not in the catalog yet; those are not references.
    const foodId = ing?.food_item_id && isValidObjectId(String(ing.food_item_id)) ? String(ing.food_item_id) : null;
    const servingSize = ing?.serving_size == null ? undefined : finiteNonNegative(ing.serving_size, `${label} serving size`);
    return {
      food_item_id: foodId,
      name,
      amount: finiteNonNegative(ing?.amount ?? ing?.servings, `${label} amount`),
      unit: String(ing?.unit || 'serving').trim() || 'serving',
      servings: finiteNonNegative(ing?.servings, `${label} servings`),
      serving: { size: servingSize, unit: ing?.serving_unit ? String(ing.serving_unit) : undefined },
      nutrition,
      estimated: !!ing?.estimated,
    };
  });

  return { yield_servings: yieldServings, ingredients };
}

/**
 * The fields a write sets on the FoodItem when it carries a recipe: the
 * sub-document, the recomputed per-serving nutrition, and a serving of
 * "1 serving" — a recipe's unit IS one of its servings.
 */
export function recipeFields(input) {
  const recipe = normalizeRecipeInput(input);
  return {
    recipe,
    nutrition: recipeNutrition(recipe),
    serving: { size: 1, unit: 'serving' },
  };
}
