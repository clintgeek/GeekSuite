import mongoose from "mongoose";

const GroupMembershipSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true
    },
    birdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bird",
      required: true,
      index: true
    },

    // Membership timeline
    joinedAt: { type: Date, required: true, default: Date.now },
    leftAt: { type: Date },

    // Role within group (optional)
    role: { type: String }, // e.g., "alpha_hen", "broody", "assistant_rooster"

    // Notes
    notes: { type: String },

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
GroupMembershipSchema.index({ ownerId: 1, groupId: 1, joinedAt: -1 });
GroupMembershipSchema.index({ ownerId: 1, birdId: 1, joinedAt: -1 });

export default mongoose.model("GroupMembership", GroupMembershipSchema);
