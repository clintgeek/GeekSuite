const { format, subDays } = require('date-fns');
const FoodLog = require('../models/FoodLog');
const NutritionGoals = require('../models/NutritionGoals');
const Weight = require('../models/Weight');

const METRICS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar'];

class FoodReportService {
  async getOverview(userId, { start, days = 7 } = {}) {
    const startDate = start ? new Date(start) : subDays(new Date(), days - 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (days - 1));
    endDate.setHours(23, 59, 59, 999);

    const logs = await this.#fetchLogs(userId, startDate, endDate);
    if (!logs.length) {
      return {
        range: this.#rangeMeta(startDate, endDate, days),
        totals: this.#emptyTotals(),
        averages: this.#emptyTotals(),
        daily: [],
        meals: {},
        topFoods: [],
        goalCompliance: null
      };
    }

    const daily = this.#buildDaily(logs);
    const totals = this.#sumTotals(daily);
    const averages = this.#toAverages(totals, daily.length);
    const meals = this.#mealBreakdown(logs);
    const topFoods = this.#topFoods(logs);
    const goalCompliance = await this.#goalCompliance(userId, daily);

    return {
      range: this.#rangeMeta(startDate, endDate, days),
      totals,
      averages,
      daily,
      meals,
      topFoods,
      goalCompliance
    };
  }

  async getTrends(userId, { start, days = 30 } = {}) {
    const startDate = start ? new Date(start) : subDays(new Date(), days - 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (days - 1));
    endDate.setHours(23, 59, 59, 999);

    const logs = await this.#fetchLogs(userId, startDate, endDate);
    const daily = this.#buildDaily(logs);
    const rolling = this.#rollingAverage(daily, 7);

    const weights = await this.#fetchWeights(userId, startDate, endDate);

    return {
      range: this.#rangeMeta(startDate, endDate, days),
      daily,
      rolling,
      weights,
      highlights: this.#trendHighlights(daily, weights)
    };
  }

  async export(userId, options = {}) {
    const overview = await this.getOverview(userId, options);
    const rows = ['Date,Calories,Protein,Carbs,Fat,Fiber,Sugar'];
    overview.daily.forEach(day => {
      rows.push([
        day.date,
        day.calories,
        day.protein,
        day.carbs,
        day.fat,
        day.fiber,
        day.sugar
      ].join(','));
    });
    return rows.join('\n');
  }

  #rangeMeta(start, end, days) {
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
      days
    };
  }

  #emptyTotals() {
    return METRICS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
  }

  async #fetchLogs(userId, startDate, endDate) {
    return FoodLog.find({
      user_id: userId,
      log_date: { $gte: startDate, $lte: endDate }
    }).populate('food_item_id').lean();
  }

  async #fetchWeights(userId, startDate, endDate) {
    const entries = await Weight.find({
      userId,
      log_date: { $gte: startDate, $lte: endDate }
    }).sort({ log_date: 1 }).lean();
    return entries.map(entry => ({
      date: format(new Date(entry.log_date), 'yyyy-MM-dd'),
      weight: entry.weight_value
    }));
  }

  #buildDaily(logs) {
    const map = new Map();
    logs.forEach(log => {
      const dateKey = format(new Date(log.log_date), 'yyyy-MM-dd');
      if (!map.has(dateKey)) {
        map.set(dateKey, { date: dateKey, ...this.#emptyTotals(), entries: 0 });
      }
      const day = map.get(dateKey);
      const nutrition = this.#calcNutrition(log);
      METRICS.forEach(metric => { day[metric] += nutrition[metric]; });
      day.entries += 1;
    });
    return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  #sumTotals(daily) {
    const totals = this.#emptyTotals();
    daily.forEach(day => {
      METRICS.forEach(metric => { totals[metric] += day[metric]; });
    });
    return totals;
  }

  #toAverages(totals, days) {
    if (!days) return this.#emptyTotals();
    const averages = {};
    METRICS.forEach(metric => {
      averages[metric] = Math.round((totals[metric] / days) * 10) / 10;
    });
    return averages;
  }

  #mealBreakdown(logs) {
    const meals = {};
    logs.forEach(log => {
      if (!meals[log.meal_type]) {
        meals[log.meal_type] = { ...this.#emptyTotals(), count: 0 };
      }
      const stats = meals[log.meal_type];
      const nutrition = this.#calcNutrition(log);
      METRICS.forEach(metric => { stats[metric] += nutrition[metric]; });
      stats.count += 1;
    });
    return meals;
  }

  #topFoods(logs) {
    const map = new Map();
    logs.forEach(log => {
      const name = log.food_item_id?.name || log.food_name || 'Unknown';
      if (!map.has(name)) {
        map.set(name, { name, count: 0, calories: 0 });
      }
      const item = map.get(name);
      const nutrition = this.#calcNutrition(log);
      item.count += 1;
      item.calories += nutrition.calories;
    });
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || b.calories - a.calories)
      .slice(0, 10);
  }

  async #goalCompliance(userId, daily) {
    const goals = await NutritionGoals.getActiveGoals(userId);
    if (!goals || !daily.length) return null;

    const compliance = {};
    METRICS.forEach(metric => {
      const goalKey = this.#goalKey(metric);
      const goalValue = goals[goalKey];
      if (!goalValue) return;
      const daysWithin = daily.filter(day => day[metric] >= 0.95 * goalValue && day[metric] <= 1.05 * goalValue).length;
      compliance[metric] = {
        goal: goalValue,
        daysWithin,
        percentage: Math.round((daysWithin / daily.length) * 100)
      };
    });
    return compliance;
  }

  #goalKey(metric) {
    switch (metric) {
      case 'calories': return 'calories';
      case 'protein': return 'protein_grams';
      case 'carbs': return 'carbs_grams';
      case 'fat': return 'fat_grams';
      case 'fiber': return 'fiber_grams';
      case 'sugar': return 'sugar_grams';
      default: return metric;
    }
  }

  #rollingAverage(daily, window) {
    const results = [];
    daily.forEach((day, idx) => {
      const slice = daily.slice(Math.max(0, idx - window + 1), idx + 1);
      const avg = this.#toAverages(this.#sumTotals(slice), slice.length);
      results.push({ date: day.date, ...avg });
    });
    return results;
  }

  #trendHighlights(daily, weights) {
    if (!daily.length) return [];
    const highlights = [];
    const last = daily[daily.length - 1];
    const first = daily[0];
    if (last.calories > first.calories * 1.2) {
      highlights.push('Calorie intake increased more than 20% over the period.');
    }
    if (weights.length >= 2) {
      const delta = weights[weights.length - 1].weight - weights[0].weight;
      if (Math.abs(delta) >= 2) {
        highlights.push(`Weight changed by ${delta.toFixed(1)} lbs.`);
      }
    }
    return highlights;
  }

  #calcNutrition(log) {
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
  }
}

module.exports = new FoodReportService();
