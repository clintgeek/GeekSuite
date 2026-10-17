/**
 * calorieCalc — the Calorie Wizard's plan arithmetic, lifted out of
 * AIGoalPlanner (2026-10-17) so Simple's one-screen quick target (IA-1, L8)
 * and the full wizard work a target out with the SAME code and save the same
 * `nutrition_goal`. Nothing here is new maths: the BMR, TDEE, floor and rate
 * all come from `@geeksuite/utils` and planMath.js, exactly as the wizard
 * used them.
 */
import {
  mifflinStJeorBMR,
  resolveBmr,
  tdeeFromBMR,
  BMR_CALC_VERSION,
  localDateString,
} from '@geeksuite/utils';
import {
  minSafeCalories, computeWeeklySchedule, planTarget, weekenderSuggestion, MEASURED_ACTIVITY, tdeeFor,
} from './planMath.js';

/**
 * Accepts the handful of height notations a person would actually type.
 * Anything that doesn't match one of these returns null — it does NOT fall
 * back to a guess. That null is load-bearing: it's what lets calculateBMR
 * tell "couldn't parse this" apart from "field is empty", which is the
 * difference between a visible error and a silent 1200-calorie floor
 * reported as "Safe".
 */
export function parseHeightToInches(height) {
  if (height === null || height === undefined || height === '') return null;
  const trimmed = String(height).trim();

  // 5'11" — the closing inch mark is REQUIRED here, on purpose. The old
  // placeholder read "5'11" (no closing quote) while the old regex
  // demanded one; typing exactly what the placeholder showed produced an
  // unparseable height that silently became a BMR of 0. The fix is a
  // correct placeholder plus a visible error for anything that still
  // doesn't match — not loosening this pattern to swallow the very typo
  // that caused the bug. (The other two formats below have no such
  // landmine, so those get the leniency instead.)
  const feetInches = trimmed.match(/^(\d+)\s*'\s*(\d{1,2})"$/);
  if (feetInches) {
    return parseInt(feetInches[1], 10) * 12 + parseInt(feetInches[2], 10);
  }

  // 5 ft 11, 5ft 11in, 5 feet 11 inches
  const feetWord = trimmed.match(/^(\d+)\s*(?:ft|feet)\.?\s*(\d{1,2})?\s*(?:in|inches)?\.?$/i);
  if (feetWord) {
    const feet = parseInt(feetWord[1], 10);
    const inches = feetWord[2] ? parseInt(feetWord[2], 10) : 0;
    return feet * 12 + inches;
  }

  // A bare number, optionally tagged in/inches/" — treated as total inches.
  // Range-checked against plausible adult height so a typo like "6" (feet,
  // not inches) or "511" doesn't get silently accepted as something valid.
  const bareInches = trimmed.match(/^(\d{2,3})\s*(?:in|inches|")?$/i);
  if (bareInches) {
    const inches = parseInt(bareInches[1], 10);
    if (inches >= 36 && inches <= 96) return inches;
  }

  return null;
}

/**
 * Mifflin-St Jeor from the profile, in the units its parameter names say.
 *   0    — a required field is simply empty (normal, mid-entry state)
 *   null — every field is filled in, but the height can't be read
 *   N    — a real BMR
 */
export function calculateBMR({ age, weight, height, gender }) {
  if (!age || !weight || !height || !gender) return 0;
  const heightInches = parseHeightToInches(height);
  if (heightInches === null) return null;
  return mifflinStJeorBMR({ weightLb: weight, heightIn: heightInches, age, gender });
}

/**
 * The whole plan, from the profile and the goal. Returns `{ heightError: true }`
 * when the height can't be read — never a plan built on a BMR of 0.
 *
 * `goal.targetWeight` may be empty (the quick target doesn't ask for one):
 * the plan then has no distance or timeline, and the save leaves the stored
 * target weight alone.
 *
 * @param {{
 *   profile: {age, weight, height, gender, activityLevel},
 *   goal: {targetWeight, weightChangeRate, planType},
 *   usableLeanMassLb?: number|null,
 *   scanBmr?: object|null,
 *   measuredActivity?: {mean:number, days:number}|null,
 * }} args
 */
export function buildCaloriePlan({ profile, goal, usableLeanMassLb = null, scanBmr = null, measuredActivity = null }) {
  let bmr = calculateBMR(profile);
  if (bmr === null) return { heightError: true };

  // Plan D1: measured lean mass beats an estimate from weight, height, age
  // and sex. `resolveBmr` picks Katch-McArdle when handed a usable lean mass
  // and says so; otherwise the Mifflin figure computed above stands.
  const resolved = resolveBmr({
    leanMassLb: usableLeanMassLb,
    mifflin: bmr > 0 ? { weightLb: profile.weight, heightIn: parseHeightToInches(profile.height), age: profile.age, gender: profile.gender } : null,
  });
  const bmrSource = resolved.source;
  if (bmrSource === 'scan') bmr = resolved.bmr;

  const tdee = tdeeFor({ bmr, activityLevel: profile.activityLevel, measured: measuredActivity, tdeeFromBMR });
  const hasTarget = goal.targetWeight !== '' && goal.targetWeight !== null && goal.targetWeight !== undefined
    && Number.isFinite(parseFloat(goal.targetWeight));
  const weightToLose = hasTarget ? parseFloat(profile.weight) - parseFloat(goal.targetWeight) : 0;
  const minSafe = minSafeCalories(bmr);
  // When the requested rate would put the target under the safety floor,
  // the target is clamped UP to it — and then the plan can't deliver the
  // requested rate. The timeline, the saved rate and the tracker's pace all
  // use the rate it DOES deliver (planMath.js; Chef, 2026-09-23).
  const { dailyCalories, floored, requestedRate, effectiveRate } = planTarget({
    tdee, requestedRate: goal.weightChangeRate, minSafe,
  });
  const weeklyDeficit = Math.round(tdee - dailyCalories);
  const timeline = effectiveRate > 0 ? Math.ceil(Math.abs(weightToLose) / effectiveRate) : 0;

  return {
    currentWeight: parseFloat(profile.weight),
    targetWeight: hasTarget ? parseFloat(goal.targetWeight) : null,
    weightToLose: Math.abs(weightToLose),
    bmr,
    bmrSource,
    leanMassLb: bmrSource === 'scan' ? resolved.lean_mass_lb : null,
    bmrScans: bmrSource === 'scan' ? (scanBmr?.scans ?? null) : null,
    tdee,
    // Carried so the SAVE can persist what this BMR was computed from.
    // A plan that stores only its outputs cannot be re-derived, audited,
    // or repaired — which is exactly the position every plan saved before
    // 2026-09-20 is in.
    calcInputs: {
      weight_lb: parseFloat(profile.weight),
      height_in: parseHeightToInches(profile.height),
      age: parseFloat(profile.age),
      gender: profile.gender,
      activity_level: profile.activityLevel,
      // The measured activity this TDEE was built on, when it was.
      ...(profile.activityLevel === MEASURED_ACTIVITY && measuredActivity ? { active_kcal: measuredActivity.mean } : {}),
    },
    dailyCalories,
    weeklyDeficit,
    timeline,
    activityLevel: profile.activityLevel,
    weightChangeRate: effectiveRate,
    requestedRate,
    floored,
    planType: goal.planType,
    schedule: computeWeeklySchedule(goal.planType, dailyCalories, minSafe),
    weekenderSuggestion: goal.planType === 'weekender'
      ? weekenderSuggestion({ tdee, minSafe, currentRate: effectiveRate })
      : null,
    rules: {
      minSafeCalories: minSafe,
      capPercent: 20,
      autoAdjust: goal.planType === 'auto',
      // A real Mifflin-St Jeor BMR for an adult is always comfortably
      // above zero. The Safety Check card reads this — not just
      // dailyCalories >= 1200 — so a floored, never-actually-computed
      // plan can't be reported "Safe" just because the floor happens to
      // sit at the minimum.
      calculationValid: bmr > 0,
    },
  };
}

/**
 * The `nutrition_goal` write for a plan. The settings mutation MERGES into
 * nutrition_goal, so a plan without a target weight leaves the stored one
 * (and its timeline) alone rather than writing NaN over it.
 */
export function nutritionGoalPayload(plan, { mode = 'standard', keto, startDate = new Date() } = {}) {
  const hasTarget = Number.isFinite(plan.targetWeight);
  const estimatedEnd = new Date(startDate);
  estimatedEnd.setDate(startDate.getDate() + (plan.timeline * 7));
  return {
    enabled: true,
    // The LOCAL calendar day: toISOString() is UTC, so an evening
    // plan in Central stored tomorrow as its start.
    start_date: localDateString(startDate),
    start_weight: plan.currentWeight,
    ...(hasTarget ? {
      target_weight: plan.targetWeight,
      // The macro rules read goal_weight_lbs BEFORE target_weight
      // (@geeksuite/utils macros.js) and the settings write merges, so a
      // stale goal_weight_lbs would outlive every new target. Write both.
      goal_weight_lbs: plan.targetWeight,
    } : {}),
    activity_level: plan.activityLevel,
    weight_change_rate: plan.weightChangeRate,
    plan_type: plan.planType,
    daily_calorie_target: plan.dailyCalories,
    weekly_schedule: plan.schedule.map((d) => d.calories),
    min_safe_calories: plan.rules.minSafeCalories,
    bmr: plan.bmr,
    tdee: plan.tdee,
    bmr_calc_version: BMR_CALC_VERSION,
    bmr_source: plan.bmrSource,
    lean_mass_lb: plan.leanMassLb,
    calc_inputs: plan.calcInputs,
    ...(hasTarget ? {
      timeline_weeks: plan.timeline,
      estimated_end_date: localDateString(estimatedEnd),
    } : {}),
    mode,
    keto,
  };
}
