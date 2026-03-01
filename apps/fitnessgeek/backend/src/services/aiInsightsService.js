/**
 * AI Insights Service
 *
 * Generates intelligent health insights by aggregating user data
 * and sending to baseGeek AI for analysis.
 */

const logger = require('../config/logger');
const cacheService = require('./cacheService');
const baseGeekAIService = require('./baseGeekAIService');
const FoodLog = require('../models/FoodLog');
const Weight = require('../models/Weight');
const BloodPressure = require('../models/BloodPressure');
const NutritionGoals = require('../models/NutritionGoals');
const WeightGoals = require('../models/WeightGoals');
const garminConnectService = require('./garminConnectService');
const foodReportService = require('./foodReportService');
const { subDays, format } = require('date-fns');

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

  /**
   * Generate morning briefing
   */
  async generateMorningBrief(userId, userToken) {
    const context = await this.buildUserContext(userId, {
      daysBack: 1, // Yesterday's data
      includeGarmin: true
    });

    const prompt = `You are a friendly, concise health coach. Generate a brief morning health briefing based on yesterday's data.

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

    try {
      const response = await baseGeekAIService.chat(prompt, userToken);
      return {
        type: 'morning_brief',
        content: response,
        generatedAt: new Date().toISOString(),
        context: { date: format(new Date(), 'yyyy-MM-dd') }
      };
    } catch (error) {
      logger.error('Error generating morning brief', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate end-of-day summary
   */
  async generateDailySummary(userId, userToken, date = null) {
    const targetDate = date || format(new Date(), 'yyyy-MM-dd');

    const context = await this.buildUserContext(userId, {
      daysBack: 1,
      includeGarmin: true
    });

    const prompt = `You are a health analytics assistant. Generate an end-of-day nutrition and health summary.

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

    try {
      const response = await baseGeekAIService.chat(prompt, userToken);
      return {
        type: 'daily_summary',
        content: response,
        generatedAt: new Date().toISOString(),
        context: { date: targetDate }
      };
    } catch (error) {
      logger.error('Error generating daily summary', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze health correlations
   */
  async analyzeCorrelations(userId, userToken) {
    const context = await this.buildUserContext(userId, {
      daysBack: 30,
      includeGarmin: true
    });

    const prompt = `You are a health data analyst. Analyze this 30-day health data for meaningful correlations and patterns.

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

    try {
      const response = await baseGeekAIService.chat(prompt, userToken);
      return {
        type: 'correlations',
        content: response,
        generatedAt: new Date().toISOString(),
        context: { daysAnalyzed: 30 }
      };
    } catch (error) {
      logger.error('Error analyzing correlations', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate AI summary for weekly nutrition report
   */
  async generateWeeklyReport(userId, userToken, options = {}) {
    const days = options.days || 7;
    const start = options.start || format(subDays(new Date(), days - 1), 'yyyy-MM-dd');

    // Generate cache key based on userId, start date, and days
    const cacheKey = cacheService.key('ai', 'user', userId, 'weekly-report', start, days);

    // Try cache first - 6 hour TTL for AI insights
    return cacheService.wrap(cacheKey, async () => {
      const report = await foodReportService.getOverview(userId, {
        start: options.start,
        days
      });

      if (!report.daily.length) {
        return {
          type: 'weekly_report',
          content: 'No nutrition logs were found for this period, so there is nothing to summarize yet.',
          generatedAt: new Date().toISOString(),
          context: report.range
        };
      }

      const prompt = `You are a precision nutrition coach. Summarize this ${report.range.days}-day food log report.

DATA:
${JSON.stringify(report, null, 2)}

Guidelines:
- Highlight calorie + macro consistency vs averages/goals
- Mention meal-type balance and standout foods
- Call out goal-compliance wins and misses
- End with two focus recommendations for next week
- Keep under 180 words, using short paragraphs/bullets.`;

      try {
        const response = await baseGeekAIService.chat(prompt, userToken);
        return {
          type: 'weekly_report',
          content: response,
          generatedAt: new Date().toISOString(),
          context: report.range
        };
      } catch (error) {
        logger.error('Error generating weekly report', { error: error.message });
        throw error;
      }
    }, 6 * 3600); // 6 hours
  }

  /**
   * Generate AI highlights for longer-term trends
   */
  async generateTrendWatch(userId, userToken, options = {}) {
    const days = options.days || 30;
    const start = options.start || format(subDays(new Date(), days - 1), 'yyyy-MM-dd');

    // Generate cache key
    const cacheKey = cacheService.key('ai', 'user', userId, 'trend-watch', start, days);

    // Try cache first - 12 hour TTL for trend analysis
    return cacheService.wrap(cacheKey, async () => {
      const trends = await foodReportService.getTrends(userId, {
        start: options.start,
        days
      });

      if (!trends.daily.length) {
        return {
          type: 'trend_watch',
          content: 'Trend analysis needs at least a few logged days to work.',
          generatedAt: new Date().toISOString(),
          context: trends.range
        };
      }

      const prompt = `You are a health data analyst. Provide a concise trend watch summary for this ${trends.range.days}-day dataset.

DATA:
${JSON.stringify(trends, null, 2)}

Return exactly 3 sections with short bullet points:
1. Trend Signals (macro/calorie patterns)
2. Weight or outcome impact
3. Watch-outs & experiments (what to monitor next)

Use clear bullets, cite numbers, stay under 160 words.`;

      try {
        const response = await baseGeekAIService.chat(prompt, userToken);
        return {
          type: 'trend_watch',
          content: response,
          generatedAt: new Date().toISOString(),
          context: trends.range
        };
      } catch (error) {
        logger.error('Error generating trend watch', { error: error.message });
        throw error;
      }
    }, 12 * 3600); // 12 hours
  }

  /**
   * Get coaching advice
   */
  async getCoachingAdvice(userId, userToken) {
    const context = await this.buildUserContext(userId, {
      daysBack: 14,
      includeGarmin: true
    });

    const prompt = `You are an experienced health coach. Based on this 2-week data, provide personalized coaching advice.

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

    try {
      const response = await baseGeekAIService.chat(prompt, userToken);
      return {
        type: 'coaching',
        content: response,
        generatedAt: new Date().toISOString(),
        context: { daysAnalyzed: 14 }
      };
    } catch (error) {
      logger.error('Error generating coaching advice', { error: error.message });
      throw error;
    }
  }

  /**
   * Chat with health data
   */
  async chat(userId, userToken, message, conversationHistory = []) {
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

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    try {
      const response = await baseGeekAIService.chatWithHistory(messages, userToken);
      return {
        type: 'chat',
        content: response,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error in AI chat', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AIInsightsService();
