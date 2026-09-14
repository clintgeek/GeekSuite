/**
 * Unified Food Service
 *
 * Single entry point for all food lookups with smart routing:
 *
 * NEW ARCHITECTURE (Phase 2):
 * 1. Classify input (branded vs generic vs composite)
 * 2. Route to appropriate data source based on classification
 * 3. Only use AI estimation as last resort
 *
 * Priority by type:
 * - Branded: FatSecret → Local DB → OpenFoodFacts
 * - Generic: USDA → Local DB → OpenFoodFacts
 * - Composite: Split items and recurse
 * - Unknown: Search all APIs → AI fallback
 *
 * Follows DRY and KISS principles.
 */

import axios from 'axios';
import logger from '../config/logger.js';
import FoodItem from '../models/FoodItem.js';
import FoodLog from '../models/FoodLog.js';
import UserSettings from '../models/UserSettings.js';
import aiFoodService from './aiFoodService.js';
import fatSecretService from './fatSecretService.js';
import foodApiService from './foodApiService.js';
import aiClassificationCacheService from './aiClassificationCacheService.js';
import calorieNinjasService from './calorieNinjasService.js';
import unitConversion from './unitConversion.js';
import cacheService from './cacheService.js';
import { foodCatalogVisibilityFilter } from '@geeksuite/schemas/fitnessgeek/foodItem';
import { parseFoodQuery, parseFragment, itemIsGroundedInQuery } from './foodQueryParser.js';
import { rankFoodResults, isConfidentMatch } from './foodRanker.js';

/**
 * Confidence levels for food lookup results
 * Higher = more reliable match
 */
const CONFIDENCE = {
  VERIFIED: 100,    // Exact barcode match from trusted source
  HIGH: 80,         // Exact name match from USDA/FatSecret
  MEDIUM: 60,       // Good partial match
  LOW: 40,          // Fuzzy match or less trusted source
  ESTIMATED: 20     // AI estimation (fallback)
};

/** How many of the user's own foods to hold in the personal index. */
const PERSONAL_INDEX_LIMIT = Number.parseInt(process.env.PERSONAL_INDEX_LIMIT || '200', 10);

class UnifiedFoodService {
  constructor() {
    this.usdaApiKey = process.env.USDA_API_KEY;
    this.openFoodFactsBaseUrl = 'https://world.openfoodfacts.org';
  }

  // ============================================
  // MAIN SEARCH METHOD
  // ============================================

  /**
   * Smart search that routes to the best source based on AI classification
   * @param {string} query - Search query or natural language description
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Array of food items
   */
  async search(query, options) {
    options = options || {};
    const limit = options.limit || 25;
    const includeAI = options.includeAI !== false;
    const userId = options.userId || null;

    const parsed = parseFoodQuery(query);
    if (parsed.fragments.length === 0) {
      return [];
    }

    try {
      const personal = await this.getPersonalIndex(userId);

      // ── The person separated their foods themselves ──────────────────
      if (parsed.explicitlySeparated) {
        return this.searchSeparatedFragments(parsed.fragments, { limit, personal, includeAI });
      }

      // ── One dish. Search the whole phrase, as written ────────────────
      const [fragment] = parsed.fragments;
      const candidates = await this.fetchCandidates(fragment.searchText, limit, userId);
      const ranked = rankFoodResults(candidates, fragment, { personal, limit });

      logger.info({
        query: parsed.normalized,
        dish: fragment.searchText,
        servings: fragment.servings,
        candidates: candidates.length,
        topScore: ranked[0]?.relevanceScore ?? null,
        topName: ranked[0]?.name ?? null
      }, 'Dish search');

      if (ranked.length > 0 && isConfidentMatch(ranked[0], fragment)) {
        return this.withRequestedServings(ranked, fragment);
      }

      // ── Nothing convincing. Only NOW may we consider ingredients ─────
      // and the person is told, rather than silently handed a different
      // question's answer. See DOCS/THE_FOOD_SEARCH_PLAN.md §1.0.
      const ingredients = includeAI
        ? await this.proposeIngredients(fragment, parsed.normalized, userId)
        : [];

      if (ingredients.length > 1) {
        logger.info({
          query: parsed.normalized,
          ingredients: ingredients.map((f) => f.searchText)
        }, 'Dish did not resolve — offering ingredients');

        const decomposed = await this.searchSeparatedFragments(ingredients, {
          limit,
          personal,
          includeAI
        });
        return decomposed.map((item) => ({
          ...item,
          decomposedFrom: fragment.searchText
        }));
      }

      // Weak matches beat no matches — hand back what we have, in order.
      if (ranked.length > 0) {
        return this.withRequestedServings(ranked, fragment);
      }

      if (includeAI) {
        const estimated = await this.estimateWithAI(parsed.normalized, userId, limit);
        if (estimated.length > 0) return estimated;
      }

      return [];

    } catch (error) {
      logger.error({ query, err: error }, 'Unified search failed');
      return [];
    }
  }

