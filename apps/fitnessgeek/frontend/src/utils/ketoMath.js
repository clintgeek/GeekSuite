/**
 * ketoMath.js
 * Utility functions for keto mode calculations.
 * All functions are pure — no side effects, no imports needed.
 */

/**
 * Compute net carbs from a food object.
 * Handles both top-level fields and nested nutrition sub-objects.
 * Returns { netCarbs: number, isMissingFiber: boolean }
 */
export function netCarbs(food) {
  // Normalise — food items use top-level fields; log entries nest under nutrition
  const carbs =
    food?.carbs_grams ??
    food?.nutrition?.carbs_grams ??
    0;

  const fiberRaw =
    food?.fiber_grams ??
    food?.nutrition?.fiber_grams ??
    null;

  const isMissingFiber = fiberRaw === null || fiberRaw === undefined;
  const fiber = isMissingFiber ? 0 : fiberRaw;

  return {
    netCarbs: Math.max(0, carbs - fiber),
    isMissingFiber,
  };
}

/**
 * Given a calorie target and a macro split, return gram targets.
 * split: { fat_pct, protein_pct, carb_pct } — must sum to 100
 */
export function ketoMacroGrams(calories, split) {
  const { fat_pct = 70, protein_pct = 25, carb_pct = 5 } = split || {};
  return {
    fat_g:     Math.round((calories * (fat_pct     / 100)) / 9),
    protein_g: Math.round((calories * (protein_pct / 100)) / 4),
    carbs_g:   Math.round((calories * (carb_pct    / 100)) / 4),
  };
}

/**
 * Returns keto status based on net carbs vs limit.
 * Returns: 'in_range' | 'approaching' | 'over'
 */
export function ketoStatus(netCarbsConsumed, limitG = 20) {
  const pct = netCarbsConsumed / limitG;
  if (pct >= 1)   return 'over';
  if (pct >= 0.7) return 'approaching';
  return 'in_range';
}

/**
 * Preset macro splits
 */
export const KETO_PRESETS = {
  classic:      { fat_pct: 70, protein_pct: 25, carb_pct: 5 },
  high_protein: { fat_pct: 60, protein_pct: 35, carb_pct: 5 },
  lazy:         null, // lazy keto = just watch the carb cap, no split tracking
};
