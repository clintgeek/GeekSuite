// packages/api/src/services/aiRouterService.js
/**
 * Model Family Router Service
 *
 * Routes AI requests to appropriate model families based on task type.
 * Integrates with LoadBalancer for provider selection.
 * Manages context caching (Redis DB 0).
 * Phase 2A: Dry-run telemetry only, no live API calls.
 */

import redis from 'redis';
import TaskDetector from './aiTaskDetector.js';
import LoadBalancer from './aiBalancerService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
const configPath = path.resolve(__dirname, '../config/aiRouting.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Load families configuration
const familiesPath = path.resolve(__dirname, '../../../../', config.familiesConfigPath);
const familiesConfig = JSON.parse(fs.readFileSync(familiesPath, 'utf-8'));

// Redis client for context cache (DB 0)
const contextClient = redis.createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port
  },
  database: config.redis.contextCacheDB
});

contextClient.on('error', (err) => console.error('[ModelFamilyRouter] Redis context error:', err));
contextClient.on('connect', () => console.log('[ModelFamilyRouter] Redis context connected (DB 0)'));

// Connection promise for lazy initialization
let connectionPromise = null;
function ensureConnection() {
  if (!connectionPromise) {
    connectionPromise = contextClient.connect().catch(err => {
      console.error('[ModelFamilyRouter] Failed to connect to Redis:', err.message);
      connectionPromise = null; // Reset to allow retry
      throw err;
    });
  }
  return connectionPromise;
}

class ModelFamilyRouter {
  constructor() {
    this.taskDetector = new TaskDetector();
    this.loadBalancer = new LoadBalancer();
    this.families = familiesConfig.families;
    this.taskRouting = familiesConfig.taskRouting;
  }

  /**
   * Route AI request to appropriate model family
   * Phase 2A: Dry-run only, logs routing decisions without executing
   * @param {object} params - Request parameters
   * @param {string} params.conversationId - Conversation ID for context tracking
   * @param {string} params.prompt - User prompt
   * @param {string} params.taskTypeHint - Optional task type hint from client
   * @param {boolean} params.dryRun - Dry-run mode (default: true for Phase 2A)
   * @returns {Promise<object>} - Routing decision and telemetry
   */
  async routeTask({ conversationId, prompt, taskTypeHint = null, dryRun = config.telemetry.dryRunMode }) {
    const startTime = Date.now();

    try {
      // 1. Detect task type
      const taskType = taskTypeHint || this.taskDetector.detectTask(prompt);
      const confidence = this.taskDetector.getConfidence(prompt, taskType);

      if (config.debug) {
        const scores = this.taskDetector.getAllScores(prompt);
        console.log('[ModelFamilyRouter] Task detection scores:', scores);
      }

      // 2. Get family for task type
      const familyName = this.taskRouting[taskType] || this.taskRouting['general'];
      const family = this.families[familyName];

      if (!family) {
        throw new Error(`Unknown family: ${familyName}`);
      }

      // 3. Get next provider via LoadBalancer
      const nextProvider = await this.loadBalancer.getNextProvider(familyName);

      // 4. Get provider score
      const providerScore = await this.loadBalancer.getProviderScore(nextProvider);

      // 5. Check context cache (Phase 2A½)
      const cachedContext = await this.getContext(conversationId, familyName);

      // 6. Build routing decision
      const decisionLog = {
        timestamp: Date.now(),
        conversationId,
        taskType,
        taskConfidence: confidence,
        family: familyName,
        familyStrengths: family.strengths,
        selectedProvider: nextProvider,
        providerScore: config.telemetry.includeProviderScore ? providerScore.score : undefined,
        providerAvgLatency: config.telemetry.includeLatency ? providerScore.avgLatency : undefined,
        contextCached: cachedContext !== null,
        dryRun,
        routingLatency: Date.now() - startTime
      };

      // 7. Log telemetry
      if (config.telemetry.logToConsole) {
        console.log('[DRY RUN - Phase 2A]', JSON.stringify(decisionLog, null, 2));
      }

      if (config.telemetry.logToFile) {
        this.logToFile(decisionLog);
      }

      // 8. Phase 2A: Return dry-run result
      if (dryRun) {
        return {
          ...decisionLog,
          result: 'dry-run',
          message: 'Phase 2A: Routing decision logged, no API call executed'
        };
      }

      // 9. Phase 2B+: Execute actual API call here
      // const aiResponse = await this.executeAICall(nextProvider, prompt, cachedContext);
      // await this.loadBalancer.trackProviderLatency(nextProvider, Date.now() - startTime);
      // return { ...decisionLog, result: aiResponse };

      return decisionLog;

    } catch (error) {
      console.error('[ModelFamilyRouter] Routing error:', error);

      // Log error telemetry
      const errorLog = {
        timestamp: Date.now(),
        conversationId,
        error: error.message,
        routingLatency: Date.now() - startTime
      };

      if (config.telemetry.logToConsole) {
        console.error('[ERROR]', JSON.stringify(errorLog, null, 2));
      }

      throw error;
    }
  }

