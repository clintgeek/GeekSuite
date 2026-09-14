/**
 * unifiedFoodService.search — dish-first resolution, end to end.
 *
 * The behaviour under test is the one that sent Chef away from the app: typing
 * the name of a food and being handed its ingredients. "4 chocolate chip
 * pancakes homemade" used to classify as `chocolate chip` ×4 + `pancakes` +
 * an invented `pancake mix`, and each of those was searched separately, so the
 * results were a bag of chocolate chips and a bottle of syrup.
 *
 * The rule now: a query is ONE DISH until the text separates it, and the
 * classifier may only be consulted after the whole phrase has failed to find
 * anything convincing — never to pre-empt it.
 *
 * Plan: DOCS/THE_FOOD_SEARCH_PLAN.md §1.0, §3 Phase 2.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mod = (p) => new URL(p, import.meta.url).pathname;

/** A mongoose query chain that resolves to whatever it was handed. */
const chain = (value) => {
  const self = {
    sort: () => self,
    limit: () => self,
    select: () => self,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return self;
};

const usda = (name, calories = 220) => ({
  name,
  brand: '',
  source: 'usda',
  nutrition: { calories_per_serving: calories, protein_grams: 6, carbs_grams: 30, fat_grams: 8 },
  serving: { size: 100, unit: 'g' }
});

const foodApiSearch = jest.fn(async () => []);
const fatSecretSearch = jest.fn(async () => []);
const calorieNinjasSearch = jest.fn(async () => []);
const classify = jest.fn(async () => ({ type: 'unknown', items: [] }));
const parseFood = jest.fn(async () => ({ ok: false, source: 'fallback', data: {} }));
const findMock = jest.fn(() => chain([]));

jest.unstable_mockModule(mod('../../models/FoodItem.js'), () => ({
  __esModule: true,
  default: { find: findMock, findOne: jest.fn(() => chain(null)) }
}));
jest.unstable_mockModule(mod('../../models/FoodLog.js'), () => ({
  __esModule: true,
  default: { aggregate: jest.fn(async () => []) }
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
  default: {
    classifyFoodInput: classify,
    parseFoodDescription: parseFood,
    scoreResultsRelevance: async (q, r) => r,
    sanityCheckResults: async () => ({ valid: true })
  }
}));

const { default: unifiedFoodService } = await import('../../services/unifiedFoodService.js');

const names = (results) => results.map((r) => r.name);

beforeEach(() => {
  foodApiSearch.mockImplementation(async () => []);
  fatSecretSearch.mockImplementation(async () => []);
  calorieNinjasSearch.mockImplementation(async () => []);
  classify.mockImplementation(async () => ({ type: 'unknown', items: [] }));
  findMock.mockImplementation(() => chain([]));
});

describe('a dish stays a dish', () => {
  const catalog = [
    usda('Chocolate chips, semi-sweet'),
    usda('Pancake syrup'),
    usda('Pancakes, chocolate chip'),
    usda('Chocolate chip cookies')
  ];

  test('"4 chocolate chip pancakes homemade" returns pancakes, not ingredients', async () => {
    foodApiSearch.mockImplementation(async () => catalog);

    const results = await unifiedFoodService.search('4 chocolate chip pancakes homemade', {
      userId: 'u1',
      limit: 10
    });

    expect(names(results)[0]).toBe('Pancakes, chocolate chip');
    // The whole point: one search for the dish, not one per invented ingredient.
    expect(foodApiSearch).toHaveBeenCalledTimes(1);
    expect(foodApiSearch).toHaveBeenCalledWith('chocolate chip pancakes', expect.any(Number));
    // And the classifier is never consulted when the dish resolves.
    expect(classify).not.toHaveBeenCalled();
  });

  test('the typed quantity rides along on the result', async () => {
    foodApiSearch.mockImplementation(async () => catalog);

    const [top] = await unifiedFoodService.search('4 chocolate chip pancakes homemade', {
      userId: 'u1',
      limit: 10
    });

    expect(top.requestedQuantity).toBe(4);
  });

  test('no separator means no composite grouping', async () => {
    foodApiSearch.mockImplementation(async () => catalog);

    const results = await unifiedFoodService.search('chocolate chip pancakes', { userId: 'u1' });

    expect(results.every((r) => r.compositeItem === undefined)).toBe(true);
  });
});

describe('a query the person separated', () => {
  test('"2 eggs and toast" searches both, in parallel, and groups them', async () => {
    foodApiSearch.mockImplementation(async (query) =>
      query.includes('egg') ? [usda('Egg, whole, raw', 72)] : [usda('Bread, toasted', 90)]
    );

    const results = await unifiedFoodService.search('2 eggs and toast', { userId: 'u1' });

    expect(foodApiSearch).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.compositeItem)).toEqual(['eggs', 'toast']);
    expect(results[0].requestedQuantity).toBe(2);
    expect(results[1].requestedQuantity).toBe(1);
  });

  test('a dish head noun survives the separator', async () => {
    foodApiSearch.mockImplementation(async () => [usda('Sandwich, peanut butter and jelly', 350)]);

    await unifiedFoodService.search('peanut butter and jelly sandwich', { userId: 'u1' });

    expect(foodApiSearch).toHaveBeenCalledTimes(1);
    expect(foodApiSearch).toHaveBeenCalledWith('peanut butter and jelly sandwich', expect.any(Number));
  });
});

