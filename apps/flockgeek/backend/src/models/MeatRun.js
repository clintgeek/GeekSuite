import mongoose from "mongoose";

/**
 * MeatRun tracks a batch of meat birds from hatch to harvest
 * No individual bird records are created - just aggregate stats
 */
const MeatRunSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },

    // Source tracking
    pairingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pairing",
      required: true
    },
    hatchEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HatchEvent",
      default: null
    },

    // Run identification
    name: { type: String }, // e.g., "Meat Run Spring 2026"

    // Timeline
    startDate: { type: Date, required: true }, // When birds were placed/hatched
    harvestDate: { type: Date },

    // Bird counts
    startCount: { type: Number, required: true }, // Birds at start
    harvestCount: { type: Number }, // Birds harvested (after mortality)

    // Mortality tracking
    mortalityCount: { type: Number, default: 0 },
    mortalityNotes: { type: String },

    // Harvest results
    avgWeightGrams: { type: Number }, // Average dressed weight
    totalWeightGrams: { type: Number }, // Total harvest weight

    // Quality assessment (1-10 scale)
    avgQualityScore: { type: Number },
    qualityNotes: { type: String },

    // Cost tracking (optional)
    feedCostCents: { type: Number },
    otherCostsCents: { type: Number },

    // Status
    status: {
      type: String,
      enum: ["growing", "harvested", "cancelled"],
      default: "growing"
    },

    // Notes
    notes: { type: String },

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
MeatRunSchema.index({ ownerId: 1, pairingId: 1 });
MeatRunSchema.index({ ownerId: 1, startDate: -1 });
MeatRunSchema.index({ ownerId: 1, status: 1 });

export default mongoose.model("MeatRun", MeatRunSchema);
