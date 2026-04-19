/**
 * Rate Limit Service (Enhanced)
 *
 * Intelligent rate limit management with predictive throttling,
 * load balancing, and automatic provider selection.
 */

import logger from '../lib/logger.js';

class RateLimitService {
  constructor() {
    // Provider limits (migrated from aiService)
    this.limits = {
      cerebras: {
        tokensPerMinute: 60000,
        requestsPerMinute: 30,
        requestsPerDay: 14400,
        maxContextTokens: 128000,
        priority: 1 // Higher = better
      },
      together: {
        tokensPerMinute: 180000,
        requestsPerMinute: 600,
        maxContextTokens: 8193,
        priority: 2
      },
      llm7: {
        tokensPerMinute: 100000,
        requestsPerMinute: 150,
        maxContextTokens: 32768,
        priority: 3
      },
      onemin: {
        // No token limit, uses monthly credits
        requestsPerMinute: 180,
        creditsPerMonth: 1000000,
        maxContextTokens: 85600,
        priority: 4
      },
      groq: {
        tokensPerMinute: 12000,
        requestsPerMinute: 30,
        requestsPerDay: 14400,
        maxContextTokens: 32768,
        priority: 5
      },
      gemini: {
        tokensPerMinute: 250000,
        requestsPerMinute: 60,
        maxContextTokens: 1000000,
        priority: 6
      },
      cohere: {
        requestsPerMinute: 20,
        requestsPerMonth: 1000,
        maxContextTokens: 128000,
        priority: 7
      },
      cloudflare: {
        requestsPerMinute: 300,
        maxContextTokens: 32000,
        priority: 8
      },
      ollama: {
        requestsPerMinute: 100,
        maxContextTokens: 32000,
        priority: 9
      },
      llmgateway: {
        requestsPerMinute: 100,
        maxContextTokens: 1000000,
        priority: 10
      }
    };

    // Runtime state per provider
    this.state = {};
    for (const provider in this.limits) {
      this.state[provider] = {
        tokensUsed: 0,
        requestsUsed: 0,
        dailyRequestsUsed: 0,
        monthlyRequestsUsed: 0,
        monthlyCreditsUsed: 0,
        lastReset: Date.now(),
        lastDailyReset: Date.now(),
        lastMonthlyReset: Date.now(),
        rateLimitedUntil: null,
        // NEW: Predictive throttling
        recentRequestTimes: [], // Track last 10 requests
        avgResponseTime: 0,
        failureCount: 0,
        successCount: 0
      };
    }

    // NEW: Load balancing
    this.loadBalancer = {
      strategy: 'weighted-round-robin', // or 'least-loaded' or 'fastest-response'
      lastUsed: {},
      providerWeights: {}
    };

    // Initialize provider weights based on priority
    for (const provider in this.limits) {
      this.loadBalancer.providerWeights[provider] = 1.0;
    }
  }

  /**
   * Check if a provider can handle a request
   * @param {string} provider - Provider name
   * @param {number} estimatedTokens - Estimated token count
   * @param {number} contextTokens - Context size
   * @returns {Object} {allowed: boolean, reason?: string, waitTime?: number}
   */
  checkLimit(provider, estimatedTokens = 1000, contextTokens = 0) {
    const limits = this.limits[provider];
    const state = this.state[provider];
    
    if (!limits || !state) {
      return { allowed: false, reason: 'Provider not configured' };
    }

    const now = Date.now();

    // Reset counters if needed
    this._resetCountersIfNeeded(provider, now);

    // Check if rate limited
    if (state.rateLimitedUntil && now < state.rateLimitedUntil) {
      const waitTime = Math.ceil((state.rateLimitedUntil - now) / 1000);
      return { allowed: false, reason: 'Rate limited', waitTime };
    }

    // Check context size
    if (limits.maxContextTokens && contextTokens > limits.maxContextTokens) {
      return { 
        allowed: false, 
        reason: `Context too large (${contextTokens} > ${limits.maxContextTokens})` 
      };
    }

    // Check per-minute token limits
    if (limits.tokensPerMinute) {
      if (state.tokensUsed > 0 && state.tokensUsed + estimatedTokens > limits.tokensPerMinute) {
        const waitTime = Math.ceil((state.lastReset + 60000 - now) / 1000);
        return { 
          allowed: false, 
          reason: `Token limit exceeded (${state.tokensUsed + estimatedTokens} > ${limits.tokensPerMinute})`,
          waitTime 
        };
      }

      // Reject oversized requests (2x limit)
      if (estimatedTokens > limits.tokensPerMinute * 2) {
        return { 
          allowed: false, 
          reason: `Request too large (${estimatedTokens} > ${limits.tokensPerMinute * 2})` 
        };
      }
    }

    // Check per-minute request limits
    if (state.requestsUsed + 1 > limits.requestsPerMinute) {
      const waitTime = Math.ceil((state.lastReset + 60000 - now) / 1000);
      return { 
        allowed: false, 
        reason: `Request limit exceeded (${state.requestsUsed + 1} > ${limits.requestsPerMinute})`,
        waitTime 
      };
    }

    // Check daily limits
    if (limits.requestsPerDay && state.dailyRequestsUsed + 1 > limits.requestsPerDay) {
      const waitTime = Math.ceil((state.lastDailyReset + 86400000 - now) / 3600000);
      return { 
        allowed: false, 
        reason: `Daily limit exceeded (${state.dailyRequestsUsed + 1} > ${limits.requestsPerDay})`,
        waitTime: waitTime * 3600 // Convert hours to seconds
      };
    }

    // Check monthly limits (for Cohere)
    if (limits.requestsPerMonth && state.monthlyRequestsUsed + 1 > limits.requestsPerMonth) {
      return { 
        allowed: false, 
        reason: `Monthly limit exceeded (${state.monthlyRequestsUsed + 1} > ${limits.requestsPerMonth})`
      };
    }

    // Check monthly credits (for 1min.ai)
    if (limits.creditsPerMonth && state.monthlyCreditsUsed + estimatedTokens > limits.creditsPerMonth) {
      return { 
        allowed: false, 
        reason: `Monthly credits exceeded (${state.monthlyCreditsUsed + estimatedTokens} > ${limits.creditsPerMonth})`
      };
    }

    // NEW: Predictive throttling - check if provider is struggling
    const healthScore = this._calculateHealthScore(provider);
    if (healthScore < 0.3) {
      return {
        allowed: false,
        reason: `Provider health low (${Math.round(healthScore * 100)}%)`,
        waitTime: 30
      };
    }

    return { allowed: true };
  }

