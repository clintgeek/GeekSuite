/**
 * aiFoodService — the food-domain AI features: parsing a sentence into food
 * items, classifying an input for the right lookup strategy, and scoring and
 * sanity-checking search results.
 *
 * This is `baseGeekAIService.js` with its transport removed. It used to own an
 * axios wrapper over `/openai/v1/chat/completions` with `model:
 * 'basegeek-app'`, a 30-second timeout and a `throw` on every failure; the
 * calls now go through `aiGeekClient.feature()` (aiGeek's front door), which
 * answers `{ ok: false, reason }` instead of throwing. Every method below is
 * therefore total: it returns something useful whether or not a model
 * answered.
 *
 * Features used here: `foodParse`, `foodClassify`, `foodScore`,
 * `foodSanityCheck`.
 */

import logger from '../config/logger.js';
import aiGeekClient from './aiGeekClient.js';

const COMMON_BRAND_HINTS = [
  'Starbucks',
  "McDonald's",
  'Chipotle',
  'Chick-fil-A',
  'Dunkin',
  'Burger King',
  'Taco Bell',
  "Domino's",
  'Subway',
  'Panera Bread',
  'Panda Express',
  'KFC',
  'Wendy\'s',
  'Costco',
  "Trader Joe's",
  'Whole Foods Market'
];

const BRAND_SYNONYMS = {
  "McDonald's": ["mc donalds", "mc d", "mcd's", 'mcds', 'mcd', "mickey d's", 'mickey ds', 'macdonalds'],
  'Starbucks': ['sbux', 'starbux', 'star bucks', 'starbuck\'s'],
  'Chipotle': ['chipoltle', 'chipolte', 'chipotle mexican grill'],
  'Chick-fil-A': ['chickfila', 'chikfila', 'chik fil a', 'chick fil a', 'cfa'],
  'Dunkin': ['dunkin donuts', 'dunkindonuts', "dunkin'"],
  'Burger King': ['bk', 'burgerking'],
  'Taco Bell': ['t bell', 'tbell', 'taco-bell', 'tacobell'],
  "Domino's": ['dominos', 'domino pizza'],
  'Panera Bread': ['panera', 'panerabread', 'st louis bread company'],
  'Panda Express': ['pandaexpress', 'panda exp', 'panda chinese'],
  'Wendy\'s': ['wendys'],
  'KFC': ['kentucky fried chicken'],
  'Costco': ['costco food court'],
  "Trader Joe's": ['trader joes', 'tj\'s'],
  'Whole Foods Market': ['wholefoods', 'whole foods']
};

const BRAND_SYNONYM_GUIDANCE = [
  "McD's / Mickey D's → McDonald's",
  'Sbux → Starbucks',
  'Chikfila / CFA → Chick-fil-A',
  'T Bell / Tbell → Taco Bell',
  'BK → Burger King'
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Quantity words the deterministic split understands. */
const WORD_QUANTITIES = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  half: 0.5, 'a half': 0.5, couple: 2, dozen: 12
};

const UNIT_WORDS = [
  'cup', 'cups', 'oz', 'ounce', 'ounces', 'g', 'gram', 'grams', 'lb', 'lbs',
  'slice', 'slices', 'piece', 'pieces', 'bottle', 'bottles', 'can', 'cans',
  'serving', 'servings', 'bowl', 'bowls', 'glass', 'glasses', 'tbsp', 'tsp'
];

const FILLER_WORDS = new Set([
  'of', 'with', 'and', 'plus', 'some', 'the', 'my', 'for', 'a', 'an'
]);

/**
 * Which model judges a plate of food.
 *
 * Env-configurable on purpose. On 2026-09-15 three model slugs that aiGeek had
 * cached as working — including `meta-llama/llama-3.1-70b-instruct:free` — had
 * been retired by OpenRouter and 404'd, and every pin to them fell back
 * silently. Model names rot, so this one must be changeable without a deploy.
 *
 * DEFAULT: UNPINNED, and that is a measured decision rather than laziness.
 * Chef's requirement is that logging feels instant. Measured 2026-09-15 on the
 * same prompt:
 *
 *   rotation (groq, 7B)          ~1s      variable, occasionally silly
 *   mistral-small-24b            5.7s     good
 *   gpt-oss-120b                 4.7-20s  good, but it is a REASONING model and
 *                                         burns hidden tokens before answering
 *   mistral-nemo                 13.4s    good
 *
 * Every better model costs five to twenty seconds, and this call sits on the
 * critical path between Chef saying what he ate and seeing it logged. So the
 * inline estimate stays fast, and quality is recovered off the critical path by
 * the background judge (`DISH_JUDGE_*`), which may correct an entry after the
 * fact. Anything he eats twice skips the model entirely via history.
 *
 * Set both to pin; either alone is ignored by aiGeek.
 */
