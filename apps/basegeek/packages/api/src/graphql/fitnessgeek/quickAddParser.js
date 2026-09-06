/**
 * quickAddParser — turn "two eggs, toast with butter, black coffee" into a
 * *proposal*: one fragment per thing the person said they ate, each carrying a
 * search **query** (never a food), a servings count, an optional unit and a
 * meal type.
 *
 * The split of labour, and it is the whole point of the feature (AI_IDEAS.md
 * idea #2):
 *
 *   - **This file is deterministic and always runs first.** It never calls a
 *     model. Its output is the fallback the runner settles on when the daily
 *     cap is hit, aiGeek is unreachable, the model is slow, or the model
 *     answers something that does not validate.
 *   - **The model only refines.** It fixes quantities the regex missed and
 *     normalizes wording into something the catalog search can actually match
 *     ("a bowl of oatmeal w/ blueberries" → two fragments, "oatmeal" and
 *     "blueberries"). It is asked for *search queries*, not foods: nothing it
 *     returns is ever logged directly, and a query with no catalog match
 *     surfaces as "no match — search?" rather than an invented item.
 *   - **The frontend runs each query through the existing food search** and
 *     logs the ticked rows through the ordinary `addFoodLog` mutation. Nothing
 *     here writes.
 *
 * ## The hour bands
 *
 * A fragment's meal type comes from the words when the person said one
 * ("eggs for breakfast"), and from the clock otherwise. The bands are exactly
 * the ones `apps/fitnessgeek/frontend/src/pages/FoodLog.jsx` already uses for
 * the FAB's pre-selected meal (`mealTypeForNow`), because a quick-add landing
 * in a different meal than the FAB would have chosen at the same minute is a
 * bug report waiting to happen:
 *
 *   | local hour   | meal      |
 *   |--------------|-----------|
 *   | 00:00–09:59  | breakfast |
 *   | 10:00–14:59  | lunch     |
 *   | 15:00–20:59  | dinner    |
 *   | 21:00–23:59  | snack     |
 *
 * **Whose hour?** Not this process's. The gateway runs in UTC (no image
 * installs tzdata — BURN_REVIEW #13), so a server-side `new Date().getHours()`
 * is the wrong meal for anybody west of UTC every evening, which is the same
 * class of bug `requireCalendarDate()` exists to prevent one field over. So
 * `parseFoodEntry`'s `date` argument accepts the caller's **local wall clock**
 * — `YYYY-MM-DDTHH:mm` — and the hour is read from that. A bare `YYYY-MM-DD`
 * (or no argument at all) has no hour in it and falls back to this process's
 * UTC hour, which is documented, deliberate, and never taken by the frontend:
 * `quickAddService.js` always sends the wall clock.
 */

/** The four meal buckets `MEAL_TYPES` in `@geeksuite/schemas` declares. */
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Hard ceilings. A proposal longer than this is not a quick-add any more. */
export const MAX_TEXT_LENGTH = 500;
export const MAX_FRAGMENTS = 12;
export const MAX_QUERY_LENGTH = 80;
export const MAX_SERVINGS = 50;

/** Words that name a meal, and the bucket each maps to. */
const MEAL_WORDS = {
  breakfast: 'breakfast',
  brunch: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  supper: 'dinner',
  snack: 'snack',
};

const MEAL_ALTERNATION = Object.keys(MEAL_WORDS).join('|');

/**
 * A meal word only counts as *intent* in three shapes — a prepositional phrase
 * ("eggs for breakfast"), a leading label ("lunch: soup") or a bare trailing
 * word ("soup, lunch"). Matching the bare word anywhere would read "breakfast
 * burrito" as a breakfast intent AND strip the word out of the search query,
 * which is how you turn a real food into "burrito".
 */
