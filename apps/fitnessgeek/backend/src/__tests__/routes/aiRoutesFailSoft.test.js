/**
 * The `/api/ai/*` REST routes: the opt-in gate on food parsing, and the rule
 * that an unavailable model is a 200.
 *
 * **The opt-in.** `POST /ai/parse-food` was the one natural-language food path
 * with no consent check — the GraphQL quick-add resolver
 * (basegeek `graphql/fitnessgeek/resolvers.js`, `parseFoodEntry`) has read
 * `ai.enabled !== false && ai.features.natural_language_food_logging === true`
 * since 2026-09-05, and this route did not, so the same sentence went to a
 * model over REST whether or not the user had turned the feature on. The flag
 * defaults to **false** in `@geeksuite/schemas` (it is the opt-in, not a kill
 * switch), so only an explicit `true` opens the model path here.
 *
 * **Fail-soft.** Every one of these routes used to answer
 * `500 { code: 'AI_*_ERROR', details: <the thrown message> }` when a free-tier
 * provider was busy. They now answer 200: the food parse with the
 * deterministic split, the goals with the computed plan, the meal plan with
 * one sentence.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';
const mod = (p) => new URL(p, import.meta.url).pathname;

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    req.user = { id: userId, _id: userId, userId };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

const findOne = jest.fn();
jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => {
  const UserSettings = jest.fn();
  UserSettings.findOne = findOne;
  return { __esModule: true, default: UserSettings };
});

const feature = jest.fn();
jest.unstable_mockModule(mod('../../services/aiGeekClient.js'), () => ({
  __esModule: true,
  default: {
    feature,
    isConfigured: () => true,
    baseGeekUrl: 'https://basegeek.invalid',
    getStatus: () => ({ enabled: true, routing: 'auto (aiGeek routing row for app fitnessgeek)' }),
    modelsAlive: async () => []
  },
  UNAVAILABLE_MESSAGE: "The assistant isn't available right now.",
  MAX_TIMEOUT_MS: 60000
}));

const getCachedResult = jest.fn();
const saveResult = jest.fn();
jest.unstable_mockModule(mod('../../services/aiFoodPromptCacheService.js'), () => ({
  __esModule: true,
  default: { getCachedResult, saveResult }
}));

const { default: aiRoutes } = await import('../../routes/aiRoutes.js');

const app = express();
app.use(express.json());
app.use('/api/ai', aiRoutes);

/** `ai` settings as the collection stores them. */
const settingsWith = (ai) => ({
  select: () => ({ lean: () => ({ catch: () => Promise.resolve({ ai }) }) })
});

const optedIn = () => findOne.mockReturnValue(settingsWith({
  enabled: true,
  features: { natural_language_food_logging: true }
}));

const declined = (reason = 'unavailable') => ({
  ok: false,
  data: null,
  reason,
  message: "The assistant isn't available right now.",
  provenance: { source: 'none', reason, hints: [] }
});

beforeEach(() => {
  feature.mockReset();
  findOne.mockReset();
  getCachedResult.mockReset().mockResolvedValue(null);
  saveResult.mockReset();
});

describe('POST /api/ai/parse-food — the opt-in gate', () => {
  test('no settings row: no model call, deterministic split, reason disabled', async () => {
    findOne.mockReturnValue(settingsWith(undefined));

    const res = await request(app)
      .post('/api/ai/parse-food')
      .set('x-test-user', OWNER)
      .send({ description: 'two tacos and a beer' });

    expect(res.status).toBe(200);
    expect(feature).not.toHaveBeenCalled();
    expect(res.body.meta).toMatchObject({ ok: false, source: 'fallback', reason: 'disabled' });
    expect(res.body.data.food_items.map(i => i.name)).toEqual(['tacos', 'beer']);
  });

  test('the flag absent is opted OUT — a true default would enrol everyone', async () => {
    findOne.mockReturnValue(settingsWith({ enabled: true, features: {} }));

    const res = await request(app)
      .post('/api/ai/parse-food')
      .set('x-test-user', OWNER)
      .send({ description: 'eggs' });

    expect(res.status).toBe(200);
    expect(feature).not.toHaveBeenCalled();
    expect(res.body.meta.reason).toBe('disabled');
  });

  test('ai.enabled false vetoes the feature flag', async () => {
    findOne.mockReturnValue(settingsWith({
      enabled: false,
      features: { natural_language_food_logging: true }
    }));

    const res = await request(app)
      .post('/api/ai/parse-food')
      .set('x-test-user', OWNER)
      .send({ description: 'eggs' });

    expect(feature).not.toHaveBeenCalled();
    expect(res.body.meta.reason).toBe('disabled');
  });

  test('opted in: the model is called with feature foodParse', async () => {
    optedIn();
    feature.mockResolvedValue({
      ok: true,
      data: JSON.stringify({ food_items: [{ name: 'taco', servings: 2 }], meal_type: 'lunch', confidence: 'high' }),
      reason: null,
      provenance: { source: 'model', provider: 'groq', model: 'llama', hints: [] }
    });

    const res = await request(app)
      .post('/api/ai/parse-food')
      .set('x-test-user', OWNER)
      .send({ description: 'two tacos' });

    expect(res.status).toBe(200);
    expect(feature.mock.calls[0][0]).toBe('foodParse');
    expect(res.body.meta).toMatchObject({ ok: true, source: 'model', provider: 'groq' });
    expect(saveResult).toHaveBeenCalled();
  });

  test('a settings read that errors is treated as opted out', async () => {
    // "We could not check your preference" is not permission.
    findOne.mockReturnValue({
      select: () => ({ lean: () => ({ catch: (handler) => Promise.resolve(handler(new Error('mongo down'))) }) })
    });

    const res = await request(app)
      .post('/api/ai/parse-food')
      .set('x-test-user', OWNER)
      .send({ description: 'eggs' });

    expect(feature).not.toHaveBeenCalled();
    expect(res.body.meta.reason).toBe('disabled');
  });
});

