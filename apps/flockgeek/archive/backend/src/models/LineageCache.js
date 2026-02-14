import mongoose from 'mongoose';

const LineageCacheSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    birdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bird', required: true },
    ancestors: [{ ancestorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bird' }, depth: Number }],
    coefficientOfRelationship: { type: Number },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

LineageCacheSchema.index({ ownerId: 1, birdId: 1 });

export default mongoose.model('LineageCache', LineageCacheSchema);
