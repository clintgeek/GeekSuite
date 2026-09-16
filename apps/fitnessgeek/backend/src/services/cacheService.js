/**
 * Cache Service
 * 
 * Provides high-level caching utilities with Redis backend.
 * Handles serialization, TTL management, and cache invalidation.
 */

import redisClient from '../config/redis.js';
import logger from '../config/logger.js';

class CacheService {
  constructor() {
    this.prefix = 'fg:'; // FitnessGeek cache prefix
  }

  /**
   * Generate cache key with prefix
   */
  key(namespace, ...parts) {
    return `${this.prefix}${namespace}:${parts.join(':')}`;
  }

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Parsed value or null if not found
   */
  async get(key) {
    try {
      if (!redisClient.isReady()) {
        logger.debug('Redis not ready, cache miss');
        return null;
      }

      const client = redisClient.getClient();
      const value = await client.get(key);
      
      if (!value) {
        logger.debug({ key }, 'Cache miss');
        return null;
      }

      logger.debug({ key }, 'Cache hit');
      return JSON.parse(value);

    } catch (error) {
      logger.error({ key, error: error.message }, 'Cache get error');
      return null;
    }
  }

  /**
   * Set cached value with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache (will be JSON stringified)
   * @param {number} ttlSeconds - Time to live in seconds
   */
  async set(key, value, ttlSeconds = 3600) {
    try {
      if (!redisClient.isReady()) {
        logger.debug('Redis not ready, skipping cache set');
        return false;
      }

      const client = redisClient.getClient();
      const serialized = JSON.stringify(value);
      
      await client.setEx(key, ttlSeconds, serialized);
      logger.debug({ key, ttl: ttlSeconds }, 'Cache set');
      
      return true;

    } catch (error) {
      logger.error({ key, error: error.message }, 'Cache set error');
      return false;
    }
  }

  /**
   * Delete a specific cache key
   */
  async delete(key) {
    try {
      if (!redisClient.isReady()) {
        return false;
      }

      const client = redisClient.getClient();
      await client.del(key);
      logger.debug({ key }, 'Cache deleted');
      
      return true;

    } catch (error) {
      logger.error({ key, error: error.message }, 'Cache delete error');
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Redis pattern (e.g., "fg:ai:user:123:*")
   */
  async deletePattern(pattern) {
    try {
      if (!redisClient.isReady()) {
        return false;
      }

      const client = redisClient.getClient();
      const keys = await client.keys(pattern);
      
      if (keys.length > 0) {
        await client.del(keys);
        logger.debug({ pattern, count: keys.length }, 'Cache pattern deleted');
      }
      
      return true;

    } catch (error) {
      logger.error({ pattern, error: error.message }, 'Cache pattern delete error');
      return false;
    }
  }

  /**
   * Wrapper for cache-aside pattern
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if cache miss
   * @param {number} ttl - TTL in seconds
   * @returns {Promise<any>} Cached or fetched data
   */
  async wrap(key, fetchFn, ttl = 3600) {
    try {
      // Try cache first
      const cached = await this.get(key);
      if (cached !== null) {
        return cached;
      }

      // Cache miss - fetch data
      const data = await fetchFn();
      
      // Store in cache
      if (data !== null && data !== undefined) {
        await this.set(key, data, ttl);
      }
      
      return data;

    } catch (error) {
      logger.error({ key, error: error.message }, 'Cache wrap error');
      // On error, try to fetch directly without caching
      return await fetchFn();
    }
  }

  // ============================================
  // CACHE INVALIDATION HELPERS
  // ============================================

  /**
   * Invalidate all user-specific caches
   */
  async invalidateUser(userId) {
    await this.deletePattern(`${this.prefix}*:user:${userId}:*`);
    logger.info({ userId }, 'User cache invalidated');
  }

  /**
   * Invalidate AI insights for a user
   */
  async invalidateUserAI(userId) {
    await this.deletePattern(`${this.prefix}ai:user:${userId}:*`);
    logger.info({ userId }, 'User AI cache invalidated');
  }

  /**
   * Invalidate food reports for a user
   */
  async invalidateUserReports(userId) {
    await this.deletePattern(`${this.prefix}reports:user:${userId}:*`);
    logger.info({ userId }, 'User reports cache invalidated');
  }
}

export default new CacheService();
