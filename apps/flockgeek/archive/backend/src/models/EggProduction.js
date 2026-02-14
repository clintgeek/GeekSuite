import mongoose from 'mongoose';

const EggProductionSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    birdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bird' }, // optional when group-level
    date: { type: Date }, // single-day observation
    startDate: { type: Date },
    endDate: { type: Date },
    daysObserved: { type: Number, default: 1 },
    eggsCount: { type: Number, required: true },
    birdIdsSnapshot: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bird' }],
    avgEggWeightGrams: { type: Number },
    eggColor: { type: String },
    eggSize: { type: String, enum: ['peewee', 'small', 'medium', 'large', 'xl', 'jumbo', 'unknown', null], default: 'unknown' },
    source: { type: String, enum: ['manual', 'import', 'auto'], default: 'manual' },
    quality: { type: String, enum: ['ok', 'estimated', 'questionable'], default: 'ok' }
  },
  { timestamps: true }
);

EggProductionSchema.index({ ownerId: 1, groupId: 1, date: -1 });
EggProductionSchema.index({ ownerId: 1, groupId: 1, startDate: -1 });
EggProductionSchema.index({ ownerId: 1, birdId: 1, date: -1 });

export default mongoose.model('EggProduction', EggProductionSchema);
