const mongoose = require('mongoose');

const mealItemSchema = new mongoose.Schema({
  food_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FoodItem',
    required: true
  },
  servings: {
    type: Number,
    required: true,
    default: 1
  }
});

const mealSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: false,
    index: true,
    default: null
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  meal_type: {
    type: String,
    enum: ['breakfast', 'lunch', 'dinner', 'snack'],
    required: true
  },
  food_items: [mealItemSchema],
  is_deleted: {
    type: Boolean,
    default: false
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Update the updated_at field before saving
mealSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Get all active meals (global)
mealSchema.statics.getActiveMeals = async function() {
  return this.find({
    is_deleted: false
  }).populate('food_items.food_item_id').sort({ name: 1 });
};

// Get meals by meal type
mealSchema.statics.getMealsByType = async function(mealType) {
  return this.find({
    meal_type: mealType,
    is_deleted: false
  }).populate('food_items.food_item_id').sort({ name: 1 });
};

// Search meals by name (global)
mealSchema.statics.searchMeals = async function(searchTerm) {
  const regex = new RegExp(searchTerm, 'i');
  return this.find({
    name: regex,
    is_deleted: false
  }).populate('food_items.food_item_id').sort({ name: 1 });
};

// Calculate total nutrition for the meal
mealSchema.methods.getNutrition = function() {
  let totals = {
    calories: 0,
    protein_grams: 0,
    carbs_grams: 0,
    fat_grams: 0,
    fiber_grams: 0,
    sugar_grams: 0,
    sodium_mg: 0
  };

  this.food_items.forEach(item => {
    if (item.food_item_id && item.food_item_id.nutrition) {
      const multiplier = item.servings || 1;
      totals.calories += item.food_item_id.nutrition.calories_per_serving * multiplier;
      totals.protein_grams += item.food_item_id.nutrition.protein_grams * multiplier;
      totals.carbs_grams += item.food_item_id.nutrition.carbs_grams * multiplier;
      totals.fat_grams += item.food_item_id.nutrition.fat_grams * multiplier;
      totals.fiber_grams += item.food_item_id.nutrition.fiber_grams * multiplier;
      totals.sugar_grams += item.food_item_id.nutrition.sugar_grams * multiplier;
      totals.sodium_mg += item.food_item_id.nutrition.sodium_mg * multiplier;
    }
  });

  // Round to reasonable precision
  return {
    calories: Math.round(totals.calories),
    protein_grams: Math.round(totals.protein_grams * 10) / 10,
    carbs_grams: Math.round(totals.carbs_grams * 10) / 10,
    fat_grams: Math.round(totals.fat_grams * 10) / 10,
    fiber_grams: Math.round(totals.fiber_grams * 10) / 10,
    sugar_grams: Math.round(totals.sugar_grams * 10) / 10,
    sodium_mg: Math.round(totals.sodium_mg)
  };
};

module.exports = mongoose.model('Meal', mealSchema);