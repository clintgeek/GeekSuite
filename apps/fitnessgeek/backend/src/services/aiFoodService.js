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

    logger.debug('AI classification metadata', {
      originalInput: input,
      normalizedInput: classificationContext.normalizedInput,
      detectedBrands: classificationContext.detectedBrands,
      resolvedBrand: parsed.brand,
      type: parsed.type
    });

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
      logger.error('AI result scoring could not be read', { error: error.message });
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
      logger.error('AI sanity check failed', { error: error.message });
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
      logger.error('Failed to parse classification response', {
        responseText: responseText,
        error: error.message
      });
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
      logger.warn('Failed to read food AI response', { error: error.message });
      return null;
    }
  }
}

export default new AIFoodService();
