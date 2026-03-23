import mongoose from "mongoose";

const UserProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    lessonSlug: {
      type: String,
      required: true,
      index: true
    },
    languageCode: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed"],
      default: "not_started"
    },
    startedAt: Date,
    completedAt: Date,

    // Performance metrics
    score: { type: Number, min: 0, max: 100 },
    xpEarned: { type: Number, default: 0 },
    timeSpentSeconds: { type: Number, default: 0 },

    // Step progress
    currentStepIndex: { type: Number, default: 0 },
    stepsCompleted: [String], // step IDs

    // Mistakes for review
    mistakes: [{
      stepId: String,
      attemptedAt: Date,
      userAnswer: String,
      correctAnswer: String
    }]
  },
  { timestamps: true }
);

// Compound index for user's lesson progress
UserProgressSchema.index({ userId: 1, lessonSlug: 1 }, { unique: true });
UserProgressSchema.index({ userId: 1, languageCode: 1, status: 1 });

export default mongoose.model("UserProgress", UserProgressSchema);
