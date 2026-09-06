// `UserSettings.updateSettings` and the three routes that reach it.
//
// The rule (apps/fitnessgeek/DOCS/CONTEXT.md, "Settings writes are PARTIAL"):
// every writer of the `usersettings` collection sends ONE `$set` of dot paths,
// so MongoDB MERGES a sub-document instead of replacing it. `PUT /api/settings`
// and basegeek's `updateFitnessUserSettings` were fixed on 2026-09-05
// (BURN_REVIEW #5, #6). This static was the writer still `$set`-ing whole
// nested objects, which mongoose leaves undotted:
//
//   updateSettings(id, { ai: { enabled: false } })      → deletes ai.features
//   updateSettings(id, { nutrition_goal: { … } })       → deletes bmr, tdee,
//                                                          weekly_schedule, keto
//
// Callers: PUT /api/settings/ai, PUT /api/settings/dashboard, POST /api/goals.
//
// Hermetic: `flattenForSet` is asserted directly here; the real static's write
// shape is pinned in `src/__tests__/models/userSettingsUpdateSettings.test.js`,
// which imports the actual model.

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { flattenForSet } from '../../utils/flattenSettingsUpdate.js';

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

jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => {
  const UserSettings = jest.fn();
  UserSettings.getOrCreate = jest.fn();
  UserSettings.findOne = jest.fn();
  UserSettings.find = jest.fn();
  UserSettings.findOneAndUpdate = jest.fn();
  UserSettings.updateSettings = jest.fn();
  return { __esModule: true, default: UserSettings };
});

jest.unstable_mockModule(mod('../../services/garminConnectService.js'), () => ({
  __esModule: true,
  getDaily: jest.fn().mockRejectedValue(new Error('Garmin integration disabled')),
  buildClient: jest.fn(),
  persistTokens: jest.fn(),
  getStatus: jest.fn(),
  getHeartRate: jest.fn(),
  updateWeightToGarmin: jest.fn(),
  getSleepData: jest.fn(),
  getActivities: jest.fn(),
}));

const { default: UserSettings } = await import('../../models/UserSettings.js');
const { default: settingsRoutes } = await import('../../routes/settingsRoutes.js');
const { default: goalRoutes } = await import('../../routes/goalRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRoutes);
  app.use('/api/goals', goalRoutes);
  return app;
}

beforeEach(() => {
  UserSettings.updateSettings.mockReset();
  UserSettings.updateSettings.mockResolvedValue({ ai: {}, dashboard: {} });
  UserSettings.getOrCreate.mockReset();
});

describe('flattenForSet', () => {
  test('dots every level of a nested patch', () => {
    expect(flattenForSet({ ai: { enabled: false } })).toEqual({ 'ai.enabled': false });
    expect(flattenForSet({ nutrition_goal: { keto: { net_carb_limit_g: 20 } } }))
      .toEqual({ 'nutrition_goal.keto.net_carb_limit_g': 20 });
  });

  test('arrays and Dates are leaves, not objects to recurse into', () => {
    const out = flattenForSet({
      dashboard: { card_order: ['a', 'b'] },
      nutrition_goal: { weekly_schedule: [1, 2, 3, 4, 5, 6, 7], start_date: new Date(0) },
    });
    expect(out['dashboard.card_order']).toEqual(['a', 'b']);
    expect(out['nutrition_goal.weekly_schedule']).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(out['nutrition_goal.start_date']).toBeInstanceOf(Date);
  });

  test('the two Mixed Garmin OAuth blobs stay whole values', () => {
    const token = { access: 'a', refresh: 'b' };
    const out = flattenForSet({ garmin: { oauth1_token: token, enabled: true } });
    expect(out['garmin.oauth1_token']).toBe(token);
    expect(out['garmin.enabled']).toBe(true);
    expect(out).not.toHaveProperty('garmin.oauth1_token.access');
  });

  test('undefined and empty objects are dropped', () => {
    expect(flattenForSet({ theme: undefined, nutrition_goal: {} })).toEqual({});
  });
});

