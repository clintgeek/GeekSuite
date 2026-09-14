/**
 * foodQueryParser — what the person actually typed, worked out without a model.
 *
 * The governing rule, and the reason this module exists:
 *
 *   **A query is ONE DISH until the text says otherwise.**
 *
 * Before this, `aiFoodService.classifyFoodInput` opened its prompt with
 * "CRITICAL: Extract EVERY distinct food item mentioned. Split on 'and',
 * commas, or implicit separators." — and so `4 chocolate chip pancakes
 * homemade` classified as `chocolate chip` ×4, `pancakes`, and an invented
 * `pancake mix`. Three ingredient searches for a query that names one food,
 * which is why that search returned a bag of chocolate chips and no pancakes.
 * See DOCS/THE_FOOD_SEARCH_PLAN.md §1.0 for the reproduction.
 *
 * So decomposition here is the exception. A query splits when the person wrote
 * a separator — a comma, "and", "with", "+", "w/" — and not otherwise; and
 * even then a fragment whose head noun names a dish ("peanut butter and jelly
 * SANDWICH") stays whole. Everything this module decides is deterministic,
 * testable, and costs no tokens; the model is left to handle only what's
 * genuinely ambiguous.
 */

/** Quantity words that can lead a fragment. */
const WORD_QUANTITIES = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  dozen: 12, couple: 2, few: 3, half: 0.5, quarter: 0.25
};

/** Units that may follow a quantity. Singular forms; a trailing "s" is trimmed. */
const UNIT_WORDS = new Set([
  'cup', 'cups', 'oz', 'ounce', 'ounces', 'g', 'gram', 'grams', 'kg',
  'ml', 'l', 'liter', 'liters', 'litre', 'litres', 'tbsp', 'tablespoon',
  'tablespoons', 'tsp', 'teaspoon', 'teaspoons', 'slice', 'slices',
  'piece', 'pieces', 'serving', 'servings', 'bottle', 'bottles', 'can',
  'cans', 'glass', 'glasses', 'bowl', 'bowls', 'plate', 'plates', 'bar',
  'bars', 'scoop', 'scoops', 'handful', 'handfuls', 'pack', 'packs',
  'packet', 'packets', 'stick', 'sticks', 'lb', 'lbs', 'pound', 'pounds'
]);

/**
 * Words that describe how food was made. They stay IN the search text — food
 * databases index them ("Chicken, breast, grilled") — but are also reported as
 * a hint so the ranker can prefer an entry that agrees.
 */
const PREPARATION_WORDS = new Set([
  'grilled', 'baked', 'fried', 'roasted', 'raw', 'boiled', 'steamed',
  'scrambled', 'poached', 'smoked', 'broiled', 'sauteed', 'sautéed',
  'toasted', 'breaded', 'stewed', 'braised'
]);

/**
 * Words that describe provenance rather than the food. No catalog indexes
 * these, so they are STRIPPED from the search text and kept only as a hint —
 * "homemade" is exactly the word that became a phantom "pancake mix".
 */
const NOISE_WORDS = new Set([
  'homemade', 'home-made', 'housemade', 'leftover', 'leftovers',
  'my', 'some', 'store-bought', 'storebought',
  'approx', 'approximately', 'about', 'roughly'
]);

/**
 * Grammar words. Dropped when tokenizing for comparison, but KEPT in the text
 * we send to a catalog — USDA really does index "Sandwich, peanut butter AND
 * jelly", and "plain"/"fresh" are catalog words, not noise, which is why they
 * are not in the set above.
 */
const STOP_TOKENS = new Set([
  'and', 'with', 'the', 'of', 'a', 'an', 'or', 'for', 'in', 'on', 'at',
  'to', 'plus', 'from'
]);

/**
 * Head nouns that name a composed dish. A fragment ending in one of these is
 * a single food no matter how many "and"s it contains — this is what keeps
 * "peanut butter and jelly sandwich" from becoming a shopping list.
 *
 * Deliberately small and curated. Grow it when a real query disappoints.
 */
