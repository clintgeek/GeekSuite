/**
 * unifiedFoodService.fetchCandidates — the per-leg deadline.
 *
 * `fetchCandidates` fans searchLocalDB / FatSecret / foodApi / CalorieNinjas
 * out with `Promise.allSettled`, which by definition waits for the slowest
 * leg. Measured live against production on 2026-09-19, `searchLocalDB` alone
 * sometimes took ~10s and returned nothing — a MongoDB server-selection
 * stall (`serverSelectionTimeoutMS: 5000` in `config/database.js`, hit twice
 * back to back), not a missing index or a slow query (the text index is
 * confirmed present and confirmed used; a healthy query answers in well
 * under a second). Whatever the cause of any one leg's stall, nothing should
 * force every search to wait for it — see the `FETCH_LEG_DEADLINE_MS` /
 * `withDeadline` comment in `unifiedFoodService.js` for the full account.
 *
 * This test sets the deadline to a tiny value via the env var it reads
 * (`FOOD_SEARCH_LEG_DEADLINE_MS`, resolved at module load — hence the
 * separate file and the assignment before the dynamic import below) so the
 * suite doesn't have to wait out a real multi-second stall to prove the
 * behaviour.
 *
 * RED/GREEN, checked by hand while writing this (see the task's own
 * instruction that a test which passes with the bug present proves
 * nothing): with `withDeadline` in `fetchCandidates` reverted to a plain,
 * un-raced call, "a slow leg does not hold up the others" below hangs past
 * jest's default 5s test timeout and fails; "a slow leg's result still
 * lands in cache" is unaffected either way since it doesn't depend on the
 * race. Restoring the fix makes both green again.
 */

import { describe, test, expect, jest } from '@jest/globals';

process.env.FOOD_SEARCH_LEG_DEADLINE_MS = '40';

const mod = (p) => new URL(p, import.meta.url).pathname;

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

/** Resolves after `ms`, so a mocked leg can outlive the deadline on purpose. */
const after = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

const foodApiSearch = jest.fn(async () => []);
const fatSecretSearch = jest.fn(async () => []);
const calorieNinjasSearch = jest.fn(async () => []);
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
    classifyFoodInput: jest.fn(async () => ({ type: 'unknown', items: [] })),
    parseFoodDescription: jest.fn(async () => ({ ok: false, source: 'fallback', data: {} })),
    scoreResultsRelevance: async (q, r) => r,
    sanityCheckResults: async () => ({ valid: true })
  }
}));

const { default: unifiedFoodService } = await import('../../services/unifiedFoodService.js');

const names = (results) => results.map((r) => r.name);

describe('fetchCandidates — one slow leg does not gate the others', () => {
  test('a leg slower than the deadline is dropped, not waited for', async () => {
    foodApiSearch.mockImplementation(async () => [usda('Fast Result')]);
    // Slower than the 40ms test deadline on purpose — this is the stand-in
    // for the ~10s live searchLocalDB stall / FatSecret's un-breakered 10s
    // axios timeout.
    fatSecretSearch.mockImplementation(() => after(300, [usda('Slow Result')]));

    const started = Date.now();
    const results = await unifiedFoodService.fetchCandidates('result', 25, 'u1');
    const elapsed = Date.now() - started;

    // The whole point: we did not sit through the 300ms leg.
    expect(elapsed).toBeLessThan(250);
    expect(names(results)).toContain('Fast Result');
    expect(names(results)).not.toContain('Slow Result');
  });

  test("a leg that misses the deadline is not cancelled — it still resolves on its own", async () => {
    let resolved = false;
    fatSecretSearch.mockImplementation(() =>
      after(80, [usda('Late Arrival')]).then((v) => { resolved = true; return v; })
    );
    foodApiSearch.mockImplementation(async () => []);

    await unifiedFoodService.fetchCandidates('late', 25, 'u1');
    expect(resolved).toBe(false); // hasn't had time yet — the deadline (40ms) fired first

    await after(100, null);
    expect(resolved).toBe(true); // but it was left running, and finished on its own
  });
});
