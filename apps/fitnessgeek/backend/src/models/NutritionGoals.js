const mongoose = require('mongoose');

const nutritionGoalsSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    index: true
  },
  calories: {
    type: Number,
    min: 0,
    max: 10000
  },
  protein_grams: {
    type: Number,
    min: 0,
    max: 1000
  },
  carbs_grams: {
    type: Number,
    min: 0,
    max: 2000
  },
  fat_grams: {
    type: Number,
    min: 0,
    max: 500
  },
  fiber_grams: {
    type: Number,
    min: 0,
    max: 200
  },
  sugar_grams: {
    type: Number,
    min: 0,
    max: 500
  },
  sodium_mg: {
    type: Number,
    min: 0,
    max: 10000
  },
  start_date: {
    type: Date,
    default: Date.now
  },
  end_date: {
    type: Date
  },
  is_active: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Compound index for user and active status
nutritionGoalsSchema.index({ user_id: 1, is_active: 1 });

// Static method to get active goals for user
nutritionGoalsSchema.statics.getActiveGoals = async function(userId) {
  return await this.findOne({
    user_id: userId,
    is_active: true
  });
};

// Static method to create new goals (deactivates old ones)
nutritionGoalsSchema.statics.createGoals = async function(userId, goalsData) {
  // Deactivate existing goals
  await this.updateMany(
    { user_id: userId, is_active: true },
    { is_active: false }
  );

  // Create new goals
  const goals = new this({
    user_id: userId,
    ...goalsData
  });

  return await goals.save();
};

// Static method to update existing goals
nutritionGoalsSchema.statics.updateGoals = async function(userId, goalsData) {
  const existingGoals = await this.findOne({
    user_id: userId,
    is_active: true
  });

  if (!existingGoals) {
    throw new Error('No active goals found for user');
  }

  Object.assign(existingGoals, goalsData);
  return await existingGoals.save();
};

// Method to check if goals are met
nutritionGoalsSchema.methods.checkGoalsMet = function(actualTotals) {
  return {
    calories: this.calories ? actualTotals.calories >= this.calories : false,
    protein: this.protein_grams ? actualTotals.protein_grams >= this.protein_grams : false,
    carbs: this.carbs_grams ? actualTotals.carbs_grams >= this.carbs_grams : false,
    fat: this.fat_grams ? actualTotals.fat_grams >= this.fat_grams : false,
    fiber: this.fiber_grams ? actualTotals.fiber_grams >= this.fiber_grams : false,
    sugar: this.sugar_grams ? actualTotals.sugar_grams <= this.sugar_grams : false, // Sugar is a limit
    sodium: this.sodium_mg ? actualTotals.sodium_mg <= this.sodium_mg : false // Sodium is a limit
  };
};

// Method to get progress percentages
nutritionGoalsSchema.methods.getProgress = function(actualTotals) {
  return {
    calories: this.calories ? Math.min((actualTotals.calories / this.calories) * 100, 100) : 0,
    protein: this.protein_grams ? Math.min((actualTotals.protein_grams / this.protein_grams) * 100, 100) : 0,
    carbs: this.carbs_grams ? Math.min((actualTotals.carbs_grams / this.carbs_grams) * 100, 100) : 0,
    fat: this.fat_grams ? Math.min((actualTotals.fat_grams / this.fat_grams) * 100, 100) : 0,
    fiber: this.fiber_grams ? Math.min((actualTotals.fiber_grams / this.fiber_grams) * 100, 100) : 0,
    sugar: this.sugar_grams ? Math.min((actualTotals.sugar_grams / this.sugar_grams) * 100, 100) : 0,
    sodium: this.sodium_mg ? Math.min((actualTotals.sodium_mg / this.sodium_mg) * 100, 100) : 0
  };
};

module.exports = mongoose.model('NutritionGoals', nutritionGoalsSchema);