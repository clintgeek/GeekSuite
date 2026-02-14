const mongoose = require('mongoose');

const loginStreakSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    index: true
  },
  current_streak: {
    type: Number,
    default: 0
  },
  longest_streak: {
    type: Number,
    default: 0
  },
  last_login_date: {
    type: Date,
    default: null
  },
  streak_start_date: {
    type: Date,
    default: null
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
loginStreakSchema.index({ user_id: 1 });

// Static method to get or create login streak for user
loginStreakSchema.statics.getOrCreateStreak = async function(userId) {
  let streak = await this.findOne({ user_id: userId });

  if (!streak) {
    streak = new this({
      user_id: userId,
      current_streak: 0,
      longest_streak: 0,
      last_login_date: null,
      streak_start_date: null
    });
    await streak.save();
  }

  return streak;
};

// Method to record a login and update streak
loginStreakSchema.methods.recordLogin = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of day

  const lastLogin = this.last_login_date ? new Date(this.last_login_date) : null;
  if (lastLogin) {
    lastLogin.setHours(0, 0, 0, 0); // Start of day
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Check if this is a consecutive day
  if (!lastLogin || lastLogin.getTime() === yesterday.getTime()) {
    // Consecutive day - increment streak
    this.current_streak += 1;

    // Update longest streak if current is longer
    if (this.current_streak > this.longest_streak) {
      this.longest_streak = this.current_streak;
    }

    // Set streak start date if this is the first day
    if (this.current_streak === 1) {
      this.streak_start_date = today;
    }
  } else if (lastLogin && lastLogin.getTime() !== today.getTime()) {
    // Not consecutive - reset streak
    this.current_streak = 1;
    this.streak_start_date = today;
  }

  this.last_login_date = today;
  this.updated_at = new Date();

  return await this.save();
};

module.exports = mongoose.model('LoginStreak', loginStreakSchema);