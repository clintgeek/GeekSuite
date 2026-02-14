import mongoose from "mongoose";

const LessonStepSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: [
        "text",
        "text+image",
        "text+audio",
        "listen_repeat",
        "matching",
        "multiple_choice",
        "fill_blank",
        "type_answer",
        "checkpoint",
        "celebration"
      ]
    },
    title: { type: String, required: true },
    body: String,

    // Media
    imageUrl: String,
    audioUrl: String,
    phonetic: String,

    // Listen & Repeat
    phrase: String,
    translation: String,

    // Matching
    pairs: [{
      left: String,
      right: String
    }],

    // Multiple Choice
    question: String,
    options: [String],
    correctIndex: Number,

    // Fill Blank
    sentence: String,
    blanks: [String],
    hint: String,

    // Type Answer
    correctAnswer: String
  },
  { _id: false }
);

const LessonContentSchema = new mongoose.Schema(
  {
    learningOutcomes: [String],
    vocabulary: [String],
    steps: [LessonStepSchema]
  },
  { _id: false }
);

const LessonSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    template: {
      type: String,
      default: "guided_steps_v1"
    },
    languageCode: {
      type: String,
      required: true,
      lowercase: true,
      index: true
    },
    level: {
      type: String,
      required: true,
      enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
      index: true
    },
    orderIndex: { type: Number, default: 0 },

    // Meta
    meta: {
      title: { type: String, required: true },
      subtitle: String,
      category: String,
      difficulty: { type: Number, min: 1, max: 5, default: 1 },
      audience: {
        type: String,
        enum: ["kid", "adult", "both"],
        default: "both"
      },
      estimatedTimeMinutes: { type: Number, default: 10 },
      xpReward: { type: Number, default: 50 },
      tags: [String],
      imageUrl: String
    },

    // Content
    content: LessonContentSchema
  },
  { timestamps: true }
);

// Compound indexes for common queries
LessonSchema.index({ languageCode: 1, level: 1, orderIndex: 1 });

export default mongoose.model("Lesson", LessonSchema);
