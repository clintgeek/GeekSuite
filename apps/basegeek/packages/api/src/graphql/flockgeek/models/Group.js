import mongoose from "mongoose";
import { getAppConnection } from '../../shared/appConnections.js';

const flockConn = getAppConnection('flockgeek');

const GroupSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },

    // Groups are broods - cohorts of birds hatched together from a pairing
    // Links back to the breeding pairing and hatch event that created this brood
    pairingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pairing",
      default: null
    },
    hatchEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HatchEvent",
      default: null
    },

    // Timeline
    hatchDate: { type: Date }, // When this brood hatched
    startDate: { type: Date, required: true }, // For backwards compat
    endDate: { type: Date },

    // Group composition (birds added via GroupMembership model)
    // This field is informational; actual membership is tracked separately
    description: { type: String },

    // Notes
    notes: { type: String },

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
GroupSchema.index({ ownerId: 1, name: 1 });
GroupSchema.index({ ownerId: 1, pairingId: 1 });
GroupSchema.index({ ownerId: 1, hatchEventId: 1 });
GroupSchema.index({ ownerId: 1, hatchDate: -1 });
GroupSchema.index({ ownerId: 1, startDate: -1 });

export default flockConn.model("Group", GroupSchema);
