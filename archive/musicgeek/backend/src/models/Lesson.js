const mongoose = require('mongoose');

const LessonStepSchema = new mongoose.Schema(
  {
    stepNumber: { type: Number, required: true },
    instruction: { type: String, required: true },
    visualAssetUrl: String,
    codeExample: String,

    // Rich Content Fields
    type: { type: String, default: 'basic' }, // 'interactive', 'video', etc.
    media: {
      type: { type: String }, // 'image', 'video', 'audio'
      url: String,
    },
    interactiveContent: mongoose.Schema.Types.Mixed,
    config: mongoose.Schema.Types.Mixed,
  },
  { _id: true }
);

const LessonSchema = new mongoose.Schema(
  {
    slug: { type: String, unique: true, index: true },
    template: { type: String },
    content: { type: mongoose.Schema.Types.Mixed },

    title: { type: String, required: true },
    subtitle: String,
    description: String,
    category: { type: String, required: true },
    difficulty: { type: Number, min: 1, max: 5 },
    estimatedTimeMinutes: Number,
    orderIndex: Number,
    unit: String,
    xpReward: Number,
    learningOutcomes: [String],
    audience: {
      type: String,
      enum: ['kid', 'adult', 'both'],
      default: 'both',
    },

    instrumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instrument' },

    // Content
    contentPath: String, // Legacy support
    imageUrl: String,
    videoUrl: String,
    audioUrl: String,
    tags: [String],
    prerequisites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],

    // Embedded Steps
    steps: [LessonStepSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lesson', LessonSchema);
