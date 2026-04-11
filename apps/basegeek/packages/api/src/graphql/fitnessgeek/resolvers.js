import { GraphQLScalarType, Kind } from 'graphql';
import crypto from 'crypto';
import { format, subDays } from 'date-fns';
import pkg from 'garmin-connect';
const { GarminConnect } = pkg;
import aiService from '../../services/aiService.js';
import UserSettings from './models/UserSettings.js';
import Weight from './models/Weight.js';
import NutritionGoals from './models/NutritionGoals.js';
import FoodItem from './models/FoodItem.js';
import FoodLog from './models/FoodLog.js';
import Meal from './models/Meal.js';
import Medication from './models/Medication.js';
import BloodPressure from './models/BloodPressure.js';
import LoginStreak from './models/LoginStreak.js';
import DailySummary from './models/DailySummary.js';
import WeightGoals from './models/WeightGoals.js';

// FitnessJSON scalar — arbitrary JSON passthrough for settings sub-objects
const FitnessJSONScalar = new GraphQLScalarType({
  name: 'FitnessJSON',
  description: 'Arbitrary JSON for FitnessGeek settings sub-objects',
  parseValue: (value) => value,
  serialize: (value) => value,
  parseLiteral: (ast) => ast.value,
});

// --- Report Helpers ---

const METRICS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar'];

const calcNutrition = (log) => {
  const servings = log.servings || 1;
  const stored = log.nutrition || {};
  const fallback = (log.food_item_id && typeof log.food_item_id === 'object') ? log.food_item_id.nutrition || {} : {};
  return {
    calories: (stored.calories_per_serving ?? fallback.calories_per_serving ?? 0) * servings,
    protein: (stored.protein_grams ?? fallback.protein_grams ?? 0) * servings,
    carbs: (stored.carbs_grams ?? fallback.carbs_grams ?? 0) * servings,
    fat: (stored.fat_grams ?? fallback.fat_grams ?? 0) * servings,
    fiber: (stored.fiber_grams ?? fallback.fiber_grams ?? 0) * servings,
    sugar: (stored.sugar_grams ?? fallback.sugar_grams ?? 0) * servings
  };
};

const buildDaily = (logs) => {
  const map = new Map();
  logs.forEach(log => {
    const dateKey = new Date(log.log_date).toISOString().split('T')[0];
    if (!map.has(dateKey)) {
      map.set(dateKey, { date: dateKey, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, entries: 0 });
    }
    const day = map.get(dateKey);
    const nutrition = calcNutrition(log);
    METRICS.forEach(metric => { day[metric] += nutrition[metric]; });
    day.entries += 1;
  });
  return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
};

const sumTotals = (daily) => {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
  daily.forEach(day => {
    METRICS.forEach(metric => { totals[metric] += day[metric]; });
  });
  return totals;
};

const toAverages = (totals, days) => {
  if (!days) return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
  const averages = {};
  METRICS.forEach(metric => {
    averages[metric] = Math.round((totals[metric] / days) * 10) / 10;
  });
  return averages;
};

const mealBreakdown = (logs) => {
  const meals = {};
  logs.forEach(log => {
    if (!meals[log.meal_type]) {
      meals[log.meal_type] = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, count: 0 };
    }
    const stats = meals[log.meal_type];
    const nutrition = calcNutrition(log);
    METRICS.forEach(metric => { stats[metric] += nutrition[metric]; });
    stats.count += 1;
  });
  return meals;
};

