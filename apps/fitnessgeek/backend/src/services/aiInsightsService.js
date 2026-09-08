/**
 * AI Insights Service
 *
 * Generates intelligent health insights by aggregating user data and sending
 * it to aiGeek's feature door (`POST /api/ai/feature`, via aiGeekClient).
 *
 * Every generator here produced prose, and prose has no deterministic
 * fallback — so every one of them answers `{ ok: false, reason, message }`
 * rather than throwing when the model cannot serve. The user's token is no
 * longer forwarded: aiGeek resolves this app from the service credential, and
 * these calls carry no per-user auth of their own.
 */

import logger from '../config/logger.js';
import cacheService from './cacheService.js';
import aiGeekClient, { UNAVAILABLE_MESSAGE } from './aiGeekClient.js';
import FoodLog from '../models/FoodLog.js';
import Weight from '../models/Weight.js';
import BloodPressure from '../models/BloodPressure.js';
import NutritionGoals from '../models/NutritionGoals.js';
import WeightGoals from '../models/WeightGoals.js';
import garminConnectService from './garminConnectService.js';
import foodReportService from './foodReportService.js';
import { subDays, format } from 'date-fns';

/** Prose is slow and worth waiting for; still under the door's 60s ceiling. */
const PROSE_TIMEOUT_MS = 45000;

class AIInsightsService {

  // ============================================
  // CONTEXT BUILDER - The Foundation
  // ============================================

