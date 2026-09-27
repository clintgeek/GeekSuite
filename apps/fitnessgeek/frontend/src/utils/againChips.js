/**
 * One-tap logging (DOCS/SIMPLE_AND_FULL_PLAN.md item 2): "Again" chips for the
 * foods and saved meals a person logs most, and "Same as yesterday's lunch".
 *
 * Everything here is derived from the person's OWN recent logs, client-side —
 * no new query, no model. The logs are the ones the add sheet already reads
 * (hooks/useRecentLogs.js), so a chip costs nothing to compute.
 *
 * RANKING. A food logged in THIS meal counts twice what the same food logged
 * in another meal does — the lunch chips should be what he has for lunch, with
 * his everyday staples still able to surface. Ties go to whatever was logged
 * most recently. A saved meal counts once for every (day, meal) in which ALL
 * of its foods appear together: logging a saved meal writes one row per food,
 * so the rows are the only record that the meal was eaten.
 */
import { rowDay } from './experience.js';

export const AGAIN_LIMIT = 6;
const IN_MEAL_WEIGHT = 2;

const foodOf = (log) => log?.food_item_id || log?.food_item || null;
const foodKey = (food) => {
  if (!food) return null;
  const id = food.id || food._id;
  if (id) return `id:${id}`;
  const name = String(food.name || '').trim().toLowerCase();
  return name ? `name:${name}::${String(food.brand || '').trim().toLowerCase()}` : null;
};
const logTime = (log) => {
  const day = rowDay(log) || '';
  return `${day}|${log?.created_at || ''}`;
};

/**
 * @param {{logs: object[], savedMeals?: object[], mealType: string, limit?: number}} input
 * @returns {{kind: 'food'|'meal', key: string, label: string, score: number, count: number, item: object}[]}
 */
export function rankAgainChips({ logs = [], savedMeals = [], mealType, limit = AGAIN_LIMIT }) {
  const rows = Array.isArray(logs) ? logs : [];
  const foods = new Map();

  for (const log of rows) {
    const food = foodOf(log);
    const key = foodKey(food);
    if (!key) continue;
    const inMeal = log.meal_type === mealType;
    const entry = foods.get(key) || { key, food, score: 0, count: 0, last: '', lastLog: null };
    entry.score += inMeal ? IN_MEAL_WEIGHT : 1;
    entry.count += 1;
    const t = logTime(log);
    // The newest log of this food carries the servings and the nutrition
    // snapshot to re-log it with — what he had last time, not the default.
    if (t >= entry.last) {
      entry.last = t;
      entry.lastLog = log;
    }
    foods.set(key, entry);
  }

  // (day, meal) → the food keys eaten together in it.
  const sittings = new Map();
  for (const log of rows) {
    const key = foodKey(foodOf(log));
    const day = rowDay(log);
    if (!key || !day) continue;
    const sitting = `${day}|${log.meal_type}`;
    if (!sittings.has(sitting)) sittings.set(sitting, { meal: log.meal_type, day, keys: new Set() });
    sittings.get(sitting).keys.add(key);
  }

  const meals = [];
  for (const meal of Array.isArray(savedMeals) ? savedMeals : []) {
    const keys = (meal?.food_items || [])
      .map((entry) => foodKey(entry?.food_item_id || entry?.food_item))
      .filter(Boolean);
    if (keys.length === 0) continue;
    let score = 0;
    let count = 0;
    let last = '';
    for (const sitting of sittings.values()) {
      if (keys.every((k) => sitting.keys.has(k))) {
        score += sitting.meal === mealType ? IN_MEAL_WEIGHT : 1;
        count += 1;
        if (sitting.day > last) last = sitting.day;
      }
    }
    // A saved meal is offered in the slot it is eaten in: "Usual
    // breakfast" is not a lunch suggestion, however often it is eaten.
    if (count === 0 || score === count) continue;
    meals.push({
      kind: 'meal',
      key: `meal:${meal.id || meal._id}`,
      label: meal.name,
      score,
      count,
      last,
      item: { ...meal, type: 'meal' },
    });
  }

  const foodChips = [...foods.values()].map((entry) => ({
    kind: 'food',
    key: entry.key,
    label: entry.food.name,
    score: entry.score,
    count: entry.count,
    last: entry.last,
    item: {
      ...entry.food,
      servings: Number(entry.lastLog?.servings) > 0 ? Number(entry.lastLog.servings) : 1,
      nutrition: entry.lastLog?.nutrition || entry.food.nutrition,
    },
  }));

  return [...meals, ...foodChips]
    // A one-off is not a habit: something logged once has nothing to repeat.
    .filter((chip) => chip.count >= 2)
    .sort((a, b) => (b.score - a.score) || (b.last > a.last ? 1 : b.last < a.last ? -1 : 0) || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/**
 * Yesterday's logs for one meal, ready to hand to `logItems` — each carrying
 * the servings and nutrition snapshot it was logged with.
 */
export function yesterdaysMeal({ logs = [], mealType, yesterday }) {
  return (Array.isArray(logs) ? logs : [])
    .filter((log) => log.meal_type === mealType && rowDay(log) === yesterday && foodOf(log))
    .map((log) => ({
      ...foodOf(log),
      servings: Number(log.servings) > 0 ? Number(log.servings) : 1,
      nutrition: log.nutrition || foodOf(log).nutrition,
    }));
}
