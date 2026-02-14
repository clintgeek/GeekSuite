import mongoose from 'mongoose';

const HatchEventSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    pairingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pairing' },
    maternalGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    setDate: { type: Date, required: true },
    hatchDate: { type: Date },
    eggsSet: { type: Number, required: true },
    eggsFertile: { type: Number },
    chicksHatched: { type: Number },
    pullets: { type: Number },
    cockerels: { type: Number },
    mortalityByDay: [{ day: Number, count: Number }],
    notes: { type: String },
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

HatchEventSchema.index({ ownerId: 1, setDate: -1 });
HatchEventSchema.index({ ownerId: 1, pairingId: 1, setDate: -1 });

export default mongoose.model('HatchEvent', HatchEventSchema);
