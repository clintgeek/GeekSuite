/**
 * Recipes on the wire. The two food writes' input normalizers used to strip
 * every field they did not know, which would have saved a recipe as a plain
 * food with no ingredients and no error. These pin that `recipe` survives both
 * writes and that My Foods' query selects it back.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { print } from 'graphql';

const mutate = vi.fn();
const query = vi.fn();

vi.mock('@geeksuite/api-client', () => ({
  createApolloClient: () => ({ mutate, query }),
}));

const { foodService } = await import('../foodService.js');
const { fitnessGeekService } = await import('../fitnessGeekService.js');

const macros = (cal) => ({
  calories_per_serving: cal, protein_grams: 10, carbs_grams: 20, fat_grams: 5,
  fiber_grams: 0, sugar_grams: 0, sodium_mg: 0,
});

const recipe = {
  yield_servings: 4,
  ingredients: [
    {
      food_item_id: 'usda_123', name: 'Chicken breast', amount: 200, unit: 'g',
      servings: 2, serving_size: 100, serving_unit: 'g', nutrition: macros(165), estimated: true,
    },
    {
      food_item_id: '0123456789abcdef01234567', name: 'Rice', amount: 1, unit: 'serving',
      servings: 1, serving_size: 1, serving_unit: 'cup', nutrition: macros(200),
    },
  ],
};

const base = { name: 'Chili', serving_size: 1, serving_unit: 'serving', nutrition: macros(100), recipe };

beforeEach(() => {
  mutate.mockReset();
  query.mockReset();
  mutate.mockResolvedValue({ data: { addFitnessFood: { id: 'x' }, updateFitnessFood: { id: 'x' } } });
  query.mockResolvedValue({ data: { fitnessFoods: [] } });
});

describe('recipe food writes', () => {
  it('addFitnessFood carries the recipe, ingredient by ingredient', async () => {
    await foodService.create(base);

    const call = mutate.mock.calls.at(-1)[0];
    expect(call.mutation.definitions[0].name.value).toBe('AddFitnessFood');
    const sent = call.variables.input.recipe;
    expect(sent.yield_servings).toBe(4);
    expect(sent.ingredients).toHaveLength(2);
    expect(sent.ingredients[0]).toMatchObject({
      food_item_id: 'usda_123', name: 'Chicken breast', amount: 200, unit: 'g',
      servings: 2, serving_size: 100, serving_unit: 'g', estimated: true,
    });
    expect(sent.ingredients[0].nutrition.calories_per_serving).toBe(165);
    // and the mutation asks for it back
    expect(print(call.mutation)).toMatch(/recipe \{\s+yield_servings/);
  });

  it('updateFitnessFood carries the recipe too', async () => {
    await foodService.update('0123456789abcdef01234567', base);

    const call = mutate.mock.calls.at(-1)[0];
    expect(call.mutation.definitions[0].name.value).toBe('UpdateFitnessFood');
    expect(call.variables.input.recipe.yield_servings).toBe(4);
    expect(call.variables.input.recipe.ingredients[1].name).toBe('Rice');
  });

  it('a plain food still goes out without a recipe key', async () => {
    const { recipe: _omit, ...plain } = base;
    await foodService.create(plain);
    await foodService.update('0123456789abcdef01234567', plain);
    for (const [call] of mutate.mock.calls) {
      expect(call.variables.input).not.toHaveProperty('recipe');
    }
  });
});

describe('My Foods query', () => {
  it('selects the recipe sub-document', async () => {
    await fitnessGeekService.getAllFoods();
    const text = print(query.mock.calls[0][0].query);
    expect(text).toMatch(/recipe \{\s+yield_servings/);
    expect(text).toMatch(/yield_servings/);
    expect(text).toMatch(/serving_unit/);
  });
});

describe('foodService.parseRecipe', () => {
  it('posts the text and returns the ingredient rows', async () => {
    const { restClient } = await import('../restClient.js');
    const post = vi.spyOn(restClient, 'post').mockResolvedValue({
      data: { success: true, data: { ingredients: [{ line: '2 eggs', name: 'egg' }] } },
    });
    const rows = await foodService.parseRecipe('2 eggs');
    expect(post).toHaveBeenCalledWith('/foods/recipe/parse', { text: '2 eggs' });
    expect(rows).toEqual([{ line: '2 eggs', name: 'egg' }]);
    post.mockRestore();
  });
});
