import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const noteConn = getAppConnection('notegeek');

// Guard against duplicate model registration when modules hot-reload
const NoteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Note content cannot be empty'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['text', 'markdown', 'code', 'mindmap', 'handwritten'],
      default: 'text',
    },
    tags: {
      type: [String],
      index: true,
      default: [],
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    isEncrypted: {
      type: Boolean,
      default: false,
    },
    lockHash: {
      type: String,
      select: false,
    },
    // Pin a note to the top of the list. `pinnedAt` is the moment it was
    // pinned (null when not), kept separately from `updatedAt` so pinning a
    // note doesn't masquerade as an edit and isn't cleared by one — it is set
    // and cleared only by `setNotePinned`.
    pinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
    // ── Meaning-based search index (indexer.js) ────────────────────────────
    // Bookkeeping only; never exposed on the GraphQL Note type. The vectors
    // themselves live in `noteChunks` (models/NoteChunk.js).
    //   stale   — title/content changed (or never indexed); the indexer will
    //             embed it once the note has been still for a while
    //   indexed — its chunks match `embeddingHash`
    //   skipped — nothing to embed (an untitled sketch)
    //   failed  — the service refused this note's text repeatedly
    // Absent on notes written before this existed: read as stale (backfill).
    // Writes that set these use `timestamps: false`, so indexing never
    // looks like an edit.
    embeddingState: {
      type: String,
      enum: ['stale', 'indexed', 'skipped', 'failed'],
      default: 'stale',
    },
    embeddingHash: { type: String, default: null },
    embeddingAttempts: { type: Number, default: 0 },
    embeddingRetryAt: { type: Date, default: null },
    embeddingError: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

/**
 * Any write that changes what a note SAYS marks it for re-embedding. Done as
 * middleware rather than in each resolver so a future write path (restore,
 * import, a script) cannot forget: create, updateNote and restoreNoteVersion
 * all go through `save` or `findOneAndUpdate`. Tag, pin and indexer writes
 * don't touch title/content, so they leave the state alone.
 */
const TEXT_FIELDS = ['title', 'content'];
NoteSchema.pre('save', function markStaleOnSave() {
  if (this.isNew || TEXT_FIELDS.some((f) => this.isModified(f))) {
    this.embeddingState = 'stale';
    this.embeddingAttempts = 0;
    this.embeddingRetryAt = null;
  }
});
NoteSchema.pre('findOneAndUpdate', function markStaleOnUpdate() {
  const update = this.getUpdate();
  if (!update || Array.isArray(update)) return;
  const touches = TEXT_FIELDS.some((f) => f in update || (update.$set && f in update.$set));
  if (touches) {
    this.set({ embeddingState: 'stale', embeddingAttempts: 0, embeddingRetryAt: null });
  }
});

NoteSchema.index({ createdAt: 1 });
// The indexer's queue scan: stale (or never-indexed) notes, oldest edit first.
NoteSchema.index({ embeddingState: 1, updatedAt: 1 });
NoteSchema.index({ updatedAt: 1 });
NoteSchema.index({ title: 'text', content: 'text', tags: 'text' });
// The `notes` query sorts pinned notes first, then by the requested order —
// this compound index serves that shape directly for the default sort.
NoteSchema.index({ pinned: -1, updatedAt: -1 });

const Note = noteConn.models.Note || noteConn.model('Note', NoteSchema);

export default Note;
