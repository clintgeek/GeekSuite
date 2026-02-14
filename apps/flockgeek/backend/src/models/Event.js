import mongoose from "mongoose";

const EventSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    type: { type: String, required: true }, // e.g., "bird_created", "hatch", "death", "moved", etc.
    entityType: { type: String }, // e.g., "bird", "hatch_event", "group"
    entityId: { type: mongoose.Schema.Types.ObjectId }, // Reference to the entity

    // Event data (flexible structure)
    data: { type: mongoose.Schema.Types.Mixed },

    // Timeline
    occurredAt: { type: Date, required: true, default: Date.now },

    // Notes
    notes: { type: String },

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
EventSchema.index({ ownerId: 1, occurredAt: -1 });
EventSchema.index({ ownerId: 1, type: 1, occurredAt: -1 });
EventSchema.index({ ownerId: 1, entityType: 1, entityId: 1 });

export default mongoose.model("Event", EventSchema);
