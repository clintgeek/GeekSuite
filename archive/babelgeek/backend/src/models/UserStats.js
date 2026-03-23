import mongoose from "mongoose";

const UserStatsSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // XP & Levels
    totalXp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },

    // Streaks
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastActivityDate: Date,
    streakFreezeAvailable: { type: Boolean, default: false },

    // Language-specific stats
    languageStats: [{
      languageCode: String,
      totalXp: { type: Number, default: 0 },
      lessonsCompleted: { type: Number, default: 0 },
      vocabularyLearned: { type: Number, default: 0 },
      conversationsHeld: { type: Number, default: 0 },
      currentLevel: { type: String, default: "A1" },
      startedAt: Date,
      lastPracticedAt: Date
    }],

    // Achievements
    achievements: [{
      achievementId: String,
      unlockedAt: Date
    }],

    // Activity tracking
    totalLessonsCompleted: { type: Number, default: 0 },
    totalTimeSpentMinutes: { type: Number, default: 0 },
    totalConversations: { type: Number, default: 0 },

    // Preferences
    preferredLanguage: String,
    dailyGoalXp: { type: Number, default: 50 }
  },
  { timestamps: true }
);

// Calculate level from XP (example: 100 XP per level, increasing)
UserStatsSchema.methods.calculateLevel = function() {
  // XP thresholds: Level 1 = 0, Level 2 = 100, Level 3 = 250, Level 4 = 500, etc.
  const thresholds = [0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000];
  let level = 1;

  for (let i = 1; i < thresholds.length; i++) {
    if (this.totalXp >= thresholds[i]) {
      level = i + 1;
    } else {
      break;
    }
  }

  this.level = level;
  return level;
};

// Update streak
UserStatsSchema.methods.updateStreak = function() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!this.lastActivityDate) {
    this.currentStreak = 1;
    this.lastActivityDate = today;
    return;
  }

  const lastActivity = new Date(this.lastActivityDate);
  const lastActivityDay = new Date(lastActivity.getFullYear(), lastActivity.getMonth(), lastActivity.getDate());
  const diffDays = Math.floor((today - lastActivityDay) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Same day, no change
    return;
  } else if (diffDays === 1) {
    // Consecutive day
    this.currentStreak += 1;
    this.longestStreak = Math.max(this.longestStreak, this.currentStreak);
  } else if (diffDays === 2 && this.streakFreezeAvailable) {
    // Use streak freeze
    this.streakFreezeAvailable = false;
  } else {
    // Streak broken
    this.currentStreak = 1;
  }

  this.lastActivityDate = today;
};

export default mongoose.model("UserStats", UserStatsSchema);
