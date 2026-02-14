const crypto = require('crypto');
const logger = require('../config/logger');
const AIFoodPromptCache = require('../models/AIFoodPromptCache');

class AIFoodPromptCacheService {
  normalizeInput(input = '') {
    if (typeof input !== 'string') return '';
    return input.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  stableSerialize(obj) {
    if (obj === null || obj === undefined) return '';
    if (typeof obj !== 'object') return String(obj);

    if (Array.isArray(obj)) {
      return `[${obj.map(item => this.stableSerialize(item)).join(',')}]`;
    }

    return `{${Object.keys(obj)
      .sort()
      .map(key => `${key}:${this.stableSerialize(obj[key])}`)
      .join(',')}}`;
  }

  hashValue(value) {
    return crypto.createHash('sha256').update(value || '').digest('hex');
  }

  buildHashes(description, userContext) {
    const normalizedPrompt = this.normalizeInput(description);
    const promptHash = this.hashValue(normalizedPrompt);
    const contextSignature = this.stableSerialize(userContext) || 'none';
    const contextHash = this.hashValue(contextSignature);
    return { normalizedPrompt, promptHash, contextHash };
  }

  async getCachedResult(userId, description, userContext = {}) {
    try {
      const { normalizedPrompt, promptHash, contextHash } = this.buildHashes(description, userContext);

      const doc = await AIFoodPromptCache.findOne({
        user_id: userId,
        prompt_hash: promptHash,
        context_hash: contextHash,
      });

      if (!doc) {
        logger.debug('AI prompt cache miss', { userId, promptHash });
        return null;
      }

      await AIFoodPromptCache.updateOne(
        { _id: doc._id },
        {
          $inc: { hit_count: 1 },
          $set: { last_used_at: new Date() },
        }
      );

      logger.debug('AI prompt cache hit', { userId, promptHash });
      return {
        ...doc.toObject(),
        normalizedPrompt,
      };
    } catch (error) {
      logger.error('AI prompt cache lookup failed', { error: error.message, userId });
      return null;
    }
  }

  async saveResult(userId, description, userContext = {}, sourcePrompt, result) {
    try {
      const { normalizedPrompt, promptHash, contextHash } = this.buildHashes(description, userContext);
      const now = new Date();

      await AIFoodPromptCache.findOneAndUpdate(
        {
          user_id: userId,
          prompt_hash: promptHash,
          context_hash: contextHash,
        },
        {
          $set: {
            user_id: userId,
            normalized_prompt: normalizedPrompt,
            user_input: description,
            source_prompt: sourcePrompt || null,
            result,
            last_used_at: now,
          },
          $setOnInsert: {
            hit_count: 0,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      logger.debug('AI prompt cache stored', { userId, promptHash });
    } catch (error) {
      logger.error('AI prompt cache write failed', { error: error.message, userId });
    }
  }
}

module.exports = new AIFoodPromptCacheService();
