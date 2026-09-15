/**
 * foodSanityRails — arithmetic, not opinion.
 *
 * When the model is allowed to invent nutrition numbers (see
 * DOCS/THE_DESCRIBE_AND_LOG_PLAN.md §5), something has to catch the nonsense.
 * Most of that job needs no second model at all: the errors worth catching are
 * order-of-magnitude, and order-of-magnitude errors are arithmetic.
 *
 * "Beef flautas · 41 piece · 220 cal" — from Chef's 2026-09-15 screenshot — is
 * 9,020 calories on one plate. That is catchable for free, in microseconds,
 * with a test around it. An LLM judge should never be asked a question that a
 * multiplication can answer.
 *
 * The bar these enforce is deliberately LOOSE. Chef's standard is "reasonable
 * for the description", not accurate to ±10 calories: a nacho plate at 960 vs
 * 1,220 is noise at the week level. These rails exist to stop absurdity, not to
 * police estimates.
 *
 * Severity is what the caller acts on:
 *   pass    — write it, say nothing
 *   suspect — write it anyway (logging beats not logging), but mark it so the
 *             background judge looks and the UI can offer a nudge
 *   reject  — arithmetically impossible or corrupt; do not write silently
 */

/** Atwater factors. Alcohol is 7 and is deliberately NOT modelled — see below. */
const CAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

/** Pure fat is 9 cal/g. Nothing edible is denser. */
const MAX_CAL_PER_GRAM = 9.5;

/** One dish above this is unusual enough to look at. A feast is still possible. */
const SUSPECT_ENTRY_CALORIES = 2500;

/**
 * Above this it is not a meal, it is a parse error. A genuine feast reaches
 * three or four thousand; nothing a person eats in one sitting reaches six.
 * Lowered from 10,000 on 2026-09-15, when "41 beef flautas" computed to 9,020
 * and was merely flagged rather than stopped.
 */
const REJECT_ENTRY_CALORIES = 6000;

/** A single dish is not 50 servings. */
const SUSPECT_SERVINGS = 25;
const REJECT_SERVINGS = 100;

/**
 * How far the macros may EXCEED the stated calories before we disbelieve them.
 *
 * The asymmetry here is the whole trick. Macros that add up to far MORE than
 * the stated calories are arithmetically impossible — 50g of fat cannot live
 * inside a 100-calorie food. But macros adding up to LESS than the calories is
 * ordinary and honest: alcohol carries 7 cal/g and appears in none of the three
 * fields, and sugar alcohols, fibre and rounding all leave calories unexplained.
 * A beer at 150 cal with P1/C13/F0 computes to 56 — flagging that would be
 * wrong, so we only ever check the impossible direction.
 *
 * The tolerance is loose on purpose. A real estimate for nachos came back at
 * 1,200 cal with macros computing to 1,520 (27% over) — sloppy, but a perfectly
 * usable answer. Flagging that would mark most entries suspect, and a warning
 * that fires constantly is a warning nobody reads. Fat alone exceeding the
 * stated calories still trips it several times over.
 */
const MACRO_OVERSHOOT_TOLERANCE = 1.4;

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Calories implied by the macros alone. */
export function caloriesFromMacros(nutrition = {}) {
  return (
    num(nutrition.protein_grams) * CAL_PER_G.protein +
    num(nutrition.carbs_grams) * CAL_PER_G.carbs +
    num(nutrition.fat_grams) * CAL_PER_G.fat
  );
}

/**
 * Check one proposed log entry.
 *
 * @param {object} entry `{ name, servings, unit, nutrition: {calories_per_serving,
 *        protein_grams, carbs_grams, fat_grams}, serving: {size, unit} }`
 * @returns {{severity: 'pass'|'suspect'|'reject', flags: string[],
 *            totals: {calories: number}, corrected: object|null}}
 *          `corrected` is a repaired entry where the fix is unambiguous
 *          (calories missing but derivable from macros), otherwise null.
 */
export function checkEntry(entry) {
  const flags = [];
  let severity = 'pass';
  let corrected = null;

  const raise = (level, flag) => {
    flags.push(flag);
    if (level === 'reject' || severity === 'reject') severity = 'reject';
    else if (level === 'suspect') severity = 'suspect';
  };

  if (!entry || typeof entry !== 'object') {
    return { severity: 'reject', flags: ['no-entry'], totals: { calories: 0 }, corrected: null };
  }

  const nutrition = entry.nutrition || {};
  // An ABSENT servings count means one; an explicit 0 (or a negative) is corrupt
  // data, and `num(x) || 1` cannot tell those apart because 0 is falsy.
  const servingsGiven = entry.servings !== undefined && entry.servings !== null && entry.servings !== '';
  const servings = servingsGiven ? num(entry.servings) : 1;
  const perServing = num(nutrition.calories_per_serving);

  // ── Corrupt values ───────────────────────────────────────────────────
  const numericFields = [
    perServing,
    num(nutrition.protein_grams),
    num(nutrition.carbs_grams),
    num(nutrition.fat_grams),
    servings
  ];
  if (numericFields.some((v) => v < 0)) raise('reject', 'negative-value');
  if (servings <= 0) raise('reject', 'non-positive-servings');

  if (!entry.name || !String(entry.name).trim()) raise('reject', 'no-name');

  // ── Servings ─────────────────────────────────────────────────────────
  if (servings > REJECT_SERVINGS) raise('reject', 'absurd-servings');
  else if (servings > SUSPECT_SERVINGS) raise('suspect', 'high-servings');

  // ── Macros vs calories, in the impossible direction only ─────────────
  const macroCalories = caloriesFromMacros(nutrition);
  if (perServing <= 0 && macroCalories > 0) {
    // Unambiguous repair: the macros say what the calories are.
    corrected = {
      ...entry,
      nutrition: { ...nutrition, calories_per_serving: Math.round(macroCalories) }
    };
    flags.push('calories-derived-from-macros');
  } else if (perServing > 0 && macroCalories > perServing * MACRO_OVERSHOOT_TOLERANCE) {
    raise('suspect', 'macros-exceed-calories');
  }

  // ── Calorie density ──────────────────────────────────────────────────
  // Only checkable when the serving is expressed in grams.
  const gramsPerServing = /^(g|gram|grams)$/i.test(String(entry.serving?.unit || ''))
    ? num(entry.serving?.size)
    : 0;
  const effectiveCalories = corrected
    ? num(corrected.nutrition.calories_per_serving)
    : perServing;
  if (gramsPerServing > 0 && effectiveCalories > 0) {
    const density = effectiveCalories / gramsPerServing;
    if (density > MAX_CAL_PER_GRAM) raise('suspect', 'impossible-calorie-density');
  }

  // ── Total for the entry ──────────────────────────────────────────────
  const totalCalories = Math.round(effectiveCalories * servings);
  if (totalCalories > REJECT_ENTRY_CALORIES) raise('reject', 'absurd-total-calories');
  else if (totalCalories > SUSPECT_ENTRY_CALORIES) raise('suspect', 'high-total-calories');

  return { severity, flags, totals: { calories: totalCalories }, corrected };
}

/** True when the entry is safe to write without comment. */
export const isClean = (result) => result.severity === 'pass';

/** True when it should be written but looked at afterwards. */
export const needsJudge = (result) => result.severity === 'suspect';

export default {
  checkEntry,
  caloriesFromMacros,
  isClean,
  needsJudge,
  MAX_CAL_PER_GRAM,
  SUSPECT_ENTRY_CALORIES,
  MACRO_OVERSHOOT_TOLERANCE
};
