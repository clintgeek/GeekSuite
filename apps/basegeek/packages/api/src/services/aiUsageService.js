import AIUsage from '../models/AIUsage.js';
import AIFreeTier from '../models/AIFreeTier.js';
import logger from '../lib/logger.js';

const NO_LIMITS = {
  requestsPerMinute: 0,
  requestsPerDay: 0,
  tokensPerMinute: 0,
  tokensPerDay: 0,
  audioSecondsPerHour: 0,
  audioSecondsPerDay: 0
};

class AIUsageService {
  constructor() {
    this.nearLimitThreshold = 80; // 80% of limit
    this.atLimitThreshold = 95; // 95% of limit
  }

  /**
   * The free-tier limits in force for this model *right now*.
   *
   * Read at use, never cached and never snapshotted. The catalog job learns
   * these numbers from the `x-ratelimit-*` headers on real calls and rewrites
   * the AIFreeTier row when a vendor changes its mind
   * (apps/basegeek/DOCS/AIGEEK_CATALOG_JOB.md), so a copy taken when a usage
   * row was first created — which is what this used to be — went stale the
   * first time that happened and was never refreshed for the rest of the day.
   *
   * A zero is "no limit known", which every caller reads as "do not gate on
   * this": an absent row must not lock a model out.
   */
  async currentFreeLimits(provider, modelId) {
    try {
      const row = await AIFreeTier.findOne({ provider, modelId }).select('freeLimits').lean();
      return { ...NO_LIMITS, ...(row?.freeLimits || {}) };
    } catch (error) {
      logger.warn({ err: error }, 'Could not read free-tier limits');
      return { ...NO_LIMITS };
    }
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

      // Get-or-create, atomically.
      //
      // This used to be `findOne` → `new AIUsage(...)` → `save()`. `AIUsage`
      // has a unique `{provider, modelId, userId, date}` index, so the first
      // two concurrent calls of a day both found nothing, both constructed a
      // row, and the loser hit E11000 — swallowed by the catch below into
      // `{success:false}`, which `aiService.js` awaits and never inspects.
      // The result was a lost usage record and a free-tier ceiling that could
      // be sailed past. An upsert cannot lose that race.
      const existing = await AIUsage.findOne({ provider, modelId, userId, date: currentDay });
      let usage = existing;
      if (!usage) {
        usage = await AIUsage.findOneAndUpdate(
          { provider, modelId, userId, date: currentDay },
          { $setOnInsert: { provider, modelId, userId, date: currentDay } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }

      // The limits are read fresh and written onto the row every call, not
      // frozen into it at insert. The row is still where the usage tab reads
      // them from, so it now shows what is actually in force rather than what
      // was in force at the day's first call.
      usage.freeLimits = await this.currentFreeLimits(provider, modelId);

      // Reset counters if time period has changed
      if (usage.currentMinute.timestamp.getTime() !== currentMinute.getTime()) {
        logger.info(`Resetting minute counters for ${provider}/${modelId} - old: ${usage.currentMinute.timestamp}, new: ${currentMinute}`);
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
      logger.error({ err: error }, 'Failed to track AI usage');
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
      logger.error({ err: error }, 'Failed to get usage status');
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

      logger.debug(`Found ${usageRecords.length} usage records for ${provider}/${userId}`);
      usageRecords.forEach(record => {
        logger.debug({
          modelId: record.modelId,
          requests: record.currentDay.requests,
          tokens: record.currentDay.tokens,
          limits: record.freeLimits,
          percentages: record.usagePercentages
        }, `Usage record for ${record.modelId}`);
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
        logger.debug({
          modelId: record.modelId,
          isNearLimit: record.isNearLimit,
          isAtLimit: record.isAtLimit,
          percentages: record.usagePercentages
        }, `Checking limits for ${record.modelId}`);

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
      logger.error({ err: error }, 'Failed to get provider usage summary');
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

      // One rule for every provider: have we made as many requests as the row
      // says we get?
      //
      // This used to be a per-provider switch naming which limits "usually"
      // bind (groq RPM, gemini RPD...) and then reading `isAtLimit`, a set of
      // booleans computed at 95% of the limits SNAPSHOTTED on the usage row
      // when it was created. Three things were wrong with that: the switch was
      // a hand-typed claim about vendors, it named only three of nine
      // providers, and the numbers behind it were a stale copy. The limits are
      // observed now (the catalog job writes them from `x-ratelimit-*`
      // headers), so the check reads the row and does the arithmetic.
      const limits = await this.currentFreeLimits(provider, modelId);

      const now = new Date();
      const thisMinute = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()
      );
      // A minute counter is only about the minute it was stamped for; an
      // untouched row from four minutes ago has spent nothing this minute.
      const minuteStamp = usage?.current?.minute?.timestamp;
      const minuteIsCurrent = minuteStamp
        && new Date(minuteStamp).getTime() === thisMinute.getTime();
      const requestsThisMinute = minuteIsCurrent ? (usage.current.minute.requests || 0) : 0;
      const requestsToday = usage?.current?.day?.requests || 0;

      // A zero limit is "not known", never "none allowed".
      if (limits.requestsPerDay > 0 && requestsToday >= limits.requestsPerDay) {
        return {
          available: false,
          reason: `Free tier limit reached (${requestsToday}/${limits.requestsPerDay} requests today)`,
          usage
        };
      }

      if (limits.requestsPerMinute > 0 && requestsThisMinute >= limits.requestsPerMinute) {
        return {
          available: false,
          reason: `Free tier limit reached (${requestsThisMinute}/${limits.requestsPerMinute} requests this minute)`,
          usage
        };
      }

      return {
        available: true,
        usage
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to check if model available');
      return {
        available: false,
        reason: 'Error checking availability'
      };
    }
  }
}

export default new AIUsageService();
