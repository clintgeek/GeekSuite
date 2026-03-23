import mongoose from "mongoose";
import { getAppConnection } from '../../shared/appConnections.js';

const flockConn = getAppConnection('flockgeek');

const EggProductionSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    birdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bird",
      default: null
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null
    },
    date: { type: Date, required: true },

    // Production data
    eggsCount: { type: Number, required: true },
    avgEggWeightGrams: { type: Number },
    eggColor: { type: String },
    eggSize: {
      type: String,
      enum: ["peewee", "small", "medium", "large", "xl", "jumbo", "unknown"],
      default: "unknown"
    },

    // Source & quality
    source: { type: String, default: "manual" }, // manual, automatic, estimate
    quality: { type: String }, // ok, graded, rejected, etc.
    birdIdsSnapshot: [{ type: mongoose.Schema.Types.ObjectId, ref: "Bird" }],
    daysObserved: { type: Number },

    // Notes
    notes: { type: String },

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
EggProductionSchema.index({ ownerId: 1, birdId: 1, date: -1 });
EggProductionSchema.index({ ownerId: 1, groupId: 1, date: -1 });
EggProductionSchema.index({ ownerId: 1, locationId: 1, date: -1 });
EggProductionSchema.index({ ownerId: 1, date: -1 });

export default flockConn.model("EggProduction", EggProductionSchema);
