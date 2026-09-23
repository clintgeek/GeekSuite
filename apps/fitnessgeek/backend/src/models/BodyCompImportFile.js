import mongoose from 'mongoose';

// The folder import's memory of what it has already handled — see
// DOCS/BODY_COMPOSITION_INTAKE.md §11.3. The import folder is Nextcloud's and
// is mounted read-only, so "done" can't be recorded by moving the file; it is
// recorded here instead.
//
// Keyed by CONTENT (`sha256`), not by name: a renamed file is not new, an
// edited one is. A `failed` file is not retried until its bytes change —
// retrying the same bytes produces the same failure.
//
// fitnessgeek-only: basegeek's gateway never reads or writes this collection,
// so it does not go through @geeksuite/schemas.
const bodyCompImportFileSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  sha256: {
    type: String,
    required: true,
  },
  folder: {
    type: String,
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
  },
  status: {
    type: String,
    enum: ['imported', 'failed'],
    required: true,
  },
  // `importBodyCompXlsxRows`'s counts — per-row `results` are left out; the
  // log has them, and a whole-history file would repeat them every time.
  counts: {
    imported: Number,
    skipped: Number,
    failed: Number,
  },
  weights: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  error: {
    type: String,
    default: null,
  },
  processed_at: {
    type: Date,
    default: Date.now,
  },
});

bodyCompImportFileSchema.index({ userId: 1, sha256: 1 }, { unique: true });

export default mongoose.model('BodyCompImportFile', bodyCompImportFileSchema);