const DISH_ESTIMATE_PROVIDER = process.env.DISH_ESTIMATE_PROVIDER || '';
const DISH_ESTIMATE_MODEL = process.env.DISH_ESTIMATE_MODEL || '';

/**
 * The background judge. Allowed to be slow, because nothing waits on it.
 *
 * Pinned to a DIFFERENT provider and family from the estimator on purpose: the
 * estimator runs on groq's Llama-derived 7B, so asking the same family again
 * would mostly rubber-stamp its own mistakes. `gpt-oss-120b` is a reasoning
 * model, which is exactly wrong inline (4.7-20s) and exactly right here —
 * "is 200g of carbs reasonable for two slices of pizza?" IS a reasoning
 * question.
 *
 * **Deliberately still a pin, not a `need`** (2026-09-15). The estimator now
 * sends `need: 'structured:fast'`, and the obvious next step looks like giving
 * this one `need: 'reasoning:deep'`. It is not, yet: aiGeek has no measurement
 * that separates a good reasoner from a bad one — that is what the golden set
 * is for (DOCS/AIGEEK_CAPABILITY_ROUTING.md §3.2) — so `reasoning` does not
 * filter anything today. This model was chosen by measuring its answers against
 * three others. Trading a measured choice for a resolver that cannot yet beat
 * it would be a regression wearing progress's clothes. Revisit when the golden
 * set lands.
 */
const DISH_JUDGE_PROVIDER = process.env.DISH_JUDGE_PROVIDER || 'openrouter';
const DISH_JUDGE_MODEL = process.env.DISH_JUDGE_MODEL || 'openai/gpt-oss-120b';

/**
 * Structured-output schema for `dishJudge`.
 *
 * `{ name, schema }` is the envelope aiGeek's door requires — it validates
 * `schema must be { name, description?, schema }` and answers 400
 * INVALID_SCHEMA otherwise. Both of these constants were raw JSON Schema when
 * they shipped, so every estimate and every judge call 400'd from the first
 * one, and fitnessgeek reported it as the generic "Dish estimate unavailable".
 * Nothing caught it because the tests mock `aiGeekClient` at the boundary
 * BELOW this, so the envelope was never exercised against the real validator.
 */
const DISH_JUDGE_SCHEMA = {
  name: 'dish_judge',
  description: 'Whether each logged entry has a believable calorie total',
  schema: {
    type: 'object',
    properties: {
      verdicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            reasonable: { type: 'boolean' },
            better_calories: { type: 'number' },
            why: { type: 'string' }
          },
          required: ['index', 'reasonable']
        }
      }
    },
    required: ['verdicts']
  }
};

/** Structured-output schema for `dishEstimate`. See DISH_JUDGE_SCHEMA on the envelope. */
const DISH_ESTIMATE_SCHEMA = {
  name: 'dish_estimate',
  description: 'One nutrition estimate per described dish',
  schema: {
    type: 'object',
    properties: {
      dishes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            name: { type: 'string' },
            serving_description: { type: 'string' },
            calories: { type: 'number' },
            protein_grams: { type: 'number' },
            carbs_grams: { type: 'number' },
            fat_grams: { type: 'number' },
            low_calories: { type: 'number' },
            high_calories: { type: 'number' }
          },
          required: ['index', 'name', 'calories', 'protein_grams', 'carbs_grams', 'fat_grams']
        }
      }
    },
    required: ['dishes']
  }
};

const MEAL_WORDS = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', supper: 'dinner', snack: 'snack' };

class AIFoodService {

  // ============================================
  // DETERMINISTIC FALLBACK
  // ============================================