const MEAL_INTENT_SOURCES = [
  `\\s*\\b(?:for|at|as)\\s+(?:a|an|my)?\\s*(?:${MEAL_ALTERNATION})\\b`,
  `^\\s*(?:${MEAL_ALTERNATION})\\s*[:\\-–—]\\s*`,
  `\\s*\\b(?:${MEAL_ALTERNATION})\\s*$`,
];
const MEAL_INTENT_RES = MEAL_INTENT_SOURCES.map((source) => new RegExp(source, 'i'));
const MEAL_INTENT_STRIP_RE = new RegExp(MEAL_INTENT_SOURCES.join('|'), 'ig');
const MEAL_WORD_RE = new RegExp(`\\b(${MEAL_ALTERNATION})\\b`, 'i');

/** Number words the leading-quantity reader understands. */
const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12,
  half: 0.5, quarter: 0.25, third: 1 / 3,
};

const VULGAR_FRACTIONS = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6,
  '⅐': 1 / 7, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

/**
 * Measure words. Kept deliberately short: a unit is a *hint* passed back to
 * the UI, never something the nutrition math consumes (servings is the only
 * number that reaches `addFoodLog`). Anything not on this list stays part of
 * the search query, where "2 chicken thighs" belongs.
 */
const UNITS = {
  cup: 'cup', cups: 'cup',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  g: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  ml: 'ml', l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece',
  serving: 'serving', servings: 'serving',
  scoop: 'scoop', scoops: 'scoop',
  bowl: 'bowl', bowls: 'bowl',
  plate: 'plate', plates: 'plate',
  glass: 'glass', glasses: 'glass',
  can: 'can', cans: 'can',
  bottle: 'bottle', bottles: 'bottle',
  packet: 'packet', packets: 'packet', pack: 'packet', packs: 'packet',
  bar: 'bar', bars: 'bar',
  handful: 'handful', handfuls: 'handful',
  strip: 'strip', strips: 'strip',
  square: 'square', squares: 'square',
  stick: 'stick', sticks: 'stick',
};

/** Filler that carries no meaning once the quantity has been read. */
const LEADING_FILLER = new Set(['of', 'a', 'an', 'some', 'the', 'my']);

/**
 * The hour a fragment's meal type is guessed from.
 *
 * @param {string|null|undefined} dateHint the caller's local wall clock,
 *   `YYYY-MM-DDTHH:mm` (a bare `YYYY-MM-DD` carries no hour)
 * @param {Date} [now] injectable clock, for the UTC fallback
 * @returns {number} 0-23
 */
export function hourFromDateHint(dateHint, now = new Date()) {
  const match = /^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})/.exec(String(dateHint ?? ''));
  if (match) {
    const hour = Number(match[1]);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return hour;
  }
  return now.getUTCHours();
}

