import mongoose from "mongoose";

const BirdTraitSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    birdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bird",
      required: true,
      index: true
    },
    loggedAt: { type: Date, required: true, default: Date.now },

    // Physical traits
    weightGrams: { type: Number },
    featherColor: { type: String },
    pattern: { type: String },
    combType: { type: String },
    legColor: { type: String },

    // Notes
    notes: { type: String },

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes for time-series queries
BirdTraitSchema.index({ ownerId: 1, birdId: 1, loggedAt: -1 });

export default mongoose.model("BirdTrait", BirdTraitSchema);
