/**
 * AI Food Classification Cache Service
 *
 * Caches AI classification results to avoid repeated API calls.
 * Classifications are much more stable than full nutrition parsing,
 * so we can cache them longer.
 *
 * "starbucks caramel macchiato" will always classify as:
 * { type: 'branded', brand: 'Starbucks', ... }
 */

var crypto = require('crypto');
var logger = require('../config/logger');
var AIFoodPromptCache = require('../models/AIFoodPromptCache');

var AIClassificationCacheService = {
  /**
   * Normalize input for consistent cache keys
   */
  normalizeInput: function(input) {
    if (typeof input !== 'string') return '';
    return input.trim().toLowerCase().replace(/\s+/g, ' ');
  },

  /**
   * Generate hash for cache lookup
   */
  hashInput: function(input) {
    return crypto.createHash('sha256').update(input || '').digest('hex');
  },

  /**
   * Get cached classification
   * @param {string} userId - User ID
   * @param {string} input - Original input text
   * @returns {Promise<Object|null>} Cached classification or null
   */
  get: async function(userId, input) {
    try {
      var normalized = this.normalizeInput(input);
      var hash = this.hashInput(normalized);

      var doc = await AIFoodPromptCache.findOne({
        user_id: userId,
        prompt_hash: hash,
        source_prompt: 'classification' // Mark classification entries
      });

      if (!doc) {
        logger.debug('Classification cache miss', { userId: userId, hash: hash.substring(0, 8) });
        return null;
      }

      // Update hit counter
      await AIFoodPromptCache.updateOne(
        { _id: doc._id },
        {
          $inc: { hit_count: 1 },
          $set: { last_used_at: new Date() }
        }
      );

      logger.debug('Classification cache hit', {
        userId: userId,
        hash: hash.substring(0, 8),
        type: doc.result && doc.result.type
      });

      return doc.result;
    } catch (error) {
      logger.error('Classification cache lookup failed', {
        error: error.message,
        userId: userId
      });
      return null;
    }
  },

  /**
   * Save classification to cache
   * @param {string} userId - User ID
   * @param {string} input - Original input text
   * @param {Object} classification - Classification result
   */
  save: async function(userId, input, classification) {
    try {
      var normalized = this.normalizeInput(input);
      var hash = this.hashInput(normalized);

      await AIFoodPromptCache.findOneAndUpdate(
        {
          user_id: userId,
          prompt_hash: hash,
          source_prompt: 'classification'
        },
        {
          $set: {
            user_id: userId,
            normalized_prompt: normalized,
            prompt_hash: hash,
            context_hash: 'classification',
            user_input: input,
            source_prompt: 'classification',
            result: classification,
            last_used_at: new Date()
          },
          $setOnInsert: {
            hit_count: 0
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      logger.debug('Classification cached', {
        userId: userId,
        hash: hash.substring(0, 8),
        type: classification.type
      });
    } catch (error) {
      logger.error('Classification cache write failed', {
        error: error.message,
        userId: userId
      });
      // Don't throw - caching failure shouldn't break the flow
    }
  },

  /**
   * Get or compute classification with caching
   * @param {string} userId - User ID
   * @param {string} input - Original input text
   * @param {Function} computeFn - Function to compute classification if not cached
   * @returns {Promise<Object>} Classification result
   */
  getOrCompute: async function(userId, input, computeFn) {
    // Try cache first
    var cached = await this.get(userId, input);
    if (cached) {
      return cached;
    }

    // Compute classification
    var result = await computeFn(input);

    // Cache the result (fire and forget)
    this.save(userId, input, result);

    return result;
  }
};

module.exports = AIClassificationCacheService;
