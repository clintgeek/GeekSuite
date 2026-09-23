// REST `GET /api/goals/nutrition/macros` on the shared macro implementation.
//
// This route is not called by the live frontend (the gateway's `derivedMacros`
// is), but it carried the third hand-copied version of the macro arithmetic
// (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md F3/D5). Now it calls
// `deriveMacroTargets` / `macrosForCalories` from @geeksuite/utils, takes lean
// mass from this backend's own BodyComposition model, and keeps its Garmin
// eat-back for "today". Pinned here:
//
//   1. no scan, standard plan: the numbers the old inline copy produced;
//   2. a recent scan: protein per lb of lean mass; a stale one is ignored;
//   3. keto: the split, not a calorie-remainder carb target;
//   4. Garmin eat-back: today's grams are recomputed at the eaten-back calories.

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

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
  UserSettings.updateSettings = jest.fn();
  return { __esModule: true, default: UserSettings };
});

let scans = [];
const bodyCompFind = jest.fn(() => ({ sort: () => ({ lean: async () => scans }) }));
jest.unstable_mockModule(mod('../../models/BodyComposition.js'), () => ({
  __esModule: true,
  default: { find: bodyCompFind },
}));

jest.unstable_mockModule(mod('../../services/garminConnectService.js'), () => ({
  __esModule: true,
  getDaily: jest.fn(),
}));

const { default: UserSettings } = await import('../../models/UserSettings.js');
const garmin = await import('../../services/garminConnectService.js');
const { default: goalRoutes } = await import('../../routes/goalRoutes.js');

const app = express();
app.use(express.json());
app.use('/api/goals', goalRoutes);

const get = () => request(app).get('/api/goals/nutrition/macros').set('x-test-user', 'u1');

const PLAN = {
  enabled: true,
  daily_calorie_target: 2400,
  goal_weight_lbs: 220,
  protein_g_per_lb_goal: 0.8,
  fat_g_per_lb_goal: 0.35,
};

/** Today's calendar day, as the route computes it (server-local). */
const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};
const daysBefore = (ymd, n) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() - n * 86400000);

beforeEach(() => {
  scans = [];
  bodyCompFind.mockClear();
  UserSettings.getOrCreate.mockReset();
  garmin.getDaily.mockReset();
  garmin.getDaily.mockRejectedValue(new Error('Garmin integration disabled'));
});

describe('GET /api/goals/nutrition/macros', () => {
  test('no scan, standard plan: the old inline numbers', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ nutrition_goal: PLAN });
    const res = await get();
    expect(res.status).toBe(200);
    // protein 0.8×220 = 176; fat 0.35×220 = 77; carbs (2400 − 704 − 693)/4 = 250.75 → 251
    const { data } = res.body;
    expect(data.fixed).toEqual({ protein_g: 176, fat_g: 77, protein_kcal: 704, fat_kcal: 693 });
    expect(data.weekly).toHaveLength(7);
    for (const day of data.weekly) {
      expect(day).toMatchObject({ base_calories: 2400, activity_add_kcal: 0, protein_g: 176, fat_g: 77, carbs_g: 251 });
    }
    expect(data.rules).toMatchObject({
      goal_weight_lbs: 220, protein_g_per_lb: 0.8, fat_g_per_lb: 0.35, carb_strategy: 'fill',
      calorie_target_mode: 'fixed', activity_eatback_fraction: 0.6, activity_eatback_cap_kcal: 500,
      protein_basis: 'goal_weight',
    });
    expect(bodyCompFind).toHaveBeenCalledWith({ userId: 'u1' });
  });

  test('a recent scan: protein per lb of measured lean mass', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ nutrition_goal: PLAN });
    scans = [{ log_date: daysBefore(localToday(), 3), weight_value: 318, body_fat_mass_lb: 140 }];
    const { body } = await get();
    expect(body.data.rules).toMatchObject({ protein_basis: 'lean_mass', lean_mass_lb: 178 });
    expect(body.data.fixed.protein_g).toBe(178);
    expect(body.data.today.carbs_g).toBe(Math.round((2400 - 178 * 4 - 77 * 9) / 4));
  });

  test('a scan more than 30 days old is ignored', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ nutrition_goal: PLAN });
    scans = [{ log_date: daysBefore(localToday(), 45), weight_value: 318, body_fat_mass_lb: 140 }];
    const { body } = await get();
    expect(body.data.rules.protein_basis).toBe('goal_weight');
    expect(body.data.fixed.protein_g).toBe(176);
  });

  test('keto: the split\'s carbs, not the calorie remainder', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ nutrition_goal: { ...PLAN, mode: 'keto', daily_calorie_target: 2000 } });
    const { body } = await get();
    // classic 70/25/5 of 2000 kcal
    expect(body.data.today).toMatchObject({ carbs_g: 25, protein_g: 125, fat_g: 156 });
    expect(body.data.rules.keto).toBe(true);
  });

  test('Garmin eat-back: today\'s grams are computed at the eaten-back calories', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ nutrition_goal: PLAN });
    garmin.getDaily.mockResolvedValue({ activeCalories: 500 });
    const { body } = await get();
    // 0.6 × 500 = 300 kcal eaten back
    expect(body.data.today).toMatchObject({
      base_calories: 2400, activity_add_kcal: 300, target_calories: 2700,
      protein_g: 176, fat_g: 77, carbs_g: Math.round((2700 - 704 - 693) / 4),
    });
    expect(garmin.getDaily).toHaveBeenCalledWith('u1', localToday());
  });

  test('keto eat-back: the split is re-applied at the eaten-back calories', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ nutrition_goal: { ...PLAN, mode: 'keto', daily_calorie_target: 2000 } });
    garmin.getDaily.mockResolvedValue({ activeCalories: 1000 }); // capped at 500
    const { body } = await get();
    // 70/25/5 of 2500 kcal: fat 194, protein 156, carbs 31
    expect(body.data.today).toMatchObject({ target_calories: 2500, fat_g: 194, protein_g: 156, carbs_g: 31 });
  });

  test('still refuses a plan with no goal weight', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ nutrition_goal: { enabled: true, daily_calorie_target: 2000 } });
    const res = await get();
    expect(res.status).toBe(400);
  });
});
