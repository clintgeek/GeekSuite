/**
 * The custom-food form's blank state and what it sends, shared by every page
 * that opens FoodEditDialog to create a food (Saved foods and the look-up
 * page), so they cannot drift apart.
 */
export const EMPTY_FOOD_FORM = {
  name: '',
  brand: '',
  calories_per_serving: '',
  protein_grams: '',
  carbs_grams: '',
  fat_grams: '',
  serving_size: 1,
  serving_unit: 'oz'
};

const amount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * The create payload for a filled-in form.
 *
 * Fiber, sugar and sodium are on the form, and used to be dropped on the
 * way out: typed, saved, gone. They go along when they were typed.
 */
export function foodPayloadFromForm(form = {}) {
  const nutrition = {
    calories_per_serving: amount(form.calories_per_serving),
    protein_grams: amount(form.protein_grams),
    carbs_grams: amount(form.carbs_grams),
    fat_grams: amount(form.fat_grams)
  };
  for (const key of ['fiber_grams', 'sugar_grams', 'sodium_mg']) {
    if (amount(form[key]) > 0) nutrition[key] = amount(form[key]);
  }
  return {
    name: String(form.name || '').trim(),
    brand: String(form.brand || '').trim() || undefined,
    nutrition,
    serving: {
      size: amount(form.serving_size) || 1,
      unit: form.serving_unit || 'oz'
    }
  };
}
