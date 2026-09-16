import crypto from 'crypto';
import logger from '../config/logger.js';
import AIFoodPromptCache from '../models/AIFoodPromptCache.js';

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
        logger.debug({ userId, promptHash }, 'AI prompt cache miss');
        return null;
      }

      await AIFoodPromptCache.updateOne(
        { _id: doc._id },
        {
          $inc: { hit_count: 1 },
          $set: { last_used_at: new Date() },
        }
      );

      logger.debug({ userId, promptHash }, 'AI prompt cache hit');
      return {
        ...doc.toObject(),
        normalizedPrompt,
      };
    } catch (error) {
      logger.error({ error: error.message, userId }, 'AI prompt cache lookup failed');
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

      logger.debug({ userId, promptHash }, 'AI prompt cache stored');
    } catch (error) {
      logger.error({ error: error.message, userId }, 'AI prompt cache write failed');
    }
  }
}

export default new AIFoodPromptCacheService();
