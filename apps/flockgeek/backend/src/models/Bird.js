import mongoose from "mongoose";

const BirdSchema = new mongoose.Schema(
  {
    // Multi-tenant filtering
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String },
    farmId: { type: String },

    // Bird identification
    name: { type: String },
    tagId: { type: String, required: true },
    species: { type: String, default: "chicken" },
    breed: { type: String },
    strain: { type: String },
    cross: { type: Boolean, default: false },

    // Demographics
    sex: {
      type: String,
      enum: ["pullet", "hen", "cockerel", "rooster", "unknown"],
      default: "unknown"
    },
    hatchDate: { type: Date },
    origin: {
      type: String,
      enum: ["own_egg", "purchased", "traded", "rescued", "unknown"],
      default: "unknown"
    },
    foundationStock: { type: Boolean, default: false },

    // Lineage - tracked via pairing (breeding group) rather than individual sire/dam
    // All roosters/hens in the pairing are considered potential parents
    pairingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pairing",
      default: null
    },

    // Location & Group
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null
    },

    // Assessment
    temperamentScore: { type: Number }, // 1-10 scale, higher = calmer/friendlier

    // Weight tracking (most recent measurement)
    weightGrams: { type: Number },
    weightDate: { type: Date },

    // Health assessment
    healthScore: { type: Number }, // 1-10 scale, higher = healthier

    // Status tracking
    status: {
      type: String,
      enum: ["active", "meat run", "retired"],
      default: "active"
    },
    statusDate: { type: Date },
    statusReason: { type: String },

    // Notes
    notes: { type: String },

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes for common queries
BirdSchema.index({ ownerId: 1, tagId: 1 }, { unique: true });
BirdSchema.index({ ownerId: 1, name: 1 });
BirdSchema.index({ ownerId: 1, pairingId: 1 });
BirdSchema.index({ ownerId: 1, status: 1 });
BirdSchema.index({ ownerId: 1, sex: 1 });
BirdSchema.index({ ownerId: 1, breed: 1 });

export default mongoose.model("Bird", BirdSchema);
