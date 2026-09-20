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