const topFoods = (logs) => {
  const map = new Map();
  logs.forEach(log => {
    const name = log.food_item_id?.name || log.food_name || 'Unknown';
    if (!map.has(name)) map.set(name, { name, count: 0, calories: 0 });
    const item = map.get(name);
    const nutrition = calcNutrition(log);
    item.count += 1;
    item.calories += nutrition.calories;
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count || b.calories - a.calories).slice(0, 10);
};

const goalKeyForMetric = (metric) => {
  switch (metric) {
    case 'calories': return 'calories';
    case 'protein': return 'protein_grams';
    case 'carbs': return 'carbs_grams';
    case 'fat': return 'fat_grams';
    case 'fiber': return 'fiber_grams';
    case 'sugar': return 'sugar_grams';
    default: return metric;
  }
};

const rollingAverage = (daily, window) => {
  const results = [];
  daily.forEach((day, idx) => {
    const slice = daily.slice(Math.max(0, idx - window + 1), idx + 1);
    const avg = toAverages(sumTotals(slice), slice.length);
    results.push({ date: day.date, ...avg });
  });
  return results;
};

const trendHighlights = (daily, weights) => {
  if (!daily.length) return [];
  const highlights = [];
  const last = daily[daily.length - 1];
  const first = daily[0];
  if (last.calories > first.calories * 1.2) {
    highlights.push('Calorie intake increased more than 20% over the period.');
  }
  if (weights?.length >= 2) {
    const delta = weights[weights.length - 1].weight - weights[0].weight;
    if (Math.abs(delta) >= 2) {
      highlights.push(`Weight changed by ${ delta.toFixed(1) } lbs.`);
    }
  }
  return highlights;
};

// --- AI Context Helpers ---

const getFoodLogContext = async (userId, startDate, endDate) => {
  const logs = await FoodLog.find({ user_id: userId, log_date: { $gte: startDate, $lte: endDate } }).populate('food_item_id').lean();
  if (!logs.length) return null;
  const dailyTotals = {};
  const mealTiming = { breakfast: [], lunch: [], dinner: [], snack: [] };
  const alcoholDays = new Set();
  logs.forEach(log => {
    const dateKey = new Date(log.log_date).toISOString().split('T')[0];
    const nutrition = calcNutrition(log);
    if (!dailyTotals[dateKey]) dailyTotals[dateKey] = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
    dailyTotals[dateKey].calories += nutrition.calories;
    dailyTotals[dateKey].protein += nutrition.protein;
    dailyTotals[dateKey].carbs += nutrition.carbs;
    dailyTotals[dateKey].fat += nutrition.fat;
    dailyTotals[dateKey].fiber += nutrition.fiber;
    dailyTotals[dateKey].sugar += nutrition.sugar;
    if (log.meal_type && mealTiming[log.meal_type]) mealTiming[log.meal_type].push(dateKey);
    const foodName = (log.food_name || log.food_item_id?.name || '').toLowerCase();
    if (foodName.match(/beer|wine|whiskey|vodka|cocktail|alcohol|margarita|tequila/)) alcoholDays.add(dateKey);
  });
  const days = Object.keys(dailyTotals).length;
  const totals = Object.values(dailyTotals);
  return {
    daysLogged: days,
    totalEntries: logs.length,
    dailyTotals,
    averages: {
      calories: Math.round(totals.reduce((s, d) => s + d.calories, 0) / days),
      protein: Math.round(totals.reduce((s, d) => s + d.protein, 0) / days),
      carbs: Math.round(totals.reduce((s, d) => s + d.carbs, 0) / days),
      fat: Math.round(totals.reduce((s, d) => s + d.fat, 0) / days),
      fiber: Math.round(totals.reduce((s, d) => s + d.fiber, 0) / days),
      sugar: Math.round(totals.reduce((s, d) => s + d.sugar, 0) / days)
    },
    alcoholDays: Array.from(alcoholDays),
    mealConsistency: {
      breakfast: mealTiming.breakfast.length,
      lunch: mealTiming.lunch.length,
      dinner: mealTiming.dinner.length,
      snack: mealTiming.snack.length
    }
  };
};

const getWeightContext = async (userId, startDate, endDate) => {
  const weights = await Weight.find({ userId: userId, log_date: { $gte: startDate, $lte: endDate } }).sort({ log_date: 1 }).lean();
  if (!weights.length) return null;
  const values = weights.map(w => w.weight_value);
  const firstWeight = values[0];
  const lastWeight = values[values.length - 1];
  const change = lastWeight - firstWeight;
  return {
    entries: weights.length,
    current: lastWeight,
    periodStart: firstWeight,
    change: Math.round(change * 10) / 10,
    trend: change < -0.5 ? 'losing' : change > 0.5 ? 'gaining' : 'stable',
    min: Math.min(...values),
    max: Math.max(...values),
    average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
  };
};

const getBPContext = async (userId, startDate, endDate) => {
  const readings = await BloodPressure.find({ userId: userId, log_date: { $gte: startDate, $lte: endDate } }).sort({ log_date: -1 }).lean();
  if (!readings.length) return null;
  const systolics = readings.map(r => r.systolic);
  const diastolics = readings.map(r => r.diastolic);
  const avgSystolic = Math.round(systolics.reduce((a, b) => a + b, 0) / systolics.length);
  const avgDiastolic = Math.round(diastolics.reduce((a, b) => a + b, 0) / diastolics.length);
  let category = 'normal';
  if (avgSystolic >= 180 || avgDiastolic >= 120) category = 'crisis';
  else if (avgSystolic >= 140 || avgDiastolic >= 90) category = 'stage2';
  else if (avgSystolic >= 130 || avgDiastolic >= 80) category = 'stage1';
  else if (avgSystolic >= 120) category = 'elevated';
  return {
    entries: readings.length,
    latest: { systolic: readings[0].systolic, diastolic: readings[0].diastolic },
    average: { systolic: avgSystolic, diastolic: avgDiastolic },
    category
  };
};

const buildUserContext = async (userId, options = {}) => {
  const daysBack = options.daysBack || 7;
  const endDate = new Date();
  const startDate = subDays(endDate, daysBack);
  const context = {
    dateRange: { start: format(startDate, 'yyyy-MM-dd'), end: format(endDate, 'yyyy-MM-dd'), days: daysBack },
    generatedAt: new Date().toISOString()
  };
  const [nutrition, weight, bloodPressure, goals] = await Promise.allSettled([
    getFoodLogContext(userId, startDate, endDate),
    getWeightContext(userId, startDate, endDate),
    getBPContext(userId, startDate, endDate),
    Promise.all([NutritionGoals.getActiveGoals(userId), WeightGoals.getActiveWeightGoals(userId)])
  ]);
  context.nutrition = nutrition.status === 'fulfilled' ? nutrition.value : null;
  context.weight = weight.status === 'fulfilled' ? weight.value : null;
  context.bloodPressure = bloodPressure.status === 'fulfilled' ? bloodPressure.value : null;
  if (goals.status === 'fulfilled') {
    const [ng, wg] = goals.value;
    context.goals = {
      nutrition: ng ? { calories: ng.calories, protein: ng.protein_grams, carbs: ng.carbs_grams, fat: ng.fat_grams, fiber: ng.fiber_grams } : null,
      weight: wg ? { enabled: wg.is_active, startWeight: wg.startWeight, targetWeight: wg.targetWeight, goalDate: wg.goalDate } : null
    };
  }
  return context;
};

// --- Garmin Helpers ---

async function buildGarminClient(userId) {
  const settings = await UserSettings.getOrCreate(userId);
  if (!settings.garmin || !settings.garmin.enabled) throw new Error('Garmin integration disabled');
  const client = new GarminConnect({ username: settings.garmin.username, password: settings.garmin.password });
  if (settings.garmin.oauth1_token && settings.garmin.oauth2_token) {
    try { client.loadToken(settings.garmin.oauth1_token, settings.garmin.oauth2_token); return { client, settings }; }
    catch (err) { console.warn('Failed to load saved Garmin tokens', err.message); }
  }
  await client.login();
  await persistGarminTokens(userId, client);
  return { client, settings };
}

async function persistGarminTokens(userId, client) {
  const oauth1 = client.client?.oauth1Token;
  const oauth2 = client.client?.oauth2Token;
  if (oauth1 && oauth2) {
    await UserSettings.findOneAndUpdate({ user_id: userId }, { $set: { 'garmin.oauth1_token': oauth1, 'garmin.oauth2_token': oauth2, 'garmin.last_connected_at': new Date() } });
  }
}

export const resolvers = {
  FitnessJSON: FitnessJSONScalar,

  Query: {
    fitnessUserSettings: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      
      const [settings, centralUser] = await Promise.all([
        UserSettings.getOrCreate(user.id).then(s => s.populate('favorite_foods')),
        import('../../models/user.js').then(m => m.User.findById(user.id))
      ]);

      // Overlay central theme if available
      const santizedSettings = settings.toObject();
      if (centralUser?.preferences?.theme) {
        santizedSettings.theme = centralUser.preferences.theme;
      }
      
      return santizedSettings;
    },
    fitnessWeights: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return Weight.find({ userId: user.id }).sort({ log_date: -1 });
    },
    fitnessWeight: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return Weight.findOne({ _id: id, userId: user.id });
    },
    activeNutritionGoals: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return NutritionGoals.getActiveGoals(user.id);
    },
    nutritionGoalsHistory: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return NutritionGoals.find({ user_id: user.id }).sort({ start_date: -1 });
    },
    fitnessFoods: async (_, { search }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const query = {
        $or: [{ user_id: user.id }, { user_id: null }, { user_id: { $exists: false } }],
        is_deleted: false,
      };
      if (search) query.name = new RegExp(search, 'i');
      return FoodItem.find(query).sort({ name: 1 }).limit(100);
    },
    fitnessFood: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return FoodItem.findOne({ _id: id, is_deleted: false });
    },
    foodLogs: async (_, { date, startDate, endDate, mealType }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      if (date) {
        if (mealType) return FoodLog.getLogsByMealType(user.id, mealType, date);
        return FoodLog.getLogsForDate(user.id, date);
      } else if (startDate && endDate) {
        return FoodLog.getLogsForDateRange(user.id, startDate, endDate);
      }
      return FoodLog.getRecentLogs(user.id, 50);
    },
    foodLog: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return FoodLog.findOne({ _id: id, user_id: user.id }).populate('food_item_id');
    },
    fitnessMeals: async (_, { mealType }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      if (mealType) return Meal.getMealsByType(mealType);
      return Meal.getActiveMeals();
    },
    fitnessMeal: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return Meal.findOne({ _id: id, is_deleted: false }).populate('food_items.food_item_id');
    },
    fitnessMedications: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return Medication.find({ user_id: user.id }).sort({ display_name: 1 });
    },
    fitnessMedication: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return Medication.findOne({ _id: id, user_id: user.id });
    },
    bloodPressures: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return BloodPressure.find({ userId: user.id }).sort({ log_date: -1 });
    },
    bloodPressure: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return BloodPressure.findOne({ _id: id, userId: user.id });
    },

    loginStreak: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const streak = await LoginStreak.getOrCreateStreak(user.id);
      return {
        currentStreak: streak.current_streak,
        longestStreak: streak.longest_streak,
        lastLoginDate: streak.last_login_date ? streak.last_login_date.toISOString().split('T')[0] : null,
        streakStartDate: streak.streak_start_date ? streak.streak_start_date.toISOString().split('T')[0] : null,
      };
    },

    dailySummary: async (_, { date }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const targetDate = date || new Date().toISOString().split('T')[0];
      const settings = await UserSettings.findOne({ user_id: user.id });
      const calorieGoal = settings?.nutrition_goal?.daily_calorie_target || null;
      const summary = await DailySummary.updateFromLogs(user.id, targetDate);
      return {
        date: targetDate,
        totals: summary.totals,
        meals: summary.meals,
        calorieGoal,
      };
    },

    weeklySummary: async (_, { startDate }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const start = new Date(startDate);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      const summaries = await DailySummary.getSummaryRange(user.id, start, end);
      const weeklyTotals = { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 };
      summaries.forEach(s => {
        weeklyTotals.calories += s.totals.calories;
        weeklyTotals.protein_grams += s.totals.protein_grams;
        weeklyTotals.carbs_grams += s.totals.carbs_grams;
        weeklyTotals.fat_grams += s.totals.fat_grams;
      });
      return {
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0],
        daily_summaries: summaries,
        weekly_totals: weeklyTotals,
        average_daily_calories: Math.round(weeklyTotals.calories / 7),
      };
    },

    derivedMacros: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);
      const ng = settings?.nutrition_goal || {};

      const goalWeightLbs = ng.goal_weight_lbs ?? ng.target_weight ?? ng.targetWeight;
      const proteinPerLb = ng.protein_g_per_lb_goal ?? ng.protein_g_per_lb ?? 0.8;
      const fatPerLb = ng.fat_g_per_lb_goal ?? ng.fat_g_per_lb ?? 0.35;
      const proteinG = goalWeightLbs ? Math.round(proteinPerLb * goalWeightLbs) : 0;
      const fatG = goalWeightLbs ? Math.round(fatPerLb * goalWeightLbs) : 0;
      const proteinKcal = proteinG * 4;
      const fatKcal = fatG * 9;

      const mode = ng.calorie_target_mode || 'fixed';
      const dailyCal = ng.daily_calorie_target || ng.auto_base_calories || ng.fixed_calories || null;
      const weeklyBase = Array.isArray(ng.weekly_schedule) && ng.weekly_schedule.length === 7
        ? ng.weekly_schedule
        : (dailyCal ? new Array(7).fill(dailyCal) : [0, 0, 0, 0, 0, 0, 0]);

      const eatFrac = typeof ng.activity_eatback_fraction === 'number' ? ng.activity_eatback_fraction : 0.6;
      const eatCap = typeof ng.activity_eatback_cap_kcal === 'number' ? ng.activity_eatback_cap_kcal : 500;

      const weekly = weeklyBase.map((baseCal, idx) => {
        const target = baseCal;
        const carbsG = Math.max(0, Math.round((target - (proteinKcal + fatKcal)) / 4));
        return { dayIndex: idx, base_calories: baseCal, activity_add_kcal: 0, target_calories: target, protein_g: proteinG, fat_g: fatG, carbs_g: carbsG };
      });

      const now = new Date();
      const dow = now.getDay();
      const todayIndex = (dow + 6) % 7;
      const today = weekly[todayIndex] || null;

      return {
        rules: { goal_weight_lbs: goalWeightLbs, protein_g_per_lb: proteinPerLb, fat_g_per_lb: fatPerLb, calorie_target_mode: mode, activity_eatback_fraction: eatFrac, activity_eatback_cap_kcal: eatCap },
        fixed: { protein_g: proteinG, fat_g: fatG, protein_kcal: proteinKcal, fat_kcal: fatKcal },
        calories: { daily: dailyCal, weekly_schedule: weeklyBase },
        weekly,
        today,
        todayIndex,
      };
    },

    fitnessHousehold: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);

      let members = [];
      if (settings.household?.household_id) {
        const householdMembers = await UserSettings.find({
          'household.household_id': settings.household.household_id,
          user_id: { $ne: user.id }
        }).select('user_id household.display_name household.share_food_logs household.share_meals');

        members = householdMembers.map(m => ({
          user_id: m.user_id,
          display_name: m.household?.display_name || 'Household Member',
          shares_food_logs: m.household?.share_food_logs || false,
          shares_meals: m.household?.share_meals || false
        }));
      }

      return {
        household_id: settings.household?.household_id || null,
        display_name: settings.household?.display_name || null,
        share_food_logs: settings.household?.share_food_logs ?? true,
        share_weight: settings.household?.share_weight ?? false,
        share_meals: settings.household?.share_meals ?? true,
        members
      };
    },

    fitnessHouseholdMemberLogs: async (_, { memberId, date }, { user }) => {
      if (!user) throw new Error('Unauthorized');

      const [userSettings, memberSettings] = await Promise.all([
        UserSettings.getOrCreate(user.id),
        UserSettings.findOne({ user_id: memberId })
      ]);

      if (!userSettings.household?.household_id) throw new Error('You are not part of a household');
      if (!memberSettings?.household?.household_id || memberSettings.household.household_id !== userSettings.household.household_id) {
        throw new Error('User is not in your household');
      }
      if (!memberSettings.household.share_food_logs) throw new Error('This household member has not enabled food log sharing');

      return FoodLog.getLogsForDate(memberId, date);
    },

    fitnessFoodReportOverview: async (_, { start, days = 7 }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const startDate = start ? new Date(start) : subDays(new Date(), days - 1);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + (days - 1));
      endDate.setUTCHours(23, 59, 59, 999);
      const logs = await FoodLog.find({ user_id: user.id, log_date: { $gte: startDate, $lte: endDate } }).populate('food_item_id').lean();
      const daily = buildDaily(logs);
      const totals = sumTotals(daily);
      const averages = toAverages(totals, daily.length);
      const meals = mealBreakdown(logs);
      const top = topFoods(logs);
      const goals = await NutritionGoals.getActiveGoals(user.id);
      const goalCompliance = {};
      if (goals) {
        METRICS.forEach(metric => {
          const goalKey = goalKeyForMetric(metric);
          const goalValue = goals[goalKey];
          if (!goalValue) return;
          const daysWithin = daily.filter(day => day[metric] >= 0.95 * goalValue && day[metric] <= 1.05 * goalValue).length;
          goalCompliance[metric] = { goal: goalValue, daysWithin, percentage: daily.length ? Math.round((daysWithin / daily.length) * 100) : 0 };
        });
      }
      return {
        range: { start: format(startDate, 'yyyy-MM-dd'), end: format(endDate, 'yyyy-MM-dd'), days },
        totals, averages, daily, meals, topFoods: top,
        goalCompliance: Object.keys(goalCompliance).length ? goalCompliance : null
      };
    },

    fitnessFoodReportTrends: async (_, { start, days = 30 }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const startDate = start ? new Date(start) : subDays(new Date(), days - 1);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + (days - 1));
      endDate.setUTCHours(23, 59, 59, 999);
      const logs = await FoodLog.find({ user_id: user.id, log_date: { $gte: startDate, $lte: endDate } }).populate('food_item_id').lean();
      const daily = buildDaily(logs);
      const rolling = rollingAverage(daily, 7);
      const weightsRaw = await Weight.find({ userId: user.id, log_date: { $gte: startDate, $lte: endDate } }).sort({ log_date: 1 }).lean();
      const weights = weightsRaw.map(w => ({ date: new Date(w.log_date).toISOString().split('T')[0], weight: w.weight_value }));
      return {
        range: { start: format(startDate, 'yyyy-MM-dd'), end: format(endDate, 'yyyy-MM-dd'), days },
        daily, rolling, weights, highlights: trendHighlights(daily, weights)
      };
    },

    fitnessInsightsMorningBrief: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const context = await buildUserContext(user.id, { daysBack: 1 });
      const prompt = `You are a friendly health coach. Generate a morning brief based on yesterday's data:\n${ JSON.stringify(context, null, 2) }\nKeep it under 100 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'morning_brief', content: response, generatedAt: new Date(), context: { date: format(new Date(), 'yyyy-MM-dd') } };
    },

    fitnessInsightsDailySummary: async (_, { date }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const targetDate = date || format(new Date(), 'yyyy-MM-dd');
      const context = await buildUserContext(user.id, { daysBack: 1 });
      const prompt = `Generate a daily health summary for ${ targetDate }:\n${ JSON.stringify(context, null, 2) }\nFormat with 2-3 key insights, under 150 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'daily_summary', content: response, generatedAt: new Date(), context: { date: targetDate } };
    },

    fitnessInsightsCorrelations: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const context = await buildUserContext(user.id, { daysBack: 30 });
      const prompt = `Analyze this 30-day health data for patterns:\n${ JSON.stringify(context, null, 2) }\nFormat as 3-5 findings, under 250 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'correlations', content: response, generatedAt: new Date(), context: { daysAnalyzed: 30 } };
    },

    fitnessInsightsWeeklyReport: async (parent, { start, days = 7 }, context) => {
      if (!context.user) throw new Error('Unauthorized');
      const report = await resolvers.Query.fitnessFoodReportOverview(parent, { start, days }, context);
      if (!report.daily.length) return { type: 'weekly_report', content: 'No data found.', generatedAt: new Date(), context: report.range };
      const prompt = `Summarize this ${ days }-day food report:\n${ JSON.stringify(report, null, 2) }\nUnder 180 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'weekly_report', content: response, generatedAt: new Date(), context: report.range };
    },

    fitnessInsightsTrendWatch: async (parent, { start, days = 30 }, context) => {
      if (!context.user) throw new Error('Unauthorized');
      const trends = await resolvers.Query.fitnessFoodReportTrends(parent, { start, days }, context);
      if (!trends.daily.length) return { type: 'trend_watch', content: 'No data found.', generatedAt: new Date(), context: trends.range };
      const prompt = `Provide a trend watch summary for this ${ days }-day data:\n${ JSON.stringify(trends, null, 2) }\nUnder 160 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'trend_watch', content: response, generatedAt: new Date(), context: trends.range };
    },

    fitnessInsightsCoaching: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const context = await buildUserContext(user.id, { daysBack: 14 });
      const prompt = `Provide coaching advice based on this 14-day data:\n${ JSON.stringify(context, null, 2) }\n2-3 action items, under 200 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'coaching', content: response, generatedAt: new Date(), context: { daysAnalyzed: 14 } };
    },

    fitnessInsightsContext: async (_, { days = 7 }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return buildUserContext(user.id, { daysBack: days });
    },

    garminStatus: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);
      const g = settings.garmin || {};
      return { enabled: !!g.enabled, hasCredentials: !!(g.username && g.password), hasTokens: !!(g.oauth1_token && g.oauth2_token), lastConnectedAt: g.last_connected_at || null };
    },

    garminDaily: async (_, { date }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const { client, settings } = await buildGarminClient(user.id);
      const d = date ? new Date(date) : new Date();
      const [hrRes, weightRes, stepsRes, sleepRes, activitiesRes] = await Promise.allSettled([
        client.getHeartRate(d),
        client.getDailyWeightInPounds(d),
        client.getSteps ? client.getSteps(d) : Promise.reject('N/A'),
        client.getSleepDuration ? client.getSleepDuration(d) : Promise.reject('N/A'),
        client.getActivities ? client.getActivities(0, 50) : Promise.reject('N/A')
      ]);
      const result = { date: d.toISOString().split('T')[0], steps: null, activeCalories: null, restingHR: null, weightLbs: null, sleepMinutes: null, fetchedAt: new Date().toISOString(), lastSyncAt: settings?.garmin?.last_connected_at };
      if (hrRes.status === 'fulfilled' && hrRes.value) result.restingHR = hrRes.value.restingHeartRate || hrRes.value.resting_hr || null;
      if (weightRes.status === 'fulfilled') result.weightLbs = weightRes.value;
      if (stepsRes.status === 'fulfilled') result.steps = typeof stepsRes.value === 'number' ? stepsRes.value : (stepsRes.value?.steps || null);
      if (sleepRes.status === 'fulfilled' && sleepRes.value) result.sleepMinutes = (sleepRes.value.hours || 0) * 60 + (sleepRes.value.minutes || 0);
      if (activitiesRes.status === 'fulfilled' && Array.isArray(activitiesRes.value)) {
        const ymd = d.toISOString().split('T')[0];
        result.activeCalories = Math.round(activitiesRes.value.filter(a => (a.startTimeLocal || '').substring(0, 10) === ymd).reduce((sum, a) => sum + (a.calories || 0), 0));
      }
      await persistGarminTokens(user.id, client);
      return result;
    },

    garminSleep: async (_, { date }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const { client } = await buildGarminClient(user.id);
      const d = date ? new Date(date) : new Date();
      const sleepData = await client.getSleepData(d);
      await persistGarminTokens(user.id, client);
      if (!sleepData) return null;
      const dto = sleepData.dailySleepDTO || sleepData;
      return {
        date: d.toISOString().split('T')[0],
        totalSleepMinutes: dto.sleepTimeSeconds ? Math.round(dto.sleepTimeSeconds / 60) : null,
        deepSleepMinutes: dto.deepSleepSeconds ? Math.round(dto.deepSleepSeconds / 60) : null,
        lightSleepMinutes: dto.lightSleepSeconds ? Math.round(dto.lightSleepSeconds / 60) : null,
        remSleepMinutes: dto.remSleepSeconds ? Math.round(dto.remSleepSeconds / 60) : null,
        awakeSleepMinutes: dto.awakeSleepSeconds ? Math.round(dto.awakeSleepSeconds / 60) : null,
        sleepStartTime: dto.sleepStartTimestampLocal ? new Date(dto.sleepStartTimestampLocal).toISOString() : null,
        sleepEndTime: dto.sleepEndTimestampLocal ? new Date(dto.sleepEndTimestampLocal).toISOString() : null,
        sleepScore: dto.sleepScores?.overall?.value || null,
        sleepQuality: dto.sleepScores?.overall?.qualifierKey || null,
        sleepFeedback: dto.sleepScoreFeedback || null,
        restingHeartRate: sleepData.restingHeartRate || dto.restingHeartRate || null,
        avgOvernightHrv: sleepData.avgOvernightHrv || null,
        hrvStatus: sleepData.hrvStatus || null,
        avgSpO2: dto.averageSpO2Value || null,
        avgRespiration: dto.averageRespirationValue || null,
        avgSleepStress: dto.avgSleepStress || null,
        bodyBatteryChange: sleepData.bodyBatteryChange || null
      };
    },

    garminActivities: async (_, { start = 0, limit = 20 }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const { client } = await buildGarminClient(user.id);
      const activities = await client.getActivities(start, limit);
      await persistGarminTokens(user.id, client);
      return (activities || []).map(a => ({
        activityId: a.activityId,
        activityName: a.activityName,
        activityType: a.activityType?.typeKey || a.activityTypeName || 'unknown',
        startTimeLocal: a.startTimeLocal,
        startTimeGMT: a.startTimeGMT,
        duration: a.duration,
        distance: a.distance,
        calories: a.calories || a.activeKilocalories,
        averageHR: a.averageHR,
        maxHR: a.maxHR,
        averageSpeed: a.averageSpeed,
        elevationGain: a.elevationGain,
        steps: a.steps
      }));
    },
  },

  Mutation: {
    fitnessInsightsChat: async (_, { message, history }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const context = await buildUserContext(user.id, { daysBack: 30 });
      const systemPrompt = `You are a helpful health assistant with access to the user's health data.\n\nUSER HEALTH DATA (LAST 30 DAYS):\n${ JSON.stringify(context, null, 2) }\n\nAnswer based on the actual data provided.`;
      const messages = [
        { role: 'system', content: systemPrompt },
        ...(history || []),
        { role: 'user', content: message }
      ];
      const response = await aiService.chatWithHistory(messages);
      return { type: 'chat', content: response, generatedAt: new Date() };
    },

    updateGarminWeight: async (_, { date, weightLbs, timezone }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const { client } = await buildGarminClient(user.id);
      await client.updateWeight(date ? new Date(date) : new Date(), weightLbs, timezone || 'America/Los_Angeles');
      await persistGarminTokens(user.id, client);
      return { success: true };
    },

    refreshDailySummary: async (_, { date }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const d = date || format(new Date(), 'yyyy-MM-dd');
      return DailySummary.updateFromLogs(user.id, d);
    },

    logMeal: async (_, { mealId, date, mealType }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const meal = await Meal.findById(mealId).populate('food_items.food_item_id');
      if (!meal) throw new Error('Meal not found');

      const logs = [];
      const logDate = date || format(new Date(), 'yyyy-MM-dd');
      for (const item of meal.food_items) {
        const log = new FoodLog({
          user_id: user.id,
          food_item_id: item.food_item_id._id,
          log_date: logDate,
          meal_type: mealType || meal.meal_type || 'snack',
          servings: item.servings,
          nutrition: item.food_item_id.nutrition
        });
        await log.save();
        logs.push(log);
      }

      await DailySummary.updateFromLogs(user.id, logDate);
      return FoodLog.find({ _id: { $in: logs.map(l => l._id) } }).populate('food_item_id');
    },
    updateFitnessUserSettings: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      
      const { theme, ...otherSettings } = input;
      
      const promises = [UserSettings.updateSettings(user.id, otherSettings)];
      
      if (theme) {
        const { User } = await import('../../models/user.js');
        promises.push(User.findByIdAndUpdate(user.id, { $set: { 'preferences.theme': theme } }));
      }
      
      const [res] = await Promise.all(promises);
      return res;
    },
    addFitnessWeight: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return new Weight({ ...input, userId: user.id }).save();
    },
    updateFitnessWeight: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const w = await Weight.findOneAndUpdate({ _id: id, userId: user.id }, { ...input, updated_at: new Date() }, { new: true });
      if (!w) throw new Error('Weight record not found');
      return w;
    },
    deleteFitnessWeight: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const result = await Weight.deleteOne({ _id: id, userId: user.id });
      return result.deletedCount === 1;
    },
    setNutritionGoals: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return NutritionGoals.createGoals(user.id, input);
    },
    addFitnessFood: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      // GraphQL FitnessFoodInput uses flat serving_size/serving_unit and has no
      // `source` field. The Mongoose FoodItem model uses nested serving.{size,unit}
      // and requires `source`. Translate here so the GraphQL schema stays clean.
      const { serving_size, serving_unit, ...rest } = input;
      const doc = {
        ...rest,
        serving: { size: serving_size, unit: serving_unit || 'g' },
        source: 'custom',
        user_id: user.id,
      };
      return new FoodItem(doc).save();
    },
    updateFitnessFood: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const { serving_size, serving_unit, ...rest } = input;
      const update = {
        ...rest,
        ...(serving_size != null || serving_unit != null
          ? { serving: { size: serving_size, unit: serving_unit || 'g' } }
          : {}),
        updated_at: new Date(),
      };
      const food = await FoodItem.findOneAndUpdate(
        { _id: id, user_id: user.id },
        update,
        { new: true }
      );
      if (!food) throw new Error('Food item not found or unauthorized');
      return food;
    },
    deleteFitnessFood: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const result = await FoodItem.findOneAndUpdate({ _id: id, user_id: user.id }, { is_deleted: true, updated_at: new Date() });
      return !!result;
    },
    addFoodLog: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const food = await FoodItem.findById(input.food_item_id);
      if (!food) throw new Error('Food item not found');
      const log = new FoodLog({ ...input, user_id: user.id, nutrition: input.nutrition || food.nutrition });
      await log.save();
      return log.populate('food_item_id');
    },
    updateFoodLog: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const log = await FoodLog.findOneAndUpdate({ _id: id, user_id: user.id }, { ...input, updated_at: new Date() }, { new: true }).populate('food_item_id');
      if (!log) throw new Error('Food log not found');
      return log;
    },
    deleteFoodLog: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const result = await FoodLog.deleteOne({ _id: id, user_id: user.id });
      return result.deletedCount === 1;
    },
    addFitnessMeal: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const meal = new Meal({ ...input, user_id: user.id });
      await meal.save();
      return meal.populate('food_items.food_item_id');
    },
    updateFitnessMeal: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const meal = await Meal.findOneAndUpdate({ _id: id, $or: [{ user_id: user.id }, { user_id: null }] }, { ...input, updated_at: new Date() }, { new: true }).populate('food_items.food_item_id');
      if (!meal) throw new Error('Meal not found or unauthorized');
      return meal;
    },
    deleteFitnessMeal: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const result = await Meal.findOneAndUpdate({ _id: id, user_id: user.id }, { is_deleted: true, updated_at: new Date() });
      return !!result;
    },
    addFitnessMedication: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return new Medication({ ...input, user_id: user.id }).save();
    },
    updateFitnessMedication: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const med = await Medication.findOneAndUpdate({ _id: id, user_id: user.id }, { ...input, updated_at: new Date() }, { new: true });
      if (!med) throw new Error('Medication not found');
      return med;
    },
    deleteFitnessMedication: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const result = await Medication.deleteOne({ _id: id, user_id: user.id });
      return result.deletedCount === 1;
    },
    addBloodPressure: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return new BloodPressure({ ...input, userId: user.id }).save();
    },
    updateBloodPressure: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const bp = await BloodPressure.findOneAndUpdate({ _id: id, userId: user.id }, { ...input, updated_at: new Date() }, { new: true });
      if (!bp) throw new Error('Blood pressure record not found');
      return bp;
    },
    deleteBloodPressure: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const result = await BloodPressure.deleteOne({ _id: id, userId: user.id });
      return result.deletedCount === 1;
    },

    recordLoginStreak: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const streak = await LoginStreak.getOrCreateStreak(user.id);
      await streak.recordLogin();
      return {
        currentStreak: streak.current_streak,
        longestStreak: streak.longest_streak,
        lastLoginDate: streak.last_login_date ? streak.last_login_date.toISOString().split('T')[0] : null,
        streakStartDate: streak.streak_start_date ? streak.streak_start_date.toISOString().split('T')[0] : null,
      };
    },

    createFitnessHousehold: async (_, { display_name }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);

      if (settings.household?.household_id) throw new Error('You are already part of a household');

      const householdId = crypto.randomBytes(6).toString('hex').toUpperCase();
      settings.household = {
        household_id: householdId,
        display_name: display_name || 'Me',
        share_food_logs: true,
        share_weight: false,
        share_meals: true
      };

      await settings.save();
      return { ...settings.household, members: [] };
    },

    joinFitnessHousehold: async (_, { household_id, display_name }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      if (!household_id) throw new Error('Household ID is required');

      const settings = await UserSettings.getOrCreate(user.id);
      if (settings.household?.household_id) throw new Error('You are already part of a household');

      const existingMember = await UserSettings.findOne({ 'household.household_id': household_id.toUpperCase() });
      if (!existingMember) throw new Error('Household not found');

      settings.household = {
        household_id: household_id.toUpperCase(),
        display_name: display_name || 'Family Member',
        share_food_logs: true,
        share_weight: false,
        share_meals: true
      };

      await settings.save();
      return { ...settings.household, members: [] }; // Members will be fetched by Query.fitnessHousehold next time
    },

    updateFitnessHouseholdSettings: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);
      if (!settings.household?.household_id) throw new Error('You are not part of a household');

      if (input.display_name !== undefined) settings.household.display_name = input.display_name;
      if (input.share_food_logs !== undefined) settings.household.share_food_logs = input.share_food_logs;
      if (input.share_weight !== undefined) settings.household.share_weight = input.share_weight;
      if (input.share_meals !== undefined) settings.household.share_meals = input.share_meals;

      await settings.save();
      return { ...settings.household, members: [] };
    },

    leaveFitnessHousehold: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);
      if (!settings.household?.household_id) throw new Error('You are not part of a household');

      settings.household = {
        household_id: undefined,
        display_name: undefined,
        share_food_logs: true,
        share_weight: false,
        share_meals: true
      };

      await settings.save();
      return true;
    },

    copyFitnessMeal: async (_, { from_date, to_date, from_meal_type, to_meal_type, from_user_id }, { user }) => {
      if (!user) throw new Error('Unauthorized');

      let sourceUserId = user.id;
      if (from_user_id && from_user_id !== user.id) {
        const [userSettings, memberSettings] = await Promise.all([
          UserSettings.getOrCreate(user.id),
          UserSettings.findOne({ user_id: from_user_id })
        ]);

        if (!userSettings.household?.household_id || !memberSettings?.household?.household_id || memberSettings.household.household_id !== userSettings.household.household_id) {
          throw new Error('Cannot copy from user outside your household');
        }
        if (!memberSettings.household.share_food_logs) throw new Error('This household member has not enabled food log sharing');
        sourceUserId = from_user_id;
      }

      const query = { user_id: sourceUserId, log_date: new Date(from_date) };
      if (from_meal_type) query.meal_type = from_meal_type;

      const sourceLogs = await FoodLog.find(query);
      if (!sourceLogs.length) throw new Error('No food logs found for the source date/meal');

      const newLogs = [];
      const targetDate = new Date(to_date);

      for (const sourceLog of sourceLogs) {
        const targetMealType = to_meal_type || sourceLog.meal_type;
        const newLog = new FoodLog({
          user_id: user.id,
          food_item_id: sourceLog.food_item_id,
          log_date: targetDate,
          meal_type: targetMealType,
          servings: sourceLog.servings,
          notes: sourceLog.notes ? `(Copied) ${ sourceLog.notes }` : '',
          nutrition: sourceLog.nutrition
        });
        await newLog.save();
        newLogs.push(newLog);
      }

      await DailySummary.updateFromLogs(user.id, to_date);
      return newLogs.map(l => l.populate('food_item_id'));
    },
  },

  FitnessUserSettings: { id: (s) => s._id.toString() },
  FitnessWeight: { id: (w) => w._id.toString() },
  NutritionGoals: { id: (g) => g._id.toString() },
  FitnessFood: { id: (f) => f._id.toString() },
  FoodLog: { id: (l) => l._id.toString() },
  FitnessMeal: { id: (m) => m._id.toString() },
  FitnessMedication: { id: (m) => m._id.toString() },
  BloodPressure: { id: (b) => b._id.toString() },
};
