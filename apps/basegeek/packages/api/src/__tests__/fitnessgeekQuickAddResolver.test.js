/**
 * fitnessgeekQuickAddResolver.test.js
 *
 * `parseFoodEntry` — the gateway half of natural-language quick-add
 * (AI_IDEAS.md idea #2, stream R115). The contract that matters is the one
 * every AI feature in the suite shares, and it is mostly about what the model
 * is *not* allowed to do:
 *
 *   - it proposes; nothing here writes (rows go through `addFoodLog` after the
 *     user ticks them, exactly as a hand-entered row does)
 *   - it returns search QUERIES, never foods — so a wrong guess is a search
 *     that finds nothing, not an invented item in the log
 *   - the deterministic split is the fallback, and it answers on every failure
 *     path: cap spent, aiGeek down, slow, unparseable, invalid
 *   - the server-side AI switch is honoured here, not only in the UI
 *   - provenance always says which of the two answered
 *
 * aiService is mocked; UserSettings is real, against the same in-memory Mongo
 * the other fitnessgeek suites use.
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const callAI = jest.fn();
const aiServiceMock = { callAI, lastProviderInfo: null, chat: jest.fn() };

jest.unstable_mockModule('../services/aiService.js', () => ({
  default: aiServiceMock,
}));

const { _resetCounters } = await import('../services/aiFeatureRunner.js');
const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');
const { resolvers } = await import('../graphql/fitnessgeek/resolvers.js');

const Q = resolvers.Query;
const ALICE = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: userId } } : {});

/** 8am local — deterministic meal type, so assertions don't move with the clock. */
const MORNING = '2026-09-06T08:30';

const modelAnswers = (payload, info = { provider: 'groq', model: 'llama-3.1-8b' }) => {
  aiServiceMock.lastProviderInfo = info;
  callAI.mockResolvedValueOnce(JSON.stringify(payload));
};

beforeAll(async () => {
  await UserSettings.db.asPromise();
}, 60000);

// R124: natural_language_food_logging is the opt-in (default false), so the
// model path needs an explicit true on the settings document. Tests that
// exercise the model start from an opted-in ALICE; the opt-out/absent cases
// below create their own documents (or none).
const optIn = (userId = ALICE) =>
  UserSettings.create({ user_id: userId, ai: { enabled: true, features: { natural_language_food_logging: true } } });

beforeEach(async () => {
  _resetCounters();
  callAI.mockReset();
  aiServiceMock.lastProviderInfo = null;
  await optIn();
});

afterEach(async () => {
  await UserSettings.deleteMany({});
});

