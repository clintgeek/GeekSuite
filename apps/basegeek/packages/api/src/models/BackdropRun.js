import mongoose from 'mongoose';

/**
 * BackdropRun — one document per backdrop refresh attempt, written even when
 * the attempt fails, so "the job never ran" and "the job ran and every source
 * was down" look different. `perSource` is `{ [source]: { tried, kept, error } }`.
 */
const backdropRunSchema = new mongoose.Schema({
  startedAt: { type: Date, required: true, default: Date.now },
  finishedAt: { type: Date, default: null },
  batchId: { type: String, default: null },
  kept: { type: Number, default: 0 },
  /** True when this run's batch replaced the previous one. */
  replaced: { type: Boolean, default: false },
  perSource: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  error: { type: String, default: null },
});

export default mongoose.models.BackdropRun || mongoose.model('BackdropRun', backdropRunSchema);
