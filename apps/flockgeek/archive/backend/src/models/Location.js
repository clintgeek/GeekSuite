import mongoose from 'mongoose';

const LocationSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String },
    farmId: { type: String },
    name: { type: String, required: true },
    description: { type: String },
    capacity: { type: Number },
    notes: { type: String },
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

LocationSchema.index({ ownerId: 1, name: 1 });

export default mongoose.model('Location', LocationSchema);