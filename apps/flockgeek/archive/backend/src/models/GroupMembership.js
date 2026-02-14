import mongoose from 'mongoose';

const GroupMembershipSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    birdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bird', required: true },
    joinedDate: { type: Date, default: Date.now },
    leftDate: { type: Date },
    notes: { type: String }
  },
  { timestamps: true }
);

// Compound index to ensure a bird can only be in a group once at a time
GroupMembershipSchema.index({ ownerId: 1, groupId: 1, birdId: 1, leftDate: 1 });
GroupMembershipSchema.index({ ownerId: 1, birdId: 1, leftDate: 1 });
GroupMembershipSchema.index({ ownerId: 1, groupId: 1, leftDate: 1 });

export default mongoose.model('GroupMembership', GroupMembershipSchema);