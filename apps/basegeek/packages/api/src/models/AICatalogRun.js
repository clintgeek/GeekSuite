import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';

/**
 * AICatalogRun — one document per catalog job run, discovery or probe.
 *
 * This is the job's only report. Before it, "is the catalog current?" was
 * answered by `docker exec … discover-free-models.js` and reading the output,
 * which meant nobody knew unless Chef looked. The status page reads the latest
 * two documents; the counts per provider are what says "Cerebras has a key and
 * zero alive models" without a human probing anything.
 *
 * `perProvider` and `pruned` are Mixed on purpose: their shape is the run's
 * shape, and pinning it in a schema would mean a migration every time a
 * provider grows a new counter. Nothing routes on these fields.
 */
const aiCatalogRunSchema = new mongoose.Schema({
  kind: {
    type: String,
    required: true,
    enum: ['discovery', 'probe']
  },
  startedAt: { type: Date, required: true, default: Date.now },
  finishedAt: { type: Date, default: null },
  /** `{ [providerId]: { listed, candidates, alive, dead, unknown, error } }` */
  perProvider: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  /** `{ AIModel: n, AIFreeTier: n, AIPricing: n }` — rows whose provider left the roster. */
  pruned: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  /** Short, credential-free text. A run that failed halfway still writes a document. */
  error: { type: String, default: null }
}, {
  timestamps: true
});

// The job's own question on every tick: "when did a run of this kind last
// finish?" — one indexed read, not a collection scan.
aiCatalogRunSchema.index({ kind: 1, startedAt: -1 });

const aiGeekConnection = getAIGeekConnection();
const AICatalogRun = aiGeekConnection.model('AICatalogRun', aiCatalogRunSchema);

export default AICatalogRun;