  /**
   * Build comprehensive user context for AI prompts
   * @param {string} userId - User ID
   * @param {Object} options - Options for what data to include
   * @returns {Object} Aggregated user data context
   */
  async buildUserContext(userId, options = {}) {
    const {
      includeFoodLogs = true,
      includeWeight = true,
      includeBP = true,
      includeGarmin = true,
      includeGoals = true,
      daysBack = 7
    } = options;

    const endDate = new Date();
    const startDate = subDays(endDate, daysBack);

    const context = {
      dateRange: {
        start: format(startDate, 'yyyy-MM-dd'),
        end: format(endDate, 'yyyy-MM-dd'),
        days: daysBack
      },
      generatedAt: new Date().toISOString()
    };

    try {
      // Parallel fetch all data sources
      const promises = [];

      if (includeFoodLogs) {
        promises.push(this.getFoodLogContext(userId, startDate, endDate));
      }
      if (includeWeight) {
        promises.push(this.getWeightContext(userId, startDate, endDate));
      }
      if (includeBP) {
        promises.push(this.getBPContext(userId, startDate, endDate));
      }
      if (includeGarmin) {
        promises.push(this.getGarminContext(userId, startDate, endDate));
      }
      if (includeGoals) {
        promises.push(this.getGoalsContext(userId));
      }

      const results = await Promise.allSettled(promises);

      let idx = 0;
      if (includeFoodLogs) {
        context.nutrition = results[idx++].status === 'fulfilled' ? results[idx - 1].value : null;
      }
      if (includeWeight) {
        context.weight = results[idx++].status === 'fulfilled' ? results[idx - 1].value : null;
      }
      if (includeBP) {
        context.bloodPressure = results[idx++].status === 'fulfilled' ? results[idx - 1].value : null;
      }
      if (includeGarmin) {
        context.garmin = results[idx++].status === 'fulfilled' ? results[idx - 1].value : null;
      }
      if (includeGoals) {
        context.goals = results[idx++].status === 'fulfilled' ? results[idx - 1].value : null;
      }

      return context;

    } catch (error) {
      logger.error('Error building user context', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get food log context with daily summaries
   */
  async getFoodLogContext(userId, startDate, endDate) {
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    const logs = await FoodLog.find({
      user_id: userId,
      log_date: { $gte: start, $lte: end }
    })
      .populate('food_item_id')
      .lean();

    if (!logs.length) return null;

    // Group by date
    const dailyTotals = {};
    const mealTiming = { breakfast: [], lunch: [], dinner: [], snack: [] };
    const alcoholDays = new Set();

    const calcNutrition = (log) => {
      const servings = log.servings || 1;
      const stored = log.nutrition || {};
      const fallback = (log.food_item_id && typeof log.food_item_id === 'object') ? log.food_item_id.nutrition || {} : {};

      const getValue = (key) => {
        const storedKey = stored[key];
        if (storedKey !== undefined && storedKey !== null) return storedKey;
        return fallback[key] || 0;
      };

      return {
        calories: (getValue('calories_per_serving') || 0) * servings,
        protein: (getValue('protein_grams') || 0) * servings,
        carbs: (getValue('carbs_grams') || 0) * servings,
        fat: (getValue('fat_grams') || 0) * servings,
        fiber: (getValue('fiber_grams') || 0) * servings,
        sugar: (getValue('sugar_grams') || 0) * servings
      };
    };

    logs.forEach(log => {
      const dateKey = new Date(log.log_date).toISOString().split('T')[0];
      const totals = calcNutrition(log);

      if (!dailyTotals[dateKey]) {
        dailyTotals[dateKey] = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
      }

      dailyTotals[dateKey].calories += totals.calories;
      dailyTotals[dateKey].protein += totals.protein;
      dailyTotals[dateKey].carbs += totals.carbs;
      dailyTotals[dateKey].fat += totals.fat;
      dailyTotals[dateKey].fiber += totals.fiber;
      dailyTotals[dateKey].sugar += totals.sugar;

      if (log.meal_type && mealTiming[log.meal_type]) {
        mealTiming[log.meal_type].push(dateKey);
      }

      const foodName = (log.food_name || log.food_item_id?.name || '').toLowerCase();
      if (foodName.match(/beer|wine|whiskey|vodka|cocktail|alcohol|margarita|tequila/)) {
        alcoholDays.add(dateKey);
      }
    });

    // Calculate averages
    const days = Object.keys(dailyTotals).length;
    const totals = Object.values(dailyTotals);

    const averages = {
      calories: Math.round(totals.reduce((s, d) => s + d.calories, 0) / days),
      protein: Math.round(totals.reduce((s, d) => s + d.protein, 0) / days),
      carbs: Math.round(totals.reduce((s, d) => s + d.carbs, 0) / days),
      fat: Math.round(totals.reduce((s, d) => s + d.fat, 0) / days),
      fiber: Math.round(totals.reduce((s, d) => s + d.fiber, 0) / days),
      sugar: Math.round(totals.reduce((s, d) => s + d.sugar, 0) / days)
    };

    return {
      daysLogged: days,
      totalEntries: logs.length,
      dailyTotals,
      averages,
      alcoholDays: Array.from(alcoholDays),
      mealConsistency: {
        breakfast: mealTiming.breakfast.length,
        lunch: mealTiming.lunch.length,
        dinner: mealTiming.dinner.length,
        snack: mealTiming.snack.length
      }
    };
  }

  /**
   * Get weight context with trends
   */
  async getWeightContext(userId, startDate, endDate) {
    const weights = await Weight.find({
      user_id: userId,
      log_date: { $gte: startDate, $lte: endDate }
    }).sort({ log_date: 1 }).lean();

    if (!weights.length) return null;

    const values = weights.map(w => w.weight_value);
    const firstWeight = values[0];
    const lastWeight = values[values.length - 1];
    const change = lastWeight - firstWeight;
    const trend = change < -0.5 ? 'losing' : change > 0.5 ? 'gaining' : 'stable';

    return {
      entries: weights.length,
      current: lastWeight,
      periodStart: firstWeight,
      change: Math.round(change * 10) / 10,
      trend,
      min: Math.min(...values),
      max: Math.max(...values),
      average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
    };
  }

  /**
   * Get blood pressure context
   */
  async getBPContext(userId, startDate, endDate) {
    const readings = await BloodPressure.find({
      user_id: userId,
      log_date: { $gte: startDate, $lte: endDate }
    }).sort({ log_date: -1 }).lean();

    if (!readings.length) return null;

    const systolics = readings.map(r => r.systolic);
    const diastolics = readings.map(r => r.diastolic);

    const avgSystolic = Math.round(systolics.reduce((a, b) => a + b, 0) / systolics.length);
    const avgDiastolic = Math.round(diastolics.reduce((a, b) => a + b, 0) / diastolics.length);

    // Categorize
    let category = 'normal';
    if (avgSystolic >= 180 || avgDiastolic >= 120) category = 'crisis';
    else if (avgSystolic >= 140 || avgDiastolic >= 90) category = 'stage2';
    else if (avgSystolic >= 130 || avgDiastolic >= 80) category = 'stage1';
    else if (avgSystolic >= 120) category = 'elevated';

    return {
      entries: readings.length,
      latest: { systolic: readings[0].systolic, diastolic: readings[0].diastolic },
      average: { systolic: avgSystolic, diastolic: avgDiastolic },
      category,
      trend: this.calculateBPTrend(readings)
    };
  }

  calculateBPTrend(readings) {
    if (readings.length < 3) return 'insufficient_data';

    const recent = readings.slice(0, Math.ceil(readings.length / 2));
    const older = readings.slice(Math.ceil(readings.length / 2));

    const recentAvg = recent.reduce((s, r) => s + r.systolic, 0) / recent.length;
    const olderAvg = older.reduce((s, r) => s + r.systolic, 0) / older.length;

    const diff = recentAvg - olderAvg;
    if (diff < -3) return 'improving';
    if (diff > 3) return 'worsening';
    return 'stable';
  }

  /**
   * Get Garmin health data context
   */
  async getGarminContext(userId, startDate, endDate) {
    try {
      // Get sleep data for the period (includes health metrics)
      const sleepData = [];

      // Fetch last 7 days of data
      for (let i = 0; i < 7; i++) {
        const date = format(subDays(new Date(), i), 'yyyy-MM-dd');

        try {
          const sleep = await garminConnectService.getSleepData(userId, date);
          if (sleep) {
            sleepData.push({
              date,
              // Sleep duration
              totalSleepMinutes: sleep.totalSleepMinutes,
              deepSleepMinutes: sleep.deepSleepMinutes,
              lightSleepMinutes: sleep.lightSleepMinutes,
              remSleepMinutes: sleep.remSleepMinutes,
              awakeSleepMinutes: sleep.awakeSleepMinutes,
              // Sleep quality
              sleepScore: sleep.sleepScore,
              sleepQuality: sleep.sleepQuality,
              // Health metrics
              restingHeartRate: sleep.restingHeartRate,
              avgOvernightHrv: sleep.avgOvernightHrv,
              hrvStatus: sleep.hrvStatus,
              avgSpO2: sleep.avgSpO2,
              avgRespiration: sleep.avgRespiration,
              avgSleepStress: sleep.avgSleepStress,
              bodyBatteryChange: sleep.bodyBatteryChange
            });
          }
        } catch (e) {
          // Skip days with no data
        }
      }

      if (!sleepData.length) return null;

      // Calculate averages
      const validSleep = sleepData.filter(d => d.totalSleepMinutes);
      const validScores = sleepData.filter(d => d.sleepScore);
      const validHrv = sleepData.filter(d => d.avgOvernightHrv);

      const averages = {
        avgSleepHours: validSleep.length
          ? Math.round(validSleep.reduce((s, d) => s + d.totalSleepMinutes, 0) / validSleep.length / 60 * 10) / 10
          : null,
        avgDeepSleepPct: validSleep.length
          ? Math.round(validSleep.reduce((s, d) => s + ((d.deepSleepMinutes || 0) / d.totalSleepMinutes * 100), 0) / validSleep.length)
          : null,
        avgSleepScore: validScores.length
          ? Math.round(validScores.reduce((s, d) => s + d.sleepScore, 0) / validScores.length)
          : null,
        avgHrv: validHrv.length
          ? Math.round(validHrv.reduce((s, d) => s + d.avgOvernightHrv, 0) / validHrv.length)
          : null
      };

      return {
        entries: sleepData.length,
        data: sleepData,
        averages,
        latest: sleepData[0] || null
      };
    } catch (error) {
      logger.error('Error fetching Garmin context', { error: error.message });
      return null;
    }
  }

  /**
   * Get user goals context
   */
  async getGoalsContext(userId) {
    const [nutritionGoals, weightGoals] = await Promise.all([
      NutritionGoals.getActiveGoals(userId),
      WeightGoals.getActiveWeightGoals(userId)
    ]);

    if (!nutritionGoals && !weightGoals) return null;

    return {
      nutrition: nutritionGoals ? {
        calories: nutritionGoals.calories,
        protein: nutritionGoals.protein_grams,
        carbs: nutritionGoals.carbs_grams,
        fat: nutritionGoals.fat_grams,
        fiber: nutritionGoals.fiber_grams
      } : null,
      weight: weightGoals ? {
        enabled: weightGoals.is_active,
        startWeight: weightGoals.startWeight,
        targetWeight: weightGoals.targetWeight,
        goalDate: weightGoals.goalDate
      } : null
    };
  }

  // ============================================
  // AI INSIGHT GENERATORS
  // ============================================
  //
  // None of these has a deterministic fallback: a health brief with the prose
  // removed is not a brief, it is a JSON dump. So when aiGeek answers
  // `ok: false` they return a **friendly refusal** — `{ ok: false, reason,
  // message }` — and the routes hand that back as a 200. The card renders the
  // sentence in place. Nothing here throws for an unavailable model; the only
  // errors that still propagate are real ones (a broken Mongo query, say).

  /** The one shape a generator answers with when no model could serve it. */
  unavailable(type, result) {
    logger.info('AI insight unavailable — answering with the friendly message', {
      type,
      reason: result.reason
    });
    return {
      ok: false,
      type,
      reason: result.reason,
      message: UNAVAILABLE_MESSAGE,
      content: null,
      generatedAt: new Date().toISOString(),
      provenance: result.provenance || null
    };
  }

  /**
   * Generate morning briefing
   */
  async generateMorningBrief(userId) {
    const context = await this.buildUserContext(userId, {
      daysBack: 1, // Yesterday's data
      includeGarmin: true
    });

    const prompt = `Generate a brief morning health briefing based on yesterday's data.

USER DATA:
${JSON.stringify(context, null, 2)}

Guidelines:
- Be encouraging but honest
- Focus on 2-3 key points
- Give one actionable tip for today
- Keep it under 100 words
- Use a warm, supportive tone
- Reference specific numbers when relevant

Format as a short paragraph, no bullet points.`;

    const result = await aiGeekClient.feature('brief', {
      quotaKey: userId,
      system: 'You are a friendly, concise health coach.',
      user: prompt,
      maxTokens: 800,
      temperature: 0.7
    }, { timeoutMs: PROSE_TIMEOUT_MS });

    if (!result.ok) return this.unavailable('morning_brief', result);

    return {
      ok: true,
      type: 'morning_brief',
      content: result.data,
      generatedAt: new Date().toISOString(),
      context: { date: format(new Date(), 'yyyy-MM-dd') },
      provenance: result.provenance
    };
  }

  /**
   * Generate end-of-day summary
   */
  async generateDailySummary(userId, date = null) {
    const targetDate = date || format(new Date(), 'yyyy-MM-dd');

    const context = await this.buildUserContext(userId, {
      daysBack: 1,
      includeGarmin: true
    });

    const prompt = `Generate an end-of-day nutrition and health summary.

USER DATA FOR ${targetDate}:
${JSON.stringify(context, null, 2)}

Guidelines:
- Summarize nutrition performance vs goals
- Note any patterns (good or concerning)
- Mention sleep/health metrics if available
- Highlight wins and areas for improvement
- Keep it concise (under 150 words)
- Be supportive, not judgmental

Format with a brief intro, then 2-3 key insights.`;

    const result = await aiGeekClient.feature('summary', {
      quotaKey: userId,
      system: 'You are a health analytics assistant.',
      user: prompt,
      maxTokens: 1000,
      temperature: 0.7
    }, { timeoutMs: PROSE_TIMEOUT_MS });

    if (!result.ok) return this.unavailable('daily_summary', result);

    return {
      ok: true,
      type: 'daily_summary',
      content: result.data,
      generatedAt: new Date().toISOString(),
      context: { date: targetDate },
      provenance: result.provenance
    };
  }

  /**
   * Analyze health correlations
   */
  async analyzeCorrelations(userId) {
    const context = await this.buildUserContext(userId, {
      daysBack: 30,
      includeGarmin: true
    });

    const prompt = `Analyze this 30-day health data for meaningful correlations and patterns.

USER DATA (30 DAYS):
${JSON.stringify(context, null, 2)}

Look for correlations between:
- Alcohol consumption and sleep quality
- Protein intake and energy levels (body battery)
- Late eating and sleep scores
- Macro adherence and weight trends
- Stress levels and eating patterns

Guidelines:
- Only report correlations you can actually see in the data
- Be specific with numbers and percentages
- Distinguish correlation from causation
- Provide actionable insights
- Keep it under 250 words

Format as 3-5 key findings with brief explanations.`;

    const result = await aiGeekClient.feature('correlations', {
      quotaKey: userId,
      system: 'You are a health data analyst.',
      user: prompt,
      maxTokens: 1400,
      temperature: 0.7
    }, { timeoutMs: PROSE_TIMEOUT_MS });

    if (!result.ok) return this.unavailable('correlations', result);

    return {
      ok: true,
      type: 'correlations',
      content: result.data,
      generatedAt: new Date().toISOString(),
      context: { daysAnalyzed: 30 },
      provenance: result.provenance
    };
  }

  /**
   * Generate AI summary for weekly nutrition report
   *
   * Cached for six hours — but only when a model answered. `cacheService.wrap`
   * stores anything non-null, which would have pinned "the assistant isn't
   * available right now" in front of this card for the rest of the afternoon,
   * so the get/set is explicit here and a refusal is never written.
   */
  async generateWeeklyReport(userId, options = {}) {
    const days = options.days || 7;
    const start = options.start || format(subDays(new Date(), days - 1), 'yyyy-MM-dd');
    const cacheKey = cacheService.key('ai', 'user', userId, 'weekly-report', start, days);

    const cached = await cacheService.get(cacheKey).catch(() => null);
    if (cached) return cached;

    const report = await foodReportService.getOverview(userId, {
      start: options.start,
      days
    });

    if (!report.daily.length) {
      return {
        ok: true,
        type: 'weekly_report',
        content: 'No nutrition logs were found for this period, so there is nothing to summarize yet.',
        generatedAt: new Date().toISOString(),
        context: report.range
      };
    }

    const prompt = `Summarize this ${report.range.days}-day food log report.

DATA:
${JSON.stringify(report, null, 2)}

Guidelines:
- Highlight calorie + macro consistency vs averages/goals
- Mention meal-type balance and standout foods
- Call out goal-compliance wins and misses
- End with two focus recommendations for next week
- Keep under 180 words, using short paragraphs/bullets.`;

    const result = await aiGeekClient.feature('weeklyReport', {
      quotaKey: userId,
      system: 'You are a precision nutrition coach.',
      user: prompt,
      maxTokens: 1200,
      temperature: 0.7
    }, { timeoutMs: PROSE_TIMEOUT_MS });

    if (!result.ok) return this.unavailable('weekly_report', result);

    const payload = {
      ok: true,
      type: 'weekly_report',
      content: result.data,
      generatedAt: new Date().toISOString(),
      context: report.range,
      provenance: result.provenance
    };
    await cacheService.set(cacheKey, payload, 6 * 3600).catch(() => {});
    return payload;
  }

  /**
   * Generate AI highlights for longer-term trends. Twelve-hour cache, and the
   * same rule as the weekly report: a refusal is never cached.
   */
  async generateTrendWatch(userId, options = {}) {
    const days = options.days || 30;
    const start = options.start || format(subDays(new Date(), days - 1), 'yyyy-MM-dd');
    const cacheKey = cacheService.key('ai', 'user', userId, 'trend-watch', start, days);

    const cached = await cacheService.get(cacheKey).catch(() => null);
    if (cached) return cached;

    const trends = await foodReportService.getTrends(userId, {
      start: options.start,
      days
    });

    if (!trends.daily.length) {
      return {
        ok: true,
        type: 'trend_watch',
        content: 'Trend analysis needs at least a few logged days to work.',
        generatedAt: new Date().toISOString(),
        context: trends.range
      };
    }

    const prompt = `Provide a concise trend watch summary for this ${trends.range.days}-day dataset.

DATA:
${JSON.stringify(trends, null, 2)}

Return exactly 3 sections with short bullet points:
1. Trend Signals (macro/calorie patterns)
2. Weight or outcome impact
3. Watch-outs & experiments (what to monitor next)

Use clear bullets, cite numbers, stay under 160 words.`;

    const result = await aiGeekClient.feature('trendWatch', {
      quotaKey: userId,
      system: 'You are a health data analyst.',
      user: prompt,
      maxTokens: 1200,
      temperature: 0.7
    }, { timeoutMs: PROSE_TIMEOUT_MS });

    if (!result.ok) return this.unavailable('trend_watch', result);

    const payload = {
      ok: true,
      type: 'trend_watch',
      content: result.data,
      generatedAt: new Date().toISOString(),
      context: trends.range,
      provenance: result.provenance
    };
    await cacheService.set(cacheKey, payload, 12 * 3600).catch(() => {});
    return payload;
  }

  /**
   * Get coaching advice
   */
  async getCoachingAdvice(userId) {
    const context = await this.buildUserContext(userId, {
      daysBack: 14,
      includeGarmin: true
    });

    const prompt = `Based on this 2-week data, provide personalized coaching advice.

USER DATA (14 DAYS):
${JSON.stringify(context, null, 2)}

Consider:
- Progress toward goals
- Consistency patterns
- Areas of struggle
- Quick wins available
- Potential plateaus

Guidelines:
- Be specific and actionable
- Reference their actual data
- Prioritize 2-3 key recommendations
- Be encouraging but realistic
- Keep it under 200 words

Format as coaching advice with specific action items.`;

    const result = await aiGeekClient.feature('coaching', {
      quotaKey: userId,
      system: 'You are an experienced health coach.',
      user: prompt,
      maxTokens: 1200,
      temperature: 0.7
    }, { timeoutMs: PROSE_TIMEOUT_MS });

    if (!result.ok) return this.unavailable('coaching', result);

    return {
      ok: true,
      type: 'coaching',
      content: result.data,
      generatedAt: new Date().toISOString(),
      context: { daysAnalyzed: 14 },
      provenance: result.provenance
    };
  }

  /**
   * Chat with health data.
   *
   * `conversationId` is the user's id: aiGeek's sticky-pick machinery keys on
   * `app:conversationId`, so one person's chat keeps landing on one model for
   * as long as that model is alive, instead of changing voice mid-thread.
   */
  async chat(userId, message, conversationHistory = []) {
    const context = await this.buildUserContext(userId, {
      daysBack: 30,
      includeGarmin: true
    });

    const systemPrompt = `You are a helpful health assistant with access to the user's health data. Answer their questions based on this data.

USER HEALTH DATA (LAST 30 DAYS):
${JSON.stringify(context, null, 2)}

Guidelines:
- Answer based on the actual data provided
- Be specific with numbers when relevant
- If data is missing, say so
- Keep responses concise but helpful
- Be supportive and encouraging`;

    const history = Array.isArray(conversationHistory)
      ? conversationHistory
        .filter(turn => turn && typeof turn.content === 'string' && (turn.role === 'user' || turn.role === 'assistant'))
        .slice(-20)
      : [];

    const result = await aiGeekClient.feature('chat', {
      quotaKey: userId,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: message }],
      conversationId: userId ? String(userId) : undefined,
      maxTokens: 2000,
      temperature: 0.7
    }, { timeoutMs: PROSE_TIMEOUT_MS });

    if (!result.ok) return this.unavailable('chat', result);

    return {
      ok: true,
      type: 'chat',
      content: result.data,
      generatedAt: new Date().toISOString(),
      provenance: result.provenance
    };
  }
}

export default new AIInsightsService();
