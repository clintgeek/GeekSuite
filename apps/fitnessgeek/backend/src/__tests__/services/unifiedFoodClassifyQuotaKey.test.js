/**
 * foodClassify / foodScore / foodSanityCheck — the per-user cap bucket.
 *
 * aiGeek's HTTP feature door counts its daily cap per `quotaKey` when the
 * service credential names no user. foodParse and dishEstimate passed the
 * person's id; foodClassify did not, so every classification on the search
 * path landed in one app-wide bucket and one person searching a lot could
 * spend everybody's day (audit 2026-11-06, #14).
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


describe('classifyInput threads the person through to the classifier', () => {
  beforeEach(() => classify.mockClear());

  test('unifiedFoodService.classifyInput passes the user id', async () => {
    await service.classifyInput('u1', 'big mac');
    expect(classify).toHaveBeenCalledWith('big mac', { userId: 'u1' });
  });

  test('the anonymous sentinel is not a quota key', async () => {
    await service.classifyInput('anonymous', 'big mac');
    expect(classify).toHaveBeenCalledWith('big mac', { userId: null });
  });
});
