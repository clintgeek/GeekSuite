/**
 * Plain helpers shared by the Today page tests. `vi.mock` is hoisted per test
 * file, so each file declares its own mocks; nothing here mocks anything.
 */
export const foodLog = (id, name, meal, cal, servings = 1, extra = {}) => ({
  id,
  meal_type: meal,
  servings,
  nutrition: { calories_per_serving: cal, protein_grams: 6, carbs_grams: 1, fat_grams: 5, ...(extra.nutrition || {}) },
  food_item_id: { _id: `f-${id}`, name },
});

/** Makes `window.matchMedia` answer every query one way: a phone, or a desktop. */
export function setViewport(desktop) {
  window.matchMedia = (query) => ({
    matches: Boolean(desktop),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });
}
