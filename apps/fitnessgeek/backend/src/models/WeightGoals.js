const mongoose = require('mongoose');

const weightGoalsSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    index: true
  },
  startWeight: {
    type: Number,
    required: true,
    min: 0
  },
  targetWeight: {
    type: Number,
    required: true,
    min: 0
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  goalDate: {
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
weightGoalsSchema.index({ user_id: 1, is_active: 1 });

// Static method to get active weight goals for user
weightGoalsSchema.statics.getActiveWeightGoals = async function(userId) {
  return await this.findOne({
    user_id: userId,
    is_active: true
  });
};

// Static method to create new weight goals (deactivates old ones)
weightGoalsSchema.statics.createWeightGoals = async function(userId, goalsData) {
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

// Static method to update existing weight goals
weightGoalsSchema.statics.updateWeightGoals = async function(userId, goalsData) {
  const existingGoals = await this.findOne({
    user_id: userId,
    is_active: true
  });

  if (!existingGoals) {
    throw new Error('No active weight goals found for user');
  }

  Object.assign(existingGoals, goalsData);
  return await existingGoals.save();
};

module.exports = mongoose.model('WeightGoals', weightGoalsSchema);