afterAll(async () => {
  await UserSettings.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('parseFoodEntry — auth and input', () => {
  test('requires a user', async () => {
    await expect(Q.parseFoodEntry(null, { text: 'eggs' }, ctx())).rejects.toThrow('Unauthorized');
    expect(callAI).not.toHaveBeenCalled();
  });

  test('rejects empty text and text over 500 characters', async () => {
    for (const text of ['', '   ', 'x'.repeat(501)]) {
      await expect(Q.parseFoodEntry(null, { text }, ctx(ALICE))).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    expect(callAI).not.toHaveBeenCalled();
  });

  test('500 characters exactly is accepted', async () => {
    const result = await Q.parseFoodEntry(null, { text: 'x'.repeat(500), date: MORNING }, ctx(ALICE));
    expect(result.fragments.length).toBeGreaterThan(0);
  });
});

describe('parseFoodEntry — the model refines, the split falls back', () => {
  test('a valid model answer is used, and provenance names the model', async () => {
    modelAnswers({
      fragments: [
        { text: 'a bowl of oatmeal', query: 'oatmeal', servings: 1, unit: 'bowl', mealType: 'breakfast' },
        { text: 'w/ blueberries', query: 'blueberries', servings: 1, unit: null, mealType: 'breakfast' },
      ],
    });

    const result = await Q.parseFoodEntry(
      null,
      { text: 'a bowl of oatmeal w/ blueberries', date: MORNING },
      ctx(ALICE)
    );

    expect(result.fragments.map((f) => f.query)).toEqual(['oatmeal', 'blueberries']);
    expect(result.provenance).toMatchObject({
      source: 'model',
      provider: 'groq',
      model: 'llama-3.1-8b',
      callsToday: 1,
      cap: 40,
    });
  });

  test('it routes through the fitnessgeek app-routing row with the quickadd feature tag', async () => {
    modelAnswers({ fragments: [{ text: 'eggs', query: 'eggs', servings: 2, unit: null, mealType: 'breakfast' }] });
    await Q.parseFoodEntry(null, { text: 'two eggs', date: MORNING }, ctx(ALICE));

    const [, config] = callAI.mock.calls[0];
    expect(config).toMatchObject({ useAppConfig: true, appName: 'fitnessgeek', feature: 'quickadd' });
    expect(config.responseFormat.type).toBe('json_schema');
  });

  test('only the sentence and the deterministic split leave the box', async () => {
    modelAnswers({ fragments: [{ text: 'eggs', query: 'eggs', servings: 2, unit: null, mealType: 'breakfast' }] });
    await Q.parseFoodEntry(null, { text: 'two eggs', date: MORNING }, ctx(ALICE));

    const payload = JSON.parse(callAI.mock.calls[0][0]);
    expect(Object.keys(payload).sort()).toEqual(['defaultMealType', 'deterministicFragments', 'sentence']);
    expect(payload.sentence).toBe('two eggs');
    expect(payload.defaultMealType).toBe('breakfast');
    // No user id, no history, no settings, nothing from another app.
    expect(JSON.stringify(payload)).not.toContain(ALICE);
  });

  test.each([
    ['aiGeek is down', () => callAI.mockRejectedValueOnce(new Error('ECONNREFUSED')), 'unavailable'],
    ['the answer is not JSON', () => callAI.mockResolvedValueOnce('sorry, I can only help with recipes'), 'unparseable'],
    ['a fragment invents a food with no query', () => callAI.mockResolvedValueOnce(JSON.stringify({
      fragments: [{ text: 'eggs', query: '', servings: 2, unit: null, mealType: 'breakfast' }],
    })), 'invalid'],
    ['servings are out of range', () => callAI.mockResolvedValueOnce(JSON.stringify({
      fragments: [{ text: 'eggs', query: 'eggs', servings: 999, unit: null, mealType: 'breakfast' }],
    })), 'invalid'],
    ['the meal type is off the enum', () => callAI.mockResolvedValueOnce(JSON.stringify({
      fragments: [{ text: 'eggs', query: 'eggs', servings: 2, unit: null, mealType: 'elevenses' }],
    })), 'invalid'],
    ['it returns more than twelve fragments', () => callAI.mockResolvedValueOnce(JSON.stringify({
      fragments: Array.from({ length: 13 }, (_, i) => ({ text: `f${i}`, query: `f${i}`, servings: 1, unit: null, mealType: 'breakfast' })),
    })), 'invalid'],
  ])('%s → the deterministic split, labelled as a fallback', async (_label, arrange, reason) => {
    arrange();
    const result = await Q.parseFoodEntry(
      null,
      { text: 'two eggs, toast with butter, black coffee', date: MORNING },
      ctx(ALICE)
    );
    expect(result.provenance).toMatchObject({ source: 'fallback', reason });
    expect(result.fragments.map((f) => f.query)).toEqual(['eggs', 'toast with butter', 'black coffee']);
    expect(result.fragments.every((f) => f.mealType === 'breakfast')).toBe(true);
  });

  test('the cap is 40 a day, per user, and the 41st still answers', async () => {
    for (let i = 0; i < 40; i += 1) {
      modelAnswers({ fragments: [{ text: 'eggs', query: 'eggs', servings: 1, unit: null, mealType: 'breakfast' }] });
      await Q.parseFoodEntry(null, { text: 'eggs', date: MORNING }, ctx(ALICE));
    }
    const capped = await Q.parseFoodEntry(null, { text: 'two eggs', date: MORNING }, ctx(ALICE));
    expect(capped.provenance).toMatchObject({ source: 'fallback', reason: 'cap', cap: 40, callsToday: 40 });
    expect(capped.fragments).toEqual([
      { text: 'two eggs', query: 'eggs', servings: 2, unit: null, mealType: 'breakfast' },
    ]);
    expect(callAI).toHaveBeenCalledTimes(40);
  });
});

describe('parseFoodEntry — the opt-in is honoured server-side', () => {
  test('ai.features.natural_language_food_logging = false means no model call at all', async () => {
    await UserSettings.findOneAndUpdate(
      { user_id: ALICE },
      { ai: { enabled: true, features: { natural_language_food_logging: false } } },
      { upsert: true }
    );

    const result = await Q.parseFoodEntry(null, { text: 'two eggs', date: MORNING }, ctx(ALICE));

    expect(callAI).not.toHaveBeenCalled();
    expect(result.provenance).toMatchObject({ source: 'fallback', reason: 'disabled', cap: 40 });
    expect(result.fragments.map((f) => f.query)).toEqual(['eggs']);
  });

  test('ai.enabled = false does the same', async () => {
    await UserSettings.findOneAndUpdate({ user_id: ALICE }, { ai: { enabled: false } }, { upsert: true });
    const result = await Q.parseFoodEntry(null, { text: 'two eggs', date: MORNING }, ctx(ALICE));
    expect(callAI).not.toHaveBeenCalled();
    expect(result.provenance.reason).toBe('disabled');
  });

  test('no settings document at all still works — deterministic split, no model call (opt-in is explicit)', async () => {
    await UserSettings.deleteMany({ user_id: ALICE });
    modelAnswers({ fragments: [{ text: 'two eggs', query: 'eggs', servings: 2, unit: null, mealType: 'breakfast' }] });
    const result = await Q.parseFoodEntry(null, { text: 'two eggs', date: MORNING }, ctx(ALICE));
    expect(result.provenance.source).toBe('fallback');
    expect(result.provenance.reason).toBe('disabled');
    expect(callAI).not.toHaveBeenCalled();
    expect(result.fragments.length).toBeGreaterThan(0);
    // Reading the switch must not CREATE a settings document — this is a query.
    expect(await UserSettings.countDocuments({ user_id: ALICE })).toBe(0);
  });
});

describe('parseFoodEntry — meal type and the clock', () => {
  test('the caller\'s local wall clock picks the meal, not the server\'s UTC hour', async () => {
    callAI.mockRejectedValue(new Error('offline'));
    const evening = await Q.parseFoodEntry(null, { text: 'pizza', date: '2026-09-06T19:00' }, ctx(ALICE));
    expect(evening.fragments[0].mealType).toBe('dinner');
    const morning = await Q.parseFoodEntry(null, { text: 'pizza', date: '2026-09-06T08:00' }, ctx(ALICE));
    expect(morning.fragments[0].mealType).toBe('breakfast');
  });

  test('a meal named in the sentence beats the clock', async () => {
    callAI.mockRejectedValue(new Error('offline'));
    const result = await Q.parseFoodEntry(
      null,
      { text: 'chicken salad for lunch', date: '2026-09-06T21:30' },
      ctx(ALICE)
    );
    expect(result.fragments[0]).toMatchObject({ query: 'chicken salad', mealType: 'lunch' });
  });
});