/** The meal bucket a given local hour falls in. See the hour-band table above. */
export function mealTypeForHour(hour) {
  const h = Number.isFinite(hour) ? Math.trunc(hour) : 0;
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

/**
 * The meal a piece of text names *as an intent*, or null. See
 * `MEAL_INTENT_SOURCES`: "eggs for breakfast" is an intent, "breakfast
 * burrito" is a food.
 */
export function mealTypeFromText(text) {
  const value = String(text ?? '');
  for (const re of MEAL_INTENT_RES) {
    const hit = re.exec(value);
    if (hit) {
      const word = MEAL_WORD_RE.exec(hit[0]);
      if (word) return MEAL_WORDS[word[1].toLowerCase()];
    }
  }
  return null;
}

/** Cut the meal phrase out of a fragment once it has been read. */
export function stripMealPhrase(text) {
  return String(text ?? '').replace(MEAL_INTENT_STRIP_RE, ' ');
}

const collapse = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** A query has to be searchable. Punctuation alone is not a food. */
const hasContent = (value) => /[\p{L}\p{N}]/u.test(String(value ?? ''));

/**
 * Split a sentence into one fragment per thing eaten.
 *
 * Newlines, commas and semicolons are hard separators; " and ", " & ", " plus "
 * and " with also " are soft ones. `with` is deliberately NOT a separator:
 * "toast with butter" is one thing a person logs, and the model is the half of
 * this feature allowed to decide otherwise.
 */
export function splitFragments(text) {
  return String(text ?? '')
    .split(/[\n\r;,]+|\s+(?:and|&|plus)\s+/i)
    .map(collapse)
    .filter(Boolean);
}

/**
 * Read a leading quantity (and an optional measure word) off a fragment.
 *
 * @returns {{ servings: number, unit: string|null, rest: string }}
 */
export function parseQuantity(fragment) {
  let rest = collapse(fragment);
  let servings = null;

  // "half a banana" / "a couple of eggs" / "a few crackers" — the multi-word
  // openings, read before the single-token pass so "a" is not eaten alone.
  const phrase = /^(half|quarter)\s+(?:a|an|of\s+a)\s+/i.exec(rest);
  if (phrase) {
    servings = NUMBER_WORDS[phrase[1].toLowerCase()];
    rest = rest.slice(phrase[0].length);
  } else {
    const couple = /^(?:a\s+)?(couple|few|pair)\s+(?:of\s+)?/i.exec(rest);
    if (couple) {
      const word = couple[1].toLowerCase();
      servings = word === 'few' ? 3 : 2;
      rest = rest.slice(couple[0].length);
    }
  }

  if (servings === null) {
    // Ordered, longest form first. A single regex with every part optional
    // cannot do this: `(\d+)?` matches "1" out of "1/2", the optional fraction
    // group then matches empty, the overall match succeeds, and the engine
    // never backtracks — so "1/2 cup" would come out as one serving of "/2".
    let value = null;
    let consumed = 0;
    const FRACTION_CHARS = '½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞';
    const attempts = [
      // "1 1/2"
      [new RegExp('^(\\d+)\\s+(\\d+)\\s*/\\s*(\\d+)(?![\\d/])'), (m) => (Number(m[3]) > 0 ? Number(m[1]) + Number(m[2]) / Number(m[3]) : null)],
      // "1/2"
      [new RegExp('^(\\d+)\\s*/\\s*(\\d+)(?![\\d/])'), (m) => (Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null)],
      // "1½"
      [new RegExp(`^(\\d+)\\s*([${FRACTION_CHARS}])`, 'u'), (m) => Number(m[1]) + VULGAR_FRACTIONS[m[2]]],
      // "½"
      [new RegExp(`^([${FRACTION_CHARS}])`, 'u'), (m) => VULGAR_FRACTIONS[m[1]]],
      // "2", "1.5"
      [/^(\d+(?:\.\d+)?)/, (m) => parseFloat(m[1])],
    ];
    for (const [re, read] of attempts) {
      const match = re.exec(rest);
      if (!match) continue;
      const parsed = read(match);
      if (parsed != null && Number.isFinite(parsed) && parsed > 0) {
        value = parsed;
        consumed = match[0].length;
      }
      break;
    }
    if (value !== null) {
      servings = value;
      rest = rest.slice(consumed);
    }
  }

  if (servings === null) {
    const word = /^([a-z]+)\b/i.exec(rest);
    const key = word && word[1].toLowerCase();
    if (key && Object.prototype.hasOwnProperty.call(NUMBER_WORDS, key)) {
      // "a"/"an" only count as one when something follows them — a bare "an"
      // is not a quantity, it is a typo.
      const tail = rest.slice(word[0].length).trim();
      if (tail) {
        servings = NUMBER_WORDS[key];
        rest = tail;
      }
    }
  }

  // A measure word directly after the quantity ("2 cups rice", "1 cup of oats").
  let unit = null;
  if (servings !== null) {
    const measure = /^([a-z]+)\.?(?=\s|$)/i.exec(rest.trim());
    const key = measure && measure[1].toLowerCase();
    if (key && Object.prototype.hasOwnProperty.call(UNITS, key)) {
      unit = UNITS[key];
      rest = rest.trim().slice(measure[0].length);
    }
  }

  // Drop the filler the quantity left behind ("of", "a", "some").
  let cleaned = collapse(rest);
  for (;;) {
    const lead = /^([a-z]+)\b/i.exec(cleaned);
    if (!lead || !LEADING_FILLER.has(lead[1].toLowerCase())) break;
    const next = collapse(cleaned.slice(lead[0].length));
    if (!next) break;
    cleaned = next;
  }

  return { servings: servings === null ? 1 : servings, unit, rest: cleaned };
}

/** Round a servings value to something a human would type. */
const roundServings = (value) => Math.round(value * 1000) / 1000;

/**
 * The deterministic pass. Always safe to call, never touches the network.
 *
 * @param {string} text  what the person typed
 * @param {object} [opts]
 * @param {number} [opts.hour]        local hour, 0-23, for the meal-type guess
 * @param {string} [opts.mealType]    an explicit meal the caller already knows
 * @returns {{ fragments: Array<{text: string, query: string, servings: number, unit: string|null, mealType: string}> }}
 */
export function deterministicParse(text, { hour = 0, mealType = null } = {}) {
  const raw = String(text ?? '').slice(0, MAX_TEXT_LENGTH);
  const byClock = mealTypeForHour(hour);
  const explicit = MEAL_TYPES.includes(mealType) ? mealType : null;
  // A meal named anywhere in the sentence ("eggs and toast for breakfast")
  // applies to every fragment that does not name one of its own.
  const sentenceMeal = mealTypeFromText(raw);
  const fallbackMeal = explicit || sentenceMeal || byClock;

  const fragments = [];
  for (const piece of splitFragments(raw)) {
    const own = mealTypeFromText(piece);
    const withoutMeal = collapse(stripMealPhrase(piece));
    const { servings, unit, rest } = parseQuantity(withoutMeal || piece);
    const query = collapse(rest || withoutMeal || piece).slice(0, MAX_QUERY_LENGTH);
    if (!hasContent(query)) continue;
    fragments.push({
      text: piece,
      query,
      servings: roundServings(servings),
      unit,
      mealType: explicit || own || sentenceMeal || byClock,
    });
    if (fragments.length >= MAX_FRAGMENTS) break;
  }

  // Nothing parseable (punctuation only, say) — one fragment carrying the
  // whole input beats an empty proposal, because the UI can still open the
  // ordinary search with it prefilled.
  if (!fragments.length) {
    const query = collapse(raw).slice(0, MAX_QUERY_LENGTH);
    if (hasContent(query)) {
      fragments.push({ text: collapse(raw), query, servings: 1, unit: null, mealType: fallbackMeal });
    }
  }

  return { fragments };
}

/**
 * The system prompt. Two rules do the load-bearing work: *queries, never
 * foods* (so the catalog stays the only source of a logged item) and *never
 * invent* (an unreadable fragment comes back as itself, not as a guess).
 */
export const QUICK_ADD_SYSTEM_PROMPT = `You turn one line of "what I ate" into search queries for a food-log app.

You are given the person's sentence and a deterministic first pass at splitting
it. Improve that split. Return JSON only, matching the schema.

Rules, in order of importance:
1. NEVER invent a food. Every "query" must come from words the person actually
   wrote. You are producing SEARCH TERMS for a food catalog, not food items:
   no brands, no calories, no nutrition, no products they did not name.
2. One fragment per distinct thing eaten. Split a compound ("a bowl of oatmeal
   with blueberries" -> "oatmeal" and "blueberries"); keep a single thing
   together ("peanut butter toast" is one).
3. "query" is the plain food name, lower case, no quantity, no unit, no meal
   word, no filler: "two scrambled eggs" -> "scrambled eggs". At most 80
   characters. Never empty.
4. "servings" is how many of that food, as a number: "half a banana" -> 0.5,
   "2 eggs" -> 2, "a bowl of oatmeal" -> 1. Between 0 and 50. When unsure, 1.
5. "unit" is the measure word the person used ("cup", "tbsp", "slice", "oz")
   or null when they used none. It is a hint for the UI; it is never a food.
6. "mealType" is one of breakfast, lunch, dinner, snack. Use the meal the
   person named if they named one; otherwise use the "defaultMealType" you are
   given. Do not guess from the food.
7. "text" is the piece of their own sentence the fragment came from.
8. At most 12 fragments. Fewer honest ones beat more invented ones.`;

/** JSON schema for the refined proposal — the same shape the fallback produces. */
export const QUICK_ADD_SCHEMA = {
  name: 'FitnessQuickAddProposal',
  description: 'Search queries and servings parsed out of one "what I ate" sentence.',
  schema: {
    type: 'object',
    properties: {
      fragments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            query: { type: 'string' },
            servings: { type: 'number' },
            unit: { type: ['string', 'null'] },
            mealType: { type: 'string', enum: MEAL_TYPES },
          },
          required: ['text', 'query', 'servings', 'unit', 'mealType'],
          additionalProperties: false,
        },
      },
    },
    required: ['fragments'],
    additionalProperties: false,
  },
};

