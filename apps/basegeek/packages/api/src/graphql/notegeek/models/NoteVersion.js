import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const noteConn = getAppConnection('notegeek');

/**
 * NoteVersion — the note as it was before a change.
 *
 * ## Why this exists
 *
 * NoteGeek had no history of any kind, which made every in-place rewrite
 * permanently unrecoverable. That is not a theoretical concern: on
 * 2026-09-21 the Tidy feature silently truncated a long note to ~63% of
 * itself and wrote the stump back, and there was nothing to restore from.
 * The AI features are the sharpest edge — they replace a whole note in one
 * action — but an ordinary fat-fingered edit is unrecoverable for exactly
 * the same reason, so this snapshots every content change rather than only
 * the machine-made ones.
 *
 * ## What a row is
 *
 * A row is the note BEFORE an update — written after that update succeeds,
 * so a rejected write leaves no version behind. The live note is never a row
 * here; "current" is always `Note` itself. Restoring version N therefore
 * snapshots the current note first, so restoring is itself undoable.
 *
 * ## Locked and encrypted notes
 *
 * Stored exactly as the note stores them. An encrypted note's content is
 * ciphertext in `Note` and ciphertext here, so a restore round-trips without
 * the server ever holding the plaintext. `isLocked` rides along so a version
 * can be gated the same way its note is. This is the opposite of the rule in
 * `suggest.js` and `compose.js` — those must never SEND such content to a
 * model; this must faithfully KEEP it.
 *
 * ## Retention (since 2026-11-15, plan 1.5 — see versions.js)
 *
 * Edits are coalesced (one version per ~10 minutes of continuous editing,
 * plus one when a session starts), then thinned by age: everything from the
 * last day, the newest of each day for 30 days, the newest of each week after
 * that — capped at MAX_VERSIONS_PER_NOTE rows and MAX_VERSION_BYTES_PER_NOTE
 * of content per note (a sketch is up to 5 MB a version). The snapshot taken
 * before a large shrink is `keep: true` and survives all of it. Before this,
 * 50 rows (one per autosave pause) covered only the last few minutes.
 */
const NoteVersionSchema = new mongoose.Schema(
  {
    noteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Note',
      required: true,
    },
    // Denormalised from the note so a version can be ownership-scoped without
    // a join — and so an orphaned version (its note deleted) is still
    // attributable and still prunable.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, trim: true },
    content: { type: String, default: '' },
    type: { type: String },
    tags: { type: [String], default: [] },
    isLocked: { type: Boolean, default: false },
    isEncrypted: { type: Boolean, default: false },
    /**
     * What replaced this version — `edit`, `compose`, `restore`. (`tidy` was
     * a member until that feature was removed on 2026-09-22; no stored row
     * ever carried it, because Tidy wrote through the ordinary save path.)
     * Free-form on purpose: a new AI feature should be able to label its own
     * writes without a schema change, and the value is for the history list's
     * benefit, not for logic.
     */
    reason: { type: String, default: 'edit' },
    /** Content length (characters), so retention can budget without reading bodies. Absent on old rows. */
    size: { type: Number, default: null },
    /**
     * Never pruned by age or budget: the note as it was before a change that
     * removed most of it (versions.js `isLargeShrink`) — the version you'd
     * want after an accidental select-all-delete or an erased sketch.
     */
    keep: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// The history query: this note's versions, newest first.
NoteVersionSchema.index({ noteId: 1, createdAt: -1 });
// Ownership-scoped reads and the delete-a-note cascade.
NoteVersionSchema.index({ userId: 1, noteId: 1 });

export const MAX_VERSIONS_PER_NOTE = 100;
/** Content kept per note across its versions: ~10 large sketches. */
export const MAX_VERSION_BYTES_PER_NOTE = 50 * 1024 * 1024;
/** `keep: true` rows per note beyond which even they go, oldest first (a runaway loop). */
export const MAX_KEPT_VERSIONS_PER_NOTE = 20;

export default noteConn.models.NoteVersion
  || noteConn.model('NoteVersion', NoteVersionSchema);
