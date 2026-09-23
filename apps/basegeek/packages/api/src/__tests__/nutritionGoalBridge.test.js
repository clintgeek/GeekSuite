/**
 * The goal store split, pinned.
 *
 * Goals are written to `UserSettings.nutrition_goal` and were read from the
 * `nutritiongoals` collection, which nothing in any frontend has ever written.
 * Against the live database on 2026-09-20 that collection held 0 documents
 * while `usersettings` held 8 with real plans, so Reports told every user "No
 * active nutrition goals recorded" and every AI insight reasoned without their
 * targets — both silently, both indistinguishable from working.
 *
 * These tests assert the projection is FAITHFUL to `derivedMacros`' own
 * arithmetic. A bridge that produced slightly different numbers would have
 * Reports grading the user against a target the Daily Ticket never showed
 * them, which is worse than the bug it replaces.
 */
import { jest } from '@jest/globals';
import {
  deriveGoalFromSettings,
  resolveActiveNutritionGoal,
} from '../graphql/fitnessgeek/nutritionGoalBridge.js';

// A plan of the shape AIGoalPlanner actually saves.
const PLAN = {
  enabled: true,
  daily_calorie_target: 2058,
  goal_weight_lbs: 190,
  protein_g_per_lb_goal: 0.8,
  fat_g_per_lb_goal: 0.35,
};

describe('deriveGoalFromSettings', () => {
  test('projects a saved plan into the shape the readers expect', () => {
    const goal = deriveGoalFromSettings(PLAN);
    // protein 0.8 * 190 = 152 g -> 608 kcal; fat 0.35 * 190 = 66.5 -> 67 g
    // -> 603 kcal; carbs = (2058 - 1211) / 4 = 211.75 -> 212 g.
    expect(goal).toMatchObject({
      calories: 2058,
      protein_grams: 152,
      fat_grams: 67,
      carbs_grams: 212,
      source: 'settings_plan',
    });
  });

  test('matches derivedMacros: protein and fat come from grams-per-lb of GOAL weight', () => {
    // Recomputed here independently — if this drifts from the resolver's own
    // formula, Reports and the Daily Ticket would show different targets.
    const proteinG = Math.round(0.8 * 190);
    const fatG = Math.round(0.35 * 190);
    const carbsG = Math.max(0, Math.round((2058 - (proteinG * 4 + fatG * 9)) / 4));
    const goal = deriveGoalFromSettings(PLAN);
    expect(goal.protein_grams).toBe(proteinG);
    expect(goal.fat_grams).toBe(fatG);
    expect(goal.carbs_grams).toBe(carbsG);
  });

  test('a weekly schedule is graded against its MEAN, not the server\'s idea of today', () => {
    // Deliberately avoids the `now.getDay()` weekday index, which is a UTC
    // weekday on a UTC container and flips at 7pm Central.
    const goal = deriveGoalFromSettings({
      ...PLAN,
      daily_calorie_target: 2000,
      weekly_schedule: [1800, 1800, 1800, 1800, 1800, 2600, 2600],
    });
    expect(goal.calories).toBe(Math.round((1800 * 5 + 2600 * 2) / 7)); // 2029
  });

  test('returns null for a disabled or empty plan rather than inventing one', () => {
    // "No goal" must stay reportable as no goal; that message is only wrong
    // when a goal actually exists.
    expect(deriveGoalFromSettings(null)).toBeNull();
    expect(deriveGoalFromSettings(undefined)).toBeNull();
    expect(deriveGoalFromSettings({})).toBeNull();
    expect(deriveGoalFromSettings({ ...PLAN, enabled: false })).toBeNull();
    expect(deriveGoalFromSettings({ enabled: true, daily_calorie_target: 0 })).toBeNull();
  });

  test('omits macro goals when there is no goal weight — absent, not zero', () => {
    // `goalCompliance` skips a falsy goal value. A literal 0 would instead be
    // graded, marking every single day non-compliant against a 0 g target.
    const goal = deriveGoalFromSettings({ enabled: true, daily_calorie_target: 2000 });
    expect(goal.calories).toBe(2000);
    expect(goal.protein_grams).toBeUndefined();
    expect(goal.fat_grams).toBeUndefined();
    expect(goal.carbs_grams).toBeUndefined();
  });

  test('never produces a negative carb goal from an over-specified plan', () => {
    // protein+fat alone exceed the calorie target; a negative goal would fail
    // every day forever.
    const goal = deriveGoalFromSettings({
      enabled: true,
      daily_calorie_target: 1200,
      goal_weight_lbs: 300,
      protein_g_per_lb_goal: 1.2,
      fat_g_per_lb_goal: 0.6,
    });
    expect(goal.carbs_grams).toBe(0);
  });

  test('falls back to auto_base_calories / fixed_calories like derivedMacros does', () => {
    expect(deriveGoalFromSettings({ enabled: true, auto_base_calories: 1900 }).calories).toBe(1900);
    expect(deriveGoalFromSettings({ enabled: true, fixed_calories: 1750 }).calories).toBe(1750);
  });
});

