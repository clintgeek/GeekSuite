import mongoose from "mongoose";

// Spaced Repetition System for vocabulary
const UserVocabularySchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    vocabularyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vocabulary",
      required: true
    },
    word: { type: String, required: true }, // denormalized for quick access
    languageCode: { type: String, required: true },

    // SRS fields (SM-2 algorithm inspired)
    strength: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    }, // 0 = new, 5 = mastered
    easeFactor: {
      type: Number,
      default: 2.5,
      min: 1.3
    },
    interval: {
      type: Number,
      default: 1
    }, // days until next review
    repetitions: {
      type: Number,
      default: 0
    },

    // Scheduling
    nextReviewAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    lastReviewedAt: Date,

    // Stats
    correctCount: { type: Number, default: 0 },
    incorrectCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Compound index for user vocabulary queries
UserVocabularySchema.index({ userId: 1, vocabularyId: 1 }, { unique: true });
UserVocabularySchema.index({ userId: 1, languageCode: 1, nextReviewAt: 1 });

// SM-2 algorithm for calculating next review
UserVocabularySchema.methods.calculateNextReview = function(quality) {
  // quality: 0-5 (0 = complete failure, 5 = perfect response)

  if (quality < 3) {
    // Failed - reset
    this.repetitions = 0;
    this.interval = 1;
  } else {
    // Passed
    if (this.repetitions === 0) {
      this.interval = 1;
    } else if (this.repetitions === 1) {
      this.interval = 6;
    } else {
      this.interval = Math.round(this.interval * this.easeFactor);
    }
    this.repetitions += 1;
  }

  // Update ease factor
  this.easeFactor = Math.max(
    1.3,
    this.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  // Update strength (0-5 scale)
  this.strength = Math.min(5, Math.max(0, Math.floor(this.repetitions / 2)));

  // Set next review date
  const now = new Date();
  this.nextReviewAt = new Date(now.getTime() + this.interval * 24 * 60 * 60 * 1000);
  this.lastReviewedAt = now;

  // Update stats
  if (quality >= 3) {
    this.correctCount += 1;
  } else {
    this.incorrectCount += 1;
  }

  return this;
};

export default mongoose.model("UserVocabulary", UserVocabularySchema);
