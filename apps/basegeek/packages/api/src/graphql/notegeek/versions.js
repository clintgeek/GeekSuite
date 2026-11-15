/**
 * versions.js — snapshot, list, and restore a note's history.
 *
 * The write side is deliberately one function called from one place. There is
 * exactly one site in this app that updates a note's content
 * (`resolvers.js`'s `updateNote`), and keeping the snapshot there means there
 * is no second path that can quietly skip it. If a second writer ever
 * appears, it calls this too — that is the whole contract.
 *
 * Two have since appeared, and both call it: `restoreNoteVersion` and
 * Fold-in's `foldInApply` (`foldin.js`). Fold-in is the one exception to
 * "stored after the write": it snapshots BEFORE writing and refuses to write
 * when the snapshot fails, because Undo is that feature's promise — and it
 * deletes the snapshot again if the conditional write then loses a race, so
 * no version describes a state that was never replaced.
 */

import mongoose from 'mongoose';
import NoteVersion, {
  MAX_VERSIONS_PER_NOTE,
  MAX_VERSION_BYTES_PER_NOTE,
  MAX_KEPT_VERSIONS_PER_NOTE,
} from './models/NoteVersion.js';

// ── coalescing and retention (plan 1.5, 2026-11-15) ───────────────────────
/** A pause longer than this ends an editing session; the next save snapshots. */
export const SESSION_GAP_MS = 10 * 60 * 1000;
/** During continuous editing, at most one version per this long. */
export const COALESCE_MS = 10 * 60 * 1000;
/** Everything younger than this is kept. */
export const KEEP_ALL_MS = 24 * 60 * 60 * 1000;
/** Newest version of each UTC day kept up to this age; newest of each week after. */
export const DAILY_FOR_MS = 30 * 24 * 60 * 60 * 1000;
/** A change that leaves under this share of the content is a large shrink. */
export const SHRINK_RATIO = 0.5;
/** ...measured only on notes at least this long (a 6-character note isn't worth pinning). */
export const SHRINK_MIN_CHARS = 200;

/** Did this change remove most of the note? Its "before" is then kept for good. */
export function isLargeShrink(previous, payload) {
  const before = typeof previous?.content === 'string' ? previous.content.length : 0;
  if (typeof payload?.content !== 'string' || before < SHRINK_MIN_CHARS) return false;
  return payload.content.length < before * SHRINK_RATIO;
}

/**
 * Should an ordinary edit (autosave) snapshot the note as it was? Coalescing:
 *   - the first version of a note, always;
 *   - a session start: the note had been still for SESSION_GAP_MS — its
 *     state then is the end of the last session, worth keeping;
 *   - during continuous editing, once the newest version is COALESCE_MS old;
 *   - and always before a large shrink.
 * Non-edit reasons (compose, restore, fold_in) always snapshot; the caller
 * decides that. Never throws: a failed check snapshots (history over space).
 */
export async function shouldSnapshotEdit(previous, payload, { now = Date.now() } = {}) {
  if (!isMeaningfulChange(previous, payload)) return { snapshot: false, keep: false };
  if (isLargeShrink(previous, payload)) return { snapshot: true, keep: true };
  const lastEdit = previous?.updatedAt ? new Date(previous.updatedAt).getTime() : 0;
  if (!lastEdit || now - lastEdit > SESSION_GAP_MS) return { snapshot: true, keep: false };
  try {
    const newest = await NoteVersion.findOne({ noteId: previous._id }, { createdAt: 1 }).sort({ createdAt: -1 }).lean();
    if (!newest) return { snapshot: true, keep: false };
    return { snapshot: now - new Date(newest.createdAt).getTime() >= COALESCE_MS, keep: false };
  } catch {
    return { snapshot: true, keep: false };
  }
}

/**
 * Which versions survive, newest first in, ids to delete out. Pure.
 *   1. the newest version and every `keep` row (up to MAX_KEPT_VERSIONS_PER_NOTE);
 *   2. everything younger than KEEP_ALL_MS;
 *   3. the newest of each UTC day up to DAILY_FOR_MS, of each week after;
 *   4. then the count and byte caps, dropping the oldest unprotected first.
 */
export function versionsToPrune(rows, { now = Date.now(), maxCount = MAX_VERSIONS_PER_NOTE, maxBytes = MAX_VERSION_BYTES_PER_NOTE } = {}) {
  const sorted = [...rows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const keepIds = new Set();
  const protectedIds = new Set();
  if (sorted[0]) { keepIds.add(String(sorted[0]._id)); protectedIds.add(String(sorted[0]._id)); }
  let kept = 0;
  for (const r of sorted) {
    if (r.keep && kept < MAX_KEPT_VERSIONS_PER_NOTE) {
      kept += 1;
      keepIds.add(String(r._id));
      protectedIds.add(String(r._id));
    }
  }
  const buckets = new Set();
  for (const r of sorted) {
    const t = new Date(r.createdAt).getTime();
    const age = now - t;
    if (age < KEEP_ALL_MS) { keepIds.add(String(r._id)); continue; }
    const day = Math.floor(t / 86400000);
    const bucket = age < DAILY_FOR_MS ? `d${ day }` : `w${ Math.floor((day + 3) / 7) }`;
    if (!buckets.has(bucket)) { buckets.add(bucket); keepIds.add(String(r._id)); }
  }
  // The caps, oldest unprotected first.
  let survivors = sorted.filter((r) => keepIds.has(String(r._id)));
  const size = (r) => Number(r.size) || 0;
  let bytes = survivors.reduce((n, r) => n + size(r), 0);
  for (let i = survivors.length - 1; i >= 0 && (survivors.length > maxCount || bytes > maxBytes); i -= 1) {
    const r = survivors[i];
    if (protectedIds.has(String(r._id))) continue;
    bytes -= size(r);
    survivors.splice(i, 1);
  }
  const alive = new Set(survivors.map((r) => String(r._id)));
  return sorted.filter((r) => !alive.has(String(r._id))).map((r) => r._id);
}

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
 * @param {string} reason what replaced it — 'edit', 'compose', 'restore', 'fold_in'
 * @returns {Promise<object|null>} the stored version, or null
 */
export async function snapshotNote(previous, reason = 'edit', { keep = false } = {}) {
  if (!previous?._id || !previous?.userId) return null;
  try {
    const version = await NoteVersion.create({
      size: typeof previous.content === 'string' ? previous.content.length : 0,
      keep: Boolean(keep),
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
 * Apply the retention rules (`versionsToPrune`) to one note. Reads ids,
 * dates, flags and sizes only — never the bodies (an old row without `size`
 * is measured in Mongo).
 *
 * Best-effort for the same reason as above.
 */
export async function pruneVersions(noteId, { now = Date.now(), keep, maxBytes } = {}) {
  try {
    const rows = await NoteVersion.aggregate([
      { $match: { noteId: typeof noteId === 'string' ? new mongoose.Types.ObjectId(noteId) : noteId } },
      { $project: { createdAt: 1, keep: 1, size: { $ifNull: ['$size', { $strLenCP: { $ifNull: ['$content', ''] } }] } } },
    ]);
    const stale = versionsToPrune(rows, { now, ...(keep ? { maxCount: keep } : {}), ...(maxBytes ? { maxBytes } : {}) });
    if (stale.length) {
      await NoteVersion.deleteMany({ _id: { $in: stale } });
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
