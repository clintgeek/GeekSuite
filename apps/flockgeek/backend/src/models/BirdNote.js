import mongoose from "mongoose";

const BirdNoteSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    birdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bird",
      required: true,
      index: true
    },
    loggedAt: { type: Date, required: true, default: Date.now },

    // Content
    content: { type: String, required: true },
    category: { type: String }, // e.g., "behavior", "medical", "breeding", "general"

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
BirdNoteSchema.index({ ownerId: 1, birdId: 1, loggedAt: -1 });

export default mongoose.model("BirdNote", BirdNoteSchema);
