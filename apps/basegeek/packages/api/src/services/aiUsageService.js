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

      if (!provider || !modelId || !userId) {
        throw new Error('trackUsage: provider, modelId and userId are required');
      }

      const key = { provider, modelId, userId, date: currentDay };

      // Every write below is an atomic operator on the row, never
      // read-modify-`save()`.
      //
      // Get-or-create was the first race (2026-09): two first-calls of a day
      // both found nothing and the loser hit E11000 on the unique
      // `{provider, modelId, userId, date}` index. The second race outlived
      // that fix until 2026-11-06: the counters were read, incremented in
      // memory and `save()`d, which writes `$set: {count: read + 1}` — N
      // concurrent calls all read the same count and booked as one, and the
      // free-tier ceiling this row watches could be sailed past.
      const freeLimits = await this.currentFreeLimits(provider, modelId);

      // 1. The row exists. A lost insert race is the other caller's success.
      await AIUsage.updateOne(
        key,
        {
          $setOnInsert: {
            currentMinute: { requests: 0, tokens: 0, audioSeconds: 0, timestamp: currentMinute },
            currentDay: { requests: 0, tokens: 0, audioSeconds: 0, date: currentDay },
            currentHour: { audioSeconds: 0, timestamp: currentHour }
          }
        },
        { upsert: true, setDefaultsOnInsert: true, runValidators: true }
      ).catch((err) => {
        if (err?.code !== 11000) throw err;
      });

      // 2. Roll a window over when time has moved past it. Conditional on
      // the stored stamp being OLDER, so concurrent callers reset it once and
      // a call that started a moment ago cannot roll it backwards.
      const olderThan = (path, at) => ({ ...key, $or: [{ [path]: { $lt: at } }, { [path]: null }] });
      await Promise.all([
        AIUsage.updateOne(olderThan('currentMinute.timestamp', currentMinute),
          { $set: { currentMinute: { requests: 0, tokens: 0, audioSeconds: 0, timestamp: currentMinute } } }),
        AIUsage.updateOne(olderThan('currentDay.date', currentDay),
          { $set: { currentDay: { requests: 0, tokens: 0, audioSeconds: 0, date: currentDay } } }),
        AIUsage.updateOne(olderThan('currentHour.timestamp', currentHour),
          { $set: { currentHour: { audioSeconds: 0, timestamp: currentHour } } })
      ]);

      // 3. The counts: one `$inc`. The limits are read fresh and written onto
      // the row every call, not frozen into it at insert — the usage tab
      // reads them from here.
      const counted = await AIUsage.findOneAndUpdate(
        key,
        {
          $inc: {
            'currentMinute.requests': requests,
            'currentMinute.tokens': totalTokens,
            'currentMinute.audioSeconds': audioSeconds,
            'currentDay.requests': requests,
            'currentDay.tokens': totalTokens,
            'currentDay.audioSeconds': audioSeconds,
            'currentHour.audioSeconds': audioSeconds
          },
          $set: { freeLimits }
        },
        { new: true }
      ).lean();
      if (!counted) throw new Error('trackUsage: usage row vanished between upsert and increment');

      // 4. The derived flags, from the counts as they stand after this
      // call's `$inc`. Under concurrency the last writer's view wins; these
      // are a display summary recomputed on every call, not a counter.
      const usagePercentages = {
        requestsPerMinute: this.calculatePercentage(counted.currentMinute.requests, freeLimits.requestsPerMinute),
        requestsPerDay: this.calculatePercentage(counted.currentDay.requests, freeLimits.requestsPerDay),
        tokensPerMinute: this.calculatePercentage(counted.currentMinute.tokens, freeLimits.tokensPerMinute),
        tokensPerDay: this.calculatePercentage(counted.currentDay.tokens, freeLimits.tokensPerDay),
        audioSecondsPerHour: this.calculatePercentage(counted.currentHour.audioSeconds, freeLimits.audioSecondsPerHour),
        audioSecondsPerDay: this.calculatePercentage(counted.currentDay.audioSeconds, freeLimits.audioSecondsPerDay)
      };
      const flags = (threshold) => Object.fromEntries(
        Object.entries(usagePercentages).map(([name, pct]) => [name, pct >= threshold])
      );
      const isNearLimit = flags(this.nearLimitThreshold);
      const isAtLimit = flags(this.atLimitThreshold);
      await AIUsage.updateOne(key, { $set: { usagePercentages, isNearLimit, isAtLimit } });

      const usage = {
        currentMinute: counted.currentMinute,
        currentDay: counted.currentDay,
        currentHour: counted.currentHour,
        freeLimits,
        usagePercentages,
        isNearLimit,
        isAtLimit
      };

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
