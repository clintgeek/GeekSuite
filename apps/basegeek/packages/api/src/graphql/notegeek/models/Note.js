import mongoose from 'mongoose';
import { sketchSearchText } from '../sketchText.js';
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
    // Archive (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md §3). An archived note
    // leaves every list, count and search but stays intact with its history.
    // Set only by `archiveNotes` / `restoreNotes`, with `timestamps: false` —
    // archiving is not an edit. NO MIGRATION: notes written before this have
    // no field at all, so every read filters with `active()` below
    // (`archived: { $ne: true }`), never `archived: false`.
    archived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
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
    // ── Word search (AUTO_TRANSCRIBE_SPEC.md) ──────────────────────────────
    // What the `$text` index reads instead of `content`. For every type but a
    // sketch it IS the content (kept by the middleware below); for a sketch it
    // is the recognised handwriting (sketchTranscript.js), never the tldraw
    // JSON, which made "draw" or "shape" match every sketch.
    wordText: { type: String, default: '' },
    // ── Automatic handwriting transcription (sketchTranscript.js) ──────────
    // Derived from the strokes, never written into `content`. Writes here use
    // `timestamps: false`: background reading is not an edit.
    sketchTranscript: {
      type: new mongoose.Schema({
        text: { type: String, default: null },        // the latest machine reading
        hash: { type: String, default: null },        // the content hash it was read from
        source: { type: String, default: null },      // 'auto' | 'convert'
        provider: { type: String, default: null },
        model: { type: String, default: null },
        at: { type: Date, default: null },
        status: { type: String, enum: ['pending', 'processing', 'searchable', 'stale', 'failed'], default: 'pending' },
        submittedHash: { type: String, default: null }, // the hash the running (or last) request read
        claimedAt: { type: Date, default: null },
        attempts: { type: Number, default: 0 },
        retryAt: { type: Date, default: null },
        failedHash: { type: String, default: null },  // given up on for this content
        error: { type: String, default: null },
        // The user's corrections from Convert's review box, for the content
        // they were made against. Automatic runs never overwrite them.
        edited: {
          type: new mongoose.Schema({
            text: { type: String, default: '' },
            hash: { type: String, default: null },
            at: { type: Date, default: null },
          }, { _id: false }),
          default: undefined,
        },
      }, { _id: false }),
      default: undefined,
    },
    // ── [[Links]] (links.js) ───────────────────────────────────────────────
    // Outgoing links parsed from the body on save: `key` is the lowercased
    // title (or `id:<hex>` for an in-app /notes/<id> link), `noteId` the
    // target once resolved, null while no note has that title.
    links: {
      type: [
        {
          _id: false,
          key: { type: String, required: true },
          title: { type: String, default: '' },
          noteId: { type: mongoose.Schema.Types.ObjectId, default: null },
        },
      ],
      default: [],
    },
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
/**
 * `wordText` follows `content` for every type but a sketch, whose word-search
 * text is its transcript (set by sketchTranscript.js). Middleware, like the
 * embedding state above, so no write path can forget it.
 */
const SKETCH = 'handwritten';
function wordTextFor(type, content, transcript) {
  if (type !== SKETCH) return typeof content === 'string' ? content : '';
  return sketchSearchText(transcript);
}
NoteSchema.pre('save', function keepWordText() {
  if (this.isNew || this.isModified('content') || this.isModified('type')) {
    this.wordText = wordTextFor(this.type, this.content, this.sketchTranscript);
  }
});
// insertMany skips 'save' middleware; an import or a script must still be searchable.
NoteSchema.pre('insertMany', function keepWordTextOnInsertMany(next, docs) {
  for (const doc of Array.isArray(docs) ? docs : []) {
    if (doc && doc.wordText === undefined) doc.wordText = wordTextFor(doc.type || 'text', doc.content, doc.sketchTranscript);
  }
  next();
});
NoteSchema.pre('findOneAndUpdate', async function keepWordTextOnUpdate() {
  const update = this.getUpdate();
  if (!update || Array.isArray(update)) return;
  const field = (f) => (f in update ? update[f] : update.$set?.[f]);
  const content = field('content');
  const type = field('type');
  if (content === undefined && type === undefined) return;
  // A typeless body write, or a type change without a body: read what's stored.
  const stored = (type === undefined || type === SKETCH || content === undefined)
    ? await this.model.findOne(this.getQuery(), { type: 1, content: 1, sketchTranscript: 1 }).lean()
    : null;
  const effectiveType = type ?? stored?.type;
  if (effectiveType === SKETCH) {
    // A sketch's body is drawing data: word search reads its transcript instead.
    this.set({ wordText: wordTextFor(SKETCH, null, stored?.sketchTranscript) });
  } else {
    this.set({ wordText: wordTextFor(effectiveType, content ?? stored?.content) });
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
// Backlinks ("who links here") and resolving pending links by title.
NoteSchema.index({ userId: 1, 'links.noteId': 1 });
NoteSchema.index({ userId: 1, 'links.key': 1 });
NoteSchema.index({ updatedAt: 1 });
// Word search reads `wordText`, not `content` (see above). The deployed index
// was { title, content, tags }; ensureNoteWordIndex() swaps it once at start-up.
export const WORD_INDEX_KEYS = { title: 'text', wordText: 'text', tags: 'text' };
NoteSchema.index(WORD_INDEX_KEYS);
// The `notes` query sorts pinned notes first, then by the requested order —
// this compound index serves that shape directly for the default sort.
NoteSchema.index({ pinned: -1, updatedAt: -1 });
// The active filter and the Archived view, both owner-scoped.
NoteSchema.index({ userId: 1, archived: 1 });

/**
 * The active-note filter. Spread into every read that lists, counts or finds
 * notes (`{ userId, ...active() }`). `$ne: true` rather than `false` so a note
 * with no `archived` field — every note written before Archive — is active.
 * A function, not a shared constant: mongoose casts filters in place.
 */
export const active = () => ({ archived: { $ne: true } });

const Note = noteConn.models.Note || noteConn.model('Note', NoteSchema);

export default Note;