const DISH_NOUNS = new Set([
  'sandwich', 'sandwiches', 'burger', 'burgers', 'cheeseburger',
  'cheeseburgers', 'wrap', 'wraps', 'burrito', 'burritos', 'taco', 'tacos',
  'quesadilla', 'quesadillas', 'pizza', 'pizzas', 'salad', 'salads',
  'soup', 'soups', 'stew', 'stews', 'chili', 'casserole', 'casseroles',
  'pie', 'pies', 'pot pie', 'bowl', 'bowls', 'smoothie', 'smoothies',
  'shake', 'shakes', 'milkshake', 'milkshakes', 'omelette', 'omelet',
  'omelettes', 'omelets', 'frittata', 'curry', 'curries', 'stirfry',
  'stir-fry', 'pancake', 'pancakes', 'waffle', 'waffles', 'crepe',
  'crepes', 'muffin', 'muffins', 'pasta', 'lasagna', 'risotto', 'paella',
  'sundae', 'sundaes', 'parfait', 'parfaits', 'cake', 'cakes', 'cookie',
  'cookies', 'brownie', 'brownies', 'roll', 'rolls', 'sub', 'subs',
  'hoagie', 'panini', 'melt', 'melts', 'hash', 'skillet', 'platter',
  'combo', 'meal', 'plate'
]);

/** Separators the person wrote. Only these split a query. */
const COMMA_SPLIT = /\s*[,;]\s*|\s*\/\s*(?![0-9])/;
const CONJUNCTION_SPLIT = /\s+(?:and|with|plus|w\/|&|\+)\s+/;

