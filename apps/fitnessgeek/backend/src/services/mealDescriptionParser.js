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
 * @param {{hour?: number}} [options] local hour, for the meal guess
 * @returns {{raw: string, normalized: string, entries: object[]}}
 */
export function parseMealDescription(text, options = {}) {
  const normalized = normalizeQuery(text);
  const raw = String(text || '');
  if (!normalized) return { raw, normalized: '', entries: [] };

  const fallbackMeal = mealFromHour(options.hour);
  const segments = normalized.split(SEGMENT_SPLIT).map((s) => s.trim()).filter(Boolean);

  const entries = [];
  // A meal stated once carries forward: "breakfast: eggs, toast, coffee".
  let currentMeal = null;

  for (const segment of segments) {
    const { meal, text: foodText } = extractMeal(segment);
    if (meal) currentMeal = meal;
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
        mealType,
        isDish: fragment.isDish || endsWithDishNoun(fragment.searchText),
        headNoun: headNounOf(fragment.searchText),
        tokens: fragment.tokens
      });
    });
  }

  return { raw, normalized, entries };
}

export default { parseMealDescription, mealFromHour };
