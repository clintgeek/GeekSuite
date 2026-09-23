/**
 * macros.js — the macro targets: protein, fat and carbohydrate grams for a
 * day's calories. ONE implementation (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md D5).
 *
 * This arithmetic used to be copy-pasted three times — basegeek's
 * `derivedMacros` resolver, its `nutritionGoalBridge.deriveGoalFromSettings`,
 * and fitnessgeek's REST `GET /goals/nutrition/macros` — with a comment in the
 * bridge pleading that they stay identical. Two changes arrived at once that
 * would each have had to be made three times:
 *
 * 1. PROTEIN FROM LEAN MASS (plan D3). With a recent body scan, protein is
 *    `protein_g_per_lb_lean` (default 1.0) × measured lean mass — the tissue
 *    protein exists to preserve. Without one, the long-standing rule:
 *    `protein_g_per_lb_goal` (0.8) × goal weight.
 * 2. KETO MODE (plan D4). All three copies ignored `mode: 'keto'` and handed a
 *    keto user a carb target of hundreds of grams. Now: carbs come from the
 *    keto split (or the net-carb cap, for 'lazy'); protein as above when lean
 *    mass is known, else the split's protein %; fat is the remainder, or the
 *    split's fat % when nothing anchors protein.
 *
 * Standard mode keeps its rules exactly: fat = `fat_g_per_lb_goal` (0.35) ×
 * goal weight, carbs = whatever calories remain, clamped at zero.
 *
 * What stays with the callers: which calories apply to which day (weekly
 * schedule, the caller's own weekday, Garmin eat-back). This module answers
 * "given this many calories, how many grams of each" and nothing about dates.
 * Pure: no I/O, no clock.
 */

export const DEFAULT_PROTEIN_G_PER_LB_GOAL = 0.8;
export const DEFAULT_FAT_G_PER_LB_GOAL = 0.35;
export const DEFAULT_PROTEIN_G_PER_LB_LEAN = 1.0;

const KETO_SPLITS = Object.freeze({
  classic: Object.freeze({ fat_pct: 70, protein_pct: 25, carb_pct: 5 }),
  high_protein: Object.freeze({ fat_pct: 60, protein_pct: 35, carb_pct: 5 }),
});

const positive = (n) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * The rules a nutrition goal implies, before any calories are applied.
 *
 * @param {Object|null|undefined} ng a stored `UserSettings.nutrition_goal`
 * @param {Object} [opts]
 * @param {number|null} [opts.leanMassLb] averaged recent lean mass
 *   (`leanMassForTargets`), or null when no usable scan exists
 */
export function macroRules(ng, { leanMassLb = null } = {}) {
  const goal = ng || {};
  const goalWeightLbs = goal.goal_weight_lbs ?? goal.target_weight ?? goal.targetWeight ?? null;
  const lean = positive(leanMassLb);
  const keto = goal.mode === 'keto';
  const preset = goal.keto?.macro_split?.preset;
  const split = keto
    ? (preset === 'lazy'
      ? null
      : {
        fat_pct: Number(goal.keto?.macro_split?.fat_pct ?? KETO_SPLITS.classic.fat_pct),
        protein_pct: Number(goal.keto?.macro_split?.protein_pct ?? KETO_SPLITS.classic.protein_pct),
        carb_pct: Number(goal.keto?.macro_split?.carb_pct ?? KETO_SPLITS.classic.carb_pct),
      })
    : null;

  const proteinPerLbGoal = goal.protein_g_per_lb_goal ?? goal.protein_g_per_lb ?? DEFAULT_PROTEIN_G_PER_LB_GOAL;
  const proteinPerLbLean = goal.protein_g_per_lb_lean ?? DEFAULT_PROTEIN_G_PER_LB_LEAN;
  const fatPerLb = goal.fat_g_per_lb_goal ?? goal.fat_g_per_lb ?? DEFAULT_FAT_G_PER_LB_GOAL;

  let proteinBasis;
  if (lean) proteinBasis = 'lean_mass';
  else if (keto && split) proteinBasis = 'percent';
  else proteinBasis = 'goal_weight';

  return {
    goal_weight_lbs: goalWeightLbs,
    protein_g_per_lb: proteinPerLbGoal,
    protein_g_per_lb_lean: proteinPerLbLean,
    fat_g_per_lb: fatPerLb,
    protein_basis: proteinBasis,
    lean_mass_lb: lean ? Math.round(lean * 10) / 10 : null,
    keto,
    keto_preset: keto ? (preset || 'classic') : null,
    keto_split: split,
    net_carb_limit_g: keto ? positive(goal.keto?.net_carb_limit_g) ?? 20 : null,
  };
}

