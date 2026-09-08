/**
 * aiFoodService — the deterministic split, and what each food feature does
 * when aiGeek answers `ok: false`.
 *
 * The rule these cases encode: **every method is total.** Food parsing falls
 * back to a comma split with `nutrition: null` (a split is useful, invented
 * calories are not), classification falls back to `type: 'unknown'` with the
 * words as search terms, scoring falls back to the caller's own order, and
 * the sanity check falls back to "no objection". Nothing throws because a
 * free tier was busy.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mod = (p) => new URL(p, import.meta.url).pathname;

const feature = jest.fn();

jest.unstable_mockModule(mod('../../services/aiGeekClient.js'), () => ({
  __esModule: true,
  default: { feature, isConfigured: () => true, getStatus: () => ({}), modelsAlive: async () => [] },
  UNAVAILABLE_MESSAGE: "The assistant isn't available right now.",
  MAX_TIMEOUT_MS: 60000
}));

const { default: aiFoodService } = await import('../../services/aiFoodService.js');

const declined = (reason = 'unavailable') => ({
  ok: false,
  data: null,
  reason,
  message: "The assistant isn't available right now.",
  provenance: { source: 'none', reason, hints: [] }
});

const answered = (text) => ({
  ok: true,
  data: text,
  reason: null,
  provenance: { source: 'model', provider: 'groq', model: 'llama', hints: [] }
});

beforeEach(() => {
  feature.mockReset();
});

describe('deterministicParse', () => {
  test('splits on commas and "and", and pulls quantities off the front', () => {
    const result = aiFoodService.deterministicParse('two tacos, beans, and a beer', { hour: 13 });

    expect(result.source).toBe('deterministic');
    expect(result.confidence).toBe('low');
    expect(result.food_items.map(i => [i.name, i.servings])).toEqual([
      ['tacos', 2],
      ['beans', 1],
      ['beer', 1]
    ]);
  });

  test('reports no nutrition rather than zeroes', () => {
    const [item] = aiFoodService.deterministicParse('grilled chicken breast', { hour: 12 }).food_items;
    // A 0-calorie chicken breast in a food log is worse than no numbers at
    // all: it looks like data and it is a lie.
    expect(item.nutrition).toBeNull();
    expect(aiFoodService.deterministicParse('x', { hour: 12 }).estimated_calories).toBeNull();
  });

  test('reads a unit after the quantity', () => {
    const [item] = aiFoodService.deterministicParse('2 cups of rice', { hour: 12 }).food_items;
    expect(item.name).toBe('rice');
    expect(item.servings).toBe(2);
    expect(item.estimated_serving_size).toBe('cup');
  });

  test('a meal named in the sentence beats the clock', () => {
    expect(aiFoodService.deterministicParse('eggs for breakfast', { hour: 19 }).meal_type).toBe('breakfast');
    expect(aiFoodService.deterministicParse('eggs', { hour: 19 }).meal_type).toBe('dinner');
    expect(aiFoodService.deterministicParse('eggs', { hour: 8 }).meal_type).toBe('breakfast');
  });

  test('nothing parseable still yields something the UI can search with', () => {
    expect(aiFoodService.deterministicParse('...', { hour: 8 }).food_items).toEqual([]);
    const single = aiFoodService.deterministicParse('leftover lasagna', { hour: 20 });
    expect(single.food_items).toHaveLength(1);
  });
});

describe('parseFoodDescription', () => {
  test('a model answer is read and reported as source: model', async () => {
    feature.mockResolvedValue(answered(JSON.stringify({
      food_items: [{ name: 'taco', servings: 2, nutrition: { calories_per_serving: 210 } }],
      meal_type: 'lunch',
      estimated_calories: 420,
      confidence: 'high'
    })));

    const result = await aiFoodService.parseFoodDescription('two tacos');
    expect(result.ok).toBe(true);
    expect(result.source).toBe('model');
    expect(result.data.food_items[0].nutrition.calories_per_serving).toBe(210);
    expect(feature.mock.calls[0][0]).toBe('foodParse');
  });

  test('ok: false takes the deterministic split, and says so', async () => {
    feature.mockResolvedValue(declined('cap'));

    const result = await aiFoodService.parseFoodDescription('two tacos and a beer');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('cap');
    expect(result.source).toBe('fallback');
    expect(result.data.food_items.map(i => i.name)).toEqual(['tacos', 'beer']);
  });

  test('a model answer that will not parse takes the same split, reason unparseable', async () => {
    feature.mockResolvedValue(answered('I am afraid I cannot help with that.'));

    const result = await aiFoodService.parseFoodDescription('two tacos');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unparseable');
    expect(result.data.food_items[0].name).toBe('tacos');
  });
});

describe('classifyFoodInput', () => {
  test('ok: false falls back to type unknown with the words as search terms', async () => {
    feature.mockResolvedValue(declined());

    const result = await aiFoodService.classifyFoodInput('big mac and large fries');
    expect(result.type).toBe('unknown');
    expect(result.items).toHaveLength(1);
    expect(result.search_terms.length).toBeGreaterThan(0);
    // Brand detection is local and survives an unavailable model.
    expect(result.detected_brands).toEqual([]);
  });

  test('brand normalization happens before the model, so it survives a refusal', async () => {
    feature.mockResolvedValue(declined());
    const result = await aiFoodService.classifyFoodInput('mcds fries');
    expect(result.detected_brands).toContain("McDonald's");
    expect(result.normalized_query).toContain("McDonald's");
  });
});

describe('scoreResultsRelevance', () => {
  test('ok: false leaves the caller\'s order alone', async () => {
    feature.mockResolvedValue(declined());
    const results = [{ name: 'a', source: 'usda' }, { name: 'b', source: 'off' }];
    expect(await aiFoodService.scoreResultsRelevance('a', results)).toBe(results);
  });

  test('an answered score is applied', async () => {
    feature.mockResolvedValue(answered('[{"index":1,"score":90,"reason":"exact"},{"index":2,"score":20,"reason":"no"}]'));
    const scored = await aiFoodService.scoreResultsRelevance('a', [{ name: 'a' }, { name: 'b' }]);
    expect(scored[0].aiRelevanceScore).toBe(90);
    expect(scored[1].aiRelevanceScore).toBe(20);
    expect(feature.mock.calls[0][0]).toBe('foodScore');
  });
});

describe('sanityCheckResults', () => {
  test('ok: false raises no objection', async () => {
    feature.mockResolvedValue(declined('timeout'));
    expect(await aiFoodService.sanityCheckResults('a', [{ name: 'a' }])).toEqual({
      valid: true, issues: [], confidence: 'unknown'
    });
    expect(feature.mock.calls[0][0]).toBe('foodSanityCheck');
  });

  test('an empty result set never calls a model', async () => {
    await aiFoodService.sanityCheckResults('a', []);
    expect(feature).not.toHaveBeenCalled();
  });
});
