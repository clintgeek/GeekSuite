/**
 * Recently deleted, for stories (SUITE_REVIEW_2026-11 decision S-D5,
 * built 2026-11-16 on BookGeek's and NoteGeek's model).
 *
 * A delete sets `deletedAt` and leaves the whole story — transcript, canon,
 * checkpoints — where it is. `hideDeletedStories` (models/Story.js) keeps it
 * out of every ordinary read meanwhile, so it cannot be listed, opened,
 * played, exported or have its characters edited. Restore clears
 * `deletedAt`. "Delete forever" removes one story at once, and only one that
 * is in the trash, so a stale tap cannot destroy a story that was restored.
 *
 * The purge is LAZY, like NoteGeek's and BookGeek's — run on every delete
 * and whenever Recently deleted is listed — so there is no job to keep alive.
 * Every query here names `deletedAt`, which is what lets it past the hook.
 */

/** 30 days. The confirm dialog and Recently deleted say this number. */
export const STORY_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const STORY_TRASH_RETENTION_DAYS = 30;

const IN_TRASH = Object.freeze({ $ne: null });

/** When a story deleted at `deletedAt` will be purged. */
export function purgeAtFor(deletedAt) {
  if (!deletedAt) return null;
  return new Date(new Date(deletedAt).getTime() + STORY_TRASH_RETENTION_MS);
}

/**
 * Move a story to Recently deleted. Resolves to 'deleted', 'already' (it was
 * in the trash) or 'missing' (no such story for this user).
 */
export async function softDeleteStory(Story, { storyId, userId, now = Date.now() }) {
  const res = await Story.updateOne(
    { _id: storyId, userId, deletedAt: null },
    { $set: { deletedAt: new Date(now) }, $unset: { turnLock: '' } }
  );
  if ((res?.matchedCount ?? res?.n ?? 0) > 0) return 'deleted';
  const inTrash = await Story.exists({ _id: storyId, userId, deletedAt: IN_TRASH });
  return inTrash ? 'already' : 'missing';
}

/** Bring a story back. Resolves to 'restored' or 'missing' (not in this user's trash). */
export async function restoreStory(Story, { storyId, userId }) {
  const res = await Story.updateOne(
    { _id: storyId, userId, deletedAt: IN_TRASH },
    // A lock left over from before the delete would otherwise block the
    // first turn after a restore until it expired.
    { $set: { deletedAt: null }, $unset: { turnLock: '' } }
  );
  return (res?.matchedCount ?? res?.n ?? 0) > 0 ? 'restored' : 'missing';
}

/** Remove one story in this user's trash for good. Resolves to true when one went. */
export async function purgeStory(Story, { storyId, userId }) {
  const res = await Story.deleteOne({ _id: storyId, userId, deletedAt: IN_TRASH });
  return (res?.deletedCount ?? 0) > 0;
}

/** Purge every story deleted over 30 days ago. Never throws: a purge failure is not the caller's problem. */
export async function purgeExpiredStories(Story, now = Date.now()) {
  try {
    const res = await Story.deleteMany({
      deletedAt: { $ne: null, $lt: new Date(now - STORY_TRASH_RETENTION_MS) },
    });
    const purged = res?.deletedCount ?? 0;
    if (purged) console.info(`[storygeek] ${purged} expired deleted stories purged`);
    return purged;
  } catch (error) {
    console.warn('[storygeek] purge of expired deleted stories failed:', error?.message);
    return 0;
  }
}

/** This user's Recently deleted, newest first, with when each will be purged. */
export async function listDeletedStories(Story, { userId }) {
  const rows = await Story.find({ userId, deletedAt: IN_TRASH })
    .select('title genre status stats deletedAt createdAt updatedAt')
    .sort({ deletedAt: -1 })
    .lean();
  return (rows || []).map((row) => ({ ...row, purgeAt: purgeAtFor(row.deletedAt) }));
}

export default {
  STORY_TRASH_RETENTION_MS, STORY_TRASH_RETENTION_DAYS,
  purgeAtFor, softDeleteStory, restoreStory, purgeStory, purgeExpiredStories, listDeletedStories,
};
