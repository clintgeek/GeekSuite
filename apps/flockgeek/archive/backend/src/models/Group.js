import mongoose from 'mongoose';

const GroupSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String },
    farmId: { type: String },
    name: { type: String, required: true },
    purpose: { type: String, enum: ['core_flock', 'meat_run'], required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    notes: { type: String },
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

GroupSchema.index({ ownerId: 1, purpose: 1, startDate: -1 });
GroupSchema.index({ ownerId: 1, name: 1 });

export default mongoose.model('Group', GroupSchema);
