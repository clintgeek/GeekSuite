import mongoose from 'mongoose';

const PairingSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    season: { type: String }, // YYYY or YYYY-Qn
    seasonYear: { type: Number },
    name: { type: String },
    roosterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bird' }],
    henIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bird' }],
    henGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    goals: [{ type: String, enum: ['bigger_eggs','better_hatch','calmer_roos','color_project','meat_growth','other'] }],
    active: { type: Boolean, default: true },
    notes: { type: String },
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

PairingSchema.index({ ownerId: 1, seasonYear: -1 });
PairingSchema.index({ ownerId: 1, season: -1 });

export default mongoose.model('Pairing', PairingSchema);