describe('when the dish does not resolve', () => {
  test('ingredients are offered only then, and only words the person typed', async () => {
    // Nothing in any catalog resembles the dish.
    foodApiSearch.mockImplementation(async (query) =>
      query === 'chocolate chip pancakes' ? [] : [usda(`Result for ${query}`)]
    );
    classify.mockImplementation(async () => ({
      type: 'composite',
      items: [
        { name: 'chocolate chip', quantity: 1 },
        { name: 'pancakes', quantity: 1 },
        { name: 'pancake mix', quantity: 1 }   // invented — never in the query
      ]
    }));

    const results = await unifiedFoodService.search('chocolate chip pancakes', { userId: 'u1' });

    const searched = foodApiSearch.mock.calls.map(([q]) => q);
    expect(searched).toContain('chocolate chip pancakes');   // the dish went first
    expect(searched).toContain('chocolate chip');
    expect(searched).toContain('pancakes');
    // The grounding guard: a word the person never typed never becomes a search.
    expect(searched).not.toContain('pancake mix');
    expect(results.every((r) => r.decomposedFrom === 'chocolate chip pancakes')).toBe(true);
  });

  test('a classifier that proposes only ungrounded items decomposes nothing', async () => {
    foodApiSearch.mockImplementation(async () => []);
    classify.mockImplementation(async () => ({
      type: 'composite',
      items: [{ name: 'flour' }, { name: 'butter' }]
    }));

    const results = await unifiedFoodService.search('quiche lorraine', { userId: 'u1' });

    expect(foodApiSearch.mock.calls.map(([q]) => q)).toEqual(['quiche lorraine']);
    expect(results).toEqual([]);
  });

  test('weak matches are still returned rather than nothing', async () => {
    foodApiSearch.mockImplementation(async () => [usda('Syrup, pancake')]);
    classify.mockImplementation(async () => ({ type: 'generic', items: [{ name: 'pancakes' }] }));

    const results = await unifiedFoodService.search('chocolate chip pancakes', { userId: 'u1' });

    expect(names(results)).toContain('Syrup, pancake');
  });
});

describe('robustness', () => {
  test('an empty query searches nothing', async () => {
    expect(await unifiedFoodService.search('', { userId: 'u1' })).toEqual([]);
    expect(await unifiedFoodService.search('   ', { userId: 'u1' })).toEqual([]);
    expect(foodApiSearch).not.toHaveBeenCalled();
  });

  test('an upstream that throws does not fail the search', async () => {
    foodApiSearch.mockImplementation(async () => { throw new Error('USDA down'); });
    fatSecretSearch.mockImplementation(async () => [usda('Pancakes', 200)]);

    const results = await unifiedFoodService.search('pancakes', { userId: 'u1' });

    expect(names(results)).toContain('Pancakes');
  });

  test('includeAI:false never reaches the classifier', async () => {
    foodApiSearch.mockImplementation(async () => []);

    await unifiedFoodService.search('quiche lorraine', { userId: 'u1', includeAI: false });

    expect(classify).not.toHaveBeenCalled();
  });

  test('an anonymous search still works', async () => {
    foodApiSearch.mockImplementation(async () => [usda('Pancakes', 200)]);

    const results = await unifiedFoodService.search('pancakes', {});

    expect(names(results)).toContain('Pancakes');
  });
});