/** Lowercase, collapse whitespace, normalise the punctuation people type. */
export function normalizeQuery(raw) {
  return String(raw || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    // "w/" is a conjunction people type; make it one before anything splits.
    .replace(/(^|\s)w\/(\s|$)/g, '$1with$2')
    .replace(/\s+/g, ' ')
    .replace(/\s*\.\s*$/, '')
    .trim();
}

/** Crude singular: enough to match a head noun, not a linguistics project. */
export function singularize(word) {
  const w = String(word || '');
  if (w.length > 3 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && /(ch|sh|ss|x|z)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Meaningful tokens of a phrase, singularised, noise removed. */
export function tokenize(text) {
  return normalizeQuery(text)
    .replace(/[^\p{L}\p{N}\s%-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !NOISE_WORDS.has(t) && !STOP_TOKENS.has(t))
    .map((t) => singularize(t));
}

/**
 * The noun a fragment is *about* — its last meaningful word, singularised.
 * "chocolate chip pancakes" is about pancakes; a result that never mentions
 * one is not that dish, however many of the other words it matches.
 */
export function headNounOf(text) {
  const tokens = tokenize(text);
  return tokens.length ? tokens[tokens.length - 1] : null;
}

/**
 * Does this fragment end in a dish noun? Checks the last one and two words,
 * so "chicken pot pie" and "pot pie" both land.
 */
export function endsWithDishNoun(text) {
  const words = normalizeQuery(text).split(' ').filter(Boolean);
  if (words.length === 0) return false;
  const last = words[words.length - 1];
  if (DISH_NOUNS.has(last) || DISH_NOUNS.has(singularize(last))) return true;
  if (words.length >= 2) {
    const pair = `${words[words.length - 2]} ${last}`;
    if (DISH_NOUNS.has(pair) || DISH_NOUNS.has(singularize(pair))) return true;
  }
  return false;
}

/**
 * Split a normalised query into the fragments the person actually separated.
 * Commas first; then conjunctions, but never inside a fragment that names a
 * dish.
 */
function splitFragments(normalized) {
  const byComma = normalized.split(COMMA_SPLIT).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const piece of byComma) {
    if (endsWithDishNoun(piece)) {
      out.push(piece);
      continue;
    }
    const byConjunction = piece.split(CONJUNCTION_SPLIT).map((p) => p.trim()).filter(Boolean);
    out.push(...(byConjunction.length ? byConjunction : [piece]));
  }
  return out;
}

/** A leading numeral, fraction or quantity word. Returns [servings, rest]. */
function takeQuantity(words) {
  if (words.length === 0) return [null, words];
  const first = words[0];

  const fraction = first.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const value = Number(fraction[1]) / Number(fraction[2]);
    if (Number.isFinite(value) && value > 0 && words.length > 1) return [value, words.slice(1)];
  }

  const times = first.match(/^(\d+(?:\.\d+)?)x$/);
  if (times && words.length > 1) return [Number(times[1]), words.slice(1)];

  // Purely numeric only: "7up" and "5 hour energy" are names, not quantities,
  // and `parseFloat('7up')` is 7.
  if (/^\d+(?:\.\d+)?$/.test(first)) {
    const numeric = Number(first);
    if (numeric > 0 && numeric <= 200 && words.length > 1) return [numeric, words.slice(1)];
  }

  if (WORD_QUANTITIES[first] != null && words.length > 1) {
    return [WORD_QUANTITIES[first], words.slice(1)];
  }

  return [null, words];
}

/** A unit immediately after the quantity. Returns [unit, rest]. */
function takeUnit(words) {
  if (words.length === 0) return [null, words];
  const first = words[0];
  // "a cup of coffee" — only treat it as a unit when something follows it.
  if (UNIT_WORDS.has(first) && words.length > 1) {
    return [singularize(first), words.slice(1)];
  }
  return [null, words];
}

/**
 * Parse one fragment into a searchable dish.
 *
 * @returns {{text: string, searchText: string, servings: number, unit: string|null,
 *            preparation: string[], noise: string[], isDish: boolean, tokens: string[]}|null}
 */
export function parseFragment(fragment) {
  const normalized = normalizeQuery(fragment);
  if (!normalized) return null;

  let words = normalized.split(' ').filter(Boolean);

  const [quantity, afterQuantity] = takeQuantity(words);
  words = afterQuantity;
  const [unit, afterUnit] = takeUnit(words);
  words = afterUnit;

  // "of" only ever survives a unit ("a cup of coffee").
  if (words[0] === 'of') words = words.slice(1);

  const preparation = [];
  const noise = [];
  const kept = [];
  for (const word of words) {
    if (NOISE_WORDS.has(word)) {
      noise.push(word);
      continue;
    }
    if (PREPARATION_WORDS.has(word)) preparation.push(word);
    kept.push(word);
  }

  const searchText = kept.join(' ').trim();
  if (!searchText) return null;

  return {
    text: normalized,
    searchText,
    servings: quantity == null ? 1 : quantity,
    unit: unit || null,
    preparation,
    noise,
    isDish: endsWithDishNoun(searchText),
    headNoun: headNounOf(searchText),
    tokens: tokenize(searchText)
  };
}

/**
 * The whole job: a typed query in, the dishes the person named out.
 *
 * `explicitlySeparated` is the flag the search path cares about — when it is
 * false there is exactly one fragment and decomposition must not happen
 * behind the person's back.
 *
 * @param {string} raw
 * @returns {{raw: string, normalized: string, fragments: object[],
 *            explicitlySeparated: boolean, isSingleDish: boolean}}
 */
export function parseFoodQuery(raw) {
  const normalized = normalizeQuery(raw);
  if (!normalized) {
    return { raw: String(raw || ''), normalized: '', fragments: [], explicitlySeparated: false, isSingleDish: false };
  }

  const pieces = splitFragments(normalized);
  const fragments = pieces.map((piece) => parseFragment(piece)).filter(Boolean);

  // De-duplicate: the classifier used to return "granola" twice for one query.
  const seen = new Set();
  const unique = [];
  for (const fragment of fragments) {
    const key = fragment.tokens.join(' ');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(fragment);
  }

  return {
    raw: String(raw || ''),
    normalized,
    fragments: unique,
    explicitlySeparated: unique.length > 1,
    isSingleDish: unique.length === 1
  };
}

/**
 * The guard that would have caught the pancake bug on its own: an item a model
 * proposes must be made of words the person actually typed.
 *
 * `pancake mix` against "4 chocolate chip pancakes homemade" fails here —
 * "mix" appears nowhere in the query — so it never reaches a search.
 *
 * @param {string} itemName  a model-proposed item
 * @param {string} query     the original query
 * @returns {boolean}
 */
export function itemIsGroundedInQuery(itemName, query) {
  const itemTokens = tokenize(itemName);
  if (itemTokens.length === 0) return false;
  const queryTokens = new Set(tokenize(query));
  return itemTokens.every((token) => queryTokens.has(token));
}

export default {
  parseFoodQuery,
  parseFragment,
  itemIsGroundedInQuery,
  normalizeQuery,
  tokenize,
  singularize,
  endsWithDishNoun,
  headNounOf,
  DISH_NOUNS,
  PREPARATION_WORDS,
  NOISE_WORDS,
  STOP_TOKENS
};
