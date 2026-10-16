/**
 * Pure helpers for the recipe builder (DOCS/RECIPES_PLAN.md §2–3).
 *
 * A builder row is one ingredient in the editor's own shape: `amount` is the
 * text the person typed, `servings` is that amount converted into the
 * ingredient's own servings (what the math multiplies by), and `nutrition` is
 * the snapshot per ONE ingredient serving.
 */
import {
  NUTRIENT_KEYS,
  amountToServings,
  canonicalUnit,
  recipeNutrition,
  recipeTotals,
  unitsFor,
} from './recipeMath.js';

let nextKey = 1;
const newKey = () => `ing-${nextKey++}`;

const snapshot = (nutrition = {}) =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, Number(nutrition?.[k]) || 0]));

const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '');

/**
 * A picked search/suggest result becomes an ingredient: 1 serving of it.
 * `previous` is the unresolved row it replaces (keeps its place in the list).
 */
export function ingredientFromFood(food, previous) {
  const serving_size = Number(food?.serving?.size ?? food?.serving_size) || 1;
  const serving_unit = food?.serving?.unit ?? food?.serving_unit ?? 'serving';
  const id = food?.id ?? food?._id;
  return {
    key: previous?.key || newKey(),
    name: food?.name || 'Ingredient',
    food_item_id: id ? String(id) : null,
    amount: '1',
    unit: 'serving',
    servings: 1,
    serving_size,
    serving_unit,
    nutrition: snapshot(food?.nutrition),
    estimated: String(food?.source || '').toLowerCase() === 'ai',
    unresolved: false,
    unitMismatch: false,
  };
}

/** One row of `POST /foods/recipe/parse`. */
export function ingredientFromParsed(row) {
  if (!row || row.unresolved) {
    return {
      key: newKey(),
      name: row?.name || row?.line || 'Ingredient',
      line: row?.line || row?.name || '',
      unresolved: true,
    };
  }
  const servings = Number(row.servings);
  return {
    key: newKey(),
    name: row.name || row.line,
    line: row.line,
    food_item_id: row.food_item_id || null,
    amount: row.amount != null ? fmt(Number(row.amount)) : fmt(servings),
    unit: row.unit ? canonicalUnit(row.unit) : 'serving',
    servings: Number.isFinite(servings) ? servings : 1,
    serving_size: Number(row.serving_size) || 1,
    serving_unit: row.serving_unit || 'serving',
    nutrition: snapshot(row.nutrition),
    estimated: Boolean(row.estimated),
    unresolved: false,
    unitMismatch: Boolean(row.unitMismatch),
  };
}

/** An ingredient as stored on a saved recipe. */
export function ingredientFromSaved(ing) {
  const servings = Number(ing?.servings) || 0;
  return {
    key: newKey(),
    name: ing?.name,
    food_item_id: ing?.food_item_id || null,
    amount: ing?.amount != null ? fmt(Number(ing.amount)) : fmt(servings),
    unit: ing?.unit ? canonicalUnit(ing.unit) : 'serving',
    servings,
    serving_size: Number(ing?.serving_size) || 1,
    serving_unit: ing?.serving_unit || 'serving',
    nutrition: snapshot(ing?.nutrition),
    estimated: Boolean(ing?.estimated),
    unresolved: false,
    unitMismatch: false,
  };
}

// US units first in the select; metric stays available after them.
const US_FIRST = ['serving', 'oz', 'lb', 'cup', 'fl oz', 'tbsp', 'tsp'];
const usRank = (u) => (US_FIRST.includes(u) ? US_FIRST.indexOf(u) : US_FIRST.length);

/** Units the select offers: what converts, plus whatever the row has now. */
export function unitOptions(row) {
  const opts = [...unitsFor({ size: row.serving_size, unit: row.serving_unit })]
    .sort((a, b) => usRank(a) - usRank(b));
  return opts.includes(row.unit) ? opts : [...opts, row.unit];
}

/**
 * The amount changed. A number that does not parse leaves `servings` at 0
 * (the row then blocks Save) rather than inheriting a stale value.
 */
export function withAmount(row, amount) {
  const s = amountToServings(amount, row.unit, { size: row.serving_size, unit: row.serving_unit });
  if (s == null) {
    // Unit can't convert (the mismatch case) — leave the maths alone.
    return { ...row, amount, servings: row.unitMismatch ? row.servings : 0 };
  }
  return { ...row, amount, servings: s, unitMismatch: false };
}

/** The unit changed. If it can't be converted, the old unit stays. */
export function withUnit(row, unit) {
  const s = amountToServings(row.amount, unit, { size: row.serving_size, unit: row.serving_unit });
  if (s == null) return row;
  return { ...row, unit, servings: s, unitMismatch: false };
}

export const rowCalories = (row) =>
  Math.round((Number(row?.nutrition?.calories_per_serving) || 0) * (Number(row?.servings) || 0));

/** The recipe sub-document as the gateway takes it. */
export function toRecipeInput(rows, yieldServings) {
  return {
    yield_servings: Number(yieldServings),
    ingredients: rows
      .filter((r) => !r.unresolved)
      .map((r) => ({
        food_item_id: r.food_item_id || null,
        name: r.name,
        amount: Number(r.amount),
        unit: r.unit,
        servings: r.servings,
        serving_size: r.serving_size,
        serving_unit: r.serving_unit,
        nutrition: r.nutrition,
        estimated: Boolean(r.estimated),
      })),
  };
}

/** Everything the builder shows live, plus whether Save should be enabled. */
export function summarize({ name, rows, yieldServings }) {
  const y = Number(yieldServings);
  const yieldOk = Number.isFinite(y) && y > 0;
  const resolved = rows.filter((r) => !r.unresolved);
  const hasUnresolved = rows.some((r) => r.unresolved);
  const allAmountsOk = resolved.every((r) => Number(r.servings) > 0);
  const recipe = toRecipeInput(rows, yieldOk ? y : 1);
  const totals = recipeTotals(recipe);
  const perServing = yieldOk ? recipeNutrition(recipe) : null;
  return {
    totals,
    perServing,
    yieldOk,
    hasUnresolved,
    canSave: Boolean(String(name || '').trim()) && resolved.length > 0 && !hasUnresolved && allAmountsOk && yieldOk,
  };
}
