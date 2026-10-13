/**
 * Recipes (apps/fitnessgeek/DOCS/RECIPES_PLAN.md): a custom food built from
 * ingredients. The server owns the per-serving totals — whatever nutrition the
 * client sends alongside a recipe is ignored and recomputed.
 */
import mongoose from 'mongoose';

const { default: FoodItem } = await import('../graphql/fitnessgeek/models/FoodItem.js');
const { resolvers } = await import('../graphql/fitnessgeek/resolvers.js');
const { default: recipeModule } = await import('@geeksuite/schemas/fitnessgeek/recipe');

const { amountToServings, recipeNutrition, unitsFor } = recipeModule;
const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (id) => ({ user: { id } });
const M = resolvers.Mutation;
const Q = resolvers.Query;

const BEEF = { calories_per_serving: 254, protein_grams: 17.2, carbs_grams: 0, fat_grams: 20, sodium_mg: 66 }; // per 100 g
const BEANS = { calories_per_serving: 110, protein_grams: 7, carbs_grams: 20, fat_grams: 0.5, fiber_grams: 6, sodium_mg: 400 }; // per 1/2 cup

const chili = (overrides = {}) => ({
  name: 'Chili',
  serving_size: 1,
  serving_unit: 'serving',
  // A stale client preview: must be ignored.
  nutrition: { calories_per_serving: 9999 },
  recipe: {
    yield_servings: 6,
    ingredients: [
      { name: 'Ground beef 80/20', amount: 1, unit: 'lb', servings: 4.5359237, serving_size: 100, serving_unit: 'g', nutrition: BEEF },
      { name: 'Kidney beans', amount: 2, unit: 'cup', servings: 4, serving_size: 0.5, serving_unit: 'cup', nutrition: BEANS, food_item_id: 'usda_1234' },
    ],
  },
  ...overrides,
});

// One in-memory Mongo serves every suite, run in sequence (jest.config.js):
// rows left here were counted by the next suite's assertions.
afterEach(async () => {
  await FoodItem.deleteMany({});
});

describe('recipe math (shared with the frontend preview)', () => {
  test('per-serving nutrition is the batch total over the yield', () => {
    const n = recipeNutrition(chili().recipe);
    // beef 254×4.536 = 1152.1, beans 110×4 = 440 → 1592.1 / 6 = 265
    expect(n.calories_per_serving).toBe(265);
    expect(n.protein_grams).toBeCloseTo((17.2 * 4.5359237 + 7 * 4) / 6, 1);
    expect(n.fiber_grams).toBe(4);
  });

  test('units convert within a dimension, and refuse to cross one', () => {
    expect(amountToServings(1, 'lb', { size: 100, unit: 'g' })).toBeCloseTo(4.5359, 4);
    expect(amountToServings(2, 'cups', { size: 0.5, unit: 'cup' })).toBe(4);
    expect(amountToServings(3, 'tbsp', { size: 15, unit: 'ml' })).toBeCloseTo(2.957, 3);
    expect(amountToServings(1, 'serving', { size: 100, unit: 'g' })).toBe(1);
    expect(amountToServings(1, 'cup', { size: 100, unit: 'g' })).toBeNull();
    expect(unitsFor({ size: 100, unit: 'g' })).toContain('lb');
    expect(unitsFor({ size: 100, unit: 'g' })).not.toContain('cup');
    expect(unitsFor({ size: 1, unit: 'slice' })).toEqual(['serving']);
  });

  test('a zero yield is refused, not divided by', () => {
    expect(() => recipeNutrition({ yield_servings: 0, ingredients: [] })).toThrow(/yield/);
  });
});

describe('addFitnessFood / updateFitnessFood with a recipe', () => {
  test('the server computes the totals; the client preview is ignored', async () => {
    const food = await M.addFitnessFood(null, { input: chili() }, ctx(ALICE));
    expect(food.nutrition.calories_per_serving).toBe(265);
    expect(food.serving).toMatchObject({ size: 1, unit: 'serving' });
    expect(food.source).toBe('custom');
    expect(food.user_id).toBe(ALICE);
    expect(food.recipe.ingredients).toHaveLength(2);
    // Synthetic search ids are not catalog references.
    expect(food.recipe.ingredients[1].food_item_id).toBeNull();
  });

  test('it is in My Foods, with its recipe on the wire', async () => {
    const created = await M.addFitnessFood(null, { input: chili() }, ctx(ALICE));
    const rows = await Q.fitnessFoods(null, { mine: true }, ctx(ALICE));
    const row = rows.find((f) => String(f._id) === String(created._id));
    expect(row.recipe.yield_servings).toBe(6);
    const ing = row.recipe.ingredients[0];
    expect(resolvers.FitnessRecipeIngredient.serving_size(ing)).toBe(100);
    expect(resolvers.FitnessRecipeIngredient.serving_unit(ing)).toBe('g');
  });

  test('editing the recipe recomputes every nutrient', async () => {
    const food = await M.addFitnessFood(null, { input: chili() }, ctx(ALICE));
    const updated = await M.updateFitnessFood(
      null,
      { id: String(food._id), input: chili({ recipe: { ...chili().recipe, yield_servings: 4 } }) },
      ctx(ALICE)
    );
    expect(updated.nutrition.calories_per_serving).toBe(398); // 1592.1 / 4
    expect(updated.nutrition.fiber_grams).toBe(6);
  });

  test('another user cannot edit it', async () => {
    const food = await M.addFitnessFood(null, { input: chili() }, ctx(ALICE));
    await expect(
      M.updateFitnessFood(null, { id: String(food._id), input: chili() }, ctx(BOB))
    ).rejects.toThrow('Food item not found or unauthorized');
  });

  test('a recipe that would make the totals lie is refused', async () => {
    const before = await FoodItem.countDocuments({});
    for (const recipe of [
      { yield_servings: 0, ingredients: chili().recipe.ingredients },
      { yield_servings: 6, ingredients: [] },
      { yield_servings: 6, ingredients: [{ ...chili().recipe.ingredients[0], servings: -1 }] },
      { yield_servings: 6, ingredients: [{ ...chili().recipe.ingredients[0], nutrition: { calories_per_serving: -5 } }] },
    ]) {
      await expect(M.addFitnessFood(null, { input: chili({ recipe }) }, ctx(ALICE))).rejects.toThrow();
    }
    expect(await FoodItem.countDocuments({})).toBe(before);
  });

  test('a plain custom food is unchanged (no recipe field)', async () => {
    const food = await M.addFitnessFood(null, {
      input: { name: 'Oats', serving_size: 40, serving_unit: 'g', nutrition: { calories_per_serving: 150 } },
    }, ctx(ALICE));
    expect(food.nutrition.calories_per_serving).toBe(150);
    expect(food.recipe).toBeUndefined();
  });
});
