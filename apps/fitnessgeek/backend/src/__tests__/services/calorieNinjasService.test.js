/**
 * CalorieNinjas — a rejected key is a configuration failure, not a search
 * failure. Production answered `400 Invalid API Key.` on every call for days
 * (REVIEW_2026-10 §2) and every search paid a round trip for it.
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
