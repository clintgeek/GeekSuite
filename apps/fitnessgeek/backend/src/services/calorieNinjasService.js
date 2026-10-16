/**
 * CalorieNinjas API Service
 *
 * Provides natural language food parsing and nutrition lookup.
 * Free tier: 10,000 API calls/month
 *
 * @see https://calorieninjas.com/api
 */

import axios from 'axios';
import logger from '../config/logger.js';
import cacheService from './cacheService.js';
import { createBreaker } from '../lib/breakers.js';

const calorieNinjasBreaker = createBreaker('calorieninjas', (task) => task());

/**
 * How long a rejected key keeps this source switched off.
 *
 * A key the upstream says is invalid will be invalid on the next call too:
 * production answered `400 Invalid API Key.` on every search for days
 * (REVIEW_2026-10 §2), and each of those was a round trip paid for nothing. A
 * new key only reaches the container with a recreate (DOCS/CONTEXT.md, the
 * env landmine), which restarts the process and clears this anyway — the
 * cooldown is only there so a key fixed upstream comes back on its own.
 */
const BAD_KEY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * Is this failure the key, rather than the request or the network?
 * CalorieNinjas answers a bad key with 400 and the text "Invalid API Key.";
 * 401/403 are the conventional shapes of the same answer.
 */
export function isInvalidKeyError(error) {
  const status = error?.response?.status;
  if (![400, 401, 403].includes(status)) return false;
  const data = error.response.data;
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
  return /invalid\s*api\s*key|api\s*key\s*(is\s*)?invalid/i.test(text);
}

class CalorieNinjasService {
  constructor() {
    this.apiKey = process.env.CALORIENINJAS_API_KEY;
    this.baseUrl = 'https://api.calorieninjas.com/v1';
    // Set when the upstream rejected the key: until then, this source is
    // skipped without a call. See BAD_KEY_COOLDOWN_MS.
    this.keyRejectedUntil = 0;
  }

  /** Has the upstream told us this key is no good, recently? */
  isKeyRejected(now = Date.now()) {
    return this.keyRejectedUntil > now;
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

    if (this.isKeyRejected()) {
      return [];
    }

    try {
      const cacheKey = cacheService.key('calorieninjas', 'search', query.toLowerCase());

      const items = await cacheService.wrap(cacheKey, async () => {
        try {
          const response = await calorieNinjasBreaker.fire(() => axios.get(`${this.baseUrl}/nutrition`, {
            params: { query },
            headers: {
              'X-Api-Key': this.apiKey
            },
            timeout: 10000
          }));

          if (!response.data || !response.data.items) {
            return [];
          }

          return response.data.items.map(item => this.transformToStandardFormat(item));
        } catch (error) {
          if (isInvalidKeyError(error)) {
            // A configuration failure, not a search failure: say it once, by
            // the variable's NAME, and stop calling until the cooldown ends.
            if (!this.isKeyRejected()) {
              logger.warn({
                status: error.response?.status,
                retryAfterHours: BAD_KEY_COOLDOWN_MS / 3600000
              }, 'CalorieNinjas rejected CALORIENINJAS_API_KEY as invalid — skipping this source until it is renewed');
            }
            this.keyRejectedUntil = Date.now() + BAD_KEY_COOLDOWN_MS;
            return null;
          }
          logger.warn({
            query,
            error: error.message,
            status: error.response?.status,
            data: error.response?.data
          }, 'CalorieNinjas search failed');
          // null, not []: a failure must not be cached for a week as "this
          // query has no results".
          return null;
        }
      }, 7 * 24 * 3600); // 7 day cache

      return items || [];

    } catch (error) {
      logger.warn({
        query,
        error: error.message,
        status: error.response?.status
      }, 'CalorieNinjas search failed');
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

export default new CalorieNinjasService();