  /**
   * Split a sentence into food items with no model at all.
   *
   * This is the fallback for `foodParse`, and it is deliberately honest about
   * what it does not know: it splits on commas / "and", pulls a leading
   * quantity and unit off each fragment, guesses the meal type from the clock,
   * and reports `nutrition: null`. A split with no numbers is useful — the
   * caller can search the catalog for each name. Invented calories are not.
   *
   * @param {string} description
   * @param {{hour?: number}} [options]
   * @returns {{food_items: Array, meal_type: string, estimated_calories: null,
   *            confidence: 'low', source: 'deterministic'}}
   */
  deterministicParse(description, options = {}) {
    const raw = String(description || '').slice(0, 2000);
    const hour = Number.isFinite(options.hour) ? options.hour : new Date().getHours();

    const mealFromClock = hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 21 ? 'dinner' : 'snack';
    const namedMeal = Object.keys(MEAL_WORDS)
      .find((word) => new RegExp(`\\b${word}\\b`, 'i').test(raw));
    const mealType = namedMeal ? MEAL_WORDS[namedMeal] : mealFromClock;

    const fragments = raw
      .split(/\s*(?:,|;|\band\b|\bplus\b|\bwith\b|\+|\/)\s*/i)
      .map((piece) => piece.trim())
      .filter(Boolean);

    const foodItems = [];
    for (const fragment of fragments) {
      const parsed = this.parseFragment(fragment);
      if (parsed) foodItems.push(parsed);
      if (foodItems.length >= 12) break;
    }

    // Nothing parseable (punctuation only, a bare meal word): one item
    // carrying the whole input still lets the UI open a search with it.
    if (foodItems.length === 0) {
      const whole = this.stripFiller(raw);
      if (whole) {
        foodItems.push({
          name: whole,
          servings: 1,
          estimated_serving_size: 'serving',
          nutrition: null
        });
      }
    }

    return {
      food_items: foodItems,
      meal_type: mealType,
      estimated_calories: null,
      confidence: 'low',
      source: 'deterministic'
    };
  }

  /** One fragment → one food item, or null when there is no food word left. */
  parseFragment(fragment) {
    const tokens = fragment.toLowerCase().split(/\s+/).filter(Boolean);
    let servings = 1;
    let unit = null;
    let index = 0;

    // A leading numeral or quantity word.
    if (tokens[index] != null) {
      const numeric = parseFloat(tokens[index]);
      if (Number.isFinite(numeric) && numeric > 0 && numeric <= 200) {
        servings = numeric;
        index += 1;
      } else if (WORD_QUANTITIES[tokens[index]] != null) {
        servings = WORD_QUANTITIES[tokens[index]];
        index += 1;
      }
    }

    // An optional unit right after the quantity.
    if (tokens[index] && UNIT_WORDS.includes(tokens[index])) {
      unit = tokens[index].replace(/s$/, '');
      index += 1;
    }

    const name = this.stripFiller(tokens.slice(index).join(' '));
    if (!name) return null;
    if (MEAL_WORDS[name]) return null; // "for breakfast" is not a food

    return {
      name,
      servings: Math.round(servings * 100) / 100,
      estimated_serving_size: unit || 'serving',
      nutrition: null
    };
  }

  stripFiller(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .split(/\s+/)
      .filter((word, position, all) => {
        if (!word) return false;
        // Filler only counts at the edges — "peanut butter and jelly" has
        // already been split, so a surviving "and" is noise.
        if (!FILLER_WORDS.has(word)) return true;
        return position !== 0 && position !== all.length - 1;
      })
      .join(' ')
      .trim()
      .slice(0, 120);
  }

  // ============================================
  // FEATURE: dishEstimate
  // ============================================

