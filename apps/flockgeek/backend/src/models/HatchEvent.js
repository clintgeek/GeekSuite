import mongoose from "mongoose";

const HatchEventSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },

    // Source pairing (breeding group that produced the eggs)
    pairingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pairing",
      required: true
    },

    // Purpose determines how chicks are tracked
    purpose: {
      type: String,
      enum: ["layer", "meat"],
      default: "layer"
    },

    // The brood (Group) created from this hatch - for layer flocks only
    broodGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null
    },

    // The meat run created from this hatch - for meat birds only
    meatRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MeatRun",
      default: null
    },

    // Incubation timeline
    setDate: { type: Date, required: true },
    hatchDate: { type: Date },

    // Egg & fertility data
    eggsSet: { type: Number },
    eggsFertile: { type: Number },
    chicksHatched: { type: Number },

    // Chick demographics
    pullets: { type: Number },
    cockerels: { type: Number },
    mortalityByDay: [
      {
        day: { type: Number },
        count: { type: Number }
      }
    ],

    // Notes
    notes: { type: String },

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
HatchEventSchema.index({ ownerId: 1, setDate: -1 });
HatchEventSchema.index({ ownerId: 1, pairingId: 1, setDate: -1 });

export default mongoose.model("HatchEvent", HatchEventSchema);
