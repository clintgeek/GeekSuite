/**
 * unifiedFoodService — the fixes from REVIEW_2026-10 §2 and P2:
 *   - a two-letter prefix never reaches the catalog APIs or the model;
 *   - "a and b" searches keep the person's own foods;
 *   - a tapped AI result can be found again by the dedupe ladder (C5);
 *   - the barcode lookup is ownership-scoped;
 *   - suggest can put saved meals first (C6).
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mod = (p) => new URL(p, import.meta.url).pathname;

const chain = (value) => {
  const self = {
    sort: () => self,
    limit: () => self,
    select: () => self,
    populate: () => self,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return self;
};

const foodApiSearch = jest.fn(async () => []);
const fatSecretSearch = jest.fn(async () => []);
const calorieNinjasSearch = jest.fn(async () => []);
const classify = jest.fn(async () => ({ type: 'unknown', items: [] }));
const parseFood = jest.fn(async () => ({ ok: false, source: 'fallback', data: {} }));
const foodFind = jest.fn(() => chain([]));
const foodFindOne = jest.fn(async () => null);
const mealFind = jest.fn(() => chain([]));
const logFind = jest.fn(() => chain([]));

jest.unstable_mockModule(mod('../../models/FoodItem.js'), () => ({
  __esModule: true,
  default: { find: foodFind, findOne: foodFindOne }
}));
jest.unstable_mockModule(mod('../../models/FoodLog.js'), () => ({
  __esModule: true,
  default: { aggregate: jest.fn(async () => []), find: logFind }
}));
jest.unstable_mockModule(mod('../../models/Meal.js'), () => ({
  __esModule: true,
  default: { find: mealFind }
}));
jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => chain(null)) }
}));
jest.unstable_mockModule(mod('../../services/foodApiService.js'), () => ({
  __esModule: true,
  default: { searchFoods: foodApiSearch }
}));
jest.unstable_mockModule(mod('../../services/fatSecretService.js'), () => ({
  __esModule: true,
  default: { searchFoods: fatSecretSearch }
}));
jest.unstable_mockModule(mod('../../services/calorieNinjasService.js'), () => ({
  __esModule: true,
  default: { searchFoods: calorieNinjasSearch }
}));
jest.unstable_mockModule(mod('../../services/aiClassificationCacheService.js'), () => ({
  __esModule: true,
  default: { getOrCompute: async (userId, input, compute) => compute(input) }
}));
jest.unstable_mockModule(mod('../../services/aiFoodService.js'), () => ({
  __esModule: true,
  default: { classifyFoodInput: classify, parseFoodDescription: parseFood }
}));

const { default: service } = await import('../../services/unifiedFoodService.js');

const own = (name, extra = {}) => ({
  _id: `id-${name}`,
  name,
  user_id: 'u1',
  source: 'custom',
  nutrition: { calories_per_serving: 150, protein_grams: 5, carbs_grams: 20, fat_grams: 5 },
  serving: { size: 1, unit: 'serving' },
  ...extra
});

/** Does this Mongo filter admit rows owned by `userId`? */
const admits = (filter, userId) => JSON.stringify(filter).includes(`{"user_id":"${userId}"}`);

beforeEach(() => {
  for (const fn of [foodApiSearch, fatSecretSearch, calorieNinjasSearch]) {
    fn.mockReset();
    fn.mockImplementation(async () => []);
  }
  classify.mockReset();
  classify.mockImplementation(async () => ({ type: 'unknown', items: [] }));
  parseFood.mockReset();
  parseFood.mockImplementation(async () => ({ ok: false, source: 'fallback', data: {} }));
  foodFind.mockReset();
  foodFind.mockImplementation(() => chain([]));
  foodFindOne.mockReset();
  foodFindOne.mockImplementation(async () => null);
  mealFind.mockReset();
  mealFind.mockImplementation(() => chain([]));
  logFind.mockReset();
  logFind.mockImplementation(() => chain([]));
});

describe('a two-letter prefix', () => {
  test('"Ha" searches her own catalog only: no upstream, no model', async () => {
    foodFind.mockImplementation((filter) => chain(filter?.$text || filter?.$or ? [own('Ham sandwich')] : []));
    parseFood.mockImplementation(async () => ({
      ok: true, data: { food_items: [{ name: 'Ha', nutrition: { calories_per_serving: 1 } }] }
    }));

    const results = await service.search('Ha', { userId: 'u1', limit: 10 });

    expect(fatSecretSearch).not.toHaveBeenCalled();
    expect(foodApiSearch).not.toHaveBeenCalled();
    expect(calorieNinjasSearch).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
    expect(parseFood).not.toHaveBeenCalled();
    expect(results.map((r) => r.source)).not.toContain('ai');
  });

  test('three letters is a real search again', async () => {
    await service.search('Ham', { userId: 'u1', limit: 10 });
    expect(foodApiSearch).toHaveBeenCalledTimes(1);
    expect(fatSecretSearch).toHaveBeenCalledTimes(1);
  });

  test('a quantity is not a letter: "2 e" stays local', async () => {
    await service.search('2 e', { userId: 'u1', limit: 10 });
    expect(foodApiSearch).not.toHaveBeenCalled();
  });
});

describe('"a and b" searches', () => {
  test('keep the person\'s own foods in the local leg', async () => {
    await service.search('greek yogurt and granola', { userId: 'u1', limit: 10 });

    // Every local query on this path must admit her rows, not just global ones.
    const localFilters = foodFind.mock.calls
      .map(([filter]) => filter)
      .filter((filter) => filter && (filter.$text || JSON.stringify(filter).includes("\"name\":")));
    expect(localFilters.length).toBeGreaterThan(0);
    for (const filter of localFilters) expect(admits(filter, 'u1')).toBe(true);
  });
});

