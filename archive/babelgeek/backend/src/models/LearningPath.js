import mongoose from "mongoose";

const UnitSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    subtitle: String,
    lessons: [{ type: String }] // lesson slugs
  },
  { _id: false }
);

const LearningPathSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true
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
    template: {
      type: String,
      default: "linear_units_v1"
    },
    isDefault: { type: Boolean, default: false },

    title: { type: String, required: true },
    subtitle: String,

    meta: {
      description: String,
      estimatedHours: Number,
      lessonsCount: Number,
      imageUrl: String
    },

    content: {
      units: [UnitSchema]
    }
  },
  { timestamps: true }
);

// Compound index for finding paths
LearningPathSchema.index({ languageCode: 1, level: 1 });

export default mongoose.model("LearningPath", LearningPathSchema);
