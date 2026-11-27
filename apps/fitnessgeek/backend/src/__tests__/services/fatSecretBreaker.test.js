// FatSecret was the one external food source with no circuit breaker: every
// search during an outage waited out a 10s axios timeout of its own. It now
// goes through a shared 'fatsecret' breaker, like USDA and OpenFoodFacts.

import { describe, test, expect, jest, beforeAll } from '@jest/globals';

const mod = (p) => new URL(p, import.meta.url).pathname;

const post = jest.fn();
jest.unstable_mockModule('axios', () => ({ default: { post, get: jest.fn() } }));
jest.unstable_mockModule(mod('../../services/cacheService.js'), () => ({
  default: {
    key: (...parts) => parts.join(':'),
    // No Redis in the test: every call is a miss.
    wrap: (_key, fn) => fn(),
  },
}));

let fatSecretService;
let breakerStats;

beforeAll(async () => {
  process.env.FATSECRET_CLIENT_ID = 'test-id';
  process.env.FATSECRET_CLIENT_SECRET = 'test-secret';
  ({ default: fatSecretService } = await import('../../services/fatSecretService.js'));
  ({ breakerStats } = await import('../../lib/breakers.js'));
});

describe('fatSecretService circuit breaker', () => {
  test('a healthy search still answers, through the breaker', async () => {
    post.mockImplementation((url) => (url.includes('oauth')
      ? Promise.resolve({ data: { access_token: 't', expires_in: 86400 } })
      : Promise.resolve({ data: { foods: { food: { food_id: '1', food_name: 'Big Mac', food_description: 'Per 1 burger - Calories: 550kcal | Fat: 30.00g | Carbs: 45.00g | Protein: 25.00g' } } } })));

    const results = await fatSecretService.searchFoods('big mac', 5);
    expect(results).toHaveLength(1);
    expect(breakerStats().fatsecret.stats.fires).toBeGreaterThanOrEqual(2);
    expect(breakerStats().fatsecret.state).toBe('closed');
  });

  test('once FatSecret is plainly down, searches stop calling it and answer [] at once', async () => {
    post.mockImplementation(() => Promise.reject(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })));

    // Enough failures to trip the breaker (volumeThreshold 10, 50% errors).
    for (let i = 0; i < 12; i += 1) {
      // A different query each time, as real searches are.
      expect(await fatSecretService.searchFoods(`pancakes ${i}`, 5)).toEqual([]);
    }
    expect(breakerStats().fatsecret.state).toBe('open');

    post.mockClear();
    const started = Date.now();
    expect(await fatSecretService.searchFoods('waffles', 5)).toEqual([]);
    expect(await fatSecretService.getFoodById('123')).toBeNull();
    expect(post).not.toHaveBeenCalled();
    expect(Date.now() - started).toBeLessThan(500);
  });
});
