/**
 * savedItemMatcher — does this described dish NAME something he saved?
 *
 * Chef, 2026-09-22: "if I have homemade quesadilla saved as a meal/food, it
 * should use that before guessing at something else." He had just built a
 * saved meal called "Homemade Quesadilla" out of seven foods. Describing
 * "homemade quesadilla" at that moment did not consult it at all: saved meals
 * were read by nothing on the describe path, and the history lookup — which
 * throws "homemade" away as noise — token-matched an old row called
 * "Quesadillas" at 1,680 cal per 100 g instead.
 *
 * THE RULE — equal significant words, qualifiers honoured
 * --------------------------------------------------------
 * A saved item matches a described entry when the two have the SAME set of
 * significant words (order-free, singularised, grammar words dropped) — the
 * dish, its `with` components and all. On top of that, provenance qualifiers
 * are NOT noise here, unlike everywhere else in the parser:
 *
 *   - a qualifier the saved NAME carries ("Homemade Quesadilla") must be in
 *     the text — "homemade quesadilla", or "my quesadilla", since "my" is him
 *     pointing at his own version. Plain "quesadilla" does NOT match it: that
 *     is exactly the restaurant quesadilla that must not silently become the
 *     homemade one.
 *   - a qualifier only the TEXT carries doesn't block a saved meal: "homemade
 *     shake meal" still finds "Shake Meal". Saying more than the name is not a
 *     contradiction; saying less is.
 *
 * WHY EQUALITY AND NOT "ALL THE NAME'S WORDS ARE PRESENT"
 * -------------------------------------------------------
 * Subset matching is the loose rule, and his data shows why it is wrong: the
 * describe path mints rows called "chicken", "cheese" and "guacamole". Under a
 * subset rule "chicken caesar salad" contains every word of "chicken", and
 * logs a side portion of chicken at the saved row's numbers — silently. A
 * false saved match is worse than no match, because the fallback path is still
 * there and still reasonable, while a wrong match writes the wrong nutrition
 * with a confident "this is yours" label on it.
 *
 * The cost, chosen knowingly: "homemade quesadilla with extra guac" does not
 * match "Homemade Quesadilla" and goes down the normal path (history, then an
 * estimate). So does a saved meal whose name the parser splits apart — "El P's
 * Rachero and Marg" is two entries by the time it gets here, because a
 * top-level `and` separates dishes. Both are misses, not wrong answers.
 *
 * WHICH SAVED FOODS ARE ELIGIBLE — only ones NAMED with a qualifier
 * ------------------------------------------------------------------
 * Saved meals are always eligible: a person built each one, by hand, on the
 * meals screen. Saved foods are not, because a "custom" FoodItem is two
 * different things wearing one `source` value — a food he created, or a row
 * describe-and-log minted from an estimate. The minted kind can be a TOTAL:
 * "a dozen nachos with beef" mints "Nachos with beef" holding all twelve
 * nachos' worth. Matching "6 nachos with beef" to that row and multiplying by
 * six is the 13,200-calorie double count this service already fought once.
 *
 * Nothing on the row says which kind it is. A name carrying "homemade" is the
 * one reliable tell: the estimate prompt is built from the noise-stripped dish
 * (`aiFoodService.estimateDishes` sends `entry.dish`), so a minted row's name
 * almost never contains it — a person typed it. Every other saved food is
 * still reached exactly as before, by the history lookup (`findInHistory`),
 * which carries the quantity in its key for precisely that total-vs-unit
 * reason.
 */

import foodQueryParser, { normalizeQuery, singularize } from './foodQueryParser.js';

const { NOISE_WORDS, STOP_TOKENS } = foodQueryParser;

/** Words that mean "made at home" — one qualifier, however it is spelled. */
const HOMEMADE_WORDS = new Set(['homemade', 'home-made', 'housemade', 'house-made']);
const HOMEMADE = 'homemade';

/** "my quesadilla" points at his own version of the dish. */
const POSSESSIVE_WORDS = new Set(['my']);

/**
 * The significant words of a phrase. Like `foodQueryParser.tokenize`, except
 * that the homemade qualifier survives (canonicalised) instead of being thrown
 * away as noise. Every other noise word ("leftover", "some", "about") still
 * drops: "leftover homemade quesadilla" is the same dish.
 */
export function significantWords(text) {
  const words = normalizeQuery(text)
    .replace(/[^\p{L}\p{N}\s%-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const out = new Set();
  let possessive = false;
  for (const word of words) {
    if (HOMEMADE_WORDS.has(word)) { out.add(HOMEMADE); continue; }
    if (POSSESSIVE_WORDS.has(word)) { possessive = true; continue; }
    if (NOISE_WORDS.has(word) || STOP_TOKENS.has(word)) continue;
    out.add(singularize(word));
  }
  return { words: out, possessive };
}

/**
 * The words a parsed entry was described with: dish, components, and the
 * qualifiers the parser stripped off the dish (`entry.qualifiers`).
 */
export function entryWords(entry) {
  const parts = [
    entry?.dish || entry?.description || '',
    ...(Array.isArray(entry?.components) ? entry.components : []),
    ...(Array.isArray(entry?.qualifiers) ? entry.qualifiers : [])
  ];
  return significantWords(parts.join(' '));
}

const withoutHomemade = (set) => [...set].filter((w) => w !== HOMEMADE).sort().join(' ');

/**
 * Does this saved NAME match these described words? See the header for the
 * rule; this is it in code.
 */
export function namesMatch(savedName, described) {
  const saved = significantWords(savedName);
  const base = withoutHomemade(saved.words);
  // A name made only of qualifiers ("Homemade") names nothing.
  if (!base) return false;
  if (base !== withoutHomemade(described.words)) return false;

  // The name's qualifier must be in the text, or pointed at with "my".
  if (saved.words.has(HOMEMADE)) {
    return described.words.has(HOMEMADE) || described.possessive;
  }
  return true;
}

/** Is this saved food one a person named, rather than one an estimate minted? */
export function isEligibleSavedFood(food) {
  return significantWords(food?.name || '').words.has(HOMEMADE);
}

/**
 * The saved item this entry names, if any.
 *
 * A saved meal outranks a saved food: it is the more deliberate act, and it is
 * what Chef reached for when he said this. Within each kind the first match
 * wins, so callers pass them most-recently-updated first — if he has two meals
 * whose names reduce to the same words, the one he touched last is the one he
 * means now.
 *
 * @param {object} entry  a `parseMealDescription` entry
 * @param {{meals?: object[], foods?: object[]}} saved
 * @returns {{kind: 'meal', meal: object} | {kind: 'food', food: object} | null}
 */
export function matchSavedItem(entry, { meals = [], foods = [] } = {}) {
  const described = entryWords(entry);
  if (described.words.size === 0) return null;

  const meal = meals.find((m) => m?.name && namesMatch(m.name, described));
  if (meal) return { kind: 'meal', meal };

  const food = foods.find((f) => f?.name && isEligibleSavedFood(f) && namesMatch(f.name, described));
  if (food) return { kind: 'food', food };

  return null;
}

export default { matchSavedItem, namesMatch, significantWords, entryWords, isEligibleSavedFood };
