/**
 * mealDescriptionParser — a sentence about food, turned into log entries.
 *
 * This is the front door for describe-and-log (DOCS/THE_DESCRIBE_AND_LOG_PLAN.md).
 * It is NOT the search parser: `foodQueryParser` answers "what is this person
 * looking for", and splits aggressively because a search wants candidates. This
 * answers "what did this person eat", and splits as little as possible because
 * a LOG wants one row per plate.
 *
 * The rule, and the whole reason this file exists:
 *
 *   **`with` binds to the dish before it, and any `and` inside that clause
 *   stays inside it.**
 *
 * "a dozen nachos with beef and chicken and cheese" is ONE plate of nachos with
 * three toppings — not four foods. Splitting it four ways is exactly what the
 * search parser did, and the result was a log offering beef, chicken and cheese
 * and no nachos at all.
 *
 * Entries separate on meal words, commas, and `and` at the TOP level only.
 */

import {
  normalizeQuery,
  parseFragment,
  headNounOf,
  endsWithDishNoun
} from './foodQueryParser.js';

const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

/** "supper" is dinner; everything else names itself. */
const MEAL_ALIASES = { supper: 'dinner', brunch: 'lunch' };

/** Splits ENTRIES. `and` is handled separately, because `with` outranks it. */
const SEGMENT_SPLIT = /\s*[,;]\s*|\s+then\s+/;

/** Inside one segment: what separates two standalone foods. */
const AND_SPLIT = /\s+(?:and|plus|&|\+)\s+/;

/** What introduces a component clause rather than another dish. */
const WITH_SPLIT = /\s+(?:with|w\/|topped\s+with|smothered\s+in|covered\s+in)\s+/;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY = `(${WEEKDAYS.join('|')})`;
const PART_OF_DAY = '(morning|afternoon|evening|night)';

/** What a part of the day says about the meal, when nothing else does. */
const MEAL_FROM_PART = { morning: 'breakfast', evening: 'dinner', night: 'dinner' };

/**
 * Words that say WHEN, not WHAT. Each pattern is stripped from the food text;
 * `day` is the hint handed back (null = today, which needs no question), and
 * `part` is the part of the day, if it names one.
 *
 * Order matters: longest first, so "the day before yesterday" is not read as
 * "the day before" plus "yesterday", and "yesterday morning" is one phrase.
 *
 * A bare weekday is NOT a day word. "Taco Tuesday" is a meal Chef has saved,
 * and "TGI Fridays" a place; a weekday only counts with "on", "last" or
 * "this past" in front of it, or a part of the day or a meal after it.
 */
const DAY_PATTERNS = [
  { re: /\b(?:on\s+|from\s+)?the\s+day\s+before\s+yesterday\b/, day: () => 'day_before_yesterday' },
  { re: new RegExp(`\\b(?:on\\s+|from\\s+)?yesterday(?:\\s+${PART_OF_DAY})?\\b`), day: () => 'yesterday', part: (m) => m[1] },
  { re: /\b(?:from\s+)?last\s+night\b/, day: () => 'yesterday', part: () => 'night' },
  { re: new RegExp(`\\b(?:on\\s+|from\\s+)?(?:last|this\\s+past)\\s+${WEEKDAY}(?:\\s+${PART_OF_DAY})?\\b`), day: (m) => m[1], part: (m) => m[2] },
  { re: new RegExp(`\\b(?:on\\s+|from\\s+)?${WEEKDAY}\\s+${PART_OF_DAY}\\b`), day: (m) => m[1], part: (m) => m[2] },
  { re: new RegExp(`\\bon\\s+${WEEKDAY}\\b`), day: (m) => m[1] },
  { re: new RegExp(`\\b${WEEKDAY}(?=\\s+(?:for|at)\\s+(?:breakfast|lunch|dinner|supper|brunch|snack)\\b)`), day: (m) => m[1] },
  { re: new RegExp(`\\b(?:earlier\\s+)?(?:this|today)\\s+${PART_OF_DAY}\\b`), day: () => null, part: (m) => m[1] },
  { re: /\btonight\b/, day: () => null, part: () => 'night' },
  { re: /\b(?:earlier\s+)?today\b/, day: () => null }
];

