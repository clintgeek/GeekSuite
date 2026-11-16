/**
 * turnLockService — one turn at a time per story, and a turn the client
 * already sent is never played twice (SUITE_REVIEW_2026-11 items 4 and 5).
 *
 * THE LOCK. A turn is a 1–3 minute request that loads the whole story,
 * makes two or three AI calls and saves the whole document at the end. Two
 * of them at once (two devices, or a resend racing the original) both bill
 * the AI calls and then either throw a VersionError or overwrite each
 * other's canon and turnNumber. `acquire` takes `story.turnLock` with ONE
 * atomic findOneAndUpdate that matches only when there is no live lock, so
 * of two racing requests exactly one gets the document back. The lock
 * carries `expiresAt` (TURN_LOCK_TTL_MS): a turn whose process died or hung
 * never holds the story past that, because an expired lock is free to take.
 * `release` clears it only if the token is still ours, so a turn that ran
 * past its expiry cannot release a lock someone else has since taken.
 *
 * THE RECEIPTS. The client sends a `clientId` per turn and keeps it when it
 * resends the same words. When a turn that carried one is saved, a receipt
 * `{ clientId, turnNumber, response }` is pushed in the SAME save
 * (`recordReceipt` before `story.save()`), so "the turn landed" and "the
 * receipt exists" cannot disagree. A repeat of that clientId is answered
 * from the receipt — the same response, `replayed: true` — and no AI call is
 * made. Only the last MAX_TURN_RECEIPTS are kept; a client only ever retries
 * its most recent turn.
 */
import crypto from 'node:crypto';

/** Longer than any honest turn (two 45s GM calls + a 45s extraction + context) and the client's 180s timeout. */
export const TURN_LOCK_TTL_MS = 5 * 60 * 1000;
export const MAX_TURN_RECEIPTS = 10;

/** Is this lock held right now (present and not expired)? */
export function isLockLive(lock, now = Date.now()) {
  if (!lock || !lock.expiresAt) return false;
  return new Date(lock.expiresAt).getTime() > now;
}

/** The filter that matches a story whose lock is free (absent, cleared or expired). */
export function freeLockFilter(now = new Date()) {
  return {
    $or: [
      { 'turnLock.expiresAt': null },
      { 'turnLock.expiresAt': { $lte: now } },
    ],
  };
}

/**
 * Take the story's turn lock. Resolves to `{ story, token }` (the fresh,
 * hydrated document to run the turn on) or `null` when another turn holds it
 * — or when the story is gone/deleted, which the caller tells apart by
 * re-reading.
 */
export async function acquire(Story, { storyId, userId, clientId = null, now = Date.now(), ttlMs = TURN_LOCK_TTL_MS }) {
  const token = crypto.randomUUID();
  const at = new Date(now);
  const story = await Story.findOneAndUpdate(
    { _id: storyId, userId, ...freeLockFilter(at) },
    { $set: { turnLock: { token, clientId: clientId || null, startedAt: at, expiresAt: new Date(now + ttlMs) } } },
    { new: true }
  );
  return story ? { story, token } : null;
}

/** Let the lock go — only if it is still the one this turn took. Never throws. */
export async function release(Story, { storyId, token }) {
  if (!token) return;
  try {
    await Story.updateOne({ _id: storyId, 'turnLock.token': token }, { $unset: { turnLock: '' } });
  } catch (error) {
    // The expiry is the backstop; a failed release costs at most TTL.
    console.error('Turn lock release failed (it will expire):', error.message);
  }
}

/** The receipt for a clientId on this story, or null. */
export function findReceipt(story, clientId) {
  if (!clientId) return null;
  const receipts = Array.isArray(story?.turnReceipts) ? story.turnReceipts : [];
  for (let i = receipts.length - 1; i >= 0; i -= 1) {
    if (receipts[i] && receipts[i].clientId === clientId) return receipts[i];
  }
  return null;
}

/**
 * Add a receipt to the in-memory story, trimmed to the newest
 * MAX_TURN_RECEIPTS. Call immediately before the turn's `story.save()`.
 * A turn without a clientId (an older client) leaves no receipt.
 */
export function recordReceipt(story, clientId, { turnNumber = 0, response = {} } = {}) {
  if (!clientId) return;
  const kept = (Array.isArray(story.turnReceipts) ? [...story.turnReceipts] : [])
    .filter((r) => r && r.clientId !== clientId);
  // A detached copy: the payload object goes on to be returned (and, under
  // `debug`, extended) after the save.
  kept.push({ clientId, turnNumber, response: JSON.parse(JSON.stringify(response)), createdAt: new Date() });
  story.turnReceipts = kept.slice(-MAX_TURN_RECEIPTS);
}

/** The body a repeat gets: what the turn answered the first time, marked as a replay. */
export function replayBody(receipt) {
  const response = receipt?.response && typeof receipt.response === 'object' ? receipt.response : {};
  return { ...response, replayed: true, clientId: receipt.clientId };
}

/** What the turn-status read and getStory say about a lock (never the token). */
export function describeLock(lock, now = Date.now()) {
  if (!isLockLive(lock, now)) return null;
  return {
    clientId: lock.clientId || null,
    startedAt: lock.startedAt || null,
    expiresAt: lock.expiresAt,
  };
}

export default {
  TURN_LOCK_TTL_MS, MAX_TURN_RECEIPTS,
  isLockLive, freeLockFilter, acquire, release,
  findReceipt, recordReceipt, replayBody, describeLock,
};
