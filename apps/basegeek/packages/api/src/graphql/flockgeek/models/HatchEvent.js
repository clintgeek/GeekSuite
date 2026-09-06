import mongoose from "mongoose";
import { getAppConnection } from '../../shared/appConnections.js';

const flockConn = getAppConnection('flockgeek');

const HatchEventSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },

    // Source pairing (breeding group that produced the eggs).
    //
    // NOT required. `recordHatchEvent` has never accepted a pairingId — not in
    // typeDefs, not in validation.js, and the Add dialog has no pairing
    // selector — so `new HatchEvent({...args, ownerId}).save()` failed the
    // required-path validator on EVERY create and no hatch event could be
    // logged through the gateway at all. The mutation now takes an optional
    // `pairingId` (ownership-checked when present), and a hatch event without
    // one is a legitimate record: eggs set from a mixed flock have no pairing
    // to name. flockgeek's own REST copy
    // (apps/flockgeek/backend/src/models/HatchEvent.js) still says
    // `required: true` — reported for that tree, since a divergence in a
    // *validator* (unlike a schema path) cannot silently drop data.
    pairingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pairing",
      default: null
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

export default flockConn.model("HatchEvent", HatchEventSchema);