/**
 * Pull the day words out of a segment. "for dinner last night" leaves
 * "for dinner", so the meal word still counts; "last night" on its own
 * leaves an implied dinner, used only when nothing better says which meal.
 *
 * @returns {{text: string, day: string|null, impliedMeal: string|null, phrases: string[]}}
 */
export function extractDayWords(segment) {
  let text = String(segment || '');
  let day = null;
  let impliedMeal = null;
  const phrases = [];

  for (const pattern of DAY_PATTERNS) {
    let match = text.match(pattern.re);
    while (match) {
      phrases.push(match[0].trim());
      const said = pattern.day(match);
      if (said && !day) day = said;
      const part = pattern.part ? pattern.part(match) : null;
      if (part && !impliedMeal && MEAL_FROM_PART[part]) impliedMeal = MEAL_FROM_PART[part];
      text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
      match = text.match(pattern.re);
    }
  }

  return { text: text.replace(/\s+/g, ' ').trim(), day, impliedMeal, phrases };
}

/** The meal a log at this hour most likely belongs to. */
export function mealFromHour(hour) {
  const h = Number.isFinite(hour) ? hour : new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

/**
 * Pull a stated meal out of a segment, returning it and the food text without it.
 * Handles "eggs for breakfast", "breakfast: eggs" and "at lunch".
 */
function extractMeal(segment) {
  let text = segment;
  let meal = null;

  const leading = text.match(/^(breakfast|lunch|dinner|supper|brunch|snack)\s*[:\-–]\s*/i);
  if (leading) {
    meal = leading[1].toLowerCase();
    text = text.slice(leading[0].length);
  }

  const phrase = text.match(/\s*\b(?:for|at|as)\s+(?:a\s+|my\s+)?(breakfast|lunch|dinner|supper|brunch|snack)\b/i);
  if (phrase) {
    meal = phrase[1].toLowerCase();
    text = (text.slice(0, phrase.index) + text.slice(phrase.index + phrase[0].length)).trim();
  }

  if (meal) meal = MEAL_ALIASES[meal] || meal;
  return { meal: MEAL_TYPES.has(meal) ? meal : null, text: text.trim() };
}

/** Split a component clause ("beef and chicken and cheese") into its parts. */
function splitComponents(text) {
  return text
    .split(SEGMENT_SPLIT)
    .flatMap((part) => part.split(AND_SPLIT))
    .map((part) => normalizeQuery(part))
    .filter(Boolean);
}

/** A readable label for the log row. */
function describeEntry(dishText, components) {
  if (components.length === 0) return dishText;
  if (components.length === 1) return `${dishText} with ${components[0]}`;
  const last = components[components.length - 1];
  return `${dishText} with ${components.slice(0, -1).join(', ')} and ${last}`;
}

/**
 * Parse a description of what someone ate.
 *
 * @param {string} text  "a dozen nachos with beef and cheese", or a whole day
 * @param {{hour?: number, mealType?: string}} [options] local hour, for the
 *        meal guess; or `mealType`, the meal the person already picked (the
 *        meal card's "+ Add" — SIMPLE_AND_FULL_PLAN.md item 1), which beats
 *        the clock. A meal NAMED in the text ("eggs for breakfast") still
 *        wins over both: it is what he said.
 * @returns {{raw: string, normalized: string, entries: object[],
 *   dayHint: string|null, dayWords: string[]}} `dayHint` is 'yesterday',
 *   'day_before_yesterday', a weekday name, or null (today / not said).
 */
export function parseMealDescription(text, options = {}) {
  const normalized = normalizeQuery(text);
  const raw = String(text || '');
  if (!normalized) return { raw, normalized: '', entries: [], dayHint: null, dayWords: [] };

  const chosenMeal = MEAL_TYPES.has(options.mealType) ? options.mealType : null;
  const fallbackMeal = chosenMeal || mealFromHour(options.hour);
  const segments = normalized.split(SEGMENT_SPLIT).map((s) => s.trim()).filter(Boolean);

  const entries = [];
  // A meal stated once carries forward: "breakfast: eggs, toast, coffee".
  let currentMeal = null;
  // "fried chicken, fries last night": a day word on one comma segment is
  // about the whole description. When no segment names a meal outright, the
  // first meal a day word implies covers every segment, so the plate is not
  // split across lunch and dinner. A stated meal still wins from its segment on.
  const whens = segments.map((s) => extractDayWords(s));
  const anyStatedMeal = whens.some((w) => w.text && extractMeal(w.text).meal);
  if (!anyStatedMeal) currentMeal = whens.map((w) => w.impliedMeal).find(Boolean) || null;
  // When, said in words ("last night", "on monday"). Never foods. The client
  // owns the date — it asks the person and sends one — so this is only a
  // hint about what to ask (Phase 3.17).
  let dayHint = null;
  const dayWords = [];

  for (const [segmentIndex, rawSegment] of segments.entries()) {
    const when = whens[segmentIndex];
    if (when.day && !dayHint) dayHint = when.day;
    dayWords.push(...when.phrases);
    const segment = when.text;
    if (!segment) continue;

    // A meal word in this segment wins; then what its day words imply ("last
    // night" is dinner), which carries forward the same way; then a meal
    // carried from earlier; then the meal the person picked; then the clock.
    const { meal, text: foodText } = extractMeal(segment);
    if (meal) currentMeal = meal;
    else if (when.impliedMeal) currentMeal = when.impliedMeal;
    if (!foodText) continue;

    const mealType = currentMeal || fallbackMeal;

    // ── The rule: `with` outranks `and` ──────────────────────────────
    const withIndex = foodText.search(WITH_SPLIT);
    let dishText = foodText;
    let components = [];

    if (withIndex !== -1) {
      const match = foodText.match(WITH_SPLIT);
      dishText = foodText.slice(0, withIndex).trim();
      components = splitComponents(foodText.slice(withIndex + match[0].length));
    }

    // Anything before `with` may still be two standalone foods
    // ("eggs and toast with butter" — the butter is on the toast).
    const dishes = dishText.split(AND_SPLIT).map((d) => d.trim()).filter(Boolean);

    dishes.forEach((dish, index) => {
      const fragment = parseFragment(dish);
      if (!fragment) return;

      // Components attach to the LAST dish before the `with`.
      const mine = index === dishes.length - 1 ? components : [];

      entries.push({
        description: describeEntry(fragment.searchText, mine),
        dish: fragment.searchText,
        components: mine,
        servings: fragment.servings,
        unit: fragment.unit,
        preparation: fragment.preparation,
        // "homemade", "my", "leftover" — stripped from `dish` because no
        // catalog indexes them, but kept here because they are exactly what
        // tells "homemade quesadilla" (his saved meal) apart from a
        // restaurant one. See savedItemMatcher.
        qualifiers: fragment.noise,
        // Which comma/meal-word segment this came from. Entries sharing one
        // were separated only by a top-level `and`, which is exactly the
        // split that tears a saved meal name like "Fat Boy's Burger and
        // Fries" in two; the saved-meal span check rejoins them.
        segmentIndex,
        mealType,
        isDish: fragment.isDish || endsWithDishNoun(fragment.searchText),
        headNoun: headNounOf(fragment.searchText),
        tokens: fragment.tokens
      });
    });
  }

  return { raw, normalized, entries, dayHint, dayWords };
}

export default { parseMealDescription, mealFromHour, extractDayWords };