  /**
   * Record successful request
   */
  recordSuccess(provider, tokensUsed, responseTime) {
    const state = this.state[provider];
    if (!state) return;

    // Update counters
    const limits = this.limits[provider];
    if (limits.tokensPerMinute) {
      state.tokensUsed += tokensUsed;
    }
    state.requestsUsed += 1;
    
    if (limits.requestsPerDay) {
      state.dailyRequestsUsed += 1;
    }
    
    if (limits.requestsPerMonth) {
      state.monthlyRequestsUsed += 1;
    }
    
    if (limits.creditsPerMonth) {
      state.monthlyCreditsUsed += tokensUsed;
    }

    // Update performance tracking
    state.successCount += 1;
    state.recentRequestTimes.push({
      timestamp: Date.now(),
      duration: responseTime,
      success: true
    });
    
    // Keep only last 10 requests
    if (state.recentRequestTimes.length > 10) {
      state.recentRequestTimes.shift();
    }

    // Update average response time
    const successfulRequests = state.recentRequestTimes.filter(r => r.success);
    if (successfulRequests.length > 0) {
      state.avgResponseTime = successfulRequests.reduce((sum, r) => sum + r.duration, 0) / successfulRequests.length;
    }

    // Update load balancer weight (better performance = higher weight)
    this._updateProviderWeight(provider, true, responseTime);
  }

  /**
   * Record failed request
   */
  recordFailure(provider, reason = 'unknown') {
    const state = this.state[provider];
    if (!state) return;

    state.failureCount += 1;
    state.recentRequestTimes.push({
      timestamp: Date.now(),
      duration: 0,
      success: false,
      reason
    });

    // Keep only last 10 requests
    if (state.recentRequestTimes.length > 10) {
      state.recentRequestTimes.shift();
    }

    // Update load balancer weight (failures = lower weight)
    this._updateProviderWeight(provider, false);

    // If failure rate is high, temporarily rate limit
    const recentFailures = state.recentRequestTimes.filter(r => !r.success).length;
    if (recentFailures >= 3) {
      logger.info(`⚠️ ${provider} has ${recentFailures}/10 recent failures, applying cooldown`);
      state.rateLimitedUntil = Date.now() + 30000; // 30 second cooldown
    }
  }

  /**
   * Mark provider as rate limited (from API 429 response)
   */
  markRateLimited(provider, retryAfterSeconds = 60) {
    const state = this.state[provider];
    if (!state) return;

    state.rateLimitedUntil = Date.now() + (retryAfterSeconds * 1000);
    logger.info(`⏸️ ${provider} marked as rate limited for ${retryAfterSeconds}s`);

    // Lower weight significantly
    this.loadBalancer.providerWeights[provider] *= 0.5;
  }