describe('the half-typed-word fallback', () => {
  test('keeps the ownership clause (it used to be overwritten by the name clause)', async () => {
    // Text index finds nothing for "ched", so the prefix regex runs.
    await service.suggest('ched', { userId: 'u1' });
    const prefix = foodFind.mock.calls.map(([f]) => f).find((f) => !f.$text && JSON.stringify(f).includes('"name":'));
    expect(prefix).toBeDefined();
    expect(admits(prefix, 'u1')).toBe(true);
    expect(JSON.stringify(prefix)).toContain('{"user_id":null}');
  });
});

describe('a tapped AI result (C5)', () => {
  const aiAnswer = () => ({
    ok: true,
    data: { food_items: [{ name: 'Arroz con Pollo', nutrition: { calories_per_serving: 600 } }] }
  });

  test('carries a source_id built from the person and the food, the same every time', async () => {
    parseFood.mockImplementation(async () => aiAnswer());

    const [first] = await service.parseWithAI('arroz con pollo', 'u1');
    const [again] = await service.parseWithAI('arroz con pollo', 'u1');
    const [other] = await service.parseWithAI('arroz con pollo', 'u2');

    expect(first.source).toBe('ai');
    expect(first.source_id).toBe('ai:u1:arroz-con-pollo');
    expect(again.source_id).toBe(first.source_id);
    expect(again.id).toBe(first.id);
    // One person's estimate never dedupes onto another's row.
    expect(other.source_id).not.toBe(first.source_id);
  });
});

describe('the barcode lookup', () => {
  test('is scoped to global rows plus the caller\'s own', async () => {
    await service.getByBarcode('0123456789', 'u1');
    const [filter] = foodFindOne.mock.calls[0];
    expect(filter.barcode).toBe('0123456789');
    expect(admits(filter, 'u1')).toBe(true);
    expect(filter.$or).toEqual(expect.arrayContaining([{ user_id: null }]));
  });
});

describe('suggest', () => {
  const meal = {
    _id: 'meal-1',
    name: 'Homemade Quesadilla',
    meal_type: 'dinner',
    food_items: [
      { food_item_id: { _id: 'f1', nutrition: { calories_per_serving: 200, protein_grams: 10, carbs_grams: 20, fat_grams: 8 } }, servings: 2 },
      { food_item_id: { _id: 'f2', nutrition: { calories_per_serving: 50, protein_grams: 1, carbs_grams: 2, fat_grams: 4 } }, servings: 1 }
    ]
  };

  test('food rows say kind: food, and meals stay out unless asked for', async () => {
    foodFind.mockImplementation(() => chain([own('Quesadilla')]));
    const rows = await service.suggest('quesa', { userId: 'u1' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.kind === 'food')).toBe(true);
    expect(mealFind).not.toHaveBeenCalled();
  });

  test('a matching saved meal comes first, with its whole-meal totals', async () => {
    foodFind.mockImplementation(() => chain([own('Quesadilla')]));
    mealFind.mockImplementation(() => chain([meal]));

    const rows = await service.suggest('quesa', { userId: 'u1', includeMeals: true });

    expect(rows[0]).toEqual({
      kind: 'meal',
      id: 'meal-1',
      name: 'Homemade Quesadilla',
      meal_type: 'dinner',
      food_count: 2,
      nutrition: {
        calories_per_serving: 450,
        protein_grams: 21,
        carbs_grams: 42,
        fat_grams: 20,
        fiber_grams: 0,
        sugar_grams: 0,
        sodium_mg: 0
      },
      source: 'meal'
    });
    expect(rows.slice(1).every((r) => r.kind === 'food')).toBe(true);

    // Owner-scoped, and every typed word must be in the name.
    const [filter] = mealFind.mock.calls[0];
    expect(filter.user_id).toBe('u1');
    expect(filter.is_deleted).toBe(false);
    expect(filter.$and[0].name.test('Homemade Quesadilla')).toBe(true);
    expect(filter.$and[0].name.test('Nachos')).toBe(false);
  });

  test('the empty box offers the meals she logged most recently', async () => {
    const tacos = { ...meal, _id: 'meal-2', name: 'Taco Tuesday' };
    mealFind.mockImplementation(() => chain([meal, tacos, { ...meal, _id: 'meal-3', name: 'Never Logged' }]));
    logFind.mockImplementation(() => chain([
      { notes: 'Added from meal: Taco Tuesday' },
      { notes: 'Added from meal: Homemade Quesadilla' },
      { notes: 'Added from meal: Taco Tuesday' }
    ]));

    const rows = await service.suggest('', { userId: 'u1', includeMeals: true });
    const meals = rows.filter((r) => r.kind === 'meal');

    expect(meals.map((m) => m.name)).toEqual(['Taco Tuesday', 'Homemade Quesadilla']);
    expect(meals.every((m) => m.shelf === 'recent')).toBe(true);
  });

  test('a meal lookup that fails costs the meals, not the foods', async () => {
    foodFind.mockImplementation(() => chain([own('Quesadilla')]));
    mealFind.mockImplementation(() => { throw new Error('mongo hiccup'); });
    const rows = await service.suggest('quesa', { userId: 'u1', includeMeals: true });
    expect(rows.map((r) => r.name)).toEqual(['Quesadilla']);
  });
});