  /**
   * Estimate what a described plate of food actually contained.
   *
   * This is the feature that makes describe-and-log possible, and it is a
   * deliberate reversal of how this file used to work. Every other path here
   * refuses to invent a food: `parseFoodDescription` returns a split with
   * `nutrition: null` rather than guess, because a made-up number looks exactly
   * like a real one. Chef chose the other trade knowingly (see
   * DOCS/THE_DESCRIBE_AND_LOG_PLAN.md §5): he does not log at all, and an
   * entry that is roughly right every day beats a precise entry never.
   *
   * So this asks for a judgement, not a lookup. The bar is "reasonable for the
   * description" — a nacho plate at 960 or 1,220 are both fine answers. What it
   * must NOT do is invent dishes nobody mentioned, which is why the prompt and
   * the caller both pin results to the input by index.
   *
   * `low_calories`/`high_calories` carry the model's own uncertainty, and that
   * spread — not a confidence word — is what decides whether we ask Chef a
   * question.
   *
   * @param {Array<{dish: string, components: string[], servings: number, unit: string|null}>} entries
   * @param {{userId?: string}} [options] the per-day cap bucket
   * @returns {Promise<{ok: boolean, dishes: object[], reason: string|null, provenance: object|null}>}
   */
  async estimateDishes(entries, options = {}) {
    const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (list.length === 0) {
      return { ok: false, dishes: [], reason: 'no-entries', provenance: null };
    }

    const described = list.map((entry, index) => {
      const parts = [`${index + 1}. ${entry.dish}`];
      if (entry.components?.length) parts.push(`(with ${entry.components.join(', ')})`);
      const count = Number(entry.servings) > 1 ? ` — TOTAL amount eaten: ${entry.servings}${entry.unit ? ' ' + entry.unit : ''}` : '';
      return parts.join(' ') + count;
    }).join('\n');

    const result = await aiGeekClient.feature('dishEstimate', {
      quotaKey: options.userId,
      // Chef is waiting on this one, so it asks for a row aiGeek has *measured*
      // as both JSON-capable and quick, rather than taking whatever the
      // rotation offers. Unpinned by default, so before this it got whatever
      // came up — which is how a retired slug served this feature for a day.
      // An env pin still wins; see DISH_ESTIMATE_PROVIDER above.
      need: 'structured:fast',
      ...(DISH_ESTIMATE_PROVIDER && DISH_ESTIMATE_MODEL
        ? { provider: DISH_ESTIMATE_PROVIDER, model: DISH_ESTIMATE_MODEL }
        : {}),
      system: 'You are estimating the nutrition of real meals for a food log. Return ONLY valid JSON.',
      user: this.buildDishEstimatePrompt(described),
      schema: DISH_ESTIMATE_SCHEMA,
      maxTokens: 900,
      temperature: 0.2
    }, { timeoutMs: 20000 });

    if (!result.ok) {
      logger.warn({ reason: result.reason, count: list.length }, 'Dish estimate unavailable');
      return { ok: false, dishes: [], reason: result.reason, provenance: result.provenance };
    }

    const dishes = this.parseDishEstimateResponse(result.data, list.length);
    if (dishes.length === 0) {
      return { ok: false, dishes: [], reason: 'unparseable', provenance: result.provenance };
    }

    return { ok: true, dishes, reason: null, provenance: result.provenance };
  }

  buildDishEstimatePrompt(describedList) {
    return `Estimate the nutrition of each dish below, as actually served.

Dishes:
${describedList}

Rules:
- Return EXACTLY one result per numbered dish, using the same index. Never add a dish that is not listed, and never split one dish into several.
- Give nutrition for the FULL amount described, as a single entry. If it says 12 nachos, give the numbers for all twelve together. The caller does NOT multiply — whatever you return is what gets logged.
- Assume a normal restaurant or home portion for the dish as described. If it says homemade, assume a home portion; if it names a restaurant, assume a restaurant portion.
- Components in brackets are toppings or fillings that are part of that one dish. Include them in that dish's numbers. Do not return them separately.
- Be reasonable rather than precise. Being 20% out is fine and expected.
- low_calories and high_calories should express your genuine uncertainty for this dish as described. If the description could plausibly mean a small home plate or a large restaurant plate, say so with a wide range.

Return JSON of the form:
{"dishes":[{"index":1,"name":"<the dish, named back>","serving_description":"<the amount>","calories":0,"protein_grams":0,"carbs_grams":0,"fat_grams":0,"low_calories":0,"high_calories":0}]}

Use your own numbers. The shape above is a template, not an answer.`;
  }

  /** Read the model's answer, keeping only rows that map back to a real input. */
  parseDishEstimateResponse(responseText, expectedCount) {
    try {
      const text = typeof responseText === 'string' ? responseText : JSON.stringify(responseText);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return [];

      const parsed = JSON.parse(match[0]);
      const rows = Array.isArray(parsed?.dishes) ? parsed.dishes : [];

      return rows
        .map((row) => {
          const index = Number(row?.index);
          if (!Number.isInteger(index) || index < 1 || index > expectedCount) return null;
          const calories = Number(row?.calories);
          if (!Number.isFinite(calories) || calories < 0) return null;

          // Only a genuine number counts. A 7B model has answered this with
          // `false`/`true` before now, and `Number(false)` is 0 — which would
          // have become a silent, meaningless "range" of 0 to 1.
          const asCalories = (value) =>
            typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
          let low = asCalories(row?.low_calories);
          let high = asCalories(row?.high_calories);
          if (low != null && high != null && low > high) [low, high] = [high, low];

          return {
            index: index - 1,
            name: String(row?.name || '').trim(),
            servingDescription: String(row?.serving_description || 'serving').trim(),
            nutrition: {
              calories_per_serving: Math.round(calories),
              protein_grams: Math.max(0, Number(row?.protein_grams) || 0),
              carbs_grams: Math.max(0, Number(row?.carbs_grams) || 0),
              fat_grams: Math.max(0, Number(row?.fat_grams) || 0)
            },
            lowCalories: low,
            highCalories: high
          };
        })
        .filter(Boolean);
    } catch (error) {
      logger.warn({ err: error }, 'Failed to read dish estimate response');
      return [];
    }
  }

