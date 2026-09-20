/**
 * nutritionGoalBridge.js — the missing connection between where goals are
 * WRITTEN and where they are READ.
 *
 * THE BUG THIS EXISTS TO CLOSE
 * ----------------------------
 * FitnessGeek has two goal stores, and until 2026-09-20 nothing joined them:
 *
 *   WRITTEN: `UserSettings.nutrition_goal` — the only thing the live UI ever
 *     saves to. `AIGoalPlanner` calls `settingsService.updateSettings({
 *     nutrition_goal })` and that is the sole path.
 *
 *   READ: the `nutritiongoals` collection, via `NutritionGoals.getActiveGoals`
 *     — queried by `activeNutritionGoals`, `nutritionGoalsHistory`, the
 *     report's `goalCompliance`, and `buildUserContext`, which feeds every AI
 *     insight.
 *
 * The only writer of that collection is the `setNutritionGoals` mutation, and
 * nothing in any frontend calls it. Checked against the live `fitnessgeek`
 * database on 2026-09-20: `nutritiongoals` held **0 documents** and
 * `weightgoals` held **0**, while `usersettings` held 8 documents, 6 of them
 * carrying a `nutrition_goal` and one an enabled plan with a real calorie
 * target and a seven-day schedule.
 *
 * So Reports rendered "No active nutrition goals recorded" — flatly false, for
 * every user, forever — and every AI coaching feature reasoned about someone
 * whose targets it could not see, while appearing to work perfectly.
 *
 * WHY A BRIDGE AND NOT A MERGE
 * ----------------------------
 * `NutritionGoals`'s own header says: "This is NOT `UserSettings.nutrition_goal`
 * ... Do not unify them." That separation is deliberate and this module
 * respects it. The two describe different things:
 *
 *   - `nutritiongoals` is an explicit per-macro target in GRAMS, with history
 *     (`is_active`, `start_date`, `end_date`).
 *   - `nutrition_goal` is a PLAN: a calorie target plus the per-pound rules
 *     from which macros are derived.
 *
 * So the readers get an adapter, not a schema change: an explicit
 * `nutritiongoals` row still wins when one exists (it is the more specific,
 * deliberately-entered record), and the settings plan is projected into the
 * same shape when it does not. No data is copied between collections, and
 * nothing has to be migrated.
 *
 * THE MACRO DERIVATION IS THE ONE THE APP ALREADY USES
 * ---------------------------------------------------
 * `deriveGoalFromSettings` reproduces `derivedMacros`' arithmetic exactly —
 * protein and fat from grams-per-pound of goal weight, carbohydrate as the
 * remaining calories divided by 4. Writing a second, subtly different
 * derivation here would mean Reports grading the user against a target the
 * Daily Ticket never showed them, which is a worse failure than the one being
 * fixed.
 *
 * Deliberately NOT derived: `fiber_grams`, `sugar_grams`, `sodium_mg`. Nothing
 * in the plan implies them, and `goalCompliance` skips any goal whose value is
 * falsy, so leaving them absent means "no fiber goal" rather than "your fiber
 * goal is 0" — which would grade every day as a failure.
 */

/**
 * Project a stored `UserSettings.nutrition_goal` plan into the shape the
 * `NutritionGoals` readers expect.
 *
 * Pure: no database, no clock. The weekday-specific target is deliberately not
 * used — compliance is graded against the plan's base daily target, so this
 * cannot inherit the "server decides what day it is" problem that
 * `derivedMacros`' own `today` index has.
 *
 * @param {Object|null|undefined} ng a stored `nutrition_goal` sub-document
 * @returns {Object|null} `{ calories, protein_grams, carbs_grams, fat_grams,
 *   source }`, or `null` when the plan is disabled or has no calorie target —
 *   in which case the caller must keep reporting "no goals" rather than invent
 *   one.
 */
export function deriveGoalFromSettings(ng) {
  if (!ng || ng.enabled === false) return null;

  // Same precedence chain as `derivedMacros`, so the two cannot disagree.
  const dailyCal = ng.daily_calorie_target || ng.auto_base_calories || ng.fixed_calories || null;

  // A weekly schedule means the daily target varies by day; compliance is a
  // range statistic, so it is graded against the week's mean rather than
  // whichever day the server thinks it is.
  const schedule = Array.isArray(ng.weekly_schedule) && ng.weekly_schedule.length === 7
    ? ng.weekly_schedule.filter((n) => Number.isFinite(Number(n)) && Number(n) > 0)
    : [];
  const calories = schedule.length
    ? Math.round(schedule.reduce((a, b) => a + Number(b), 0) / schedule.length)
    : (Number.isFinite(Number(dailyCal)) && Number(dailyCal) > 0 ? Math.round(Number(dailyCal)) : null);

  if (!calories) return null;

  const goalWeightLbs = ng.goal_weight_lbs ?? ng.target_weight ?? ng.targetWeight;
  const proteinPerLb = ng.protein_g_per_lb_goal ?? ng.protein_g_per_lb ?? 0.8;
  const fatPerLb = ng.fat_g_per_lb_goal ?? ng.fat_g_per_lb ?? 0.35;

  const weight = Number(goalWeightLbs);
  const hasWeight = Number.isFinite(weight) && weight > 0;
  const proteinG = hasWeight ? Math.round(proteinPerLb * weight) : 0;
  const fatG = hasWeight ? Math.round(fatPerLb * weight) : 0;

  // Carbohydrate is whatever calories are left once protein and fat are paid
  // for. Clamped at zero: a plan whose protein and fat exceed its calorie
  // target is over-specified, and a negative carb goal would grade every
  // single day as non-compliant.
  const carbsG = Math.max(0, Math.round((calories - (proteinG * 4 + fatG * 9)) / 4));

  return {
    calories,
    // Without a goal weight there is no basis for a macro split, and a `0`
    // gram goal is skipped by `goalCompliance` rather than graded — which is
    // the honest outcome, not a silent zero.
    protein_grams: proteinG || undefined,
    fat_grams: fatG || undefined,
    carbs_grams: hasWeight ? carbsG : undefined,
    source: 'settings_plan',
  };
}

/**
 * The active nutrition goal for a user, from whichever store actually has one.
 *
 * @param {string} userId
 * @param {Object} deps
 * @param {Object} deps.NutritionGoals model with `getActiveGoals`
 * @param {Object} deps.UserSettings   model with `getOrCreate`
 * @returns {Promise<Object|null>} a `NutritionGoals`-shaped goal, or null
 */
export async function resolveActiveNutritionGoal(userId, { NutritionGoals, UserSettings }) {
  // An explicitly-entered per-macro goal wins: it is the more specific record,
  // and honouring it keeps `setNutritionGoals` meaningful rather than making
  // this bridge silently override it.
  const explicit = await NutritionGoals.getActiveGoals(userId);
  if (explicit) return explicit;

  const settings = await UserSettings.getOrCreate(userId);
  return deriveGoalFromSettings(settings?.nutrition_goal);
}
