import mongoose from "mongoose";

const PairingSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },

    // Breeding group members
    roosterIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bird"
      }
    ],
    henIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bird"
      }
    ],
    henGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null
    },

    // Season & timeline
    season: { type: String }, // "2024" or "2024-Q1"
    seasonYear: { type: Number },
    startDate: { type: Date },
    endDate: { type: Date },

    // Breeding goals
    goals: [
      {
        type: String,
        enum: ["bigger_eggs", "better_hatch", "calmer_roos", "color_project", "meat_growth", "other"]
      }
    ],

    // Status
    active: { type: Boolean, default: true },

    // Notes
    notes: { type: String },

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
PairingSchema.index({ ownerId: 1, name: 1 });
PairingSchema.index({ ownerId: 1, active: 1 });
PairingSchema.index({ ownerId: 1, seasonYear: -1 });
PairingSchema.index({ ownerId: 1, season: 1 });

export default mongoose.model("Pairing", PairingSchema);
