/**
 * The shapes the composer, the "Just added" strip and the Fix sheet share.
 */

/** Stable identity for a list row, de-duplicating the two search waves. */
export const identityOf = (food) => {
  if (!food) return '';
  if (food.kind === 'meal') return `meal:${food.id || food._id}`;
  return (
    food.id ||
    food._id ||
    `${food.source || '?'}::${food.compositeItem || ''}::${(food.name || '').toLowerCase()}`
  );
};

/**
 * "Egg ×2": the name with its amount when the amount isn't one (L4). Home,
 * the toast and the result card all said "Egg" for two eggs, so nothing
 * confirmed what she did and the safe-looking move was to add another.
 */
export function withAmount(name, servings) {
  const n = Number(servings);
  if (!name || !Number.isFinite(n) || n <= 0 || Math.abs(n - 1) < 1e-9) return name;
  const rounded = Math.round(n * 100) / 100;
  // A whole number is a count ("Egg ×2"). Part of one is said in words:
  // "Blueberries ×0.5" read like a formula (review 2026-11-27).
  if (Number.isInteger(rounded)) return `${name} ×${rounded}`;
  return `${name}, ${servingWords(rounded)}`;
}

const FRACTIONS = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];

/** "½ serving", "1½ servings", "2 servings", "0.4 servings". */
export function servingWords(servings) {
  const n = Math.round((Number(servings) || 0) * 100) / 100;
  const whole = Math.floor(n);
  const part = n - whole;
  const glyph = FRACTIONS.find(([value]) => Math.abs(value - part) < 0.011)?.[1];
  const number = part < 0.005 ? String(whole) : glyph ? `${whole || ''}${glyph}` : String(n);
  return `${number} serving${n > 1 ? 's' : ''}`;
}

const SMALL_WORDS = new Set(['A', 'AN', 'AND', 'FOR', 'IN', 'OF', 'ON', 'THE', 'TO', 'WITH']);
// Initials that are meant to be capitals.
const INITIALS = new Set(['BBQ', 'BLT', 'PB', 'PBJ', 'IPA', 'MCT', 'BCAA', 'XL', 'XXL', 'UHT', 'USA', 'UK', 'NY', 'USDA', 'DHA', 'EPA', 'GF', 'MSG', 'KFC', 'IHOP', 'TV', 'OJ']);

/**
 * A name for the screen. Catalog names arrive shouted ("CHOCOLATE PEANUT
 * BUTTER protein bar"); the shouted words are shown in title case, apart
 * from the common initials ("BBQ", "USDA"). The stored name is never
 * changed: this is for drawing only.
 */
export function displayName(name) {
  const text = String(name ?? '');
  return text.replace(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’]*/g, (word, at) => {
    if (word.length < 2 || word !== word.toUpperCase() || word === word.toLowerCase()) return word;
    if (SMALL_WORDS.has(word)) return at === 0 ? word[0] + word.slice(1).toLowerCase() : word.toLowerCase();
    if (INITIALS.has(word)) return word;
    return word[0] + word.slice(1).toLowerCase();
  });
}

/**
 * What a sitting added, in the ribbon's words: "Egg ×2" for one entry,
 * "3 foods" for more. Foods, not picks (UX review 2026-11, B3/B7): a copied
 * meal ("Same as Sarah's dinner", a household copy or yesterday's, `whole`)
 * is one entry that wrote one log per food, and counts its foods.
 */
export function sittingWhat(items = []) {
  const copied = (item) => item?.type === 'household-meal' || item?.whole;
  const foods = items.reduce((n, item) => (
    n + (copied(item) ? Math.max(1, item?.logIds?.length || 0) : 1)
  ), 0);
  if (items.length === 1 && foods === 1) {
    return withAmount(items[0]?.name, copied(items[0]) ? 1 : items[0]?.servings) || '1 food';
  }
  return `${foods} foods`;
}

const roundTo10 = (n) => Math.max(10, Math.round(n / 10) * 10);

/** The Smaller and Bigger numbers for an entry. */
export function portionChoices(item) {
  const logged = Math.round(Number(item?.calories) || 0);
  const low = Number(item?.range?.low);
  const high = Number(item?.range?.high);
  return {
    smaller: Number.isFinite(low) && low > 0 && low < logged ? Math.round(low) : roundTo10(logged * 0.7),
    bigger: Number.isFinite(high) && high > logged ? Math.round(high) : roundTo10(logged * 1.35),
  };
}

/**
 * A list of entries after one of them was fixed: replaced in place, or (after
 * "It was actually…") swapped for whatever the new words logged.
 */
export function applyItemChange(items, item, change) {
  const list = items || [];
  if (!change) return list;
  if (change.added || change.removed) {
    const at = list.findIndex((i) => i.logId === item.logId);
    const kept = change.removed ? list.filter((i) => i.logId !== item.logId) : list;
    const insert = (change.added || []).map(entryFromLogged);
    const index = at < 0 ? kept.length : Math.min(at, kept.length);
    return [...kept.slice(0, index), ...insert, ...kept.slice(index)];
  }
  return list.map((i) => (i.logId === item.logId ? change : i));
}

/**
 * One entry, the way the result card, the strip and the Fix sheet hold it,
 * from a describe response's `logged` row. `calories` is the row's total;
 * `nutrition` is per serving, at `servings` (the multiplier written).
 */
export function entryFromLogged(row, { mealType, date, questions = [] } = {}) {
  if (!row) return null;
  if (row.logId && row.nutrition && 'date' in row && 'range' in row) return row;
  const asked = questions.find((q) => q.logId === row.logId);
  return {
    logId: row.logId,
    name: row.name,
    calories: Math.round(Number(row.calories) || 0),
    nutrition: row.nutrition || {},
    servings: row.loggedServings ?? row.servings ?? 1,
    mealType: row.mealType || mealType,
    date: row.date || date,
    savedMeal: row.savedMeal || null,
    range: asked ? { low: asked.low, high: asked.high } : null,
  };
}