describe('POST /api/ai/parse-food — fail soft', () => {
  test('an unavailable model is a 200 with the split, and is not cached', async () => {
    optedIn();
    feature.mockResolvedValue(declined('cap'));

    const res = await request(app)
      .post('/api/ai/parse-food')
      .set('x-test-user', OWNER)
      .send({ description: 'two tacos, beans' });

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ ok: false, source: 'fallback', reason: 'cap' });
    expect(res.body.data.food_items).toHaveLength(2);
    // Caching a refusal would keep handing it back long after the tier
    // recovered.
    expect(saveResult).not.toHaveBeenCalled();
  });

  test('a missing description is still a 400', async () => {
    const res = await request(app)
      .post('/api/ai/parse-food')
      .set('x-test-user', OWNER)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_DESCRIPTION');
  });
});

describe('POST /api/ai/create-nutrition-goals — deterministic fallback', () => {
  test('an unavailable model answers 200 with the computed plan', async () => {
    feature.mockResolvedValue(declined());

    const res = await request(app)
      .post('/api/ai/create-nutrition-goals')
      .set('x-test-user', OWNER)
      .send({
        userInput: 'lose 20 pounds',
        userProfile: {
          age: 45, weight: 210, height: `5'11"`, gender: 'male',
          currentFitnessLevel: 'light', weightChangeRate: 1, targetWeight: 190
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ ok: false, source: 'deterministic' });
    // Mifflin-St Jeor: 10*210 + 6.25*71 - 5*45 + 5 = 2323.75 → 2324. TDEE at
    // the `light` multiplier 1.375 = 3195.5 → 3196. Minus a 500 kcal/day
    // deficit for 1 lb/week = 2696, well above the max(1200, BMR*0.8) floor.
    expect(res.body.data.primary_goal.daily_calorie_target).toBe(2696);
    expect(res.body.data.primary_goal.timeline_weeks).toBe(20);
  });

  test('too thin a profile to compute leaves data null and says so, still 200', async () => {
    feature.mockResolvedValue(declined());

    const res = await request(app)
      .post('/api/ai/create-nutrition-goals')
      .set('x-test-user', OWNER)
      .send({ userInput: 'get healthier', userProfile: {} });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta.message).toBe("The assistant isn't available right now.");
  });

  test('no user bearer token is demanded any more — the app has its own key', async () => {
    feature.mockResolvedValue(declined());
    const res = await request(app)
      .post('/api/ai/create-nutrition-goals')
      .set('x-test-user', OWNER)
      .send({ userInput: 'x', userProfile: {} });
    expect(res.status).not.toBe(401);
  });
});

describe('POST /api/ai/generate-meal-plan — the friendly message', () => {
  test('an unavailable model is a 200 { ok: false, reason, message }', async () => {
    feature.mockResolvedValue(declined('unavailable'));

    const res = await request(app)
      .post('/api/ai/generate-meal-plan')
      .set('x-test-user', OWNER)
      .send({ goal: { title: 'cut', daily_calorie_target: 2000 } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: false,
      reason: 'unavailable',
      message: "The assistant isn't available right now."
    });
    expect(feature.mock.calls[0][0]).toBe('mealPlan');
  });

  test('a model answer comes back on the success envelope', async () => {
    feature.mockResolvedValue({
      ok: true,
      data: JSON.stringify({ weekly_meal_plans: [{ week: 1, days: [] }] }),
      reason: null,
      provenance: { source: 'model', hints: [] }
    });

    const res = await request(app)
      .post('/api/ai/generate-meal-plan')
      .set('x-test-user', OWNER)
      .send({ goal: { title: 'cut' } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.weekly_meal_plans).toHaveLength(1);
  });
});

describe('GET /api/ai/status', () => {
  test('reports routing and never a model id', async () => {
    const res = await request(app).get('/api/ai/status').set('x-test-user', OWNER);
    expect(res.status).toBe(200);
    expect(res.body.data.routing).toContain('auto');
    expect(res.body.data.model).toBeUndefined();
  });
});
