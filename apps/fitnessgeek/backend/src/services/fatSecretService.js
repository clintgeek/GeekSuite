/**
 * FatSecret Platform API Service
 *
 * Provides access to branded food data (restaurants, packaged foods)
 * that USDA and OpenFoodFacts don't have.
 *
 * Free tier: 5,000 API calls/day
 * Auth: OAuth 2.0 Client Credentials
 *
 * @see https://platform.fatsecret.com/docs
 */

const axios = require('axios');
const logger = require('../config/logger');
const cacheService = require('./cacheService');

class FatSecretService {
  constructor() {
    this.clientId = process.env.FATSECRET_CLIENT_ID;
    this.clientSecret = process.env.FATSECRET_CLIENT_SECRET;
    this.tokenUrl = 'https://oauth.fatsecret.com/connect/token';
    this.apiUrl = 'https://platform.fatsecret.com/rest/server.api';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Check if service is configured
   */
  isConfigured() {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Get OAuth 2.0 access token (cached until expiry)
   */
  async getAccessToken() {
    // Return cached token if still valid (with 5 min buffer)
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken;
    }

    if (!this.isConfigured()) {
      throw new Error('FatSecret API credentials not configured');
    }

    try {
      const response = await axios.post(
        this.tokenUrl,
        'grant_type=client_credentials&scope=basic',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          auth: {
            username: this.clientId,
            password: this.clientSecret,
          },
          timeout: 10000,
        }
      );

      this.accessToken = response.data.access_token;
      // Token typically expires in 24 hours, but we'll respect the actual expiry
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

      logger.debug('FatSecret access token obtained', {
        expiresIn: response.data.expires_in,
      });

      return this.accessToken;
    } catch (error) {
      logger.error('Failed to get FatSecret access token', {
        error: error.message,
        status: error.response && error.response.status,
      });
      throw new Error('FatSecret authentication failed');
    }
  }

