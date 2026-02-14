const mongoose = require('mongoose');

const foodItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  brand: {
    type: String,
    trim: true,
    index: true
  },
  barcode: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  nutrition: {
    calories_per_serving: {
      type: Number,
      required: true,
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
  serving: {
    size: {
      type: Number,
      required: true,
      min: 0.1
    },
    unit: {
      type: String,
      required: true,
      default: 'g'
    }
  },
  source: {
    type: String,
    required: true,
    enum: ['nutritionix', 'usda', 'openfoodfacts', 'custom', 'ai', 'fatsecret'],
    index: true
  },
  source_id: {
    type: String,
    index: true
  },
  user_id: {
    type: String,
    index: true
  },
  is_deleted: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Compound indexes for better query performance
foodItemSchema.index({ name: 1, brand: 1 });
foodItemSchema.index({ source: 1, source_id: 1 });
foodItemSchema.index({ is_deleted: 1, user_id: 1 });
foodItemSchema.index({ barcode: 1, is_deleted: 1 });  // For barcode lookups in findOrCreate

// Text search index
foodItemSchema.index({ name: 'text', brand: 'text' });

// Virtual for total calories calculation
foodItemSchema.virtual('totalCalories').get(function() {
  return this.nutrition.calories_per_serving;
});

// Method to check if food is global (not user-specific)
foodItemSchema.methods.isGlobal = function() {
  return !this.user_id;
};

// Static method to find or create food item
foodItemSchema.statics.findOrCreate = async function(foodData, userId = null) {
  // Try to find existing food by barcode first
  if (foodData.barcode) {
    const existing = await this.findOne({
      barcode: foodData.barcode,
      is_deleted: false
    });
    if (existing) return existing;
  }

  // Try to find by source and source_id
  if (foodData.source && foodData.source_id) {
    const existing = await this.findOne({
      source: foodData.source,
      source_id: foodData.source_id,
      is_deleted: false
    });
    if (existing) return existing;
  }

  // Try to find by name and brand (for custom foods)
  if (foodData.name && foodData.brand) {
    const existing = await this.findOne({
      name: foodData.name,
      brand: foodData.brand,
      is_deleted: false
    });
    if (existing) return existing;
  }

  // Create new food item
  const foodItem = new this({
    name: foodData.name,
    brand: foodData.brand,
    barcode: foodData.barcode,
    nutrition: {
      calories_per_serving: foodData.nutrition?.calories_per_serving || 0,
      protein_grams: foodData.nutrition?.protein_grams || 0,
      carbs_grams: foodData.nutrition?.carbs_grams || 0,
      fat_grams: foodData.nutrition?.fat_grams || 0,
      fiber_grams: foodData.nutrition?.fiber_grams || 0,
      sugar_grams: foodData.nutrition?.sugar_grams || 0,
      sodium_mg: foodData.nutrition?.sodium_mg || 0
    },
    serving: {
      size: foodData.serving?.size || 100,
      unit: foodData.serving?.unit || 'g'
    },
    source: foodData.source || 'custom',
    source_id: foodData.source_id,
    user_id: null
  });

  return await foodItem.save();
};

// Static method to search foods
foodItemSchema.statics.search = async function(query, userId = null, limit = 25) {
  const filter = { is_deleted: false };

  // Include global foods and user's custom foods
  const userFilter = {
    $or: [
      { user_id: null }, // Global foods
      { user_id: userId } // User's custom foods
    ]
  };

  if (query) {
    // Simple regex search instead of text search
    const searchRegex = new RegExp(query, 'i');
    filter.$and = [
      userFilter,
      {
        $or: [
          { name: searchRegex },
          { brand: searchRegex }
        ]
      }
    ];
  } else {
    // No search query, just get all foods for user
    filter.$or = userFilter.$or;
  }

  return await this.find(filter)
    .sort({ name: 1 })
    .limit(limit);
};

module.exports = mongoose.model('FoodItem', foodItemSchema);