  // ============================================
  // FEATURE: dishJudge
  // ============================================

  /**
   * A second opinion on entries that were ESTIMATED, after they are already
   * logged.
   *
   * Only estimates are judged. A history hit is a number Chef already accepted;
   * a catalog hit is published fact. Re-litigating either would spend a model
   * call to second-guess something more trustworthy than the model.
   *
   * The hard-won rule this obeys: a judge is only worth its latency if its
   * verdict changes what Chef sees. `applySanityCheck` used to make a second
   * LLM call setting `sanityCheckPassed` / `Issues` / `Confidence` — three
   * fields no frontend code ever read. Deleted 2026-09-14. So this returns a
   * BETTER NUMBER, not an opinion, and the caller writes it.
   *
   * @param {Array<{name: string, servings: number, calories: number, nutrition: object}>} entries
   * @param {{userId?: string}} [options]
   * @returns {Promise<{ok: boolean, verdicts: object[], reason: string|null, provenance: object|null}>}
   */
  async judgeEntries(entries, options = {}) {
    const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (list.length === 0) {
      return { ok: false, verdicts: [], reason: 'no-entries', provenance: null };
    }

    const described = list.map((e, i) => {
      const n = e.nutrition || {};
      return `${i + 1}. ${e.name} — logged as ${e.calories} cal total `
        + `(P${n.protein_grams || 0} C${n.carbs_grams || 0} F${n.fat_grams || 0})`;
    }).join('\n');

    const result = await aiGeekClient.feature('dishJudge', {
      quotaKey: options.userId,
      ...(DISH_JUDGE_PROVIDER && DISH_JUDGE_MODEL
        ? { provider: DISH_JUDGE_PROVIDER, model: DISH_JUDGE_MODEL }
        : {}),
      system: 'You are checking a food log for obviously wrong numbers. Return ONLY valid JSON.',
      user: `Each line is an entry already written to a food log. For each one, say whether the calorie total is reasonable for that food and amount.

${described}

Rules:
- Judge the TOTAL shown, for the amount described. Do not re-scale it.
- "Reasonable" is generous: anything within about a third of what you would expect is fine. A plate of nachos at 960 or 1,220 calories are both reasonable answers.
- Mark reasonable=false ONLY for something clearly wrong — a factor of two or more out, or macros that could not belong to that food.
- When reasonable=false, give better_calories: your own total for that food and amount, and one short clause in "why".
- Return exactly one verdict per numbered line, same index.

Return JSON: {"verdicts":[{"index":1,"reasonable":true},{"index":2,"reasonable":false,"better_calories":0,"why":""}]}`,
      schema: DISH_JUDGE_SCHEMA,
      maxTokens: 700,
      temperature: 0.1
    }, { timeoutMs: 45000 });

    if (!result.ok) {
      logger.warn({ reason: result.reason, count: list.length }, 'Dish judge unavailable');
      return { ok: false, verdicts: [], reason: result.reason, provenance: result.provenance };
    }

    return {
      ok: true,
      verdicts: this.parseJudgeResponse(result.data, list.length),
      reason: null,
      provenance: result.provenance
    };
  }

  /** Read the judge's answer, keeping only verdicts that map to a real entry. */
  parseJudgeResponse(responseText, expectedCount) {
    try {
      const text = typeof responseText === 'string' ? responseText : JSON.stringify(responseText);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return [];

      const rows = JSON.parse(match[0])?.verdicts;
      if (!Array.isArray(rows)) return [];

      return rows.map((row) => {
        const index = Number(row?.index);
        if (!Number.isInteger(index) || index < 1 || index > expectedCount) return null;
        const better = typeof row?.better_calories === 'number' && Number.isFinite(row.better_calories)
          ? Math.round(row.better_calories)
          : null;
        return {
          index: index - 1,
          reasonable: row?.reasonable !== false,
          betterCalories: better != null && better > 0 ? better : null,
          why: String(row?.why || '').trim().slice(0, 160)
        };
      }).filter(Boolean);
    } catch (error) {
      logger.warn({ err: error }, 'Failed to read judge response');
      return [];
    }
  }

  // ============================================
  // FEATURE: foodParse
  // ============================================

