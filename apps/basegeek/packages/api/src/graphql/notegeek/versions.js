/**
 * versions.js — snapshot, list, and restore a note's history.
 *
 * The write side is deliberately one function called from one place. There is
 * exactly one site in this app that updates a note's content
 * (`resolvers.js`'s `updateNote`), and keeping the snapshot there means there
 * is no second path that can quietly skip it. If a second writer ever
 * appears, it calls this too — that is the whole contract.
 */

import NoteVersion, { MAX_VERSIONS_PER_NOTE } from './models/NoteVersion.js';

/**
 * Has anything worth keeping actually changed?
 *
 * A save that changes nothing — the editor's autosave firing on focus loss,
 * a tag reorder, an idempotent AI result — should not push a version and
 * scroll the real history out of the retention window. Content is the
 * substance; title and type are included because losing either is just as
 * annoying and just as unrecoverable.
 */
export function isMeaningfulChange(previous, payload) {
  if (!previous) return false;
  if (typeof payload?.content === 'string' && payload.content !== previous.content) return true;
  if (typeof payload?.title === 'string' && payload.title !== previous.title) return true;
  if (typeof payload?.type === 'string' && payload.type !== previous.type) return true;
  return false;
}

/**
 * Keep the note as it was, before whatever just replaced it.
 *
 * Called AFTER the update succeeds: a rejected write must not leave a version
 * behind, or the history fills with states that never existed.
 *
 * Never throws. A failed snapshot must not fail the user's save — losing the
 * history entry is bad, losing the edit because the history entry failed is
 * worse. It returns null instead so a caller can log it.
 *
 * @param {object} previous the note document as it was (lean or hydrated)
 * @param {string} reason what replaced it — 'edit', 'tidy', 'compose', 'restore'
 * @returns {Promise<object|null>} the stored version, or null
 */
export async function snapshotNote(previous, reason = 'edit') {
  if (!previous?._id || !previous?.userId) return null;
  try {
    const version = await NoteVersion.create({
      noteId: previous._id,
      userId: previous.userId,
      title: previous.title,
      content: previous.content ?? '',
      type: previous.type,
      tags: Array.isArray(previous.tags) ? previous.tags : [],
      isLocked: Boolean(previous.isLocked),
      isEncrypted: Boolean(previous.isEncrypted),
      reason,
    });
    await pruneVersions(previous._id);
    return version;
  } catch {
    return null;
  }
}

/**
 * Drop everything past the retention cap for one note, oldest first.
 *
 * Best-effort for the same reason as above.
 */
export async function pruneVersions(noteId, keep = MAX_VERSIONS_PER_NOTE) {
  try {
    const stale = await NoteVersion
      .find({ noteId })
      .sort({ createdAt: -1 })
      .skip(keep)
      .select('_id')
      .lean();
    if (stale.length) {
      await NoteVersion.deleteMany({ _id: { $in: stale.map((v) => v._id) } });
    }
    return stale.length;
  } catch {
    return 0;
  }
}

/**
 * A note's history, newest first.
 *
 * Ownership-scoped by `userId` rather than by joining to the note, so a
 * version whose note has been deleted is still unreachable by anyone else —
 * and a cross-user id behaves as an empty history rather than an error, the
 * same shape the rest of this app uses.
 *
 * Content is omitted: a list of twenty versions of a 12k note is a payload
 * nobody asked for. `getNoteVersion` fetches one.
 */
export async function listNoteVersions({ noteId, userId, limit = MAX_VERSIONS_PER_NOTE }) {
  if (!noteId || !userId) return [];
  return NoteVersion
    .find({ noteId, userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, MAX_VERSIONS_PER_NOTE))
    .select('-content')
    .lean();
}

/** One version, with its content. Ownership-scoped; null when not the caller's. */
export async function getNoteVersion({ versionId, userId }) {
  if (!versionId || !userId) return null;
  return NoteVersion.findOne({ _id: versionId, userId }).lean();
}

/**
 * Remove a note's history. Called when the note itself is deleted.
 *
 * Deliberate: keeping versions of a deleted note would mean "delete" did not
 * delete, which is not what the word promises.
 */
export async function deleteVersionsForNote(noteId, userId) {
  if (!noteId || !userId) return 0;
  try {
    const { deletedCount } = await NoteVersion.deleteMany({ noteId, userId });
    return deletedCount || 0;
  } catch {
    return 0;
  }
}
