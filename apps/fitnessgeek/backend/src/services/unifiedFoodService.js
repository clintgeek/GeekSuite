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

var axios = require('axios');
var logger = require('../config/logger');
var FoodItem = require('../models/FoodItem');
var FoodLog = require('../models/FoodLog');
var UserSettings = require('../models/UserSettings');
var baseGeekAIService = require('./baseGeekAIService');
var foodApiService = require('./foodApiService');
var fatSecretService = require('./fatSecretService');
var aiClassificationCacheService = require('./aiClassificationCacheService');
var calorieNinjasService = require('./calorieNinjasService');
var unitConversion = require('./unitConversion');

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

// Stop words to ignore when tokenizing search queries
const RAW_RESULT_STOP_WORDS = new Set([
  'and', 'with', 'the', 'a', 'of', 'to', 'for', 'in', 'from', 'on', 'at', 'or', 'is'
]);

const MAX_SANITY_RESULTS = Number.parseInt(process.env.MAX_SANITY_RESULTS || '10', 10);
const USER_PREFERENCE_LIMIT = Number.parseInt(process.env.USER_PREFERENCE_LIMIT || '20', 10);

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
    var limit = options.limit || 25;
    var includeAI = options.includeAI !== false;
    var userId = options.userId || 'anonymous';

    if (!query || query.trim().length < 2) {
      return [];
    }

    var trimmedQuery = query.trim();

    try {
      const userPreferenceResults = userId ? await this.getUserPreferenceResults(userId, trimmedQuery, limit) : [];

      // Step 1: Classify the input (cheap AI call, cached)
      var classification = null;
      if (includeAI && this.shouldUseAIClassification(trimmedQuery)) {
        classification = await this.classifyInput(userId, trimmedQuery);
        logger.info('Food input classified', {
          query: trimmedQuery,
          type: classification.type,
          brand: classification.brand,
          items: classification.items,
          confidence: classification.confidence
        });
      }

      // Step 2: Route based on classification
      var results = [];

      if (classification && classification.type === 'branded' && classification.brand) {
        // Branded item → prioritize FatSecret
        results = await this.searchBranded(classification, limit, includeAI);
      } else if (classification && classification.type === 'composite') {
        // Multiple items → handle each and combine
        results = await this.searchComposite(classification, limit, includeAI);
      } else if (classification && classification.type === 'generic') {
        // Generic food → prioritize USDA
        results = await this.searchGeneric(classification, limit, includeAI);
      } else {
        // Unknown or no classification → search all APIs
        results = await this.searchAPIs(trimmedQuery, limit);
      }

      logger.info('Search results', {
        query: trimmedQuery,
        type: classification ? classification.type : 'unclassified',
        count: results.length
      });

      // Step 3: If no results and AI enabled, fall back to AI estimation
      if (results.length === 0 && includeAI) {
        logger.info('No API results, using AI estimation', { query: trimmedQuery });
        try {
          var aiResults = await this.parseWithAI(trimmedQuery);
          if (aiResults && aiResults.length > 0) {
            // Mark as estimated so UI can show confidence indicator
            return aiResults.map(function(r) {
              r.confidence = 'estimated';
              return r;
            }).slice(0, limit);
          }
        } catch (aiError) {
          logger.error('AI estimation fallback failed', { error: aiError.message });
        }
      }

      // Step 4: Apply AI sanity check to validate and rank results
      let searchResults = results;
      if (searchResults.length > 0 && includeAI && this.shouldUseAIScoring(trimmedQuery)) {
        const sanityLimit = Math.min(limit, MAX_SANITY_RESULTS);
        searchResults = await this.applySanityCheck(trimmedQuery, searchResults, sanityLimit);
      } else if (searchResults.length > limit) {
        searchResults = searchResults.slice(0, limit);
      }

      return this.mergePreferenceResults(userPreferenceResults, searchResults, limit);

    } catch (error) {
      logger.error('Unified search failed', { query: query, error: error.message });
      return [];
    }
  }

  /**
   * Classify input using AI (with caching)
   */
  async classifyInput(userId, input) {
    var self = this;
    return aiClassificationCacheService.getOrCompute(userId, input, function(inp) {
      return baseGeekAIService.classifyFoodInput(inp);
    });
  }

  /**
   * Search for branded foods - prioritize FatSecret
   */
  async searchBranded(classification, limit, includeAI) {
    var itemName = classification.items[0] ? classification.items[0].name : '';
    var brand = classification.brand;

    logger.debug('Searching branded food (FatSecret priority)', {
      itemName,
      brand
    });

    // Use new routing with FatSecret priority
    return this.searchBrandedItem(itemName, brand, limit, includeAI);
  }

  /**
   * Search for generic foods - prioritize USDA
   */
  async searchGeneric(classification, limit, includeAI) {
    var searchTerm = classification.items[0] ? classification.items[0].name : '';
    var searchTerms = classification.search_terms || [];

    if (!searchTerm && searchTerms.length > 0) {
      searchTerm = searchTerms.join(' ');
    }

    logger.debug('Searching generic food (USDA priority)', { searchTerm: searchTerm });

    return this.searchRawIngredient(searchTerm, limit, includeAI);
  }

  /**
   * Handle composite queries (multiple food items)
   * Search for each item separately using appropriate API based on item type
   */
  async searchComposite(classification, limit, includeAI) {
    var self = this;
    var items = classification.items || [];
    var overallBrand = classification.brand; // e.g., "McDonald's" for the whole query

    if (items.length === 0) {
      return [];
    }

    logger.info('Searching composite foods', {
      itemCount: items.length,
      items: items.map(function(i) { return i.name; }),
      overallBrand: overallBrand
    });

    // Search for each item - get best matches only
    var allResults = [];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var searchTerm = item.name;
      var itemBrand = item.brand || overallBrand; // Use item brand or fall back to overall brand

      logger.debug('Searching for composite item', {
        index: i,
        name: item.name,
        brand: itemBrand,
        quantity: item.quantity
      });

      // Route to appropriate search based on whether item has a brand
      var itemResults;
      if (itemBrand) {
        // Branded item - use FatSecret priority
        itemResults = await self.searchBrandedItem(searchTerm, itemBrand, 10, includeAI);
      } else {
        // Generic item - use USDA priority
        itemResults = await self.searchRawIngredient(searchTerm, 10, includeAI);
      }

      // Score and rank results by relevance to the search term
      var scoredResults = itemResults.map(function(r) {
        r.relevanceScore = self.scoreRelevance(r, searchTerm);
        r.compositeItem = item.name;
        r.compositeIndex = i;
        r.requestedQuantity = item.quantity || 1;
        r.requestedUnit = item.unit || 'serving';
        return r;
      });

      // Sort by relevance
      scoredResults.sort(function(a, b) {
        return b.relevanceScore - a.relevanceScore;
      });

      // Determine how many results to show based on top score confidence
      // Scoring: 100+ = exact match, 50+ = starts with, 30+ = contains
      var topScore = scoredResults[0] ? scoredResults[0].relevanceScore : 0;
      var resultsToShow;
      if (topScore >= 100) {
        // Exact or near-exact match - show just 1-2 options
        resultsToShow = 2;
      } else if (topScore >= 50) {
        // Good match (starts with search term) - show a few options
        resultsToShow = 3;
      } else {
        // Lower confidence - show more options
        resultsToShow = 4;
      }

      var topResults = scoredResults.slice(0, resultsToShow);

      logger.debug('Composite item results', {
        item: item.name,
        totalFound: itemResults.length,
        topScore: topScore,
        resultsToShow: resultsToShow,
        topMatch: topResults[0] ? topResults[0].name : 'none'
      });

      allResults = allResults.concat(topResults);
    }

    // Sort final results: group by compositeIndex, then by relevance
    allResults.sort(function(a, b) {
      if (a.compositeIndex !== b.compositeIndex) {
        return a.compositeIndex - b.compositeIndex;
      }
      return b.relevanceScore - a.relevanceScore;
    });

    return allResults;
  }

  /**
   * Search for raw/generic ingredients
   * Priority: USDA → OpenFoodFacts → CalorieNinjas
   * AI handles ranking - no brittle lexical filtering
   */
  async searchRawIngredient(searchTerm, limit, includeAI) {
    if (!searchTerm) {
      return [];
    }

    // Fetch from multiple sources
    const fetchLimit = Math.min(limit * 2, 30);
    const results = [];

    const useCalorieNinjas = this.detectNaturalLanguage(searchTerm);
    const [usdaResults, offResults, cnResults] = await Promise.allSettled([
      this.searchUSDA(searchTerm, fetchLimit),
      this.searchOpenFoodFacts(searchTerm, fetchLimit),
      useCalorieNinjas ? calorieNinjasService.searchFoods(searchTerm) : Promise.resolve([])
    ]);

    const resolvedUsda = usdaResults.status === 'fulfilled' ? usdaResults.value : [];
    const resolvedOff = offResults.status === 'fulfilled' ? offResults.value : [];
    const resolvedCn = cnResults.status === 'fulfilled' ? cnResults.value : [];

    results.push(...resolvedUsda, ...resolvedOff, ...resolvedCn);

    logger.info('Raw ingredient search results', {
      query: searchTerm,
      usda: resolvedUsda.length,
      off: resolvedOff.length,
      cn: resolvedCn.length,
      total: results.length
    });

    const useAIScoring = includeAI && this.shouldUseAIScoring(searchTerm);
    if (useAIScoring) {
      const scored = await baseGeekAIService.scoreResultsRelevance(searchTerm, results);
      const sorted = scored
        .sort((a, b) => (b.aiRelevanceScore || 0) - (a.aiRelevanceScore || 0));
      return this.deduplicateResults(sorted, limit);
    }

    const sorted = this.basicLexicalSort(results, searchTerm);
    return this.deduplicateResults(sorted, limit);
  }

  /**
   * Filter out results that don't contain ANY of the search tokens.
   * DEPRECATED: Keeping for reference but AI scoring is preferred.
   */
  filterRelevantResults(results, searchTerm) {
    if (!results || results.length === 0) return [];

    const tokens = searchTerm.toLowerCase()
      .split(/[\s\-]+/)
      .filter(t => t && t.length > 1 && !RAW_RESULT_STOP_WORDS.has(t));

    if (tokens.length === 0) return results;

    return results.filter(item => {
      const name = (item.name || '').toLowerCase();
      const brand = (item.brand || '').toLowerCase();
      const combined = `${name} ${brand}`;

      // Must contain at least one meaningful token
      return tokens.some(token => combined.includes(token));
    });
  }

  /**
   * Search for branded items - FatSecret first
   * Chain: FatSecret → OpenFoodFacts → CalorieNinjas
   * AI handles ranking - no brittle lexical filtering
   */
  async searchBrandedItem(searchTerm, brand, limit, includeAI) {
    if (!searchTerm && !brand) {
      return [];
    }

    const fullQuery = [brand, searchTerm].filter(Boolean).join(' ').trim();
    const fetchLimit = Math.min(limit * 2, 30);
    const results = [];

    const useCalorieNinjas = this.detectNaturalLanguage(fullQuery);
    const [fsResults, offResults, cnResults] = await Promise.allSettled([
      fatSecretService.searchFoods(fullQuery, fetchLimit),
      this.searchOpenFoodFacts(fullQuery, fetchLimit),
      useCalorieNinjas ? calorieNinjasService.searchFoods(fullQuery) : Promise.resolve([])
    ]);

    const resolvedFs = fsResults.status === 'fulfilled' ? fsResults.value : [];
    const resolvedOff = offResults.status === 'fulfilled' ? offResults.value : [];
    const resolvedCn = cnResults.status === 'fulfilled' ? cnResults.value : [];

    results.push(...resolvedFs, ...resolvedOff, ...resolvedCn);

    logger.info('Branded item search results', {
      query: fullQuery,
      fatsecret: resolvedFs.length,
      off: resolvedOff.length,
      cn: resolvedCn.length,
      total: results.length
    });

    const useAIScoring = includeAI && this.shouldUseAIScoring(fullQuery);
    if (useAIScoring) {
      const scored = await baseGeekAIService.scoreResultsRelevance(fullQuery, results);
      const sorted = scored
        .sort((a, b) => (b.aiRelevanceScore || 0) - (a.aiRelevanceScore || 0));
      return this.deduplicateResults(sorted, limit);
    }

    const sorted = this.basicLexicalSort(results, fullQuery);
    return this.deduplicateResults(sorted, limit);
  }

  /**
   * Simple lexical pre-sort before AI ranking.
   * Just does basic token matching to put obvious matches first.
   * AI layer does the real filtering/ranking.
   */
  basicLexicalSort(results, searchTerm) {
    if (!results || results.length === 0) {
      return [];
    }

    const search = (searchTerm || '').toLowerCase();
    const tokens = search.split(/[\s\-]+/).filter(t => t && !RAW_RESULT_STOP_WORDS.has(t));

    return results
      .map(item => {
        const name = (item.name || '').toLowerCase();
        let score = 0;

        // Exact match
        if (name === search) score += 100;
        // Starts with query
        else if (name.startsWith(search)) score += 50;
        // Contains query
        else if (name.includes(search)) score += 25;

        // Token matches
        tokens.forEach(token => {
          if (name.includes(token)) score += 10;
        });

        return { ...item, lexicalScore: score };
      })
      .sort((a, b) => (b.lexicalScore || 0) - (a.lexicalScore || 0));
  }

  /**
   * Score how relevant a food result is to the search term
   * Higher score = better match
   */
  scoreRelevance(food, searchTerm) {
    var score = 0;
    var name = (food.name || '').toLowerCase();
    var brand = (food.brand || '').toLowerCase();
    var search = searchTerm.toLowerCase();
    var searchWords = search.split(/\s+/);

    // Exact name match
    if (name === search) {
      score += 100;
    }

    // Name starts with search term
    if (name.indexOf(search) === 0) {
      score += 50;
    }

    // Name contains search term
    if (name.indexOf(search) !== -1) {
      score += 30;
    }

    // Check each search word
    for (var i = 0; i < searchWords.length; i++) {
      var word = searchWords[i];
      if (word.length < 2) continue;

      if (name.indexOf(word) !== -1) {
        score += 10;
      }
      if (brand.indexOf(word) !== -1) {
        score += 5;
      }
    }

    // Prefer verified sources
    if (food.confidence === 'verified') {
      score += 15;
    }

    // Prefer branded sources for branded items
    if (food.source === 'fatsecret' || food.source === 'local') {
      score += 10;
    }

    // USDA is good for generic items
    if (food.source === 'USDA') {
      score += 8;
    }

    // Penalize if name is much longer than search (probably not a good match)
    if (name.length > search.length * 3) {
      score -= 10;
    }

    return score;
  }

  shouldUseAIScoring(query) {
    if (!query) return false;
    const wordCount = query.trim().split(/\s+/).length;
    if (wordCount <= 3 && !this.detectNaturalLanguage(query)) {
      return false;
    }
    return true;
  }

  shouldUseAIClassification(query) {
    if (!query) return false;
    const wordCount = query.trim().split(/\s+/).length;
    if (wordCount <= 3 && !this.detectNaturalLanguage(query)) {
      return false;
    }
    return true;
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
      logger.error('Barcode lookup failed', { barcode, error: error.message });
      return null;
    }
  }

  // ============================================
  // AI PARSING
  // ============================================

  /**
   * Parse natural language food description with AI
   * @param {string} description - Natural language description
   * @returns {Promise<Array>} Array of parsed food items
   */
  async parseWithAI(description) {
    try {
      var result = await baseGeekAIService.parseFoodDescription(description);

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
      logger.error('AI parsing failed', { description: description, error: error.message });
      throw error;
    }
  }

  // ============================================
  // INTERNAL: API SEARCHES
  // ============================================

  /**
   * Search across local DB and external APIs
   * Uses cached foodApiService for external API calls
   * Priority: Local DB > FatSecret (branded) > USDA/OpenFoodFacts
   */
  async searchAPIs(query, limit) {
    const thirdLimit = Math.ceil(limit / 3);

    // Search in parallel - include FatSecret for branded foods
    const [localResults, fatSecretResults, externalResults] = await Promise.allSettled([
      this.searchLocalDB(query, thirdLimit),
      fatSecretService.searchFoods(query, thirdLimit),
      foodApiService.searchFoods(query, thirdLimit)
    ]);

    // Combine results - prioritize local, then FatSecret (branded), then others
    let allResults = [];

    if (localResults.status === 'fulfilled') {
      allResults.push(...localResults.value);
    }

    if (fatSecretResults.status === 'fulfilled' && fatSecretResults.value.length > 0) {
      logger.debug('FatSecret results added', { count: fatSecretResults.value.length });
      allResults.push(...fatSecretResults.value);
    }

    if (externalResults.status === 'fulfilled') {
      // External results are already in standard format from foodApiService
      allResults.push(...externalResults.value);
    }

    // Deduplicate by name+brand
    return this.deduplicateResults(allResults, limit);
  }

  /**
   * Apply AI sanity check to results
   * 1. Score each result's relevance
   * 2. Sort by AI score
   * 3. Take top N
   * 4. Final validation
   *
   * @param {string} originalQuery - User's original input
   * @param {Array} results - Raw API results
   * @param {number} topN - Number of results to return (default 3)
   * @returns {Promise<Array>} Validated, scored, filtered results
   */
  async applySanityCheck(originalQuery, results, topN = 3) {
    if (!results || results.length === 0) {
      return results;
    }

    try {
      // Step 1: Score results with AI
      const scoredResults = await baseGeekAIService.scoreResultsRelevance(
        originalQuery,
        results
      );

      // Step 2: Sort by AI relevance score (highest first)
      scoredResults.sort((a, b) =>
        (b.aiRelevanceScore || 0) - (a.aiRelevanceScore || 0)
      );

      // Step 3: Take top N results
      const topResults = scoredResults.slice(0, topN).map((result, index) => ({
        ...result,
        sanityRank: index + 1
      }));

      // Step 4: Final sanity check
      const validation = await baseGeekAIService.sanityCheckResults(
        originalQuery,
        topResults
      );

      return topResults.map(result => ({
        ...result,
        sanityCheckPassed: validation.valid,
        sanityCheckIssues: validation.issues || [],
        sanityCheckConfidence: validation.confidence || 'unknown'
      }));

    } catch (error) {
      logger.error('Sanity check failed, returning unvalidated results', {
        error: error.message
      });
      return results.slice(0, topN);
    }
  }

  /**
   * Search local MongoDB database
   */
  async searchLocalDB(query, limit) {
    try {
      const foods = await FoodItem.find({
        is_deleted: false,
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { brand: { $regex: query, $options: 'i' } }
        ]
      })
      .limit(limit)
      .lean();

      return foods.map(f => this.transformToStandardFormat(f, 'local'));

    } catch (error) {
      logger.warn('Local DB search failed', { error: error.message });
      return [];
    }
  }

  /**
   * Search OpenFoodFacts API
   */
  async searchOpenFoodFacts(query, limit) {
    try {
      const response = await axios.get(`${this.openFoodFactsBaseUrl}/cgi/search.pl`, {
        params: {
          search_terms: query,
          page_size: limit,
          json: 1
        },
        timeout: 8000
      });

      if (!response.data?.products) {
        return [];
      }

      return response.data.products
        .filter(p => p.product_name && p.nutriments)
        .map(p => this.transformOpenFoodFacts(p));

    } catch (error) {
      logger.warn('OpenFoodFacts search failed', { error: error.message });
      return [];
    }
  }

  /**
   * Search USDA FoodData Central API
   */
  async searchUSDA(query, limit) {
    if (!this.usdaApiKey) {
      logger.warn('USDA API key not configured');
      return [];
    }

    try {
      // Request more results than needed so we have room to filter
      const requestLimit = Math.min(limit * 3, 50);

      // USDA API dataType values must match exactly
      // Valid: Foundation, Branded, SR Legacy, Survey (FNDDS)
      const response = await axios.get('https://api.nal.usda.gov/fdc/v1/foods/search', {
        params: {
          api_key: this.usdaApiKey,
          query: query,
          pageSize: requestLimit
          // Removed dataType filter - let USDA return all types for better coverage
        },
        timeout: 8000
      });

      if (!response.data?.foods) {
        return [];
      }

      return response.data.foods
        .filter(f => f.description && f.foodNutrients)
        .map(f => this.transformUSDA(f));

    } catch (error) {
      logger.warn('USDA search failed', {
        error: error.message,
        query: query,
        status: error.response?.status,
        data: error.response?.data
      });
      return [];
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
      logger.warn('OpenFoodFacts barcode lookup failed', { barcode, error: error.message });
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

  /**
   * Transform USDA food to standard format
   * Note: USDA data is per 100g. We keep it that way and let the frontend/AI
   * handle serving size adjustments based on user input.
   */
  transformUSDA(food) {
    const nutrients = {};
    (food.foodNutrients || []).forEach(n => {
      if (n.nutrientName && n.value != null) {
        nutrients[n.nutrientName.toLowerCase()] = n.value;
      }
    });

    // Use USDA's serving size if provided, otherwise default to 100g
    // The AI classification handles user-specified quantities separately
    let servingSize = food.servingSize || 100;
    let servingUnit = food.servingSizeUnit || food.servingUnit || 'g';
    const ratio = servingSize / 100;

    // Convert ml to fl oz for US-friendly display
    if (servingUnit === 'ml' || servingUnit === 'milliliter' || servingUnit === 'milliliters') {
      const converted = unitConversion.fromBase(servingSize, 'floz');
      servingSize = Math.round(converted.value * 10) / 10;
      servingUnit = 'fl oz';
    }

    return {
      id: 'usda_' + food.fdcId,
      name: (food.description || '').trim(),
      brand: food.brandOwner || food.brandName || '',
      barcode: food.gtinUpc || '',
      nutrition: {
        calories_per_serving: Math.round((nutrients['energy'] || 0) * ratio),
        protein_grams: Math.round((nutrients['protein'] || 0) * ratio * 10) / 10,
        carbs_grams: Math.round((nutrients['carbohydrate, by difference'] || 0) * ratio * 10) / 10,
        fat_grams: Math.round((nutrients['total lipid (fat)'] || 0) * ratio * 10) / 10,
        fiber_grams: Math.round((nutrients['fiber, total dietary'] || 0) * ratio * 10) / 10,
        sugar_grams: Math.round((nutrients['sugars, total including nlea'] || 0) * ratio * 10) / 10,
        sodium_mg: Math.round((nutrients['sodium, na'] || 0) * ratio * 10) / 10
      },
      serving: {
        size: servingSize,
        unit: servingUnit
      },
      source: 'usda',
      source_id: food.fdcId,
      confidence: CONFIDENCE.HIGH
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

  async getUserPreferenceResults(userId, query, limit) {
    try {
      const resultsMap = new Map();
      const regex = this.buildQueryRegex(query);
      const normalizedLimit = Math.max(5, Math.min(limit || USER_PREFERENCE_LIMIT, USER_PREFERENCE_LIMIT));

      const settings = await UserSettings.findOne({ user_id: userId }).lean();
      const favoriteIds = settings?.favorite_foods || [];

      const addPreferenceResult = (foodDoc, meta) => {
        if (!foodDoc) return;
        if (regex && !this.matchesQueryText(foodDoc.name, foodDoc.brand, regex)) {
          return;
        }

        const key = foodDoc._id ? foodDoc._id.toString() : `${(foodDoc.name || '').toLowerCase()}-${(foodDoc.brand || '').toLowerCase()}`;
        const isFavorite = meta.preferenceType === 'favorite' || (favoriteIds.length && favoriteIds.some(id => id.toString() === key));
        const transformed = this.transformToStandardFormat(foodDoc, foodDoc.source || 'local');

        const preferencePayload = {
          ...transformed,
          isFavorite: isFavorite || transformed.isFavorite,
          preferenceScore: meta.preferenceScore,
          preferenceType: meta.preferenceType,
          preferenceMeta: meta.preferenceMeta || {}
        };

        if (resultsMap.has(key)) {
          const current = resultsMap.get(key);
          if ((meta.preferenceScore || 0) > (current.preferenceScore || 0)) {
            resultsMap.set(key, { ...current, ...preferencePayload });
          } else {
            resultsMap.set(key, {
              ...current,
              isFavorite: current.isFavorite || preferencePayload.isFavorite,
              preferenceMeta: { ...preferencePayload.preferenceMeta, ...current.preferenceMeta }
            });
          }
        } else {
          resultsMap.set(key, preferencePayload);
        }
      };

      if (favoriteIds.length) {
        const favoriteFoods = await FoodItem.find({
          _id: { $in: favoriteIds },
          is_deleted: false
        }).limit(normalizedLimit).lean();

        favoriteFoods.forEach((foodDoc, index) => {
          addPreferenceResult(foodDoc, {
            preferenceType: 'favorite',
            preferenceScore: 100 - index,
            preferenceMeta: { rank: index + 1 }
          });
        });
      }

      const recentLogs = await FoodLog.aggregate([
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
        { $limit: normalizedLimit }
      ]);

      if (recentLogs.length) {
        const ids = recentLogs.map((log) => log._id).filter(Boolean);
        if (ids.length) {
          const foods = await FoodItem.find({
            _id: { $in: ids },
            is_deleted: false
          }).lean();
          const foodMap = new Map(foods.map((food) => [food._id.toString(), food]));

          recentLogs.forEach((log, index) => {
            const foodDoc = foodMap.get(log._id?.toString());
            if (!foodDoc) return;
            addPreferenceResult(foodDoc, {
              preferenceType: 'recent',
              preferenceScore: 80 - index,
              preferenceMeta: {
                lastUsed: log.lastUsed,
                usageCount: log.usageCount
              }
            });
          });
        }
      }

      const customFoods = await FoodItem.find({
        user_id: userId,
        is_deleted: false
      })
        .limit(normalizedLimit)
        .lean();

      customFoods.forEach((foodDoc, index) => {
        addPreferenceResult(foodDoc, {
          preferenceType: 'custom',
          preferenceScore: 60 - index,
          preferenceMeta: { userOwned: true }
        });
      });

      return Array.from(resultsMap.values())
        .sort((a, b) => (b.preferenceScore || 0) - (a.preferenceScore || 0))
        .slice(0, normalizedLimit);

    } catch (error) {
      logger.warn('Failed to build user preferences for search', { userId, error: error.message });
      return [];
    }
  }

  mergePreferenceResults(preferenceResults, searchResults, limit) {
    const combined = [];
    const seen = new Set();

    const pushResult = (item) => {
      if (!item) return;
      const key = this.generateResultKey(item);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      combined.push(item);
    };

    (preferenceResults || [])
      .sort((a, b) => (b.preferenceScore || 0) - (a.preferenceScore || 0))
      .forEach((item) => pushResult(item));

    (searchResults || []).forEach((item) => pushResult(item));

    return combined.slice(0, limit || MAX_SANITY_RESULTS);
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
      logger.warn('Failed to build query regex', { query, error: error.message });
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

module.exports = new UnifiedFoodService();
