const mongoose = require('mongoose');

const foodLogSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    index: true
  },
  log_date: {
    type: Date,
    required: true,
    index: true
  },
  meal_type: {
    type: String,
    required: true,
    enum: ['breakfast', 'lunch', 'dinner', 'snack'],
    index: true
  },
  food_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FoodItem',
    required: true,
    index: true
  },
  servings: {
    type: Number,
    required: true,
    min: 0.1,
    max: 100
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  // Store nutrition information at the time of logging (in case food item changes later)
  nutrition: {
    calories_per_serving: {
      type: Number,
      default: 0
    },
    protein_grams: {
      type: Number,
      default: 0
    },
    carbs_grams: {
      type: Number,
      default: 0
    },
    fat_grams: {
      type: Number,
      default: 0
    },
    fiber_grams: {
      type: Number,
      default: 0
    },
    sugar_grams: {
      type: Number,
      default: 0
    },
    sodium_mg: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updatedAt'
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for better query performance
foodLogSchema.index({ user_id: 1, log_date: 1 });
foodLogSchema.index({ user_id: 1, meal_type: 1 });
foodLogSchema.index({ user_id: 1, food_item_id: 1 });

// Virtual for calculated nutrition values
foodLogSchema.virtual('calculatedNutrition').get(function() {
  const multiplier = this.servings;

  // Use stored nutrition data if available, otherwise use food item nutrition
  const nutrition = this.nutrition || {};
  const food = this.populated('food_item_id') ? this.food_item_id : null;

  return {
    calories: (nutrition.calories_per_serving || (food?.nutrition?.calories_per_serving || 0)) * multiplier,
    protein_grams: (nutrition.protein_grams || (food?.nutrition?.protein_grams || 0)) * multiplier,
    carbs_grams: (nutrition.carbs_grams || (food?.nutrition?.carbs_grams || 0)) * multiplier,
    fat_grams: (nutrition.fat_grams || (food?.nutrition?.fat_grams || 0)) * multiplier,
    fiber_grams: (nutrition.fiber_grams || (food?.nutrition?.fiber_grams || 0)) * multiplier,
    sugar_grams: (nutrition.sugar_grams || (food?.nutrition?.sugar_grams || 0)) * multiplier,
    sodium_mg: (nutrition.sodium_mg || (food?.nutrition?.sodium_mg || 0)) * multiplier
  };
});

// Helper: parse YYYY-MM-DD as a UTC date (timezone-agnostic across servers)
function toUtcDate(date) {
  if (typeof date === 'string') {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  }
  // If a Date was provided, normalize to same Y-M-D at UTC midnight
  if (date instanceof Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  return new Date(date);
}

// Static method to get logs for a specific date
foodLogSchema.statics.getLogsForDate = async function(userId, date) {
  const startDate = toUtcDate(date);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = toUtcDate(date);
  endDate.setUTCHours(23, 59, 59, 999);

  return await this.find({
    user_id: userId,
    log_date: { $gte: startDate, $lte: endDate }
  })
  .populate('food_item_id')
  .sort({ created_at: -1 });
};

// Static method to get logs for a date range
foodLogSchema.statics.getLogsForDateRange = async function(userId, startDate, endDate) {
  const start = toUtcDate(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const end = toUtcDate(endDate);
  end.setUTCHours(23, 59, 59, 999);

  return await this.find({
    user_id: userId,
    log_date: { $gte: start, $lte: end }
  })
  .populate('food_item_id')
  .sort({ log_date: -1, created_at: -1 });
};

// Static method to get recent logs
foodLogSchema.statics.getRecentLogs = async function(userId, limit = 10) {
  return await this.find({ user_id: userId })
    .populate('food_item_id')
    .sort({ created_at: -1 })
    .limit(limit);
};

// Static method to get logs by meal type
foodLogSchema.statics.getLogsByMealType = async function(userId, mealType, date) {
  const startDate = toUtcDate(date);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = toUtcDate(date);
  endDate.setUTCHours(23, 59, 59, 999);

  return await this.find({
    user_id: userId,
    meal_type: mealType,
    log_date: { $gte: startDate, $lte: endDate }
  })
  .populate('food_item_id')
  .sort({ created_at: -1 });
};

module.exports = mongoose.model('FoodLog', foodLogSchema);