import mongoose from "mongoose";

const LineageCacheSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    birdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bird",
      required: true,
      index: true
    },

    // Cached ancestry (bounded to ~5 generations)
    ancestors: [
      {
        ancestorId: { type: mongoose.Schema.Types.ObjectId, ref: "Bird" },
        depth: { type: Number } // 1 = parent, 2 = grandparent, etc.
      }
    ],

    // Inbreeding coefficient (optional, computed)
    coefficientOfRelationship: { type: Number },

    // Last update time
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

// Indexes
LineageCacheSchema.index({ ownerId: 1, birdId: 1 });

export default mongoose.model("LineageCache", LineageCacheSchema);
