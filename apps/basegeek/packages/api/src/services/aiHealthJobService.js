// packages/api/src/services/aiHealthJobService.js
/**
 * Background Health Job Service
 *
 * Periodically checks and clears expired provider cooldowns.
 * Logs provider health status for monitoring.
 * Phase 2C: Add score decay and adaptive health checks.
 */

import LoadBalancer from './aiBalancerService.js';
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
const familiesConfig = JSON.parse(fs.readFileSync(familiesPath, 'utf-8'));class HealthJobService {
  constructor() {
    this.loadBalancer = new LoadBalancer();
    this.jobInterval = null;
    this.isRunning = false;
  }

  /**
   * Start background health check job
   */
  start() {
    if (!config.healthTracking.enabled || !config.healthTracking.backgroundJobEnabled) {
      logger.info('[HealthJob] Background health job disabled in config');
      return;
    }

    if (this.isRunning) {
      logger.warn('[HealthJob] Health job already running');
      return;
    }

    this.isRunning = true;
    const intervalMs = config.healthTracking.backgroundJobInterval;

    logger.info(`[HealthJob] Starting background health job (interval: ${intervalMs}ms)`);

    // Run immediately on start
    this.checkProviderHealth();

    // Schedule periodic checks
    this.jobInterval = setInterval(() => {
      this.checkProviderHealth();
    }, intervalMs);
  }

  /**
   * Stop background health check job
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('[HealthJob] Health job not running');
      return;
    }

    if (this.jobInterval) {
      clearInterval(this.jobInterval);
      this.jobInterval = null;
    }

    this.isRunning = false;
    logger.info('[HealthJob] Stopped background health job');
  }

  /**
   * Check health of all providers
   */
  async checkProviderHealth() {
    try {
      const now = Date.now();
      const allProviders = this.getAllProviders();
      const scores = await this.loadBalancer.getAllProviderScores();

      logger.info(`[HealthJob] Checking health for ${allProviders.length} providers...`);

      let clearedCount = 0;
      const healthStatus = {};

      for (const provider of allProviders) {
        const scoreData = scores[provider] || {
          successCount: 0,
          failureCount: 0,
          score: 0,
          avgLatency: 0,
          lastSuccess: null,
          lastFailure: null,
          cooldownUntil: null
        };

        // Check if cooldown expired
        if (scoreData.cooldownUntil && scoreData.cooldownUntil < now) {
          // Clear cooldown by resetting score data
          scoreData.cooldownUntil = null;

          // Optional: Reset failure count after cooldown expires
          // scoreData.failureCount = 0;
          // scoreData.score = scoreData.successCount;

          await this.loadBalancer.updateProviderScore(provider, 'recovery');
          clearedCount++;

          logger.info(`[HealthJob] ✓ Cleared cooldown for ${provider}`);
        }

        // Check provider availability
        const isAvailable = await this.loadBalancer.isProviderAvailable(provider);

        healthStatus[provider] = {
          available: isAvailable,
          score: scoreData.score,
          successCount: scoreData.successCount,
          failureCount: scoreData.failureCount,
          avgLatency: scoreData.avgLatency,
          cooldownUntil: scoreData.cooldownUntil,
          status: isAvailable ? 'healthy' : 'on-cooldown'
        };
      }

      logger.info(`[HealthJob] Health check complete. Cleared ${clearedCount} cooldowns.`);

      // Log detailed status if debug enabled
      if (config.debug) {
        logger.info('[HealthJob] Provider health status:');
        for (const [provider, status] of Object.entries(healthStatus)) {
          logger.info(`  - ${provider}: ${status.status} (score: ${status.score}, latency: ${status.avgLatency}ms)`);
        }
      }

      // Log telemetry
      if (config.telemetry.logToConsole) {
        const summary = {
          timestamp: now,
          totalProviders: allProviders.length,
          healthyProviders: Object.values(healthStatus).filter(s => s.available).length,
          cooldownsCleared: clearedCount,
          avgScore: this.calculateAvgScore(healthStatus),
          avgLatency: this.calculateAvgLatency(healthStatus)
        };
        logger.info({ summary }, '[HealthJob] Summary');
      }

    } catch (error) {
      logger.error({ err: error }, '[HealthJob] Error during health check');
    }
  }

  /**
   * Get all providers from families config
   * @returns {array} - Array of provider names
   */
  getAllProviders() {
    const providersSet = new Set();

    for (const family of Object.values(familiesConfig.families)) {
      family.providers.forEach(p => providersSet.add(p));
    }

    return Array.from(providersSet);
  }

  /**
   * Calculate average score across all providers
   * @param {object} healthStatus - Provider health status
   * @returns {number} - Average score
   */
  calculateAvgScore(healthStatus) {
    const scores = Object.values(healthStatus).map(s => s.score);
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * Calculate average latency across all providers
   * @param {object} healthStatus - Provider health status
   * @returns {number} - Average latency in ms
   */
  calculateAvgLatency(healthStatus) {
    const latencies = Object.values(healthStatus)
      .map(s => s.avgLatency)
      .filter(l => l > 0);

    if (latencies.length === 0) return 0;
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }

  /**
   * Manual health check trigger (for testing)
   * @returns {Promise<object>} - Health status
   */
  async manualCheck() {
    await this.checkProviderHealth();
    return await this.loadBalancer.getAllProviderScores();
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create HealthJobService instance
 * @returns {HealthJobService}
 */
function getInstance() {
  if (!instance) {
    instance = new HealthJobService();
  }
  return instance;
}

export {
  HealthJobService,
  getInstance
};

/**
 * Auto-start if enabled (can be disabled for testing)
 */
export function autoStart() {
  const service = getInstance();
  service.start();
}