  /**
   * Parse a natural language food description into structured nutrition data.
   *
   * @param {string} description - Natural language food description
   * @param {Object} userContext - Optional user dietary context
   * @param {Object} [options] - `{ hour }` for the deterministic meal-type
   *        guess, and `{ userId }` as the per-day cap bucket (`quotaKey`)
   * @returns {Promise<{ok: boolean, source: 'model'|'fallback', data: Object,
   *                    reason: string|null, provenance: Object|null}>}
   *          Always resolves; `data` is a parsed proposal either way.
   */
  async parseFoodDescription(description, userContext = {}, options = {}) {
    const result = await aiGeekClient.feature('foodParse', {
      quotaKey: options.userId,
      system: 'You are a nutrition expert. Return ONLY valid JSON, no explanations.',
      user: this.buildFoodParsingPrompt(description, userContext),
      maxTokens: 1000,
      temperature: 0.2
    }, { timeoutMs: 30000 });

    if (result.ok) {
      const parsed = this.parseFoodAIResponse(result.data);
      if (parsed) {
        return { ok: true, source: 'model', data: parsed, reason: null, provenance: result.provenance };
      }
      // The model answered with something that will not parse. That is an
      // `unparseable`, and it takes the same fallback as a missing model.
      logger.warn('AI food parse returned unusable content — falling back to the split');
      return {
        ok: false,
        source: 'fallback',
        data: this.deterministicParse(description, options),
        reason: 'unparseable',
        provenance: result.provenance
      };
    }

    return {
      ok: false,
      source: 'fallback',
      data: this.deterministicParse(description, options),
      reason: result.reason,
      provenance: result.provenance
    };
  }

  buildFoodParsingPrompt(description, userContext) {
    return `You are a nutrition expert helping to parse natural language food descriptions into structured JSON data.

    User's dietary context: ${JSON.stringify(userContext)}

    Please parse this food description: "${description}"

    Return ONLY a valid JSON object following this EXACT structure (no explanations or extra text):

    {
      "food_items": [
        {
          "name": "Food name",
          "servings": number,
          "estimated_serving_size": "1 cup, 1 piece, 100 grams, etc.",
          "nutrition": {
            "calories_per_serving": number,
            "protein_grams": number,
            "carbs_grams": number,
            "fat_grams": number,
            "fiber_grams": number,
            "sugar_grams": number
          }
        }
      ],
      "meal_type": "breakfast|lunch|dinner|snack",
      "estimated_calories": number,
      "confidence": "high|medium|low"
    }

    Guidelines:
    - Nutrition values correspond to one serving.
    - Round nutrition values to whole numbers (use one decimal for values under 1g).
    - Use common food names.
    - Use standard serving units.
    - Respect user's dietary restrictions strictly.
    - If uncertain about meal_type, default to "snack".
    - Confidence should reflect parsing certainty.

    Example output:
    {
      "food_items": [
        {
          "name": "Grilled chicken breast",
          "servings": 1,
          "estimated_serving_size": "4 oz",
          "nutrition": {
            "calories_per_serving": 180,
            "protein_grams": 35,
            "carbs_grams": 0,
            "fat_grams": 4,
            "fiber_grams": 0,
            "sugar_grams": 0
          }
        }
      ],
      "meal_type": "lunch",
      "estimated_calories": 180,
      "confidence": "high"
    }`;
  }

  /**
   * Classify food input to determine the best lookup strategy
   * This is a CHEAP call - just classification, no nutrition estimation
   *
   * @param {string} input - User's food input
   * @returns {Promise<Object>} Classification result
   */
  async classifyFoodInput(input) {
    const classificationContext = this.prepareClassificationInput(input);
    const prompt = this.buildClassificationPrompt(
      classificationContext.normalizedInput,
      classificationContext
    );
    const result = await aiGeekClient.feature('foodClassify', {
      system: 'You are a food classification expert. Return ONLY valid JSON.',
      user: prompt,
      maxTokens: 300,     // Small response = cheap
      temperature: 0.1    // Very deterministic
    }, { timeoutMs: 20000 });

    // `parseClassificationResponse` already has the deterministic answer for
    // unusable content — type `unknown`, the whole input as one item, the
    // words as search terms — which is exactly the right answer when no model
    // replied either. Feeding it the empty string reaches that branch.
    const parsed = this.parseClassificationResponse(
      result.ok ? result.data : (classificationContext.normalizedInput || String(input || ''))
    );
    const enriched = {
      ...parsed,
      detected_brands: classificationContext.detectedBrands,
      normalized_query: classificationContext.normalizedInput
    };

    logger.debug({
      originalInput: input,
      normalizedInput: classificationContext.normalizedInput,
      detectedBrands: classificationContext.detectedBrands,
      resolvedBrand: parsed.brand,
      type: parsed.type
    }, 'AI classification metadata');

    return enriched;
  }

