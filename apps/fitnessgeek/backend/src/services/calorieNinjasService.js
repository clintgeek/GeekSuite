/**
 * API Ninjas nutrition (formerly CalorieNinjas)
 *
 * Natural-language food parsing and nutrition lookup ("2 eggs and toast").
 * CalorieNinjas became API Ninjas; the old api.calorieninjas.com answered
 * `400 Invalid API Key.` to every call (REVIEW_2026-10 §2).
 *
 * On API Ninjas' FREE tier `calories` and `protein_g` are premium-only: the
 * field holds a string ("Only available for premium subscribers.") instead of
 * a number. A food with no calories is worse than no food — mapped naively it
 * logs as 0 cal — so such items are dropped, and a key that only ever gets
 * locked calories switches this source off like a bad key does.
 *
 * The internal source id stays 'calorieninjas' (ranker weights, breaker,
 * foods already stored with it).
 *
 * @see https://api-ninjas.com/api/nutrition
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
  // API Ninjas and the old CalorieNinjas both answer a bad key this way.
  const status = error?.response?.status;
  if (![400, 401, 403].includes(status)) return false;
  const data = error.response.data;
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
  return /invalid\s*api\s*key|api\s*key\s*(is\s*)?invalid/i.test(text);
}

/** A real number, not the free tier's "Only available for premium subscribers." */
export function hasNumericCalories(item) {
  const v = item?.calories;
  return (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))))
    && Number.isFinite(Number(v));
}

class CalorieNinjasService {
  constructor() {
    // The old variable name still works, so a container with only that set
    // keeps running.
    this.apiKey = process.env.API_NINJAS_API_KEY || process.env.CALORIENINJAS_API_KEY;
    this.keyName = process.env.API_NINJAS_API_KEY ? 'API_NINJAS_API_KEY' : 'CALORIENINJAS_API_KEY';
    this.baseUrl = 'https://api.api-ninjas.com/v1';
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
      logger.debug('API Ninjas not configured, skipping');
      return [];
    }

    if (!query || query.trim().length < 2) {
      return [];
    }

    if (this.isKeyRejected()) {
      return [];
    }

    try {
      const cacheKey = cacheService.key('apininjas', 'search', query.toLowerCase());

      const items = await cacheService.wrap(cacheKey, async () => {
        try {
          const response = await calorieNinjasBreaker.fire(() => axios.get(`${this.baseUrl}/nutrition`, {
            params: { query },
            headers: {
              'X-Api-Key': this.apiKey
            },
            timeout: 10000
          }));

          // API Ninjas answers a bare array; CalorieNinjas wrapped it in `items`.
          const raw = Array.isArray(response.data) ? response.data : response.data?.items;
          if (!Array.isArray(raw) || raw.length === 0) {
            return [];
          }

          const usable = raw.filter(hasNumericCalories);
          if (usable.length === 0) {
            // Every item came back with calories locked: a free-tier key.
            if (!this.isKeyRejected()) {
              logger.warn({
                retryAfterHours: BAD_KEY_COOLDOWN_MS / 3600000
              }, `API Ninjas returned no calories for ${this.keyName} (calories are premium-only on the free tier) — skipping this source`);
            }
            this.keyRejectedUntil = Date.now() + BAD_KEY_COOLDOWN_MS;
            return null;
          }
          return usable.map(item => this.transformToStandardFormat(item));
        } catch (error) {
          if (isInvalidKeyError(error)) {
            // A configuration failure, not a search failure: say it once, by
            // the variable's NAME, and stop calling until the cooldown ends.
            if (!this.isKeyRejected()) {
              logger.warn({
                status: error.response?.status,
                retryAfterHours: BAD_KEY_COOLDOWN_MS / 3600000
              }, `API Ninjas rejected ${this.keyName} as invalid — skipping this source until it is renewed`);
            }
            this.keyRejectedUntil = Date.now() + BAD_KEY_COOLDOWN_MS;
            return null;
          }
          logger.warn({
            query,
            error: error.message,
            status: error.response?.status,
            data: error.response?.data
          }, 'API Ninjas nutrition search failed');
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
      }, 'API Ninjas nutrition search failed');
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
      brand: '', // no brand from this endpoint
      barcode: '',
      nutrition: {
        calories_per_serving: Math.round(Number(item.calories)),
        // Premium-only on the free tier too; a locked string reads as unknown (0).
        protein_grams: Math.round((Number(item.protein_g) || 0) * 10) / 10,
        carbs_grams: Math.round((Number(item.carbohydrates_total_g) || 0) * 10) / 10,
        fat_grams: Math.round((Number(item.fat_total_g) || 0) * 10) / 10,
        fiber_grams: Math.round((Number(item.fiber_g) || 0) * 10) / 10,
        sugar_grams: Math.round((Number(item.sugar_g) || 0) * 10) / 10,
        sodium_mg: Math.round(Number(item.sodium_mg) || 0)
      },
      serving: {
        size: Number(item.serving_size_g) || 100,
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
      name: 'API Ninjas',
      keyName: this.keyName
    };
  }
}

export default new CalorieNinjasService();
