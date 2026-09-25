/**
 * gamegeek `PlayniteDropFile` — the Nextcloud folder-drop ledger
 * (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md, "Later" §Automatic import from
 * Nextcloud). Chef's Playnite exporter writes the same filename into a
 * per-user Nextcloud folder every time, so this collection is "the current
 * state of that file slot" per user, not a log of every scan — one row per
 * `(userId, relPath)`, upserted in place.
 *
 * Keyed by content (`sha256`) for the decisions that matter: a file whose
 * bytes haven't changed since the last look is a no-op, and a failed file is
 * not retried until its sha changes — both fall out of comparing the new
 * sha256 to this row's stored one before doing anything else.
 */
function playniteDropFileDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError('@geeksuite/schemas/gamegeek/playniteDropFile: pass your own mongoose instance');
  }
  return {
    householdId: { type: String, required: true },
    userId: { type: String, required: true },
    // folder/filename under the drop root, e.g. "clint@clintgeek.com/playnite-library.json".
    relPath: { type: String, required: true },
    sha256: { type: String, required: true },
    size: { type: Number, default: null },
    mtime: { type: Date, default: null },
    // The export's own `generatedAtUtc`, when the file parsed far enough to have one.
    generatedAtUtc: { type: Date, default: null },
    status: {
      type: String,
      enum: ['imported', 'skipped-older', 'skipped-duplicate', 'failed'],
      required: true,
    },
    // The commit plan's counts (planPlayniteImport) when status is 'imported'.
    counts: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    processedAt: { type: Date, default: Date.now },
  };
}

function createPlayniteDropFileSchema(mongoose) {
  const schema = new mongoose.Schema(playniteDropFileDefinition(mongoose), { timestamps: false });
  schema.index({ userId: 1, relPath: 1 }, { unique: true });
  return schema;
}

const PLAYNITE_DROP_STATUSES = ['imported', 'skipped-older', 'skipped-duplicate', 'failed'];

module.exports = { playniteDropFileDefinition, createPlayniteDropFileSchema, PLAYNITE_DROP_STATUSES };
