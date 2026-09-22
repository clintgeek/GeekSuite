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
 * estimate). A miss, not a wrong answer.
 *
 * MEAL NAMES WITH "AND" IN THEM — spans of entries
 * ------------------------------------------------
 * Half of Chef's saved meals have an "and" in the name: "Fat Boy's Burger and
 * Fries", "El P's Rachero and Marg", "El P's Enchiladas Ranchera Plate and a
 * Margarita". The parser splits a top-level `and` into separate entries
 * before anything here runs — correctly, for "eggs and toast" — so no single
 * entry could ever equal those names. `matchSavedMealSpan` rejoins runs of
 * consecutive entries from the SAME segment (separated only by `and`, never by
 * a comma or a meal word) and applies the same equality rule, longest run
 * first. "fat boy's burger and fries and a coke" is the meal plus a coke.
 *
 * Spans are for meals only. A saved food is one thing; two dishes joined by
 * "and" are not one food.
 *
 * Quantity for a span is the FIRST entry's ("2 fat boy's burger and fries" is
 * two of the meal). A quantity on any later entry ("... and 3 fries") means he
 * is describing something other than the saved meal, so the span does not
 * match and the entries resolve one by one.
 *
 * FILLER WORDS — "had my regular home breakfast"
 * ----------------------------------------------
 * A few eating verbs and "i" are ignored on both sides, so the way people
 * actually say it ("I had my regular home breakfast") neither adds words nor
 * blocks a match. The trade-off: a saved meal NAMED with one of these words
 * ("Got Milk Shake") loses that word for matching. A name that depends on an eating verb is implausible enough to
 * accept that.
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
 * How people say they ate something, not what they ate. See the header for
 * the trade-off. Deliberately short: every word added here is a word a saved
 * name can no longer be told apart by.
 */
const FILLER_WORDS = new Set([
  'i', 'had', 'have', 'having', 'ate', 'eat', 'eating', 'got', 'grabbed'
]);

/** Longest run of `and`-joined entries tried as one meal name. */
const MAX_SPAN = 4;

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
    if (NOISE_WORDS.has(word) || STOP_TOKENS.has(word) || FILLER_WORDS.has(word)) continue;
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

/**
 * The words of several entries read as ONE name: dishes rejoined with the
 * `and` the parser split on, plus every entry's components and qualifiers.
 */
export function spanWords(entries) {
  return entryWords({
    dish: entries.map((e) => e?.dish || e?.description || '').join(' and '),
    components: entries.flatMap((e) => (Array.isArray(e?.components) ? e.components : [])),
    qualifiers: entries.flatMap((e) => (Array.isArray(e?.qualifiers) ? e.qualifiers : []))
  });
}

/**
 * Saved meals whose names span several consecutive entries. See the header.
 *
 * Returns non-overlapping spans, each `{start, end, meal}` (inclusive indexes
 * into `entries`), found left to right with the longest run tried first at
 * each position. Entries without a `segmentIndex` never join a span — only
 * the parser can say two entries were split by `and` rather than a comma.
 *
 * @param {object[]} entries  `parseMealDescription` entries, in order
 * @param {{meals?: object[]}} saved
 */
export function matchSavedMealSpans(entries, { meals = [] } = {}) {
  const spans = [];
  if (!Array.isArray(entries) || meals.length === 0) return spans;

  let start = 0;
  while (start < entries.length) {
    const segment = entries[start]?.segmentIndex;
    let found = null;

    if (segment !== undefined && segment !== null) {
      let last = start;
      while (
        last + 1 < entries.length &&
        last + 1 - start < MAX_SPAN &&
        entries[last + 1]?.segmentIndex === segment
      ) last += 1;

      for (let end = last; end > start && !found; end -= 1) {
        const run = entries.slice(start, end + 1);
        // A later quantity changes the meal; see the header.
        if (run.slice(1).some((e) => Number(e?.servings ?? 1) !== 1)) continue;
        const described = spanWords(run);
        const meal = meals.find((m) => m?.name && namesMatch(m.name, described));
        if (meal) found = { start, end, meal };
      }
    }

    if (found) {
      spans.push(found);
      start = found.end + 1;
    } else {
      start += 1;
    }
  }
  return spans;
}

export default {
  matchSavedItem,
  matchSavedMealSpans,
  namesMatch,
  significantWords,
  entryWords,
  spanWords,
  isEligibleSavedFood
};
