/**
 * describeAndLogService — resolution order, and the rails that guard the log.
 *
 * The order is the design: his own history first (free, consistent, and the
 * common path within weeks), then published facts for anything branded, and
 * only then a model estimate. Getting that order wrong costs money, latency,
 * and the internal consistency of his log.
 *
 * Plan: DOCS/THE_DESCRIBE_AND_LOG_PLAN.md §3.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

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

const findOne = jest.fn(() => chain(null));
const find = jest.fn(() => chain([]));
const create = jest.fn(async (doc) => ({ ...doc, _id: 'food-new' }));
const savedLogs = [];
const updateFromLogs = jest.fn(async () => {});
const estimateDishes = jest.fn(async () => ({ ok: false, dishes: [], reason: 'unavailable' }));
const judgeEntries = jest.fn(async () => ({ ok: false, verdicts: [], reason: 'unavailable' }));
const unifiedSearch = jest.fn(async () => []);

class FakeFoodLog {
  constructor(doc) { Object.assign(this, doc); }
  async save() {
    if (!this._id) { this._id = `log-${savedLogs.length + 1}`; savedLogs.push(this); }
    return this;
  }
}
FakeFoodLog.findOne = jest.fn(async ({ _id }) => savedLogs.find((l) => l._id === _id) || null);

jest.unstable_mockModule(mod('../../models/FoodItem.js'), () => ({
  __esModule: true,
  default: { findOne, find, create }
}));
jest.unstable_mockModule(mod('../../models/FoodLog.js'), () => ({
  __esModule: true,
  default: FakeFoodLog
}));
jest.unstable_mockModule(mod('../../models/DailySummary.js'), () => ({
  __esModule: true,
  default: { updateFromLogs }
}));
jest.unstable_mockModule(mod('../../services/aiFoodService.js'), () => ({
  __esModule: true,
  default: {
    estimateDishes,
    judgeEntries,
    prepareClassificationInput: (input) => ({
      detectedBrands: /kroger|pure protein|mcdonald/i.test(input) ? ['Kroger'] : []
    })
  }
}));
jest.unstable_mockModule(mod('../../services/unifiedFoodService.js'), () => ({
  __esModule: true,
  default: { search: unifiedSearch }
}));

const { logDescription, findInHistory, reviewLoggedEntries } = await import('../../services/describeAndLogService.js');

const estimated = (index, name, calories, extra = {}) => ({
  index,
  name,
  servingDescription: '1 plate',
  nutrition: { calories_per_serving: calories, protein_grams: 20, carbs_grams: 40, fat_grams: 20 },
  lowCalories: null,
  highCalories: null,
  ...extra
});

const run = (text) => logDescription(text, { userId: 'u1', date: '2026-09-15', hour: 19, skipReview: true });

beforeEach(() => {
  savedLogs.length = 0;
  judgeEntries.mockImplementation(async () => ({ ok: false, verdicts: [], reason: 'unavailable' }));
  findOne.mockImplementation(() => chain(null));
  find.mockImplementation(() => chain([]));
  unifiedSearch.mockImplementation(async () => []);
  estimateDishes.mockImplementation(async () => ({ ok: false, dishes: [], reason: 'unavailable' }));
});

describe('the nachos plate', () => {
  test('is logged as ONE row, at the quantity he said', async () => {
    estimateDishes.mockImplementation(async () => ({
      ok: true,
      dishes: [estimated(0, 'Nachos with beef, chicken and cheese', 1150)]
    }));

    const result = await run('a dozen nachos with beef and chicken and cheese');

    expect(result.logged).toHaveLength(1);
    expect(result.logged[0]).toMatchObject({
      name: 'Nachos with beef, chicken and cheese',
      servings: 12,
      mealType: 'dinner',
      source: 'estimate'
    });
    // The model is asked about the dish, never about its toppings separately.
    expect(estimateDishes).toHaveBeenCalledTimes(1);
    expect(estimateDishes.mock.calls[0][0]).toHaveLength(1);
  });

  test('recomputes the daily summary once, not once per row', async () => {
    estimateDishes.mockImplementation(async () => ({
      ok: true,
      dishes: [estimated(0, 'Eggs', 140), estimated(1, 'Toast', 90)]
    }));

    await run('eggs and toast');
    expect(updateFromLogs).toHaveBeenCalledTimes(1);
  });
});

describe('resolution order', () => {
  test('his own history wins, and costs no model call', async () => {
    findOne.mockImplementation(() => chain({
      _id: 'food-history',
      name: 'nachos with beef, chicken and cheese',
      nutrition: { calories_per_serving: 1100, protein_grams: 50, carbs_grams: 90, fat_grams: 60 },
      serving: { size: 1, unit: 'plate' }
    }));

    const result = await run('a dozen nachos with beef and chicken and cheese');

    expect(result.logged[0].source).toBe('history');
    // Reused at face value: the stored row is already twelve nachos' worth.
    expect(result.logged[0].calories).toBe(1100);
    expect(result.logged[0].loggedServings).toBe(1);
    expect(estimateDishes).not.toHaveBeenCalled();
    // Reuses the existing catalog row rather than minting a duplicate.
    expect(create).not.toHaveBeenCalled();
  });

  test('a branded item resolves against published facts, not a guess', async () => {
    unifiedSearch.mockImplementation(async () => [{
      id: 'cat-1',
      name: 'Kroger Chicken Tenders',
      source: 'fatsecret',
      nutrition: { calories_per_serving: 220, protein_grams: 14, carbs_grams: 16, fat_grams: 11 }
    }]);

    const result = await run('kroger chicken tenders');

    expect(result.logged[0].source).toBe('catalog');
    expect(estimateDishes).not.toHaveBeenCalled();
  });

  test('an unbranded dish never bothers the catalog', async () => {
    estimateDishes.mockImplementation(async () => ({
      ok: true, dishes: [estimated(0, 'Nachos', 900)]
    }));

    await run('nachos');
    expect(unifiedSearch).not.toHaveBeenCalled();
  });
});

describe('the rails guard the log', () => {
  test('an absurd estimate is skipped, not written', async () => {
    // The model is asked for the TOTAL, so 41 flautas comes back as one
    // five-figure number rather than a sane per-item one.
    estimateDishes.mockImplementation(async () => ({
      ok: true,
      dishes: [estimated(0, 'Beef flautas', 9020)]
    }));

    const result = await logDescription('41 beef flautas', { userId: 'u1', date: '2026-09-15', hour: 19, skipReview: true });

    expect(result.logged).toHaveLength(0);
    expect(result.skipped[0].reason).toBe('absurd-total-calories');
    expect(savedLogs).toHaveLength(0);
  });

  test('a merely large plate is written, and marked for a second look', async () => {
    estimateDishes.mockImplementation(async () => ({
      ok: true, dishes: [estimated(0, 'Full rack of ribs', 2800)]
    }));

    const result = await run('a full rack of ribs');

    expect(result.logged).toHaveLength(1);
    expect(result.logged[0].needsJudge).toBe(true);
  });
});

describe('asking a question', () => {
  test('only when the spread actually moves the day', async () => {
    estimateDishes.mockImplementation(async () => ({
      ok: true,
      dishes: [
        estimated(0, 'Nachos', 900, { lowCalories: 400, highCalories: 1400 }),
        estimated(1, 'Fries', 400, { lowCalories: 380, highCalories: 510 })
      ]
    }));

    const result = await run('nachos, fries');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].name).toBe('Nachos');
  });
});

describe('when the model is unavailable', () => {
  test('nothing is invented and nothing is written', async () => {
    const result = await run('some dish nobody has heard of');

    expect(result.logged).toHaveLength(0);
    expect(savedLogs).toHaveLength(0);
    expect(updateFromLogs).not.toHaveBeenCalled();
  });
});

describe('findInHistory', () => {
  test('matches the same words in a different order', async () => {
    findOne.mockImplementation(() => chain(null));
    find.mockImplementation(() => chain([
      { _id: 'f1', name: 'nachos with cheese and beef' }
    ]));

    const hit = await findInHistory('u1', 'nachos with beef and cheese');
    expect(hit?.match).toBe('tokens');
  });

  test('is null for a user with no history', async () => {
    expect(await findInHistory('u1', 'nachos')).toBeNull();
    expect(await findInHistory(null, 'nachos')).toBeNull();
  });
});


describe('the background judge', () => {
  const logOneEstimate = async (calories) => {
    estimateDishes.mockImplementation(async () => ({
      ok: true, dishes: [estimated(0, 'Pepperoni pizza', calories)]
    }));
    const result = await run('two slices of pepperoni pizza');
    return result.logged;
  };

  test('rewrites an entry the judge says is a factor out', async () => {
    const logged = await logOneEstimate(1200);
    judgeEntries.mockImplementation(async () => ({
      ok: true,
      verdicts: [{ index: 0, reasonable: false, betterCalories: 570, why: 'two slices is about 570' }]
    }));

    const out = await reviewLoggedEntries(logged, { userId: 'u1', date: '2026-09-15' });

    expect(out).toEqual({ reviewed: 1, corrected: 1 });
    const row = savedLogs[0];
    // 570/1200 = 0.475, applied to calories AND macros so they stay coherent.
    expect(row.nutrition.calories_per_serving).toBe(570);
    expect(row.nutrition.protein_grams).toBeCloseTo(9.5, 1);
    expect(row.notes).toMatch(/Adjusted 1200 → 570 cal on review: two slices is about 570/);
    expect(updateFromLogs).toHaveBeenCalled();
  });

  test('leaves a merely imprecise entry alone', async () => {
    // 960 vs 1220 is 27% — Chef calls that noise at the week level.
    const logged = await logOneEstimate(1220);
    judgeEntries.mockImplementation(async () => ({
      ok: true, verdicts: [{ index: 0, reasonable: false, betterCalories: 960, why: 'a bit high' }]
    }));

    const out = await reviewLoggedEntries(logged, { userId: 'u1', date: '2026-09-15' });

    expect(out.corrected).toBe(0);
    expect(savedLogs[0].nutrition.calories_per_serving).toBe(1220);
    expect(savedLogs[0].notes).toBeUndefined();
  });

  test('never judges history or catalog entries', async () => {
    const out = await reviewLoggedEntries([
      { logId: 'a', source: 'history', name: 'Nachos', calories: 1100 },
      { logId: 'b', source: 'catalog', name: 'Kroger tenders', calories: 220 }
    ], { userId: 'u1', date: '2026-09-15' });

    expect(out).toEqual({ reviewed: 0, corrected: 0 });
    expect(judgeEntries).not.toHaveBeenCalled();
  });

  test('a verdict of reasonable changes nothing', async () => {
    const logged = await logOneEstimate(570);
    judgeEntries.mockImplementation(async () => ({
      ok: true, verdicts: [{ index: 0, reasonable: true, betterCalories: null, why: '' }]
    }));

    expect((await reviewLoggedEntries(logged, { userId: 'u1', date: '2026-09-15' })).corrected).toBe(0);
  });

  test('an unavailable judge is not an error', async () => {
    const logged = await logOneEstimate(1200);
    expect(await reviewLoggedEntries(logged, { userId: 'u1', date: '2026-09-15' }))
      .toEqual({ reviewed: 0, corrected: 0 });
    expect(savedLogs[0].nutrition.calories_per_serving).toBe(1200);
  });

  test('logging does not wait on the judge', async () => {
    let released;
    judgeEntries.mockImplementation(() => new Promise((r) => { released = r; }));
    estimateDishes.mockImplementation(async () => ({
      ok: true, dishes: [estimated(0, 'Pizza', 600)]
    }));

    // No skipReview: the detached review is left hanging and must not block.
    const result = await logDescription('pizza', { userId: 'u1', date: '2026-09-15', hour: 19 });

    expect(result.logged).toHaveLength(1);
    released?.({ ok: false, verdicts: [] });
  });
});