  /**
   * Get best available provider for a request
   * @param {number} estimatedTokens - Estimated token count
   * @param {number} contextTokens - Context size
   * @param {Array<string>} preferredProviders - Ordered list of preferred providers
   * @returns {string|null} Best provider name or null
   */
  getBestProvider(estimatedTokens, contextTokens, preferredProviders = []) {
    const candidates = [];

    // Check all providers
    for (const provider in this.limits) {
      const check = this.checkLimit(provider, estimatedTokens, contextTokens);
      if (check.allowed) {
        const limits = this.limits[provider];
        const state = this.state[provider];
        const weight = this.loadBalancer.providerWeights[provider] || 1.0;
        const healthScore = this._calculateHealthScore(provider);
        
        candidates.push({
          provider,
          priority: limits.priority,
          weight,
          healthScore,
          avgResponseTime: state.avgResponseTime || 1000,
          isPreferred: preferredProviders.includes(provider)
        });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by: preferred first, then health*weight, then priority
    candidates.sort((a, b) => {
      if (a.isPreferred && !b.isPreferred) return -1;
      if (!a.isPreferred && b.isPreferred) return 1;
      
      const scoreA = a.healthScore * a.weight;
      const scoreB = b.healthScore * b.weight;
      
      if (Math.abs(scoreA - scoreB) > 0.1) {
        return scoreB - scoreA; // Higher score first
      }
      
      return a.priority - b.priority; // Lower priority number = better
    });

    return candidates[0].provider;
  }

  /**
   * Get rate limit status for all providers
   */
  getStatus() {
    const status = {};
    
    for (const provider in this.limits) {
      const limits = this.limits[provider];
      const state = this.state[provider];
      const healthScore = this._calculateHealthScore(provider);
      
      status[provider] = {
        tokensUsed: state.tokensUsed || 0,
        tokensPerMinute: limits.tokensPerMinute || null,
        tokensAvailable: limits.tokensPerMinute 
          ? Math.max(0, limits.tokensPerMinute - state.tokensUsed)
          : null,
        requestsUsed: state.requestsUsed,
        requestsPerMinute: limits.requestsPerMinute,
        requestsAvailable: Math.max(0, limits.requestsPerMinute - state.requestsUsed),
        isRateLimited: state.rateLimitedUntil && Date.now() < state.rateLimitedUntil,
        rateLimitedUntil: state.rateLimitedUntil,
        healthScore: Math.round(healthScore * 100),
        weight: Math.round(this.loadBalancer.providerWeights[provider] * 100) / 100,
        avgResponseTime: Math.round(state.avgResponseTime),
        successRate: state.successCount + state.failureCount > 0
          ? Math.round((state.successCount / (state.successCount + state.failureCount)) * 100)
          : 100
      };
    }
    
    return status;
  }

  /**
   * Reset counters if time window has passed
   */
  _resetCountersIfNeeded(provider, now) {
    const state = this.state[provider];

    // Reset per-minute counters
    if (now - state.lastReset > 60000) {
      logger.info(`🔄 Resetting minute counters for ${provider}`);
      state.tokensUsed = 0;
      state.requestsUsed = 0;
      state.lastReset = now;
      state.rateLimitedUntil = null;
      
      // Gradually restore weight
      if (this.loadBalancer.providerWeights[provider] < 1.0) {
        this.loadBalancer.providerWeights[provider] = Math.min(1.0, 
          this.loadBalancer.providerWeights[provider] * 1.1
        );
      }
    }

    // Reset daily counters
    if (now - state.lastDailyReset > 86400000) {
      logger.info(`🔄 Resetting daily counters for ${provider}`);
      state.dailyRequestsUsed = 0;
      state.lastDailyReset = now;
    }

    // Reset monthly counters
    if (now - state.lastMonthlyReset > 2592000000) {
      logger.info(`🔄 Resetting monthly counters for ${provider}`);
      state.monthlyRequestsUsed = 0;
      state.monthlyCreditsUsed = 0;
      state.lastMonthlyReset = now;
    }
  }

  /**
   * Calculate provider health score (0-1)
   */
  _calculateHealthScore(provider) {
    const state = this.state[provider];
    
    if (state.recentRequestTimes.length === 0) {
      return 1.0; // No history = assume healthy
    }

    const successCount = state.recentRequestTimes.filter(r => r.success).length;
    const successRate = successCount / state.recentRequestTimes.length;
    
    // Factor in response time (lower is better)
    const avgTime = state.avgResponseTime || 1000;
    const timeScore = Math.max(0, 1 - (avgTime / 10000)); // 10s = 0 score
    
    // Combine success rate and response time
    return (successRate * 0.7) + (timeScore * 0.3);
  }

  /**
   * Update provider weight for load balancing
   */
  _updateProviderWeight(provider, success, responseTime = 0) {
    const currentWeight = this.loadBalancer.providerWeights[provider] || 1.0;
    
    if (success) {
      // Increase weight for fast, successful requests
      const speedBonus = responseTime < 2000 ? 0.05 : 0.02;
      this.loadBalancer.providerWeights[provider] = Math.min(2.0, currentWeight + speedBonus);
    } else {
      // Decrease weight for failures
      this.loadBalancer.providerWeights[provider] = Math.max(0.1, currentWeight * 0.9);
    }
  }
}

// Export singleton
const rateLimitService = new RateLimitService();
export default rateLimitService;


