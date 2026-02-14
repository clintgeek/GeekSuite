import mongoose from 'mongoose';

const BirdTraitSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String },
    farmId: { type: String },
    birdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bird', required: true },
    loggedAt: { type: Date, required: true },
    weightGrams: { type: Number },
    featherColor: { type: String },
    pattern: { type: String },
    combType: { type: String },
    legColor: { type: String },
    notes: { type: String },
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

BirdTraitSchema.index({ ownerId: 1, birdId: 1, loggedAt: -1 });

export default mongoose.model('BirdTrait', BirdTraitSchema);