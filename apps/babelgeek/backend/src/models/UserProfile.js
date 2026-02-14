import mongoose from "mongoose";

/**
 * UserProfile model - stores BabelGeek-specific user data
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
      comment: "baseGeek user ID from JWT token",
    },

    // Display information (cached from baseGeek for convenience)
    email: { type: String },
    displayName: { type: String },
    name: { type: String },
    bio: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },

    // Language Learning Progress
    languages: [{
      languageCode: { type: String, required: true },
      level: { type: String, default: "A1" },
      isActive: { type: Boolean, default: false },
      startedAt: { type: Date, default: Date.now },
      lastStudiedAt: { type: Date },
    }],

    // Active language
    activeLanguage: { type: String, default: "es" },

    // Gamification & Stats
    gamification: {
      totalXp: { type: Number, default: 0 },
      level: { type: Number, default: 1 },
      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      lastStudyDate: { type: Date },
    },

    // Settings
    preferences: {
      voiceSpeed: { type: Number, default: 1.0 },
      autoPlayAudio: { type: Boolean, default: true },
      showTranslations: { type: Boolean, default: true },
      dailyGoalMinutes: { type: Number, default: 15 },
    },
  },
  { timestamps: true }
);

// Create index for faster lookups by userId
UserProfileSchema.index({ userId: 1 });

export default mongoose.model("UserProfile", UserProfileSchema);
