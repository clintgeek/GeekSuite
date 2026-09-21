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
 * ## Retention
 *
 * `MAX_VERSIONS_PER_NOTE` newest rows per note, pruned on write. The corpus
 * is small (16 notes, ~24KB total when this was built), so the cap exists to
 * bound a pathological editor loop rather than to save meaningful space.
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
     * What replaced this version — `edit`, `tidy`, `compose`, `restore`.
     * Free-form on purpose: a new AI feature should be able to label its own
     * writes without a schema change, and the value is for the history list's
     * benefit, not for logic.
     */
    reason: { type: String, default: 'edit' },
  },
  { timestamps: true }
);

// The history query: this note's versions, newest first.
NoteVersionSchema.index({ noteId: 1, createdAt: -1 });
// Ownership-scoped reads and the delete-a-note cascade.
NoteVersionSchema.index({ userId: 1, noteId: 1 });

export const MAX_VERSIONS_PER_NOTE = 50;

export default noteConn.models.NoteVersion
  || noteConn.model('NoteVersion', NoteVersionSchema);
