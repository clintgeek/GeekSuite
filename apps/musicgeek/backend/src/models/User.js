const mongoose = require('mongoose');

const UserInstrumentSchema = new mongoose.Schema(
  {
    instrumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instrument' },
    isActive: { type: Boolean, default: false },
    skillLevel: { type: String, default: 'beginner' },
    totalPracticeTime: { type: Number, default: 0 },
    lessonsCompleted: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserAchievementSchema = new mongoose.Schema(
  {
    achievementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Achievement' },
    earnedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * UserProfile model - stores MusicGeek-specific user data
 * Authentication is handled by baseGeek SSO
 * This model references the baseGeek user ID
 */
const UserProfileSchema = new mongoose.Schema(
  {
    // Reference to baseGeek user (from JWT token)
    userId: {
      type: String,
      required: true,
      unique: true,
      comment: 'baseGeek user ID from JWT token',
    },

    // Display information (cached from baseGeek for convenience)
    email: { type: String },
    displayName: { type: String },
    name: { type: String },
    bio: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },

    // Gamification & Stats
    gamification: {
      totalXp: { type: Number, default: 0 },
      level: { type: Number, default: 1 },
      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      lastPracticeDate: { type: Date },
    },

    // Instrument Progress (Embedded)
    instruments: [UserInstrumentSchema],

    // Settings
    activeInstrumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instrument' },
    preferences: { type: Map, of: String },

    // Achievements (Embedded for fast access)
    achievements: [UserAchievementSchema],
  },
  { timestamps: true }
);

// Create index for faster lookups by userId
UserProfileSchema.index({ userId: 1 });

module.exports = mongoose.model('UserProfile', UserProfileSchema);