  prepareClassificationInput(input) {
    const rawInput = input || '';
    let normalizedInput = rawInput;
    const detectedBrandSet = new Set();
    const lowerInput = rawInput.toLowerCase();

    Object.entries(BRAND_SYNONYMS).forEach(([canonical, variants]) => {
      const variantList = [canonical].concat(variants || []);
      variantList.forEach((variant) => {
        const regex = new RegExp(`\\b${escapeRegExp(variant)}\\b`, 'gi');
        if (regex.test(normalizedInput)) {
          detectedBrandSet.add(canonical);
          normalizedInput = normalizedInput.replace(regex, canonical);
        }
      });
    });

    COMMON_BRAND_HINTS.forEach((brand) => {
      if (lowerInput.includes(brand.toLowerCase())) {
        detectedBrandSet.add(brand);
      }
    });

    return {
      normalizedInput: normalizedInput.trim(),
      detectedBrands: Array.from(detectedBrandSet)
    };
  }

  /**
   * Score API results for relevance to the original query
   * This is a CHEAP call - just scoring, returns quickly
   *
   * @param {string} originalQuery - What the user asked for
   * @param {Array} results - API results to score
   * @returns {Promise<Array>} Results with AI confidence scores applied
   */
  async scoreResultsRelevance(originalQuery, results) {
    if (!results || results.length === 0) {
      return results;
    }

    // Build a compact list for the AI to score
    const resultList = results.slice(0, 15).map((r, i) =>
      `${i + 1}. "${r.name}"${r.brand ? ` (${r.brand})` : ''} - ${r.source}`
    ).join('\n');

    const prompt = `Score how well each food result matches what the user asked for.

User's query: "${originalQuery}"

Results to score:
${resultList}

Return ONLY a JSON array with scores (0-100):
[
  {"index": 1, "score": 85, "reason": "exact match"},
  {"index": 2, "score": 40, "reason": "wrong type of food"}
]

Scoring guide:
- 90-100: Exact or near-exact match
- 70-89: Good match, minor differences
- 50-69: Partial match, may not be what user wants
- 30-49: Poor match, likely wrong item
- 0-29: Completely irrelevant`;

    // Scoring is a ranking nicety, so the fallback is the caller's own order.
    // `ok: false` here is not worth telling anyone about.
    const result = await aiGeekClient.feature('foodScore', {
      system: 'You are a food matching expert. Return ONLY valid JSON.',
      user: prompt,
      maxTokens: 400,
      temperature: 0.1
    }, { timeoutMs: 20000 });

    if (!result.ok) return results;

    try {
      const jsonMatch = String(result.data || '').match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn('AI scoring returned no JSON');
        return results;
      }

      const scores = JSON.parse(jsonMatch[0]);

      return results.map((entry, i) => {
        const scoreEntry = scores.find(s => s.index === i + 1);
        return {
          ...entry,
          aiRelevanceScore: scoreEntry?.score || 50,
          aiScoreReason: scoreEntry?.reason || 'not scored'
        };
      });
    } catch (error) {
      logger.error({ err: error }, 'AI result scoring could not be read');
      return results;
    }
  }

  /**
   * Final sanity check - validates that results match user intent
   *
   * @param {string} originalQuery - What the user asked for
   * @param {Array} topResults - Top results to validate
   * @returns {Promise<Object>} Validation result with issues
   */
  async sanityCheckResults(originalQuery, topResults) {
    if (!topResults || topResults.length === 0) {
      return { valid: true, issues: [] };
    }

    const resultList = topResults.map((r, i) =>
      `${i + 1}. "${r.name}"${r.brand ? ` (${r.brand})` : ''} - ${r.nutrition?.calories_per_serving || '?'} cal`
    ).join('\n');

    const prompt = `Sanity check: Do these food results match what the user asked for?

User asked for: "${originalQuery}"

We're returning:
${resultList}

Return ONLY JSON:
{
  "valid": true/false,
  "issues": ["description of any problems"],
  "confidence": "high|medium|low"
}

Flag issues like wrong food type, brand mismatches, or irrelevant items.`;

    // No model, no objection: the results stand as they came from the APIs.
    const result = await aiGeekClient.feature('foodSanityCheck', {
      system: 'You are a food matching expert. Return ONLY valid JSON.',
      user: prompt,
      maxTokens: 200,
      temperature: 0.1
    }, { timeoutMs: 20000 });

    if (!result.ok) return { valid: true, issues: [], confidence: 'unknown' };

    try {
      const jsonMatch = String(result.data || '').match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { valid: true, issues: [], confidence: 'low' };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      logger.error({ err: error }, 'AI sanity check failed');
      return { valid: true, issues: [], confidence: 'unknown' };
    }
  }

  buildClassificationPrompt(input, context = {}) {
    const detectedBrands = context.detectedBrands || [];
    const brandDictionary = COMMON_BRAND_HINTS.join(', ');
    const synonymGuidance = BRAND_SYNONYM_GUIDANCE.join('\n- ');
    const detectedBrandSection = detectedBrands.length > 0
      ? `Detected brands in input: ${detectedBrands.join(', ')}. Normalize spellings to these exact names and set type="branded" (or composite with brand metadata) when appropriate.`
      : 'If you detect a known brand, set type="branded" unless multiple different foods are specified (then use composite but keep the brand on each item).';

    return `Parse this food input into structured data for nutrition database lookup.

Input: "${input}"

CRITICAL: Extract EVERY distinct food item mentioned. Split on "and", commas, or implicit separators.

Brand recognition rules:
- ${detectedBrandSection}
- Reference brand dictionary (treat these as branded if present): ${brandDictionary}.
- Normalize obvious nicknames/misspellings:
  - ${synonymGuidance}

Return ONLY a JSON object:
{
  "type": "branded|generic|composite|unknown",
  "brand": "Brand name if detected, otherwise null",
  "items": [
    {
      "name": "Simple food name for API search (singular form, no quantity words)",
      "quantity": 1,
      "unit": "item|cup|oz|g|serving|slice|piece|bottle|can"
    }
  ],
  "search_terms": ["keywords", "for", "search"],
  "confidence": "high|medium|low"
}

Rules:
- type="composite" if 2+ distinct foods (connected by "and", commas, etc.)
- type="branded" if restaurant/brand detected (McDonald's, Starbucks, etc.)
- type="generic" for single unbranded foods
- Convert word quantities: "two"→2, "a"→1, "three"→3, etc.
- Use singular food names: "tacos"→"taco", "eggs"→"egg"
- Default unit is "serving" unless context suggests otherwise
- For beverages: beer/soda→"bottle" or "can", coffee→"cup"

Examples:
"Two tacos, beans, and a beer" → {"type":"composite","brand":null,"items":[{"name":"taco","quantity":2,"unit":"item"},{"name":"beans","quantity":1,"unit":"serving"},{"name":"beer","quantity":1,"unit":"bottle"}],"search_terms":["taco","beans","beer"],"confidence":"high"}
"McDonald's Big Mac and large fries" → {"type":"branded","brand":"McDonald's","items":[{"name":"Big Mac","quantity":1,"unit":"item"},{"name":"large fries","quantity":1,"unit":"serving"}],"search_terms":["big mac","fries","large"],"confidence":"high"}
"2 eggs and toast" → {"type":"composite","brand":null,"items":[{"name":"egg","quantity":2,"unit":"item"},{"name":"toast","quantity":1,"unit":"slice"}],"search_terms":["egg","toast"],"confidence":"high"}
"grilled chicken breast" → {"type":"generic","brand":null,"items":[{"name":"grilled chicken breast","quantity":1,"unit":"serving"}],"search_terms":["chicken","breast","grilled"],"confidence":"high"}`;
  }

  parseClassificationResponse(responseText) {
    try {
      var jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in classification response');
      }

      var result = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!result.type || !result.items) {
        throw new Error('Invalid classification structure');
      }

      // Normalize type
      var validTypes = ['branded', 'generic', 'composite', 'unknown'];
      if (validTypes.indexOf(result.type) === -1) {
        result.type = 'unknown';
      }

      return result;
    } catch (error) {
      logger.error({
        responseText: responseText,
        err: error
      }, 'Failed to parse classification response');
      // Return a safe fallback
      return {
        type: 'unknown',
        brand: null,
        items: [{ name: responseText, quantity: 1, unit: 'serving' }],
        search_terms: responseText.toLowerCase().split(/\s+/),
        confidence: 'low'
      };
    }
  }

  /**
   * Lenient JSON read of the model's food-parse answer.
   *
   * Returns `null` rather than throwing: an unusable answer is not an
   * exception any more, it is a reason to take the deterministic split
   * (`parseFoodDescription` does exactly that).
   */
  parseFoodAIResponse(responseText) {
    try {
      const jsonMatch = String(responseText || '').match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const result = JSON.parse(jsonMatch[0]);
      if (!result.food_items || !Array.isArray(result.food_items)) return null;

      return result;
    } catch (error) {
      logger.warn({ err: error }, 'Failed to read food AI response');
      return null;
    }
  }
}

export default new AIFoodService();