/**
 * The contract every proposal must satisfy before it can leave the resolver,
 * whether a model or the deterministic pass produced it. `runAIFeature` runs
 * this as its `validate`; failing it settles on the fallback.
 */
export function isValidProposal(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.fragments)) return false;
  if (data.fragments.length === 0 || data.fragments.length > MAX_FRAGMENTS) return false;
  return data.fragments.every((fragment) => {
    if (!fragment || typeof fragment !== 'object') return false;
    if (typeof fragment.query !== 'string') return false;
    const query = fragment.query.trim();
    if (!hasContent(query) || query.length > MAX_QUERY_LENGTH) return false;
    const servings = Number(fragment.servings);
    if (!Number.isFinite(servings) || servings <= 0 || servings > MAX_SERVINGS) return false;
    if (fragment.unit != null && typeof fragment.unit !== 'string') return false;
    if (!MEAL_TYPES.includes(fragment.mealType)) return false;
    return true;
  });
}

/**
 * Coerce a validated proposal into the exact GraphQL shape. Runs on the
 * fallback's output too, so both paths answer with identical field types.
 */
export function normalizeProposal(data, { mealType = 'snack' } = {}) {
  const fallbackMeal = MEAL_TYPES.includes(mealType) ? mealType : 'snack';
  const fragments = (data?.fragments || [])
    .slice(0, MAX_FRAGMENTS)
    .map((fragment) => {
      const query = collapse(fragment?.query).slice(0, MAX_QUERY_LENGTH);
      const servingsRaw = Number(fragment?.servings);
      const servings = Number.isFinite(servingsRaw) && servingsRaw > 0
        ? roundServings(Math.min(servingsRaw, MAX_SERVINGS))
        : 1;
      const unit = typeof fragment?.unit === 'string' && fragment.unit.trim()
        ? collapse(fragment.unit).slice(0, 40)
        : null;
      return {
        text: collapse(fragment?.text) || query,
        query,
        servings,
        unit,
        mealType: MEAL_TYPES.includes(fragment?.mealType) ? fragment.mealType : fallbackMeal,
      };
    })
    .filter((fragment) => hasContent(fragment.query));
  return { fragments };
}

export default {
  MEAL_TYPES,
  MAX_TEXT_LENGTH,
  MAX_FRAGMENTS,
  MAX_QUERY_LENGTH,
  MAX_SERVINGS,
  hourFromDateHint,
  mealTypeForHour,
  mealTypeFromText,
  stripMealPhrase,
  splitFragments,
  parseQuantity,
  deterministicParse,
  isValidProposal,
  normalizeProposal,
  QUICK_ADD_SCHEMA,
  QUICK_ADD_SYSTEM_PROMPT,
};