  /**
   * Make an authenticated API request
   */
  async apiRequest(method, params = {}) {
    const token = await this.getAccessToken();

    const requestParams = {
      method,
      format: 'json',
      ...params,
    };

    try {
      const response = await axios.post(
        this.apiUrl,
        new URLSearchParams(requestParams).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${token}`,
          },
          timeout: 10000,
        }
      );

      return response.data;
    } catch (error) {
      logger.error('FatSecret API request failed', {
        method,
        error: error.message,
        status: error.response && error.response.status,
        data: error.response && error.response.data,
      });
      throw error;
    }
  }

  /**
   * Search for foods by query
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results (default 20, max 50)
   * @returns {Promise<Array>} Array of food items in standard format
   */
  async searchFoods(query, maxResults = 20) {
    if (!this.isConfigured()) {
      logger.debug('FatSecret not configured, skipping search');
      return [];
    }

    if (!query || query.trim().length < 2) {
      return [];
    }

    const cacheKey = cacheService.key('fatsecret', 'search', query.toLowerCase().trim(), maxResults);

    try {
      return await cacheService.wrap(cacheKey, async () => {
        const data = await this.apiRequest('foods.search', {
          search_expression: query,
          max_results: Math.min(maxResults, 50),
        });

        if (!data.foods || !data.foods.food) {
          return [];
        }

        // FatSecret returns single object if only one result, array if multiple
        const foods = Array.isArray(data.foods.food) ? data.foods.food : [data.foods.food];

        logger.debug('FatSecret search results', {
          query,
          count: foods.length,
        });

        return foods.map(food => this.transformToStandardFormat(food));
      }, 7 * 24 * 3600); // 7 day cache
    } catch (error) {
      logger.error('FatSecret search failed', {
        query,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get detailed food information by ID
   * @param {string} foodId - FatSecret food ID
   * @returns {Promise<Object|null>} Food item in standard format
   */
  async getFoodById(foodId) {
    if (!this.isConfigured()) {
      return null;
    }

    const cacheKey = cacheService.key('fatsecret', 'food', foodId);

    try {
      return await cacheService.wrap(cacheKey, async () => {
        const data = await this.apiRequest('food.get.v4', {
          food_id: foodId,
        });

        if (!data.food) {
          return null;
        }

        return this.transformDetailedFood(data.food);
      }, 30 * 24 * 3600); // 30 day cache for individual foods
    } catch (error) {
      logger.error('FatSecret get food failed', {
        foodId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Transform FatSecret search result to standard format
   * Note: Search results have limited nutrition data in the description
   */
  transformToStandardFormat(food) {
    // Parse nutrition from description string
    // Format: "Per 100g - Calories: 52kcal | Fat: 0.17g | Carbs: 13.81g | Protein: 0.26g"
    const nutrition = this.parseNutritionDescription(food.food_description);

    return {
      id: `fatsecret_${food.food_id}`,
      externalId: food.food_id,
      name: food.food_name,
      brand: food.brand_name || '',
      source: 'fatsecret',
      confidence: 'verified',
      nutrition: {
        calories_per_serving: nutrition.calories || 0,
        protein_grams: nutrition.protein || 0,
        carbs_grams: nutrition.carbs || 0,
        fat_grams: nutrition.fat || 0,
        fiber_grams: nutrition.fiber || 0,
        sugar_grams: nutrition.sugar || 0,
        sodium_mg: nutrition.sodium || 0,
      },
      serving: {
        size: 1,
        unit: nutrition.servingDescription || 'serving',
      },
      food_type: food.food_type, // 'Brand' or 'Generic'
      food_url: food.food_url,
    };
  }

  /**
   * Transform detailed food response (from food.get.v4)
   */
  transformDetailedFood(food) {
    // Get the default serving or first serving
    const servings = food.servings && food.servings.serving;
    const serving = Array.isArray(servings) ? servings[0] : servings;

    if (!serving) {
      return this.transformToStandardFormat(food);
    }

    return {
      id: `fatsecret_${food.food_id}`,
      externalId: food.food_id,
      name: food.food_name,
      brand: food.brand_name || '',
      source: 'fatsecret',
      confidence: 'verified',
      nutrition: {
        calories_per_serving: parseFloat(serving.calories) || 0,
        protein_grams: parseFloat(serving.protein) || 0,
        carbs_grams: parseFloat(serving.carbohydrate) || 0,
        fat_grams: parseFloat(serving.fat) || 0,
        fiber_grams: parseFloat(serving.fiber) || 0,
        sugar_grams: parseFloat(serving.sugar) || 0,
        sodium_mg: parseFloat(serving.sodium) || 0,
        saturated_fat_grams: parseFloat(serving.saturated_fat) || 0,
        cholesterol_mg: parseFloat(serving.cholesterol) || 0,
        potassium_mg: parseFloat(serving.potassium) || 0,
      },
      serving: {
        size: parseFloat(serving.number_of_units) || 1,
        unit: serving.serving_description || 'serving',
        metric_amount: parseFloat(serving.metric_serving_amount) || null,
        metric_unit: serving.metric_serving_unit || null,
      },
      food_type: food.food_type,
      food_url: food.food_url,
      allServings: Array.isArray(servings) ? servings : [servings],
    };
  }

  /**
   * Parse nutrition info from FatSecret description string
   * Example: "Per 100g - Calories: 52kcal | Fat: 0.17g | Carbs: 13.81g | Protein: 0.26g"
   * Example: "Per 1 cup - Calories: 134kcal | Fat: 0.50g | Carbs: 34.50g | Protein: 0.50g"
   */
  parseNutritionDescription(description) {
    if (!description) return {};

    const result = {};

    // Extract serving description
    const servingMatch = description.match(/^Per\s+(.+?)\s*-/i);
    if (servingMatch) {
      result.servingDescription = servingMatch[1];
    }

    // Extract calories
    const caloriesMatch = description.match(/Calories:\s*([\d.]+)/i);
    if (caloriesMatch) {
      result.calories = parseFloat(caloriesMatch[1]);
    }

    // Extract fat
    const fatMatch = description.match(/Fat:\s*([\d.]+)/i);
    if (fatMatch) {
      result.fat = parseFloat(fatMatch[1]);
    }

    // Extract carbs
    const carbsMatch = description.match(/Carbs:\s*([\d.]+)/i);
    if (carbsMatch) {
      result.carbs = parseFloat(carbsMatch[1]);
    }

    // Extract protein
    const proteinMatch = description.match(/Protein:\s*([\d.]+)/i);
    if (proteinMatch) {
      result.protein = parseFloat(proteinMatch[1]);
    }

    return result;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      hasToken: !!this.accessToken,
      tokenExpiry: this.tokenExpiry ? new Date(this.tokenExpiry).toISOString() : null,
    };
  }
}

module.exports = new FatSecretService();
