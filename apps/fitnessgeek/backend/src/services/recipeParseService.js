/**
 * recipeParseService — a pasted ingredient list, turned into recipe rows for
 * REVIEW. Nothing is logged and nothing is saved (DOCS/RECIPES_PLAN.md §3).
 *
 * Each line goes through the same parser and resolver describe-and-log uses
 * (`parseMealDescription` → `resolveEntries`: saved foods → history → catalog
 * → one batched AI estimate), so a line resolves the way a sentence about
 * food already does. The builder shows every row; unresolved lines come back
 * as `{ unresolved: true }` instead of vanishing, because a recipe silently
 * missing its butter is a recipe with wrong numbers.
 *
 * Recipe lines are not sentences, so they are cleaned first:
 *   - bullets / numbering ("- ", "• ", "1. ") are stripped;
 *   - headings ("Ingredients:", "For the sauce:") are skipped, and a
 *     "Directions" / "Instructions" / "Method" heading ENDS the list, so a
 *     whole pasted recipe works;
 *   - parentheticals go ("1 (15 oz) can beans" → "1 can beans");
 *   - everything after the first comma goes ("2 cloves garlic, minced") —
 *     the meal parser would otherwise read "minced" as a second food.
 */

import recipeModule from '@geeksuite/schemas/fitnessgeek/recipe';
import { parseMealDescription } from './mealDescriptionParser.js';
import describeAndLogService from './describeAndLogService.js';

const { NUTRIENT_KEYS, amountToServings, canonicalUnit } = recipeModule;

export const MAX_RECIPE_TEXT = 10000;
export const MAX_RECIPE_LINES = 100;

const BULLET = /^\s*(?:[-*•·◦▪]+|\d+[.)]|[a-z][.)])\s+/i;
const STOP_HEADING = /^(?:directions|instructions|method|steps|preparation|notes?)\b\s*:?\s*$/i;
const HEADING = /(?::\s*$)|^(?:ingredients?)\s*$/i;

/**
 * One raw line → the text to parse, or `null` to skip, or `STOP`.
 */
const STOP = Symbol('stop');
export function cleanRecipeLine(raw) {
  let line = String(raw || '').trim();
  if (!line) return null;
  line = line.replace(BULLET, '').trim();
  if (STOP_HEADING.test(line)) return STOP;
  if (HEADING.test(line)) return null;
  line = line.replace(/\([^)]*\)/g, ' ');
  const comma = line.indexOf(',');
  if (comma > 0) line = line.slice(0, comma);
  line = line.replace(/\s+/g, ' ').trim();
  return line || null;
}

const pickNutrition = (nutrition = {}) =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => {
    const v = Number(nutrition?.[k]);
    return [k, Number.isFinite(v) && v > 0 ? v : 0];
  }));

/**
 * A describe-and-log resolution → a recipe ingredient row.
 *
 * Catalog-shaped hits (saved food, branded catalog) carry nutrition PER
 * SERVING, so the typed amount converts against that serving when the units
 * share a dimension, and otherwise counts servings ("2 eggs" = 2).
 * History hits and estimates already describe the WHOLE typed amount
 * (`servingsOverride: 1`), so they are one serving of themselves.
 */
export function toIngredient(line, resolution) {
  const entry = resolution.entry || {};
  const base = {
    line,
    name: resolution.name,
    food_item_id: resolution.foodId ? String(resolution.foodId) : null,
    nutrition: pickNutrition(resolution.nutrition),
    serving_size: resolution.serving?.size ?? null,
    serving_unit: resolution.serving?.unit ?? null,
    estimated: resolution.source === 'estimate',
    source: resolution.source
  };

  if (resolution.servingsOverride === 1) {
    return {
      ...base,
      amount: entry.servings ?? 1,
      unit: entry.unit ? canonicalUnit(entry.unit) : 'serving',
      // The nutrition IS the whole amount, so the row is one serving of it;
      // the serving is relabelled to say so, for the editor.
      servings: 1,
      serving_size: entry.servings ?? 1,
      serving_unit: entry.unit ? canonicalUnit(entry.unit) : 'serving'
    };
  }

  const amount = entry.servings ?? 1;
  const unit = entry.unit ? canonicalUnit(entry.unit) : 'serving';
  const converted = unit === 'serving' ? amount : amountToServings(amount, unit, resolution.serving);
  return {
    ...base,
    amount,
    unit: converted == null ? 'serving' : unit,
    servings: converted == null ? amount : converted,
    // The typed unit didn't convert (a "cup" of a food served in grams): it
    // is counted as servings and flagged, so the review step asks.
    unitMismatch: converted == null
  };
}

/**
 * @param {string} text the pasted list
 * @param {{userId: string, resolve?: Function}} options `resolve` is
 *   injectable for tests; defaults to describe-and-log's resolveEntries.
 * @returns {Promise<{ingredients: object[], skipped: number}>}
 */
export async function parseRecipeText(text, { userId, resolve = describeAndLogService.resolveEntries } = {}) {
  const raw = String(text || '').slice(0, MAX_RECIPE_TEXT);
  const lines = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const cleaned = cleanRecipeLine(rawLine);
    if (cleaned === STOP) break;
    if (cleaned) lines.push({ original: rawLine.trim(), cleaned });
    if (lines.length >= MAX_RECIPE_LINES) break;
  }

  // Every entry remembers which line it came from; one batched resolve, so
  // the AI estimate (if any line needs one) is a single call.
  const owned = [];
  for (const line of lines) {
    const parsed = parseMealDescription(line.cleaned);
    if (parsed.entries.length === 0) owned.push({ line, entry: null });
    for (const entry of parsed.entries) owned.push({ line, entry });
  }

  const entries = owned.filter((o) => o.entry).map((o) => o.entry);
  const resolutions = entries.length ? await resolve(entries, { userId }) : [];
  const byEntry = new Map(resolutions.map((r) => [r.entry, r]));

  const ingredients = owned.map(({ line, entry }) => {
    const resolution = entry && byEntry.get(entry);
    // A saved MEAL is several foods, not one ingredient — the builder asks.
    if (!resolution || resolution.source === 'saved-meal') {
      return { line: line.original, name: entry?.dish || line.cleaned, unresolved: true };
    }
    return toIngredient(line.original, resolution);
  });

  return { ingredients };
}

export default { parseRecipeText, cleanRecipeLine, toIngredient };
