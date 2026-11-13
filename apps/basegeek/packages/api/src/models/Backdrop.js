import mongoose from 'mongoose';

/**
 * Backdrop — one wallpaper in the current batch (DOCS/BACKDROP_SERVICE_PLAN.md).
 *
 * Bytes live in the document: ~10 photos × 2 crops is a few MB, well under
 * Mongo's 16 MB per-document cap, and keeping them here avoids a volume —
 * a compose change that Watchtower would never deploy. Regenerable, so
 * backups don't matter.
 *
 * A batch is every doc with the same `batchId`. The job writes a whole new
 * batch, then deletes the others, so readers always see one complete batch.
 */
const variantSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
    bytes: { type: Number, required: true },
  },
  { _id: false },
);

const backdropSchema = new mongoose.Schema({
  batchId: { type: String, required: true, index: true },
  source: { type: String, required: true },
  sourceId: { type: String, default: null },
  credit: { type: String, default: null },
  landscape: { type: variantSchema, required: true },
  portrait: { type: variantSchema, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Backdrop || mongoose.model('Backdrop', backdropSchema);