describe('resolveActiveNutritionGoal', () => {
  const UserSettings = { getOrCreate: jest.fn() };
  const NutritionGoals = { getActiveGoals: jest.fn() };

  beforeEach(() => {
    UserSettings.getOrCreate.mockReset();
    NutritionGoals.getActiveGoals.mockReset();
  });

  test('an explicit nutritiongoals row still wins — the bridge does not override it', () => {
    const explicit = { calories: 1800, protein_grams: 140 };
    NutritionGoals.getActiveGoals.mockResolvedValue(explicit);
    return expect(
      resolveActiveNutritionGoal('u1', { NutritionGoals, UserSettings })
    ).resolves.toBe(explicit);
  });

  test('falls back to the settings plan when that collection is empty — the live case', async () => {
    NutritionGoals.getActiveGoals.mockResolvedValue(null);
    UserSettings.getOrCreate.mockResolvedValue({ nutrition_goal: PLAN });
    const goal = await resolveActiveNutritionGoal('u1', { NutritionGoals, UserSettings });
    expect(goal).toMatchObject({ calories: 2058, source: 'settings_plan' });
  });

  test('returns null when neither store has anything', async () => {
    NutritionGoals.getActiveGoals.mockResolvedValue(null);
    UserSettings.getOrCreate.mockResolvedValue({});
    await expect(
      resolveActiveNutritionGoal('u1', { NutritionGoals, UserSettings })
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lean mass and keto (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md D3/D4) — the bridge
// now runs on @geeksuite/utils' macroRules + macrosForCalories, the same
// functions derivedMacros uses.
// ---------------------------------------------------------------------------

describe('deriveGoalFromSettings — lean mass', () => {
  test('a recent scan sets protein at 1.0 g per lb of lean mass; fat stays per lb of goal weight', () => {
    const goal = deriveGoalFromSettings(PLAN, { leanMassLb: 178 });
    // protein 178 g -> 712 kcal; fat 67 g -> 603 kcal; carbs (2058 - 1315) / 4 = 185.75 -> 186
    expect(goal).toMatchObject({ calories: 2058, protein_grams: 178, fat_grams: 67, carbs_grams: 186 });
  });

  test('protein_g_per_lb_lean is honoured', () => {
    const goal = deriveGoalFromSettings({ ...PLAN, protein_g_per_lb_lean: 1.2 }, { leanMassLb: 150 });
    expect(goal.protein_grams).toBe(180);
  });

  test('no scan: exactly the goal-weight numbers', () => {
    expect(deriveGoalFromSettings(PLAN, { leanMassLb: null })).toEqual(deriveGoalFromSettings(PLAN));
    expect(deriveGoalFromSettings(PLAN).protein_grams).toBe(152);
  });

  test('lean mass without a goal weight: protein has a basis, fat and carbs do not', () => {
    const goal = deriveGoalFromSettings({ enabled: true, daily_calorie_target: 2000 }, { leanMassLb: 178 });
    expect(goal.protein_grams).toBe(178);
    expect(goal.fat_grams).toBeUndefined();
    expect(goal.carbs_grams).toBeUndefined();
  });
});

describe('deriveGoalFromSettings — keto', () => {
  const KETO = { enabled: true, mode: 'keto', daily_calorie_target: 2000, goal_weight_lbs: 190 };

  test('no scan: the saved split — carbs are the split\'s 5 %, not the calorie remainder', () => {
    // classic 70/25/5 of 2000 kcal: fat 1400/9 = 156, protein 500/4 = 125, carbs 100/4 = 25
    expect(deriveGoalFromSettings(KETO)).toMatchObject({ protein_grams: 125, fat_grams: 156, carbs_grams: 25 });
  });

  test('with lean mass: protein from lean mass, carbs from the split, fat the remainder', () => {
    // protein 178 (712 kcal), carbs 25 (100 kcal), fat (2000 - 812) / 9 = 132
    expect(deriveGoalFromSettings(KETO, { leanMassLb: 178 })).toMatchObject({
      protein_grams: 178, carbs_grams: 25, fat_grams: 132,
    });
  });

  test('lazy keto with nothing to anchor protein: only the carb cap is a goal', () => {
    const goal = deriveGoalFromSettings({
      enabled: true, mode: 'keto', daily_calorie_target: 2000,
      keto: { macro_split: { preset: 'lazy' }, net_carb_limit_g: 30 },
    });
    expect(goal.carbs_grams).toBe(30);
    expect(goal.protein_grams).toBeUndefined();
    expect(goal.fat_grams).toBeUndefined();
  });
});

describe('resolveActiveNutritionGoal — deps.leanMassFor', () => {
  const UserSettings = { getOrCreate: jest.fn() };
  const NutritionGoals = { getActiveGoals: jest.fn() };

  beforeEach(() => {
    UserSettings.getOrCreate.mockReset();
    NutritionGoals.getActiveGoals.mockReset();
  });

  test('uses the lean mass it is handed', async () => {
    NutritionGoals.getActiveGoals.mockResolvedValue(null);
    UserSettings.getOrCreate.mockResolvedValue({ nutrition_goal: PLAN });
    const leanMassFor = jest.fn().mockResolvedValue({ lean_mass_lb: 178, scans: 3 });
    const goal = await resolveActiveNutritionGoal('u1', { NutritionGoals, UserSettings, leanMassFor });
    expect(leanMassFor).toHaveBeenCalledWith('u1');
    expect(goal.protein_grams).toBe(178);
  });

  test('a null lean mass falls back to the goal-weight rule', async () => {
    NutritionGoals.getActiveGoals.mockResolvedValue(null);
    UserSettings.getOrCreate.mockResolvedValue({ nutrition_goal: PLAN });
    const goal = await resolveActiveNutritionGoal('u1', {
      NutritionGoals, UserSettings, leanMassFor: async () => null,
    });
    expect(goal.protein_grams).toBe(152);
  });

  test('an explicit row still wins, without reading scans at all', async () => {
    const explicit = { calories: 1800, protein_grams: 140 };
    NutritionGoals.getActiveGoals.mockResolvedValue(explicit);
    const leanMassFor = jest.fn();
    await expect(
      resolveActiveNutritionGoal('u1', { NutritionGoals, UserSettings, leanMassFor })
    ).resolves.toBe(explicit);
    expect(leanMassFor).not.toHaveBeenCalled();
  });
});