  /**
   * The typeahead: the person's own catalog, ranked, with nothing on the wire
   * but Mongo.
   *
   * This is what the search box calls on every keystroke. It touches no
   * external API and no model, so it answers in milliseconds and can run
   * while someone is still typing — which is the whole difference between a
   * search box that feels alive and one you have to submit to.
   *
   * With no query it returns the starting shelf: favourites, then what they
   * logged recently, then their own custom foods. That is the empty state of
   * the box, and it is the answer most of the time.
   *
   * @param {string} query
   * @param {{userId?: string, limit?: number}} [options]
   * @returns {Promise<Array>}
   */
  async suggest(query, options = {}) {
    const limit = options.limit || 15;
    const userId = options.userId || null;
    const parsed = parseFoodQuery(query);

    try {
      const personal = await this.getPersonalIndex(userId);

      if (parsed.fragments.length === 0) {
        return this.startingShelf(userId, personal, limit);
      }

      const [fragment] = parsed.fragments;
      const candidates = await this.searchLocalDB(fragment.searchText, limit * 3, userId);
      const ranked = rankFoodResults(candidates, fragment, { personal, limit });

      return this.withRequestedServings(ranked, fragment);

    } catch (error) {
      logger.warn({ err: error, query }, 'Suggest failed');
      return [];
    }
  }

