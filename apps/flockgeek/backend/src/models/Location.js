import mongoose from "mongoose";

const LocationSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },

    // Infrastructure type
    type: {
      type: String,
      enum: ["tractor", "coop", "breeding_pen", "brooder", "other"],
      required: true
    },

    // Capacity & maintenance
    capacity: { type: Number },
    cleaningIntervalDays: { type: Number },
    lastCleanedAt: { type: Date },

    // Status
    isActive: { type: Boolean, default: true },

    // Notes
    notes: { type: String },

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
LocationSchema.index({ ownerId: 1, type: 1 });
LocationSchema.index({ ownerId: 1, name: 1 });
LocationSchema.index({ ownerId: 1, isActive: 1 });

export default mongoose.model("Location", LocationSchema);
