/**
 * energy.js — basal metabolic rate and total daily energy expenditure.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Mifflin-St Jeor is defined for KILOGRAMS and CENTIMETRES:
 *
 *     BMR = 10·kg + 6.25·cm − 5·age + (male ? +5 : −161)
 *
 * FitnessGeek stores and displays weight in pounds and height in inches, and
 * until 2026-09-20 both copies of this formula — one in the frontend's
 * `AIGoalPlanner`, one in the backend's `fitnessGoalService` — fed it pounds
 * and inches directly, with no conversion. Nothing cancelled out: the mass
 * term is 2.2× too large and the height term is 2.54× too small, and mass
 * dominates, so every result was high and got worse the heavier the person.
 *
 *     M, 40y, 200 lb, 5'10"   ->  2243 reported,  1823 true   (+23%)
 *     M, 45y, 320 lb, 5'11"   ->  3424 reported,  2359 true   (+45%)
 *     F, 30y, 140 lb, 5'4"    ->  1489 reported,  1340 true   (+11%)
 *
 * That number is not advisory. It is written to
 * `UserSettings.nutrition_goal.daily_calorie_target` and is the figure the
 * whole app holds the user to, so a 200 lb man asking for 1 lb/week was handed
 * roughly his maintenance intake, would have logged perfectly, lost nothing,
 * and been shown as 100% compliant throughout. The `min_safe_calories` floor
 * was computed from the same inflated BMR, so it backstopped nothing either.
 *
 * TWO RULES THIS MODULE ENFORCES
 * ------------------------------
 * 1. THE UNIT IS IN THE PARAMETER NAME. `weightLb`, `heightIn` — not `weight`,
 *    not `height`. A bare `weight` is exactly what let a pound be passed to a
 *    parameter meaning a kilogram for as long as this bug lived. Callers
 *    holding metric values convert at the call site, visibly.
 * 2. ONE IMPLEMENTATION, IMPORTED TWICE. The formula was duplicated across the
 *    frontend and the backend, so the bug had to be found and fixed twice and
 *    could drift again. `@geeksuite/utils` is the only package both the
 *    fitnessgeek frontend and its backend already depend on, which is why this
 *    lives here rather than in `@geeksuite/schemas` (mongoose-oriented, CJS,
 *    and deliberately not a frontend dependency).
 *
 * Everything here is pure: no clock, no I/O, no rounding decisions beyond the
 * documented ones, so it can be asserted directly.
 */

/** Exact, by definition (international pound). */
export const KG_PER_LB = 0.45359237;
/** Exact, by definition (international inch). */
export const CM_PER_IN = 2.54;

/**
 * The version stamped onto a saved plan by `BMR_CALC_VERSION`.
 *
 * Version 1 is "computed before 2026-09-20", i.e. with the pounds-and-inches
 * bug above. A stored plan carries no record of the height, weight and age it
 * was built from — the planner persisted only its OUTPUTS — so a v1 plan
 * cannot be recomputed after the fact. It can only be identified and
 * re-entered by the user, which is what `isPlanCalculationStale` is for.
 *
 * Version 2 is the corrected formula, and plans written at v2 also persist
 * their inputs so this is the last time a plan is unrecomputable.
 */
export const BMR_CALC_VERSION = 2;

const finitePositive = (n) => Number.isFinite(n) && n > 0;

export const lbToKg = (lb) => lb * KG_PER_LB;
export const inToCm = (inches) => inches * CM_PER_IN;

/**
 * Mifflin-St Jeor BMR, in kcal/day, from US customary units.
 *
 * @param {Object} p
 * @param {number} p.weightLb  body mass in POUNDS
 * @param {number} p.heightIn  height in INCHES
 * @param {number} p.age       years
 * @param {string} p.gender    'male' applies +5; anything else applies −161,
 *   which matches the equation's two published constants and the app's
 *   existing two-way control. Callers that cannot offer a value should not
 *   call this at all rather than guess.
 * @returns {number|null} rounded kcal/day, or `null` when any input is
 *   missing, non-numeric or non-positive. Null means "not calculable" and is
 *   deliberately NOT 0 — a zero BMR is indistinguishable from an empty form
 *   and reads as a plausible-looking "safe" plan, which is the second bug this
 *   file's callers had.
 */
export function mifflinStJeorBMR({ weightLb, heightIn, age, gender }) {
  const lb = Number(weightLb);
  const inches = Number(heightIn);
  const years = Number(age);
  if (!finitePositive(lb) || !finitePositive(inches) || !finitePositive(years)) return null;

  const bmr =
    10 * lbToKg(lb) +
    6.25 * inToCm(inches) -
    5 * years +
    (gender === 'male' ? 5 : -161);

  // A non-positive result is not a metabolic rate; it means the inputs were
  // nonsense (an age of 400, say) even though each one was individually
  // finite and positive.
  return bmr > 0 ? Math.round(bmr) : null;
}

/**
 * Activity multipliers applied to BMR to reach TDEE.
 *
 * THE KEYS ARE THE APP'S, NOT A TIDIER SET. `very` and `extra` read like
 * abbreviations begging to be renamed `very_active`/`extra_active`, and they
 * are not: they are the exact `value=` strings on the activity-level
 * `MenuItem`s in `AIGoalPlanner` and the exact keys of the backend's own
 * table in `fitnessGoalService`. Renaming them here without changing both
 * call sites would send every "Very Active" and "Extra Active" user through
 * the unknown-key fallback below and quietly cut their TDEE to sedentary.
 */
export const ACTIVITY_MULTIPLIERS = Object.freeze({
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
});

/**
 * Total daily energy expenditure.
 *
 * @param {number|null} bmr kcal/day, as returned by `mifflinStJeorBMR`
 * @param {string} activityLevel a key of `ACTIVITY_MULTIPLIERS`; an unknown
 *   key falls back to `sedentary`, the most conservative factor — erring
 *   toward a SMALLER expenditure, so an unrecognised value cannot inflate
 *   someone's allowance the way the unit bug did.
 * @returns {number|null} rounded kcal/day, or `null` if `bmr` is null.
 */
export function tdeeFromBMR(bmr, activityLevel) {
  if (!finitePositive(Number(bmr))) return null;
  const factor = ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS.sedentary;
  return Math.round(Number(bmr) * factor);
}

/**
 * Has this saved plan been calculated with a formula we now know was wrong?
 *
 * A plan written before 2026-09-20 carries no `bmr_calc_version` (and no
 * inputs), so it is stale by absence. There is no way to silently repair it —
 * the inputs are gone — so the only honest handling is to tell the user the
 * plan needs recalculating rather than leave them eating to a number that is
 * up to 45% too high.
 *
 * @param {Object|null|undefined} nutritionGoal the stored `nutrition_goal`
 * @returns {boolean} true when the plan exists and predates the fix
 */
export function isPlanCalculationStale(nutritionGoal) {
  if (!nutritionGoal) return false;
  // Nothing calculated yet is not a stale calculation.
  if (!finitePositive(Number(nutritionGoal.bmr))) return false;
  return Number(nutritionGoal.bmr_calc_version || 1) < BMR_CALC_VERSION;
}
