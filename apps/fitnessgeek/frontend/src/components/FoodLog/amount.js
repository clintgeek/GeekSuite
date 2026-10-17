/**
 * How much of a food an entry is, in a few characters (UX review L15).
 *
 *   - 1 serving says nothing: it's what she always logs.
 *   - Whole servings say "×2".
 *   - A part serving of a food with a real unit says the unit amount
 *     ("6 oz" for 1.5 × 4 oz): nobody thinks in "×0.75".
 *   - Any other part serving says "×1.5".
 *
 * Only `servings` is stored on an entry; the unit comes from the food.
 */
const NO_UNIT = new Set(['', 'serving', 'servings', 'item', 'items', 'each']);

const trim = (n) => String(Math.round(n * 100) / 100);

export function amountLabel(log) {
  const raw = log?.servings;
  const servings = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(servings) || servings <= 0 || servings === 1) return '';
  if (Number.isInteger(servings)) return `×${servings}`;
  const food = log.food_item || log.food_item_id || {};
  const size = Number(food.serving_size);
  const unit = String(food.serving_unit || '').trim();
  if (size > 0 && !NO_UNIT.has(unit.toLowerCase())) return `${trim(size * servings)} ${unit}`;
  return `×${trim(servings)}`;
}

export default amountLabel;
