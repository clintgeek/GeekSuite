import AIUsage from '../models/AIUsage.js';
import AIFreeTier from '../models/AIFreeTier.js';

class AIUsageService {
  constructor() {
    this.nearLimitThreshold = 80; // 80% of limit
    this.atLimitThreshold = 95; // 95% of limit
  }

  async trackUsage(provider, modelId, userId, requestData = {}) {
    try {
      const {
        inputTokens = 0,
        outputTokens = 0,
        audioSeconds = 0,
        requests = 1
      } = requestData;

      const totalTokens = inputTokens + outputTokens;
      const now = new Date();
      const currentMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
      const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

      // Get or create usage record
      let usage = await AIUsage.findOne({
        provider,
        modelId,
        userId,
        date: currentDay
      });

      if (!usage) {
        // Get free tier limits for this model
        const freeTier = await AIFreeTier.findOne({ provider, modelId });
        const freeLimits = freeTier?.freeLimits || {
          requestsPerMinute: 0,
          requestsPerDay: 0,
          tokensPerMinute: 0,
          tokensPerDay: 0,
          audioSecondsPerHour: 0,
          audioSecondsPerDay: 0
        };

        usage = new AIUsage({
          provider,
          modelId,
          userId,
          date: currentDay,
          freeLimits
        });
      }

      // Reset counters if time period has changed
      if (usage.currentMinute.timestamp.getTime() !== currentMinute.getTime()) {
        console.log(`Resetting minute counters for ${provider}/${modelId} - old: ${usage.currentMinute.timestamp}, new: ${currentMinute}`);
        usage.currentMinute = {
          requests: 0,
          tokens: 0,
          audioSeconds: 0,
          timestamp: currentMinute
        };
      }

      if (usage.currentDay.date.getTime() !== currentDay.getTime()) {
        usage.currentDay = {
          requests: 0,
          tokens: 0,
          audioSeconds: 0,
          date: currentDay
        };
      }

      if (usage.currentHour.timestamp.getTime() !== currentHour.getTime()) {
        usage.currentHour = {
          audioSeconds: 0,
          timestamp: currentHour
        };
      }

      // Update usage counters
      usage.currentMinute.requests += requests;
      usage.currentMinute.tokens += totalTokens;
      usage.currentMinute.audioSeconds += audioSeconds;

      usage.currentDay.requests += requests;
      usage.currentDay.tokens += totalTokens;
      usage.currentDay.audioSeconds += audioSeconds;

      usage.currentHour.audioSeconds += audioSeconds;

      // Calculate usage percentages
      usage.usagePercentages = {
        requestsPerMinute: this.calculatePercentage(usage.currentMinute.requests, usage.freeLimits.requestsPerMinute),
        requestsPerDay: this.calculatePercentage(usage.currentDay.requests, usage.freeLimits.requestsPerDay),
        tokensPerMinute: this.calculatePercentage(usage.currentMinute.tokens, usage.freeLimits.tokensPerMinute),
        tokensPerDay: this.calculatePercentage(usage.currentDay.tokens, usage.freeLimits.tokensPerDay),
        audioSecondsPerHour: this.calculatePercentage(usage.currentHour.audioSeconds, usage.freeLimits.audioSecondsPerHour),
        audioSecondsPerDay: this.calculatePercentage(usage.currentDay.audioSeconds, usage.freeLimits.audioSecondsPerDay)
      };

      // Update limit status
      usage.isNearLimit = {
        requestsPerMinute: usage.usagePercentages.requestsPerMinute >= this.nearLimitThreshold,
        requestsPerDay: usage.usagePercentages.requestsPerDay >= this.nearLimitThreshold,
        tokensPerMinute: usage.usagePercentages.tokensPerMinute >= this.nearLimitThreshold,
        tokensPerDay: usage.usagePercentages.tokensPerDay >= this.nearLimitThreshold,
        audioSecondsPerHour: usage.usagePercentages.audioSecondsPerHour >= this.nearLimitThreshold,
        audioSecondsPerDay: usage.usagePercentages.audioSecondsPerDay >= this.nearLimitThreshold
      };

      usage.isAtLimit = {
        requestsPerMinute: usage.usagePercentages.requestsPerMinute >= this.atLimitThreshold,
        requestsPerDay: usage.usagePercentages.requestsPerDay >= this.atLimitThreshold,
        tokensPerMinute: usage.usagePercentages.tokensPerMinute >= this.atLimitThreshold,
        tokensPerDay: usage.usagePercentages.tokensPerDay >= this.atLimitThreshold,
        audioSecondsPerHour: usage.usagePercentages.audioSecondsPerHour >= this.atLimitThreshold,
        audioSecondsPerDay: usage.usagePercentages.audioSecondsPerDay >= this.atLimitThreshold
      };

      await usage.save();

      return {
        success: true,
        usage: {
          current: {
            minute: usage.currentMinute,
            day: usage.currentDay,
            hour: usage.currentHour
          },
          limits: usage.freeLimits,
          percentages: usage.usagePercentages,
          isNearLimit: usage.isNearLimit,
          isAtLimit: usage.isAtLimit
        }
      };

    } catch (error) {
      console.error('Failed to track AI usage:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  calculatePercentage(current, limit) {
    if (limit === 0) return 0;
    return Math.min((current / limit) * 100, 100);
  }

  async getUsageStatus(provider, modelId, userId) {
    try {
      const now = new Date();
      const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const usage = await AIUsage.findOne({
        provider,
        modelId,
        userId,
        date: currentDay
      });

      if (!usage) {
        return {
          success: true,
          usage: {
            current: { minute: { requests: 0, tokens: 0 }, day: { requests: 0, tokens: 0 } },
            limits: { requestsPerMinute: 0, requestsPerDay: 0, tokensPerMinute: 0, tokensPerDay: 0 },
            percentages: { requestsPerMinute: 0, requestsPerDay: 0, tokensPerMinute: 0, tokensPerDay: 0 },
            isNearLimit: { requestsPerMinute: false, requestsPerDay: false, tokensPerMinute: false, tokensPerDay: false },
            isAtLimit: { requestsPerMinute: false, requestsPerDay: false, tokensPerMinute: false, tokensPerDay: false }
          }
        };
      }

      return {
        success: true,
        usage: {
          current: {
            minute: usage.currentMinute,
            day: usage.currentDay,
            hour: usage.currentHour
          },
          limits: usage.freeLimits,
          percentages: usage.usagePercentages,
          isNearLimit: usage.isNearLimit,
          isAtLimit: usage.isAtLimit
        }
      };

    } catch (error) {
      console.error('Failed to get usage status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getProviderUsageSummary(provider, userId) {
    try {
      const now = new Date();
      const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const usageRecords = await AIUsage.find({
        provider,
        userId,
        date: currentDay
      });

      console.log(`Found ${usageRecords.length} usage records for ${provider}/${userId}`);
      usageRecords.forEach(record => {
        console.log(`Usage record for ${record.modelId}:`, {
          requests: record.currentDay.requests,
          tokens: record.currentDay.tokens,
          limits: record.freeLimits,
          percentages: record.usagePercentages
        });
      });

      const summary = {
        totalRequests: 0,
        totalTokens: 0,
        totalAudioSeconds: 0,
        models: [],
        isNearAnyLimit: false,
        isAtAnyLimit: false
      };

      usageRecords.forEach(record => {
        summary.totalRequests += record.currentDay.requests;
        summary.totalTokens += record.currentDay.tokens;
        summary.totalAudioSeconds += record.currentDay.audioSeconds;

        const modelSummary = {
          modelId: record.modelId,
          requests: record.currentDay.requests,
          tokens: record.currentDay.tokens,
          audioSeconds: record.currentDay.audioSeconds,
          percentages: record.usagePercentages,
          isNearLimit: record.isNearLimit,
          isAtLimit: record.isAtLimit
        };

        summary.models.push(modelSummary);

        // Check if any model is near or at limit
        console.log(`Checking limits for ${record.modelId}:`, {
          isNearLimit: record.isNearLimit,
          isAtLimit: record.isAtLimit,
          percentages: record.usagePercentages
        });

        Object.values(record.isNearLimit).forEach(isNear => {
          if (isNear) summary.isNearAnyLimit = true;
        });

        Object.values(record.isAtLimit).forEach(isAt => {
          if (isAt) summary.isAtAnyLimit = true;
        });
      });

      return {
        success: true,
        summary
      };

    } catch (error) {
      console.error('Failed to get provider usage summary:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async checkIfModelAvailable(provider, modelId, userId) {
    try {
      const usageStatus = await this.getUsageStatus(provider, modelId, userId);

      if (!usageStatus.success) {
        return { available: false, reason: 'Failed to check usage status' };
      }

      const { usage } = usageStatus;
      const { isAtLimit } = usage;

      // Provider-specific limit checking - focus on the most restrictive limits
      let criticalLimits = [];

      switch (provider) {
        case 'groq':
          // Groq: RPM is usually the limiting factor (50 RPM vs 14.4K RPD)
          criticalLimits = ['requestsPerMinute', 'tokensPerMinute'];
          break;
        case 'together':
          // Together.ai: RPM is the limiting factor (60 RPM vs 86.4K RPD)
          criticalLimits = ['requestsPerMinute', 'tokensPerMinute'];
          break;
        case 'gemini':
          // Gemini: RPD is more limiting (1.5K RPD vs 60 RPM)
          criticalLimits = ['requestsPerDay', 'tokensPerDay'];
          break;
        default:
          // Check all limits for unknown providers
          criticalLimits = Object.keys(isAtLimit);
      }

      // Check if any critical limit is reached
      const anyCriticalLimitReached = criticalLimits.some(limit => isAtLimit[limit]);

      if (anyCriticalLimitReached) {
        return {
          available: false,
          reason: `Free tier limit reached (${criticalLimits.join(', ')})`,
          usage
        };
      }

      return {
        available: true,
        usage
      };

    } catch (error) {
      console.error('Failed to check if model available:', error);
      return {
        available: false,
        reason: 'Error checking availability'
      };
    }
  }
}

export default new AIUsageService();
