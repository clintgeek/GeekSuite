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
 * `deriveGoalFromSettings` is built on `macroRules` + `macrosForCalories`
 * from `@geeksuite/utils` — the same functions `derivedMacros` and REST
 * `GET /goals/nutrition/macros` call (plan D5). It used to be a third copy of
 * that arithmetic with a comment pleading that the copies stay identical;
 * now they cannot differ. Reports grading the user against a target the
 * Daily Ticket never showed them would be a worse failure than the one this
 * module fixed.
 *
 * With a recent body scan (`deps.leanMassFor`), protein is per lb of measured
 * lean mass (plan D3); keto plans get keto macros (plan D4). Without either,
 * the numbers are exactly what they were.
 *
 * Deliberately NOT derived: `fiber_grams`, `sugar_grams`, `sodium_mg`. Nothing
 * in the plan implies them, and `goalCompliance` skips any goal whose value is
 * falsy, so leaving them absent means "no fiber goal" rather than "your fiber
 * goal is 0" — which would grade every day as a failure.
 */

import { macroRules, macrosForCalories } from '@geeksuite/utils';

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
 * @param {Object} [opts]
 * @param {number|null} [opts.leanMassLb] averaged recent lean mass
 *   (`leanMassForTargets`), or null/absent when no usable scan exists
 * @returns {Object|null} `{ calories, protein_grams, carbs_grams, fat_grams,
 *   source }`, or `null` when the plan is disabled or has no calorie target —
 *   in which case the caller must keep reporting "no goals" rather than invent
 *   one.
 */
export function deriveGoalFromSettings(ng, { leanMassLb = null } = {}) {
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

  const rules = macroRules(ng, { leanMassLb });
  const { protein_g: proteinG, fat_g: fatG, carbs_g: carbsG } = macrosForCalories(calories, rules);

  // WHICH GOALS HAVE A BASIS. A macro with nothing to derive it from is left
  // ABSENT, never 0: `goalCompliance` skips a falsy goal value, whereas a
  // literal 0 g goal would be graded and fail every day.
  const goalWeight = Number(rules.goal_weight_lbs);
  const hasGoalWeight = Number.isFinite(goalWeight) && goalWeight > 0;
  const hasLean = rules.lean_mass_lb !== null;
  const ketoSplit = rules.keto && !!rules.keto_split;
  // Protein is anchored by lean mass, by goal weight, or (keto, no scan) by
  // the saved split.
  const proteinBasis = hasLean || hasGoalWeight || ketoSplit;

  let protein;
  let fat;
  let carbs;
  if (rules.keto) {
    // Keto carbs are the split's share or the lazy-keto cap — always known.
    // Fat is the split's share, or the remainder once protein is paid for,
    // which is only meaningful when protein itself has a basis.
    carbs = carbsG;
    protein = proteinBasis ? proteinG : undefined;
    fat = proteinBasis ? fatG : undefined;
  } else {
    // Standard: fat is per lb of goal weight and carbs the remainder, so
    // without a goal weight neither has a basis — only a scan-based protein.
    protein = proteinBasis ? proteinG : undefined;
    fat = hasGoalWeight ? fatG : undefined;
    // Clamped at zero by macrosForCalories: a plan whose protein and fat
    // exceed its calories is over-specified, and a negative carb goal would
    // grade every day as non-compliant. 0 is kept here (unlike protein/fat)
    // because it is a real, computed answer, not an absent basis.
    carbs = proteinBasis && hasGoalWeight ? carbsG : undefined;
  }

  return {
    calories,
    protein_grams: protein || undefined,
    fat_grams: fat || undefined,
    carbs_grams: carbs,
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
 * @param {Function} [deps.leanMassFor] `async (userId) => ({ lean_mass_lb }) | null`
 *   — the lean mass a target may use (bodyCompPoints.js `leanMassFor`). When
 *   absent, or when it answers null, protein uses the goal-weight rule.
 * @returns {Promise<Object|null>} a `NutritionGoals`-shaped goal, or null
 */
export async function resolveActiveNutritionGoal(userId, { NutritionGoals, UserSettings, leanMassFor = null }) {
  // An explicitly-entered per-macro goal wins: it is the more specific record,
  // and honouring it keeps `setNutritionGoals` meaningful rather than making
  // this bridge silently override it.
  const explicit = await NutritionGoals.getActiveGoals(userId);
  if (explicit) return explicit;

  const [settings, lean] = await Promise.all([
    UserSettings.getOrCreate(userId),
    leanMassFor ? leanMassFor(userId) : null,
  ]);
  return deriveGoalFromSettings(settings?.nutrition_goal, { leanMassLb: lean?.lean_mass_lb ?? null });
}
