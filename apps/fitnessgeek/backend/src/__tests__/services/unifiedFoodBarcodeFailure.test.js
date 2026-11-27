// A barcode lookup that FAILED used to answer null, which the scanner showed
// as "that barcode isn't in the food databases". Hermetic: models, the other
// food services and axios are doubles.

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

const axiosGet = jest.fn();
jest.unstable_mockModule('axios', () => ({ __esModule: true, default: { get: axiosGet, post: jest.fn() } }));

const foodApiSearch = jest.fn(async () => []);
const fatSecretSearch = jest.fn(async () => []);
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
jest.unstable_mockModule(mod('../../services/aiClassificationCacheService.js'), () => ({
  __esModule: true,
  default: { getOrCompute: async (userId, input, compute) => compute(input) }
}));
jest.unstable_mockModule(mod('../../services/aiFoodService.js'), () => ({
  __esModule: true,
  default: { classifyFoodInput: classify, parseFoodDescription: parseFood }
}));

const { default: service } = await import('../../services/unifiedFoodService.js');

beforeEach(() => {
  axiosGet.mockReset();
  foodFindOne.mockReset();
  foodFindOne.mockImplementation(async () => null);
});

describe('barcode lookup: "could not look" is not "no such product"', () => {
  test('a product OpenFoodFacts does not have is null (status 0, or a 404)', async () => {
    axiosGet.mockResolvedValueOnce({ data: { status: 0 } });
    expect(await service.getByBarcode('0000000000000', 'u1')).toBeNull();

    axiosGet.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } }));
    expect(await service.getByBarcode('0000000000001', 'u1')).toBeNull();
  });

  test('a product it has is returned', async () => {
    axiosGet.mockResolvedValueOnce({
      data: { status: 1, product: { code: '737628064502', product_name: 'Thai peanut noodle kit', nutriments: { 'energy-kcal_100g': 385 } } },
    });
    const food = await service.getByBarcode('737628064502', 'u1');
    expect(food?.name).toBe('Thai peanut noodle kit');
  });

  test('OpenFoodFacts being down THROWS, marked, instead of answering null', async () => {
    axiosGet.mockRejectedValueOnce(Object.assign(new Error('timeout of 8000ms exceeded'), { code: 'ECONNABORTED' }));
    await expect(service.getByBarcode('737628064502', 'u1')).rejects.toMatchObject({ code: 'BARCODE_LOOKUP_FAILED' });
  });

  test('the database being down throws too, and OpenFoodFacts is not asked', async () => {
    foodFindOne.mockImplementation(async () => { throw new Error('server selection timed out'); });
    await expect(service.getByBarcode('737628064502', 'u1')).rejects.toMatchObject({ code: 'BARCODE_LOOKUP_FAILED' });
    expect(axiosGet).not.toHaveBeenCalled();
  });
});