  /**
   * Favourites, then recents, then their own foods — the box's empty state.
   */
  async startingShelf(userId, personal, limit) {
    if (!userId) return [];

    const ids = [
      ...personal.favorites,
      ...personal.recent.keys(),
      ...personal.custom
    ];
    if (ids.length === 0) return [];

    const unique = [...new Set(ids)].slice(0, limit * 2);
    const foods = await FoodItem.find({ _id: { $in: unique }, is_deleted: false }).lean();
    const byId = new Map(foods.map((f) => [String(f._id), f]));

    const out = [];
    const seen = new Set();
    for (const id of unique) {
      const doc = byId.get(String(id));
      if (!doc || seen.has(String(id))) continue;
      seen.add(String(id));
      out.push({
        ...this.transformToStandardFormat(doc, doc.source || 'local'),
        isFavorite: personal.favorites.has(String(id)),
        shelf: personal.favorites.has(String(id))
          ? 'favorite'
          : (personal.recent.has(String(id)) ? 'recent' : 'custom')
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Search fragments the person separated themselves, in parallel, tagging
   * each result with the fragment it answers so the UI can group them.
   *
   * Sequential `await` in a `for` loop is what made a four-item query cost
   * four round trips; these are independent questions and go out together.
   */
  async searchSeparatedFragments(fragments, { limit, personal, includeAI }) {
    void includeAI;
    const perFragment = Math.max(4, Math.ceil(limit / Math.max(1, fragments.length)));

    const settled = await Promise.allSettled(
      fragments.map((fragment) => this.fetchCandidates(fragment.searchText, perFragment * 2))
    );

    const out = [];
    fragments.forEach((fragment, index) => {
      const candidates = settled[index].status === 'fulfilled' ? settled[index].value : [];
      const ranked = rankFoodResults(candidates, fragment, { personal, limit: perFragment });
      for (const item of ranked) {
        out.push({
          ...item,
          compositeItem: fragment.searchText,
          compositeIndex: index,
          requestedQuantity: fragment.servings,
          requestedUnit: fragment.unit || 'serving'
        });
      }
    });

    logger.info({
      fragments: fragments.map((f) => f.searchText),
      count: out.length
    }, 'Separated fragment search');

    return out;
  }

  /** Carry the quantity the person typed onto every result. */
  withRequestedServings(results, fragment) {
    if (!fragment || fragment.servings === 1) return results;
    return results.map((item) => ({
      ...item,
      requestedQuantity: fragment.servings,
      requestedUnit: fragment.unit || 'serving'
    }));
  }

  /**
   * Ask the model whether an unresolved dish is really several foods — the
   * ONLY place decomposition may originate, and it is gated twice:
   *
   *   1. it runs only after the whole-phrase search failed to convince, and
   *   2. every item it proposes must be built from words the person actually
   *      typed (`itemIsGroundedInQuery`).
   *
   * Guard 2 is what stops "4 chocolate chip pancakes homemade" from acquiring
   * a "pancake mix" that appears nowhere in the query.
   */
  async proposeIngredients(fragment, normalizedQuery, userId) {
    try {
      const classification = await this.classifyInput(userId || 'anonymous', fragment.searchText);
      const items = Array.isArray(classification?.items) ? classification.items : [];
      if (items.length < 2) return [];

      const grounded = [];
      const seen = new Set();
      for (const item of items) {
        const name = String(item?.name || '').trim();
        if (!name) continue;
        if (!itemIsGroundedInQuery(name, normalizedQuery)) {
          logger.warn({ item: name, query: normalizedQuery }, 'Dropped ungrounded classifier item');
          continue;
        }
        const parsedItem = parseFragment(name);
        if (!parsedItem) continue;
        const key = parsedItem.tokens.join(' ');
        if (seen.has(key)) continue;
        seen.add(key);
        if (Number(item?.quantity) > 0) parsedItem.servings = Number(item.quantity);
        grounded.push(parsedItem);
      }

      // One surviving item is the dish we already searched — not a split.
      return grounded.length > 1 ? grounded : [];

    } catch (error) {
      logger.warn({ err: error }, 'Ingredient proposal failed');
      return [];
    }
  }

  /** Last resort: let the model estimate a food nobody's catalog has. */
  async estimateWithAI(query, userId, limit) {
    try {
      const results = await this.parseWithAI(query, userId);
      return (results || [])
        .map((r) => ({ ...r, confidence: 'estimated' }))
        .slice(0, limit);
    } catch (error) {
      logger.error({ err: error }, 'AI estimation fallback failed');
      return [];
    }
  }

  /**
   * Every source, in parallel, deduplicated. Ranking happens once, centrally,
   * in `foodRanker` — no source gets to decide the order any more.
   */
  async fetchCandidates(searchText, limit, userId = null) {
    if (!searchText) return [];

    const fetchLimit = Math.min(Math.max(limit, 10) * 2, 40);
    const useCalorieNinjas = this.detectNaturalLanguage(searchText);

    // USDA and OpenFoodFacts go through `foodApiService`, which is Redis-cached
    // (7 days) and wrapped in the shared 'usda' / 'openfoodfacts' circuit
    // breakers. The old generic path called those two upstreams directly over
    // axios instead — no cache, no breaker — which is most of why a
    // multi-word search cost 3–5 seconds every single time.
    const settled = await Promise.allSettled([
      this.searchLocalDB(searchText, fetchLimit, userId),
      fatSecretService.searchFoods(searchText, fetchLimit),
      foodApiService.searchFoods(searchText, fetchLimit),
      useCalorieNinjas ? calorieNinjasService.searchFoods(searchText) : Promise.resolve([])
    ]);

    const [local, fatsecret, external, cn] = settled.map((r) =>
      (r.status === 'fulfilled' && Array.isArray(r.value)) ? r.value : []
    );

    logger.debug({
      query: searchText,
      local: local.length,
      fatsecret: fatsecret.length,
      external: external.length,
      calorieninjas: cn.length
    }, 'Candidate fetch');

    return this.deduplicateResults([...local, ...fatsecret, ...external, ...cn], fetchLimit);
  }

  /**
   * Classify input using AI (with caching)
   */
  async classifyInput(userId, input) {
    var self = this;
    void self;
    return aiClassificationCacheService.getOrCompute(userId, input, function(inp) {
      return aiFoodService.classifyFoodInput(inp);
    });
  }

  // ============================================
  // BARCODE LOOKUP
  // ============================================

  /**
   * Look up food by barcode
   * @param {string} barcode - UPC/EAN barcode
   * @returns {Promise<Object|null>} Food item or null
   */
  async getByBarcode(barcode) {
    if (!barcode) return null;

    try {
      // Step 1: Check local database
      const localFood = await FoodItem.findOne({
        barcode,
        is_deleted: false
      });

      if (localFood) {
        return this.transformToStandardFormat(localFood, 'local');
      }

      // Step 2: Try OpenFoodFacts (best for barcodes)
      const offResult = await this.getOpenFoodFactsByBarcode(barcode);
      if (offResult) {
        return offResult;
      }

      return null;

    } catch (error) {
      logger.error({ barcode, err: error }, 'Barcode lookup failed');
      return null;
    }
  }

  // ============================================
  // AI PARSING
  // ============================================

  /**
   * Parse natural language food description with AI.
   *
   * This is the last resort in `search()` — every catalog API came back empty.
   * When the model is unavailable, `parseFoodDescription` still answers, with
   * the deterministic comma-split and `nutrition: null`. That split is a fine
   * answer for a food *log* proposal but a bad one for a *search result*: an
   * item with no numbers would render as a 0-calorie food. So this path takes
   * only a model answer and otherwise returns nothing, exactly as it did when
   * a failure was a throw.
   *
   * @param {string} description - Natural language description
   * @param {string|null} userId - the per-day cap bucket (`quotaKey`)
   * @returns {Promise<Array>} Array of parsed food items
   */
  async parseWithAI(description, userId = null) {
    try {
      var envelope = await aiFoodService.parseFoodDescription(description, {}, { userId });
      if (!envelope.ok) {
        logger.info({
          reason: envelope.reason
        }, 'AI estimation unavailable — no estimated results to add');
        return [];
      }

      var result = envelope.data;
      if (!result || !result.food_items) {
        return [];
      }

      // Transform AI results to standard format
      return result.food_items.map(function(item) {
        var nutrition = item.nutrition || {};
        return {
          id: 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          name: item.name,
          brand: '',
          barcode: '',
          nutrition: {
            calories_per_serving: nutrition.calories_per_serving || 0,
            protein_grams: nutrition.protein_grams || 0,
            carbs_grams: nutrition.carbs_grams || 0,
            fat_grams: nutrition.fat_grams || 0,
            fiber_grams: nutrition.fiber_grams || 0,
            sugar_grams: nutrition.sugar_grams || 0,
            sodium_mg: nutrition.sodium_mg || 0
          },
          serving: {
            size: item.servings || 1,
            unit: item.estimated_serving_size || 'serving'
          },
          source: 'ai',
          confidence: result.confidence || 'medium',
          meal_type: result.meal_type
        };
      });

    } catch (error) {
      logger.error({ description, err: error }, 'AI parsing failed');
      throw error;
    }
  }

  // ============================================
  // INTERNAL: API SEARCHES
  // ============================================

  /**
   * Search local MongoDB database
   */
  async searchLocalDB(query, limit, userId = null) {
    if (!query) return [];

    // Ownership, not just liveness. This filter is the one definition of "a
    // catalog row this person may see"; searching without it put another
    // household member's private custom foods in your results.
    const visibility = foodCatalogVisibilityFilter(userId);

    try {
      // The `{name: 'text', brand: 'text'}` index has existed all along and
      // nothing used it — this path was an unanchored regex, i.e. a scan.
      const textHits = await FoodItem.find(
        { is_deleted: false, ...visibility, $text: { $search: query } },
        { score: { $meta: 'textScore' } }
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .lean();

      let foods = textHits;

      // A text index matches whole words, so a half-typed word ("ched") finds
      // nothing. Fall back to an ANCHORED, escaped prefix regex, which the
      // {name, brand} index can still serve.
      if (foods.length < Math.min(5, limit)) {
        const escaped = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const prefix = new RegExp(`^${escaped}`, 'i');
        const prefixHits = await FoodItem.find({
          is_deleted: false,
          ...visibility,
          $or: [{ name: prefix }, { brand: prefix }]
        })
          .limit(limit)
          .lean();

        const seen = new Set(foods.map((f) => String(f._id)));
        foods = [...foods, ...prefixHits.filter((f) => !seen.has(String(f._id)))];
      }

      return foods.map((f) => this.transformToStandardFormat(f, f.source || 'local'));

    } catch (error) {
      logger.warn({ err: error, query }, 'Local DB search failed');
      return [];
    }
  }

  /**
   * What this person actually eats — favourites, recent logs, their own custom
   * foods, and what they picked the last time they typed this.
   *
   * This replaces `getUserPreferenceResults`, which ran a whole-phrase regex
   * (so "greek yogurt 0" never found their saved "Fage Total 0% Greek Yogurt")
   * and then PREPENDED its hits, letting up to 20 of 25 result slots go to the
   * personal list before the search was even consulted. Personalisation is a
   * ranking signal now, not a queue-jump.
   */
  async getPersonalIndex(userId) {
    const empty = {
      favorites: new Set(),
      recent: new Map(),
      custom: new Set(),
      chosenForQuery: new Set()
    };
    if (!userId) return empty;

    try {
      const [settings, recentLogs, customFoods] = await Promise.all([
        UserSettings.findOne({ user_id: userId }).lean(),
        FoodLog.aggregate([
          { $match: { user_id: userId } },
          { $sort: { created_at: -1 } },
          {
            $group: {
              _id: '$food_item_id',
              lastUsed: { $first: '$created_at' },
              usageCount: { $sum: 1 }
            }
          },
          { $sort: { lastUsed: -1 } },
          { $limit: PERSONAL_INDEX_LIMIT }
        ]),
        FoodItem.find({ user_id: userId, is_deleted: false })
          .select('_id')
          .limit(PERSONAL_INDEX_LIMIT)
          .lean()
      ]);

      const favorites = new Set(
        (settings?.favorite_foods || []).map((id) => String(id))
      );
      const recent = new Map(
        recentLogs
          .filter((log) => log._id)
          .map((log) => [String(log._id), { lastUsed: log.lastUsed, usageCount: log.usageCount }])
      );
      const custom = new Set(customFoods.map((f) => String(f._id)));

      return { favorites, recent, custom, chosenForQuery: empty.chosenForQuery };

    } catch (error) {
      logger.warn({ err: error, userId }, 'Failed to build personal index');
      return empty;
    }
  }

  /**
   * Get food by barcode from OpenFoodFacts
   */
  async getOpenFoodFactsByBarcode(barcode) {
    try {
      const response = await axios.get(
        `${this.openFoodFactsBaseUrl}/api/v0/product/${barcode}.json`,
        { timeout: 8000 }
      );

      if (!response.data || response.data.status === 0) {
        return null;
      }

      return this.transformOpenFoodFacts(response.data.product);

    } catch (error) {
      logger.warn({ barcode, err: error }, 'OpenFoodFacts barcode lookup failed');
      return null;
    }
  }

  // ============================================
  // INTERNAL: DATA TRANSFORMATION
  // ============================================

  /**
   * Transform local DB food to standard format
   */
  transformToStandardFormat(food, source) {
    return {
      id: food._id?.toString() || food.id,
      name: food.name || 'Unknown',
      brand: food.brand || '',
      barcode: food.barcode || '',
      nutrition: {
        calories_per_serving: food.nutrition?.calories_per_serving || 0,
        protein_grams: food.nutrition?.protein_grams || 0,
        carbs_grams: food.nutrition?.carbs_grams || 0,
        fat_grams: food.nutrition?.fat_grams || 0,
        fiber_grams: food.nutrition?.fiber_grams || 0,
        sugar_grams: food.nutrition?.sugar_grams || 0,
        sodium_mg: food.nutrition?.sodium_mg || 0
      },
      serving: {
        size: food.serving?.size || 100,
        unit: food.serving?.unit || 'g'
      },
      source: source || food.source || 'unknown',
      source_id: food.source_id || food._id?.toString(),
      confidence: source === 'local' ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM
    };
  }

  /**
   * Transform OpenFoodFacts product to standard format
   */
  transformOpenFoodFacts(product) {
    const n = product.nutriments || {};

    // Get serving size, default to 100g
    const servingSize = this.parseServingSize(product.serving_size) || 100;
    const servingUnit = product.serving_unit || 'g';

    return {
      id: `off_${product.code || product._id}`,
      name: product.product_name || product.generic_name || 'Unknown',
      brand: product.brands || '',
      barcode: product.code || '',
      nutrition: {
        calories_per_serving: Math.round(n['energy-kcal_serving'] || n['energy-kcal_100g'] || 0),
        protein_grams: Math.round((n.proteins_serving || n.proteins_100g || 0) * 10) / 10,
        carbs_grams: Math.round((n.carbohydrates_serving || n.carbohydrates_100g || 0) * 10) / 10,
        fat_grams: Math.round((n.fat_serving || n.fat_100g || 0) * 10) / 10,
        fiber_grams: Math.round((n.fiber_serving || n.fiber_100g || 0) * 10) / 10,
        sugar_grams: Math.round((n.sugars_serving || n.sugars_100g || 0) * 10) / 10,
        sodium_mg: Math.round((n.sodium_serving || n.sodium_100g || 0) * 1000 * 10) / 10
      },
      serving: {
        size: servingSize,
        unit: servingUnit
      },
      source: 'openfoodfacts',
      source_id: product.code,
      confidence: product.code ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
      image_url: product.image_front_small_url || product.image_url
    };
  }

  // ============================================
  // INTERNAL: UTILITIES
  // ============================================

  /**
   * Detect if query looks like natural language
   */
  detectNaturalLanguage(query) {
    // Natural language indicators:
    // - Contains numbers with food (e.g., "2 tacos")
    // - Contains conversational words/phrases
    // - Multiple words that aren't just brand + product
    // - Vague descriptors that need AI interpretation
    const nlPatterns = [
      /\d+\s+\w+/,           // "2 tacos"
      /\band\b/i,            // "tacos and beer"
      /\bwith\b/i,           // "burger with fries"
      /\ba\s+\w+/i,          // "a sandwich"
      /\ban\s+\w+/i,         // "an apple"
      /\bfor\s+(breakfast|lunch|dinner|snack)/i,
      /\b(like|similar|kind of|sort of|type of)\b/i,  // "like apple fritters"
      /\b(those|that|these|this)\s+(things?|stuff|food)/i,  // "those things"
      /\b(from|at)\s+the\b/i,  // "from the donut shop"
      /\bor\s+(something|anything)/i,  // "or something"
      /\b(what|which|that)\s+(is|are|was|were)/i,  // "what is"
      /\b(some|any)\s+\w+/i,  // "some breakfast"
      /\bthat\s+\w+\s+\w+/i   // "that pastry thing"
    ];

    // Also check word count - if >5 words, likely natural language
    const wordCount = query.split(/\s+/).length;
    if (wordCount > 5) return true;

    return nlPatterns.some(pattern => pattern.test(query));
  }

  /**
   * Parse serving size from various string formats
   */
  parseServingSize(size) {
    if (typeof size === 'number') return size;
    if (!size) return null;

    const match = String(size).match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  /**
   * Deduplicate results by name+brand
   */
  deduplicateResults(results, limit) {
    const seen = new Set();
    const unique = [];

    for (const item of results) {
      const key = `${(item.name || '').toLowerCase()}-${(item.brand || '').toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
        if (unique.length >= limit) break;
      }
    }

    return unique;
  }

  matchesQueryText(name, brand, regex) {
    if (!regex) return true;
    return regex.test(name || '') || regex.test(brand || '');
  }

  buildQueryRegex(query) {
    if (!query || query.length < 2) return null;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return new RegExp(escaped, 'i');
    } catch (error) {
      logger.warn({ query, err: error }, 'Failed to build query regex');
      return null;
    }
  }

  generateResultKey(item) {
    if (!item) return 'unknown';
    if (item.id) return item.id.toString();
    if (item._id) return item._id.toString();
    return `${(item.name || '').toLowerCase()}-${(item.brand || '').toLowerCase()}`;
  }
}

export default new UnifiedFoodService();
