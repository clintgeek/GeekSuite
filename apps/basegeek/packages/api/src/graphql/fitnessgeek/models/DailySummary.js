import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const fitnessConn = getAppConnection('fitnessgeek');

const dailySummarySchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  totals: {
    calories: {
      type: Number,
      default: 0,
      min: 0
    },
    protein_grams: {
      type: Number,
      default: 0,
      min: 0
    },
    carbs_grams: {
      type: Number,
      default: 0,
      min: 0
    },
    fat_grams: {
      type: Number,
      default: 0,
      min: 0
    },
    fiber_grams: {
      type: Number,
      default: 0,
      min: 0
    },
    sugar_grams: {
      type: Number,
      default: 0,
      min: 0
    },
    sodium_mg: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  meals: {
    breakfast: {
      calories: { type: Number, default: 0, min: 0 },
      protein_grams: { type: Number, default: 0, min: 0 },
      carbs_grams: { type: Number, default: 0, min: 0 },
      fat_grams: { type: Number, default: 0, min: 0 }
    },
    lunch: {
      calories: { type: Number, default: 0, min: 0 },
      protein_grams: { type: Number, default: 0, min: 0 },
      carbs_grams: { type: Number, default: 0, min: 0 },
      fat_grams: { type: Number, default: 0, min: 0 }
    },
    dinner: {
      calories: { type: Number, default: 0, min: 0 },
      protein_grams: { type: Number, default: 0, min: 0 },
      carbs_grams: { type: Number, default: 0, min: 0 },
      fat_grams: { type: Number, default: 0, min: 0 }
    },
    snack: {
      calories: { type: Number, default: 0, min: 0 },
      protein_grams: { type: Number, default: 0, min: 0 },
      carbs_grams: { type: Number, default: 0, min: 0 },
      fat_grams: { type: Number, default: 0, min: 0 }
    }
  },
  goals_met: {
    calories: { type: Boolean, default: false },
    protein: { type: Boolean, default: false },
    carbs: { type: Boolean, default: false },
    fat: { type: Boolean, default: false }
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Compound index for user and date
dailySummarySchema.index({ user_id: 1, date: 1 }, { unique: true });

// Normalize a provided date (string YYYY-MM-DD or Date) to a UTC date at midnight.
// This mirrors the behavior used when storing and querying FoodLog entries so that
// dev (local) and prod (UTC) yield the same calendar day.
function toUtcDate(input) {
  if (typeof input === 'string') {
    const [y, m, d] = input.split('-').map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  }
  const date = new Date(input);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Static method to get or create daily summary
dailySummarySchema.statics.getOrCreate = async function(userId, date) {
  const startDate = toUtcDate(date);
  startDate.setUTCHours(0, 0, 0, 0);

  let summary = await this.findOne({
    user_id: userId,
    date: startDate
  });

  if (!summary) {
    summary = new this({
      user_id: userId,
      date: startDate
    });
    await summary.save();
  }

  return summary;
};

// Static method to update daily summary from food logs
dailySummarySchema.statics.updateFromLogs = async function(userId, date) {
  const FoodLog = fitnessConn.model('FoodLog');

  const startDate = toUtcDate(date);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = toUtcDate(date);
  endDate.setUTCHours(23, 59, 59, 999);

  // Get all logs for the date
  const logs = await FoodLog.find({
    user_id: userId,
    log_date: { $gte: startDate, $lte: endDate }
  }).populate('food_item_id');

  // Calculate totals
  const totals = {
    calories: 0,
    protein_grams: 0,
    carbs_grams: 0,
    fat_grams: 0,
    fiber_grams: 0,
    sugar_grams: 0,
    sodium_mg: 0
  };

  const meals = {
    breakfast: { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 },
    lunch: { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 },
    dinner: { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 },
    snack: { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 }
  };

  logs.forEach(log => {
    const food = log.food_item_id;
    const multiplier = log.servings || 1;

    // Skip if food or nutrition is missing
    if (!food || !food.nutrition) {
      return;
    }

    const n = food.nutrition;

    // Add to totals (with null safety)
    totals.calories += ((n.calories_per_serving || 0) * multiplier);
    totals.protein_grams += ((n.protein_grams || 0) * multiplier);
    totals.carbs_grams += ((n.carbs_grams || 0) * multiplier);
    totals.fat_grams += ((n.fat_grams || 0) * multiplier);
    totals.fiber_grams += ((n.fiber_grams || 0) * multiplier);
    totals.sugar_grams += ((n.sugar_grams || 0) * multiplier);
    totals.sodium_mg += ((n.sodium_mg || 0) * multiplier);

    // Add to meal breakdown
    if (meals[log.meal_type]) {
      meals[log.meal_type].calories += ((n.calories_per_serving || 0) * multiplier);
      meals[log.meal_type].protein_grams += ((n.protein_grams || 0) * multiplier);
      meals[log.meal_type].carbs_grams += ((n.carbs_grams || 0) * multiplier);
      meals[log.meal_type].fat_grams += ((n.fat_grams || 0) * multiplier);
    }
  });

  // Get user's goals
  const UserSettings = fitnessConn.model('UserSettings');
  const userSettings = await UserSettings.findOne({ user_id: userId });
  const goals = userSettings?.nutrition_goal || null;

  // Check if goals are met
  const goals_met = {
    calories: goals && goals.daily_calorie_target ? totals.calories >= goals.daily_calorie_target : false,
    protein: goals && goals.protein_grams ? totals.protein_grams >= goals.protein_grams : false,
    carbs: goals && goals.carbs_grams ? totals.carbs_grams >= goals.carbs_grams : false,
    fat: goals && goals.fat_grams ? totals.fat_grams >= goals.fat_grams : false
  };

  // Update or create daily summary
  const summary = await this.findOneAndUpdate(
    { user_id: userId, date: startDate },
    {
      totals,
      meals,
      goals_met,
      updated_at: new Date()
    },
    { upsert: true, new: true }
  );

  return summary;
};

// Static method to get summary for date range
dailySummarySchema.statics.getSummaryRange = async function(userId, startDate, endDate) {
  const start = toUtcDate(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const end = toUtcDate(endDate);
  end.setUTCHours(23, 59, 59, 999);

  return await this.find({
    user_id: userId,
    date: { $gte: start, $lte: end }
  }).sort({ date: 1 });
};

export default fitnessConn.model('DailySummary', dailySummarySchema);