// packages/api/src/services/aiBalancerService.js
/**
 * Load Balancer Service
 *
 * Handles round-robin provider selection within model families.
 * Tracks provider health, scores, and latency.
 * Uses Redis DB 1 for operational state.
 */

import redis from 'redis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
const configPath = path.resolve(__dirname, '../config/aiRouting.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Load families configuration
const familiesPath = path.resolve(__dirname, '../../../../', config.familiesConfigPath);
const familiesConfig = JSON.parse(fs.readFileSync(familiesPath, 'utf-8'));

// Redis client for state (DB 1)
const stateClient = redis.createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port
  },
  database: config.redis.stateDB
});

stateClient.on('error', (err) => logger.error({ err }, '[LoadBalancer] Redis state error'));
stateClient.on('connect', () => logger.info('[LoadBalancer] Redis state connected (DB 1)'));

// Connection promise for lazy initialization
let connectionPromise = null;
function ensureConnection() {
  if (!connectionPromise) {
    connectionPromise = stateClient.connect().catch(err => {
      logger.error({ err }, '[LoadBalancer] Failed to connect to Redis');
      connectionPromise = null; // Reset to allow retry
      throw err;
    });
  }
  return connectionPromise;
}

class LoadBalancer {
  constructor() {
    this.families = familiesConfig.families;
    this.taskRouting = familiesConfig.taskRouting;
  }

  /**
   * Get next provider for a family using round-robin
   * @param {string} familyName - Model family name (llama, qwen, etc.)
   * @returns {Promise<string>} - Provider name
   */
  async getNextProvider(familyName) {
    await ensureConnection();

    const family = this.families[familyName];
    if (!family) {
      throw new Error(`Unknown family: ${familyName}`);
    }

    const providers = family.providers;
    const key = `roundrobin:${familyName}:index`;

    // Get available providers (filter out those on cooldown)
    const availableProviders = [];
    for (const provider of providers) {
      const isAvailable = await this.isProviderAvailable(provider);
      if (isAvailable) {
        availableProviders.push(provider);
      }
    }

    if (availableProviders.length === 0) {
      logger.warn(`[LoadBalancer] No available providers in family ${familyName}, using all`);
      // Fallback: use all providers even if on cooldown
      return providers[0];
    }

    // Atomic increment for round-robin
    const index = await stateClient.incr(key);

    const wrappedIndex = (index - 1) % availableProviders.length;
    const provider = availableProviders[wrappedIndex];

    if (config.debug) {
      logger.debug(`[LoadBalancer] Family: ${familyName}, Index: ${index}, Provider: ${provider}`);
    }

    return provider;
  }

  /**
   * Check if provider is available (not on cooldown)
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} - True if available
   */
  async isProviderAvailable(provider) {
    await ensureConnection();
    const key = `provider:${provider}:unavailable`;
    const value = await stateClient.get(key);
    return !value;
  }

  /**
   * Mark provider as unavailable (cooldown)
   * @param {string} provider - Provider name
   * @param {number} cooldownSeconds - Cooldown duration in seconds
   */
  async markProviderUnavailable(provider, cooldownSeconds = config.healthTracking.cooldownSeconds) {
    await ensureConnection();
    const key = `provider:${provider}:unavailable`;
    await stateClient.setEx(key, cooldownSeconds, 'true');

    // Update provider score
    await this.updateProviderScore(provider, 'failure');

    if (config.telemetry.logToConsole) {
      logger.info(`[LoadBalancer] Provider ${provider} marked unavailable for ${cooldownSeconds}s`);
    }
  }

  /**
   * Get provider score
   * @param {string} provider - Provider name
   * @returns {Promise<object>} - Score data
   */
  async getProviderScore(provider) {
    await ensureConnection();
    const key = `provider:scores`;
    const scoreData = await stateClient.hGet(key, provider);

    if (!scoreData) {
      return {
        successCount: 0,
        failureCount: 0,
        score: 0,
        avgLatency: 0,
        lastSuccess: null,
        lastFailure: null,
        cooldownUntil: null
      };
    }

    return JSON.parse(scoreData);
  }

  /**
   * Update provider score
   * @param {string} provider - Provider name
   * @param {string} outcome - 'success' or 'failure'
   * @param {number} latency - Request latency in ms (optional)
   */
  async updateProviderScore(provider, outcome, latency = null) {
    const scoreData = await this.getProviderScore(provider);

    if (outcome === 'success') {
      scoreData.successCount += 1;
      scoreData.lastSuccess = Date.now();
    } else if (outcome === 'failure') {
      scoreData.failureCount += 1;
      scoreData.lastFailure = Date.now();

      // Set cooldown if threshold exceeded
      if (scoreData.failureCount >= config.healthTracking.failureThreshold) {
        scoreData.cooldownUntil = Date.now() + (config.healthTracking.cooldownSeconds * 1000);
      }
    }

    // Update score: success - failure
    scoreData.score = scoreData.successCount - scoreData.failureCount;

    // Update average latency
    if (latency !== null) {
      if (scoreData.avgLatency === 0) {
        scoreData.avgLatency = latency;
      } else {
        // Moving average
        scoreData.avgLatency = (scoreData.avgLatency * 0.9) + (latency * 0.1);
      }
    }

    // Save to Redis
    await ensureConnection();
    const key = `provider:scores`;
    await stateClient.hSet(key, provider, JSON.stringify(scoreData));

    if (config.debug) {
      logger.debug({ scoreData }, `[LoadBalancer] Updated score for ${provider}`);
    }
  }

  /**
   * Track provider latency
   * @param {string} provider - Provider name
   * @param {number} latency - Request latency in ms
   */
  async trackProviderLatency(provider, latency) {
    await this.updateProviderScore(provider, 'success', latency);

    if (config.telemetry.includeLatency && config.telemetry.logToConsole) {
      logger.info(`[LoadBalancer] Provider ${provider} latency: ${latency}ms`);
    }
  }

  /**
   * Should skip provider based on score
   * Phase 2C: Implement weighted selection based on scores
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} - True if should skip
   */
  async shouldSkipProvider(provider) {
    const scoreData = await this.getProviderScore(provider);

    // Skip if on cooldown
    if (scoreData.cooldownUntil && scoreData.cooldownUntil > Date.now()) {
      return true;
    }

    // Phase 2C: Skip if score below threshold
    // const SCORE_THRESHOLD = -5;
    // return scoreData.score < SCORE_THRESHOLD;

    return false;
  }

  /**
   * Get all provider scores for monitoring
   * @returns {Promise<object>} - Object with provider scores
   */
  async getAllProviderScores() {
    await ensureConnection();
    const key = `provider:scores`;
    const scores = await stateClient.hGetAll(key) || {};

    // Parse JSON values
    const parsed = {};
    for (const [provider, data] of Object.entries(scores)) {
      parsed[provider] = JSON.parse(data);
    }

    return parsed;
  }

  /**
   * Reset round-robin state for a family
   * @param {string} familyName - Model family name
   */
  async resetRoundRobin(familyName) {
    await ensureConnection();
    const key = `roundrobin:${familyName}:index`;
    await stateClient.set(key, '0');

    logger.info(`[LoadBalancer] Reset round-robin for family ${familyName}`);
  }
}

export default LoadBalancer;
