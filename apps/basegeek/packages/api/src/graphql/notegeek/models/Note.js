import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { hasAnyShape } from '../sketchText.js';
import { derivedFields, DERIVED_VERSION } from '../noteDerived.js';
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
    // Soft delete (decision D1, 2026-11-15; reverses CONTEXT.md §11's "no
    // trash"). A deleted note leaves every list, count, search, link and
    // suite read, keeps its history, and can be restored for 30 days; then
    // it is purged (resolvers.js `purgeExpiredNotes`). Set by deleteNote with
    // `timestamps: false` — deleting is not an edit. Notes written before
    // this have no field: `deletedAt: null` matches them, so every read
    // filters with `active()` / `notDeleted()` below.
    deletedAt: {
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
    // A new value every time the note is queued for (re-)embedding. The
    // indexer marks a note indexed only if this is still what it read, so a
    // transcript that lands mid-embed (it changes the text without touching
    // `updatedAt`) is never marked indexed against the older text.
    embeddingTicket: { type: String, default: null },
    // A list row's text (noteDerived.js `previewFor`): ~200 characters of the
    // note's words, no markup; a sketch's comes from its transcript. Kept by
    // the middleware below, so list queries never need `content`.
    preview: { type: String, default: '' },
    // Which version of noteDerived.js wrote `wordText` / `preview`;
    // wordIndex.js re-derives every note below DERIVED_VERSION at start-up.
    derivedV: { type: Number, default: 0 },
    // The sketch's content hash (sketchText.js), remembered for the content
    // it was computed from (`len` + `at` = the note's content length and
    // updatedAt then). Computing it costs ~0.3 s on a multi-MB sketch, and it
    // used to run on every transcript read; now once per saved drawing, on
    // first read — never on autosave. Bookkeeping only.
    sketchHash: {
      type: new mongoose.Schema({
        value: { type: String, default: null },
        len: { type: Number, default: null },
        at: { type: Date, default: null },
        // The hash rule it was computed under (sketchTranscript.js HASH_VERSION).
        v: { type: Number, default: null },
        // The content has photographed pages: never read automatically.
        photo: { type: Boolean, default: null },
      }, { _id: false }),
      default: undefined,
    },
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
        // Why the last attempt failed ('AI_BUDGET', 'AI_CAP', 'AI_UNAVAILABLE', ...).
        errorCode: { type: String, default: null },
        // Whether `edited` (made for an older drawing) still describes the
        // page: false once a newer reading shows that drawing erased or
        // rewritten (sketchText.js). Absent = true.
        editedSearchable: { type: Boolean, default: undefined },
        // Consecutive transient failures (outage, timeout, today's cap): the
        // backoff exponent. They never count toward `attempts`.
        retries: { type: Number, default: 0 },
        // Journal lines of this sketch already sent to TodoGeek, as line keys
        // (BUJO_HANDWRITING.md), so the dialog doesn't offer them twice.
        // Added with $addToSet — never read-merge-$set, which lost keys when
        // two sends overlapped.
        sentTaskKeys: { type: [String], default: undefined },
        // The text of lines sent (optional, from newer clients), so a line
        // whose key changed after a correction can still be recognised as
        // "probably already sent".
        sentTaskTexts: { type: [String], default: undefined },
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
/** The fields that queue a note for the indexer; a fresh ticket each time. */
export const staleIndexFields = () => ({
  embeddingState: 'stale',
  embeddingAttempts: 0,
  embeddingRetryAt: null,
  embeddingTicket: randomUUID(),
});
NoteSchema.pre('save', function markStaleOnSave() {
  if (this.isNew || TEXT_FIELDS.some((f) => this.isModified(f))) {
    Object.assign(this, staleIndexFields());
  }
});
/**
 * `wordText` and `preview` (noteDerived.js) follow `content` for every type
 * but a sketch, whose words are its transcript (set by sketchTranscript.js).
 * Middleware, like the embedding state above, so no write path can forget.
 */
const SKETCH = 'handwritten';
NoteSchema.pre('save', function keepDerivedOnSave() {
  if (this.isNew || this.isModified('content') || this.isModified('type') || this.isModified('sketchTranscript')) {
    Object.assign(this, derivedFields(this));
  }
});
// insertMany skips 'save' middleware; an import or a script must still be searchable.
NoteSchema.pre('insertMany', function keepDerivedOnInsertMany(next, docs) {
  for (const doc of Array.isArray(docs) ? docs : []) {
    if (doc && doc.wordText === undefined) Object.assign(doc, derivedFields({ type: 'text', ...doc }));
  }
  next();
});
/**
 * A body or type write through findOneAndUpdate (updateNote, a version
 * restore, fold-in).
 *
 * A sketch that stays a sketch is left alone: its words are its transcript,
 * which this write does not carry. Re-deriving them here from a transcript
 * read moments earlier is how an autosave used to write an OLDER reading back
 * over one that landed in between (2026-11-15). The one exception is a sketch
 * saved with nothing drawn on it: whatever was read from the erased ink is no
 * longer on the page, so it stops being searchable at once.
 */
NoteSchema.pre('findOneAndUpdate', async function keepDerivedOnUpdate() {
  const update = this.getUpdate();
  if (!update || Array.isArray(update)) return;
  const field = (f) => (f in update ? update[f] : update.$set?.[f]);
  const content = field('content');
  const type = field('type');
  if (content === undefined && type === undefined) return;
  const stored = await this.model.findOne(this.getQuery(), {
    type: 1, isLocked: 1, isEncrypted: 1, sketchTranscript: 1, ...(content === undefined ? { content: 1 } : {}),
  }).lean();
  const effectiveType = type ?? stored?.type ?? 'text';
  if (effectiveType === SKETCH && stored?.type === SKETCH) {
    if (typeof content === 'string' && !hasAnyShape(content)) {
      this.set({ wordText: '', preview: '', derivedV: DERIVED_VERSION });
      if (stored.sketchTranscript) {
        this.set({ 'sketchTranscript.text': null, 'sketchTranscript.hash': null, 'sketchTranscript.edited': null });
      }
    }
    return;
  }
  this.set(derivedFields({
    type: effectiveType,
    content: content ?? stored?.content,
    sketchTranscript: stored?.sketchTranscript,
    isLocked: stored?.isLocked,
    isEncrypted: stored?.isEncrypted,
  }));
});
NoteSchema.pre('findOneAndUpdate', function markStaleOnUpdate() {
  const update = this.getUpdate();
  if (!update || Array.isArray(update)) return;
  const touches = TEXT_FIELDS.some((f) => f in update || (update.$set && f in update.$set));
  if (touches) this.set(staleIndexFields());
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
// A title hit outranks a tag hit, which outranks a body hit (Tier 5.4,
// 2026-11-15). Mongo can't change a text index's weights in place: the
// running index is dropped and recreated by ensureNoteWordIndex() at
// start-up when its weights differ (wordIndex.js).
export const WORD_INDEX_WEIGHTS = { title: 10, tags: 5, wordText: 1 };
NoteSchema.index(WORD_INDEX_KEYS, { weights: WORD_INDEX_WEIGHTS });
// The `notes` query sorts pinned notes first, then by the requested order —
// this compound index serves that shape directly for the default sort.
NoteSchema.index({ pinned: -1, updatedAt: -1 });
// The list and its keyset pages (notesPage): owner, pinned first, newest
// edit, `_id` as the tiebreak a cursor needs (Tier 5.6).
NoteSchema.index({ userId: 1, pinned: -1, updatedAt: -1, _id: -1 });
// The active filter and the Archived view, both owner-scoped.
NoteSchema.index({ userId: 1, archived: 1 });
// Recently deleted, and the 30-day purge.
NoteSchema.index({ userId: 1, deletedAt: -1 });

/**
 * The active-note filter. Spread into every read that lists, counts or finds
 * notes (`{ userId, ...active() }`): not archived and not deleted. `$ne: true`
 * rather than `false` so a note with no `archived` field — every note written
 * before Archive — is active; `deletedAt: null` matches a missing field too.
 * A function, not a shared constant: mongoose casts filters in place.
 */
export const active = () => ({ archived: { $ne: true }, deletedAt: null });

/**
 * Not soft-deleted (archived or not). For the Archived view and anything
 * else that reaches archived notes but must never reach deleted ones.
 */
export const notDeleted = () => ({ deletedAt: null });

const Note = noteConn.models.Note || noteConn.model('Note', NoteSchema);

export default Note;
