const mongoose = require('mongoose');

const ExerciseProgressSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    metricName: String,
    metricValue: Number,
    notes: String,
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const UserProgressSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true, comment: 'BaseGeek user ID' },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },

    status: {
      isCompleted: { type: Boolean, default: false },
      completedAt: Date,
      startedAt: { type: Date, default: Date.now },
      currentStep: { type: Number, default: 1 },
    },

    stats: {
      score: { type: Number, default: 0 },
      xpGained: { type: Number, default: 0 },
    },

    exercises: [ExerciseProgressSchema],
  },
  { timestamps: true }
);

// Compound index for unique progress per user/lesson
UserProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });

module.exports = mongoose.model('UserProgress', UserProgressSchema);