describe('POST /api/goals writes the schema\'s own weight_goal spelling', () => {
  test('camelCase keys and YYYY-MM-DD strings, not start_weight / Date', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ weight_goal: {}, nutrition_goal: {} });

    const res = await request(buildApp())
      .post('/api/goals')
      .set('x-test-user', OWNER)
      .send({ weight: { startWeight: 210, targetWeight: 180, startDate: '2026-01-01', goalDate: '2026-06-01' } });

    expect(res.status).toBe(200);
    const [, patch] = UserSettings.updateSettings.mock.calls[0];
    expect(patch.weight_goal).toMatchObject({
      enabled: true,
      is_active: true,
      startWeight: 210,
      targetWeight: 180,
      startDate: '2026-01-01',
      goalDate: '2026-06-01',
    });
    // `start_weight` / `target_weight` / `start_date` / `goal_date` are NOT
    // paths on UserSettings.weight_goal — mongoose strict mode dropped every
    // one of them, so the whole weight goal was silently discarded.
    expect(patch.weight_goal).not.toHaveProperty('start_weight');
    expect(patch.weight_goal).not.toHaveProperty('target_weight');
    expect(patch.weight_goal).not.toHaveProperty('start_date');
    expect(patch.weight_goal).not.toHaveProperty('goal_date');
  });

  test('GET /api/goals reads the same spelling back', async () => {
    UserSettings.getOrCreate.mockResolvedValue({
      nutrition_goal: { enabled: true, daily_calorie_target: 1900 },
      weight_goal: {
        startWeight: 210, targetWeight: 180,
        startDate: '2026-01-01', goalDate: '2026-06-01', is_active: true,
      },
    });

    const res = await request(buildApp()).get('/api/goals').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.weight).toEqual({
      startWeight: 210,
      targetWeight: 180,
      startDate: '2026-01-01',
      goalDate: '2026-06-01',
      is_active: true,
    });
    expect(res.body.data.nutrition.goals.calories).toBe(1900);
  });

  test('a nutrition save names only the keys it means to change', async () => {
    UserSettings.getOrCreate.mockResolvedValue({
      nutrition_goal: { enabled: true, daily_calorie_target: 1900, bmr: 1500, tdee: 2200 },
      weight_goal: {},
    });

    await request(buildApp())
      .post('/api/goals')
      .set('x-test-user', OWNER)
      .send({ nutrition: { trackMacros: true, goals: { calories: 2000 } } });

    const [, patch] = UserSettings.updateSettings.mock.calls[0];
    expect(patch.nutrition_goal).toEqual({ enabled: true, daily_calorie_target: 2000 });
    // `{...mongooseSubdoc}` copies `$__`/`_doc`, not the fields — the old code
    // spread the existing sub-document and shipped mongoose internals.
    expect(patch.nutrition_goal).not.toHaveProperty('_doc');
    expect(patch.nutrition_goal).not.toHaveProperty('$__');
    // Macro GRAM targets are not paths on UserSettings.nutrition_goal at all
    // (consolidation §12 follow-up #8) — writing them was a silent no-op.
    expect(patch.nutrition_goal).not.toHaveProperty('protein_grams');
  });
});

describe('PUT /api/settings/ai and /dashboard go through the partial writer', () => {
  test('a features-only AI save is handed to updateSettings under `ai`', async () => {
    const res = await request(buildApp())
      .put('/api/settings/ai')
      .set('x-test-user', OWNER)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(UserSettings.updateSettings).toHaveBeenCalledWith(OWNER, { ai: { enabled: false } });
  });

  test('a dashboard save is handed to updateSettings under `dashboard`', async () => {
    const res = await request(buildApp())
      .put('/api/settings/dashboard')
      .set('x-test-user', OWNER)
      .send({ show_current_weight: false });

    expect(res.status).toBe(200);
    expect(UserSettings.updateSettings).toHaveBeenCalledWith(OWNER, {
      dashboard: { show_current_weight: false },
    });
  });
});