  /**
   * Get cached context for conversation
   * Phase 2A½: Basic cache lookup
   * Phase 2B: Implement context strategies (summarize-old, prune-old, etc.)
   * @param {string} conversationId - Conversation ID
   * @param {string} family - Model family name
   * @returns {Promise<object|null>} - Cached context or null
   */
  async getContext(conversationId, family) {
    if (!config.contextManagement.cacheEnabled) {
      return null;
    }

    await ensureConnection();
    const key = `family:${family}:conv:${conversationId}:summary`;
    const cached = await contextClient.get(key);

    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Cache context for conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} family - Model family name
   * @param {object} summary - Context summary
   * @param {number} ttl - Time to live in seconds (default: 1 hour)
   */
  async cacheContext(conversationId, family, summary, ttl = 3600) {
    if (!config.contextManagement.cacheEnabled) {
      return;
    }

    await ensureConnection();
    const key = `family:${family}:conv:${conversationId}:summary`;
    await contextClient.setEx(key, ttl, JSON.stringify(summary));

    if (config.debug) {
      console.log(`[ModelFamilyRouter] Cached context for ${conversationId} in family ${family}`);
    }
  }

  /**
   * Apply context strategy to messages
   * Phase 2B: Implement summarization, pruning, etc.
   * @param {string} strategy - Strategy name (maintain-full, summarize-old, prune-old)
   * @param {array} messages - Conversation messages
   * @returns {Promise<array>} - Processed messages
   */
  async applyContextStrategy(strategy, messages) {
    // Stub for Phase 2B
    // For now, return messages as-is
    if (config.debug) {
      console.log(`[ModelFamilyRouter] Context strategy stub: ${strategy} (Phase 2B)`);
    }
    return messages;
  }

  /**
   * Select optimal model within family
   * Phase 2C: Implement weighted selection based on scores, latency, cost
   * @param {string} familyName - Model family name
   * @param {object} criteria - Selection criteria (latency, cost, context window)
   * @returns {Promise<string>} - Selected provider
   */
  async selectOptimalModel(familyName, criteria = {}) {
    // Stub for Phase 2C
    // For now, use round-robin
    if (config.debug) {
      console.log(`[ModelFamilyRouter] Optimal model selection stub: ${familyName} (Phase 2C)`);
    }
    return await this.loadBalancer.getNextProvider(familyName);
  }

  /**
   * Get provider metadata from cache
   * Phase 2A: Cache provider limits, context windows, costs
   * @param {string} provider - Provider name
   * @returns {Promise<object|null>} - Provider metadata
   */
  async getProviderMetadata(provider) {
    await ensureConnection();
    const key = `provider:metadata:${provider}`;
    const cached = await contextClient.get(key);

    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Cache provider metadata
   * @param {string} provider - Provider name
   * @param {object} metadata - Provider metadata
   * @param {number} ttl - Time to live in seconds (default: 1 hour)
   */
  async cacheProviderMetadata(provider, metadata, ttl = 3600) {
    await ensureConnection();
    const key = `provider:metadata:${provider}`;
    await contextClient.setEx(key, ttl, JSON.stringify(metadata));

    if (config.debug) {
      console.log(`[ModelFamilyRouter] Cached metadata for provider ${provider}`);
    }
  }

  /**
   * Log telemetry to file
   * @param {object} log - Telemetry log
   */
  logToFile(log) {
    try {
      const logDir = path.dirname(config.telemetry.logPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const logLine = JSON.stringify(log) + '\n';
      fs.appendFileSync(config.telemetry.logPath, logLine);
    } catch (error) {
      console.error('[ModelFamilyRouter] Failed to write to log file:', error);
    }
  }

  /**
   * Get routing statistics
   * @returns {Promise<object>} - Routing stats
   */
  async getRoutingStats() {
    const providerScores = await this.loadBalancer.getAllProviderScores();

    return {
      families: Object.keys(this.families),
      taskRouting: this.taskRouting,
      providerScores,
      config: {
        dryRunMode: config.telemetry.dryRunMode,
        contextCacheEnabled: config.contextManagement.cacheEnabled,
        healthTrackingEnabled: config.healthTracking.enabled
      }
    };
  }
}

export default ModelFamilyRouter;