/**
 * Gram targets for one day's calories under `rules` (from `macroRules`).
 *
 * @param {number} calories
 * @param {Object} rules
 * @returns {{protein_g: number, fat_g: number, carbs_g: number}}
 */
export function macrosForCalories(calories, rules) {
  const cal = Math.max(0, Number(calories) || 0);
  const goalWeight = positive(rules.goal_weight_lbs);
  const lean = positive(rules.lean_mass_lb);

  const proteinByRule = () => {
    if (lean) return Math.round(rules.protein_g_per_lb_lean * lean);
    return goalWeight ? Math.round(rules.protein_g_per_lb * goalWeight) : 0;
  };

  if (rules.keto) {
    const split = rules.keto_split;
    // Carbs: the split's share, or for lazy keto the cap itself.
    const carbsG = split
      ? Math.round((cal * (split.carb_pct / 100)) / 4)
      : Math.round(rules.net_carb_limit_g ?? 20);

    if (split && !lean) {
      // Nothing anchors protein: the saved split, exactly as the wizard's
      // keto step displays it.
      return {
        protein_g: Math.round((cal * (split.protein_pct / 100)) / 4),
        fat_g: Math.round((cal * (split.fat_pct / 100)) / 9),
        carbs_g: carbsG,
      };
    }
    const proteinG = proteinByRule();
    const fatG = Math.max(0, Math.round((cal - proteinG * 4 - carbsG * 4) / 9));
    return { protein_g: proteinG, fat_g: fatG, carbs_g: carbsG };
  }

  const proteinG = proteinByRule();
  const fatG = goalWeight ? Math.round(rules.fat_g_per_lb * goalWeight) : 0;
  // Carbohydrate is whatever calories are left once protein and fat are paid
  // for. Clamped at zero: a plan whose protein and fat exceed its calories is
  // over-specified, and a negative goal would grade every day non-compliant.
  const carbsG = Math.max(0, Math.round((cal - (proteinG * 4 + fatG * 9)) / 4));
  return { protein_g: proteinG, fat_g: fatG, carbs_g: carbsG };
}

/**
 * The whole `derivedMacros` payload minus "which day is today", which only a
 * caller that knows the user's calendar can answer.
 *
 * @param {Object|null|undefined} ng
 * @param {Object} [opts]
 * @param {number|null} [opts.leanMassLb]
 * @returns {{rules: Object, fixed: Object, calories: Object, weekly: Array}}
 *   `weekly` is Monday-first, `activity_add_kcal: 0` (eat-back is live and
 *   per-day; callers that apply it recompute that day with `macrosForCalories`).
 */
export function deriveMacroTargets(ng, { leanMassLb = null } = {}) {
  const goal = ng || {};
  const rules = {
    ...macroRules(goal, { leanMassLb }),
    calorie_target_mode: goal.calorie_target_mode || 'fixed',
    activity_eatback_fraction: typeof goal.activity_eatback_fraction === 'number' ? goal.activity_eatback_fraction : 0.6,
    activity_eatback_cap_kcal: typeof goal.activity_eatback_cap_kcal === 'number' ? goal.activity_eatback_cap_kcal : 500,
  };

  const dailyCal = goal.daily_calorie_target || goal.auto_base_calories || goal.fixed_calories || null;
  const weeklyBase = Array.isArray(goal.weekly_schedule) && goal.weekly_schedule.length === 7
    ? goal.weekly_schedule
    : (dailyCal ? new Array(7).fill(dailyCal) : [0, 0, 0, 0, 0, 0, 0]);

  const weekly = weeklyBase.map((baseCal, idx) => ({
    dayIndex: idx,
    base_calories: baseCal,
    activity_add_kcal: 0,
    target_calories: baseCal,
    ...macrosForCalories(baseCal, rules),
  }));

  // "Fixed" macros are the day-independent part. In standard mode protein and
  // fat never vary with calories; in keto they can (the split is a share of
  // calories), so they are reported at the plan's base daily target.
  const atBase = macrosForCalories(dailyCal ?? weeklyBase[0] ?? 0, rules);
  const fixed = {
    protein_g: atBase.protein_g,
    fat_g: atBase.fat_g,
    protein_kcal: atBase.protein_g * 4,
    fat_kcal: atBase.fat_g * 9,
  };

  return { rules, fixed, calories: { daily: dailyCal, weekly_schedule: weeklyBase }, weekly };
}
