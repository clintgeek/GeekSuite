/**
 * CalorieNinjas API Service
 *
 * Provides natural language food parsing and nutrition lookup.
 * Free tier: 10,000 API calls/month
 *
 * @see https://calorieninjas.com/api
 */

const axios = require('axios');
const logger = require('../config/logger');
const cacheService = require('./cacheService');

class CalorieNinjasService {
  constructor() {
    this.apiKey = process.env.CALORIENINJAS_API_KEY;
    this.baseUrl = 'https://api.calorieninjas.com/v1';
  }

  /**
   * Check if service is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Search for foods by natural language query
   * CalorieNinjas excels at parsing queries like "2 eggs and a slice of toast"
   *
   * @param {string} query - Natural language food description
   * @returns {Promise<Array>} Array of food items in standard format
   */
  async searchFoods(query) {
    if (!this.isConfigured()) {
      logger.debug('CalorieNinjas not configured, skipping');
      return [];
    }

    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      const cacheKey = cacheService.key('calorieninjas', 'search', query.toLowerCase());

      return cacheService.wrap(cacheKey, async () => {
        try {
          const response = await axios.get(`${this.baseUrl}/nutrition`, {
            params: { query },
            headers: {
              'X-Api-Key': this.apiKey
            },
            timeout: 10000
          });

          if (!response.data || !response.data.items) {
            return [];
          }

          return response.data.items.map(item => this.transformToStandardFormat(item));
        } catch (error) {
          logger.warn('CalorieNinjas search failed', {
            query,
            error: error.message,
            status: error.response?.status,
            data: error.response?.data
          });
          return [];
        }
      }, 7 * 24 * 3600); // 7 day cache

    } catch (error) {
      logger.warn('CalorieNinjas search failed', {
        query,
        error: error.message,
        status: error.response?.status
      });
      return [];
    }
  }

  /**
   * Transform CalorieNinjas response to standard format
   *
   * CalorieNinjas returns per-serving data, which is what we want.
   */
  transformToStandardFormat(item) {
    return {
      id: `cn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: item.name || 'Unknown',
      brand: '', // CalorieNinjas doesn't provide brand info
      barcode: '',
      nutrition: {
        calories_per_serving: Math.round(item.calories || 0),
        protein_grams: Math.round((item.protein_g || 0) * 10) / 10,
        carbs_grams: Math.round((item.carbohydrates_total_g || 0) * 10) / 10,
        fat_grams: Math.round((item.fat_total_g || 0) * 10) / 10,
        fiber_grams: Math.round((item.fiber_g || 0) * 10) / 10,
        sugar_grams: Math.round((item.sugar_g || 0) * 10) / 10,
        sodium_mg: Math.round(item.sodium_mg || 0)
      },
      serving: {
        size: item.serving_size_g || 100,
        unit: 'g'
      },
      source: 'calorieninjas',
      source_id: null,
      confidence: 'medium'
    };
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      enabled: this.isConfigured(),
      name: 'CalorieNinjas',
      rateLimit: '10,000/month'
    };
  }
}

module.exports = new CalorieNinjasService();
