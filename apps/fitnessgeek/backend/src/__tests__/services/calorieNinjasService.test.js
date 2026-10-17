/**
 * API Ninjas nutrition (formerly CalorieNinjas).
 *
 * - A rejected key is a configuration failure, not a search failure.
 *   Production answered `400 Invalid API Key.` on every call for days
 *   (REVIEW_2026-10 §2): CalorieNinjas had become API Ninjas.
 * - API Ninjas answers a bare array.
 * - On the free tier `calories` is a string ("Only available for premium
 *   subscribers."). Such a food must never become a 0-calorie row.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mod = (p) => new URL(p, import.meta.url).pathname;

process.env.CALORIENINJAS_API_KEY = 'secret-test-key-value';

const axiosGet = jest.fn();
const warn = jest.fn();
const stored = new Map();

jest.unstable_mockModule('axios', () => ({ __esModule: true, default: { get: axiosGet } }));
jest.unstable_mockModule(mod('../../config/logger.js'), () => ({
  __esModule: true,
  default: { warn, info: jest.fn(), debug: jest.fn(), error: jest.fn() }
}));
jest.unstable_mockModule(mod('../../lib/breakers.js'), () => ({
  __esModule: true,
  createBreaker: () => ({ fire: (task) => task() })
}));
jest.unstable_mockModule(mod('../../services/cacheService.js'), () => ({
  __esModule: true,
  default: {
    key: (...parts) => parts.join(':'),
    wrap: async (key, fn) => {
      if (stored.has(key)) return stored.get(key);
      const data = await fn();
      if (data !== null && data !== undefined) stored.set(key, data);
      return data;
    }
  }
}));

const { default: service } = await import('../../services/calorieNinjasService.js');

const rejection = (status, data) => Object.assign(new Error(`Request failed with status code ${status}`), {
  response: { status, data }
});

beforeEach(() => {
  axiosGet.mockReset();
  warn.mockReset();
  stored.clear();
  service.keyRejectedUntil = 0;
});

describe('an invalid key', () => {
  test('switches the source off after ONE call, and says so once, by name', async () => {
    axiosGet.mockRejectedValue(rejection(400, 'Invalid API Key.'));

    expect(await service.searchFoods('two eggs')).toEqual([]);
    expect(await service.searchFoods('a slice of toast')).toEqual([]);
    expect(await service.searchFoods('coffee with milk')).toEqual([]);

    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    const [fields, message] = warn.mock.calls[0];
    expect(message).toMatch(/CALORIENINJAS_API_KEY/);
    expect(JSON.stringify([fields, message])).not.toContain('secret-test-key-value');
  });

  test('the JSON shape of the same answer counts too', async () => {
    axiosGet.mockRejectedValue(rejection(401, { message: 'Invalid API key' }));
    await service.searchFoods('two eggs');
    await service.searchFoods('toast');
    expect(axiosGet).toHaveBeenCalledTimes(1);
  });
});

describe('an ordinary failure', () => {
  test('does not switch the source off, and is not cached as "no results"', async () => {
    axiosGet.mockRejectedValueOnce(rejection(503, 'Service Unavailable'));
    expect(await service.searchFoods('two eggs')).toEqual([]);

    axiosGet.mockResolvedValueOnce({ data: { items: [{ name: 'egg', calories: 140 }] } });
    const second = await service.searchFoods('two eggs');

    expect(axiosGet).toHaveBeenCalledTimes(2);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ name: 'egg', source: 'calorieninjas' });
  });

  test('a 400 that is not about the key does not switch the source off', async () => {
    axiosGet.mockRejectedValueOnce(rejection(400, 'Bad query'));
    await service.searchFoods('???');
    axiosGet.mockResolvedValueOnce({ data: { items: [] } });
    await service.searchFoods('eggs');
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });
});

const LOCKED = 'Only available for premium subscribers.';

describe('API Ninjas', () => {
  test('calls api-ninjas.com and reads its bare-array answer', async () => {
    axiosGet.mockResolvedValueOnce({ data: [{ name: 'egg', calories: 72, protein_g: 6.3, fat_total_g: 4.8, serving_size_g: 50 }] });
    const [egg] = await service.searchFoods('an egg');
    expect(axiosGet.mock.calls[0][0]).toBe('https://api.api-ninjas.com/v1/nutrition');
    expect(egg).toMatchObject({ name: 'egg', source: 'calorieninjas', serving: { size: 50, unit: 'g' } });
    expect(egg.nutrition).toMatchObject({ calories_per_serving: 72, protein_grams: 6.3, fat_grams: 4.8 });
  });

  test('a free-tier answer (calories locked) is never a 0-calorie food, and switches the source off once', async () => {
    axiosGet.mockResolvedValue({ data: [{ name: 'egg', calories: LOCKED, protein_g: LOCKED, fat_total_g: 4.8, serving_size_g: 50 }] });
    expect(await service.searchFoods('an egg')).toEqual([]);
    expect(await service.searchFoods('toast')).toEqual([]);
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toMatch(/CALORIENINJAS_API_KEY.*premium/);
  });

  test('a locked protein reads as unknown, not NaN, when calories are real', async () => {
    axiosGet.mockResolvedValueOnce({ data: [{ name: 'rice', calories: 206, protein_g: LOCKED, carbohydrates_total_g: 45 }] });
    const [rice] = await service.searchFoods('a cup of rice');
    expect(rice.nutrition.calories_per_serving).toBe(206);
    expect(rice.nutrition.protein_grams).toBe(0);
    expect(Number.isNaN(rice.nutrition.protein_grams)).toBe(false);
  });
});
