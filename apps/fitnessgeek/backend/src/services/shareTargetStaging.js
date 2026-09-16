// Short-lived, in-memory holding pen for a file that just arrived via the
// Android share sheet (Web Share Target `POST` action) before an
// authenticated app instance claims it.
//
// ## Why this exists
//
// A share-target POST is a browser-initiated top-level navigation from the
// OS, not a fetch from this app's own JS — see the CSRF discussion in
// `shareTargetController.js`. Rather than treat that POST as a trusted,
// user-attributed write, it only stages the raw bytes here under a random,
// single-use id and then 303-redirects the browser to a page inside the
// installed app. That page (running with full cookies + CSRF header
// machinery, exactly like every other authenticated call this app makes)
// fetches the staged bytes and re-POSTs them through the normal
// authenticated `/api/body-comp/uploads` endpoint, which is what actually
// persists anything.
//
// So this store never needs to know who the file belongs to, is never
// queried by anyone but the single client that receives the redirect, and
// self-destructs on first read or after a short TTL — whichever comes
// first. It deliberately is NOT disk-backed: the data is transient by
// design (seconds, not minutes) and does not need to survive a process
// restart. If a deploy/Watchtower restart happens to land in that window,
// the claim simply 404s and the frontend falls back to asking the user to
// pick the file again via the plain <input type="file"> control.

import crypto from 'crypto';
import logger from '../config/logger.js';

const STAGE_TTL_MS = 5 * 60 * 1000; // 5 minutes — generous for "share, then the app opens"
const MAX_STAGED_ENTRIES = 50; // small deployment; bounds worst-case memory if sweeps fall behind

const staged = new Map();

function sweepExpired() {
  const now = Date.now();
  for (const [id, entry] of staged) {
    if (entry.expiresAt <= now) staged.delete(id);
  }
}

// Runs regardless of whether anything is currently staged; `.unref()` so it
// never keeps the process alive on its own (matters for tests and for a
// clean `server.close()` shutdown).
const sweepTimer = setInterval(sweepExpired, 60 * 1000);
sweepTimer.unref?.();

/**
 * Stage a buffer for pickup. Returns the id the caller redirects the
 * browser to.
 */
export function stageFile({ buffer, mimeType, originalName }) {
  sweepExpired();

  if (staged.size >= MAX_STAGED_ENTRIES) {
    // Evict the oldest entry rather than grow unbounded. A share sheet is a
    // low-volume, single-user path; this is a safety valve, not an expected
    // condition.
    const oldestId = staged.keys().next().value;
    if (oldestId !== undefined) staged.delete(oldestId);
    logger.warn({ maxEntries: MAX_STAGED_ENTRIES }, 'shareTargetStaging: evicted oldest entry, staging area at capacity');
  }

  const id = crypto.randomUUID();
  staged.set(id, {
    buffer,
    mimeType,
    originalName: originalName || null,
    expiresAt: Date.now() + STAGE_TTL_MS,
  });
  return id;
}

/**
 * Claim a staged file by id. Single-use: a second call for the same id
 * returns null, same as an expired or unknown id.
 */
export function consumeStagedFile(id) {
  if (!id) return null;
  sweepExpired();
  const entry = staged.get(id);
  if (!entry) return null;
  staged.delete(id);
  return entry;
}

/** Test/shutdown helper — not used by production code paths. */
export function __clearAllStagedForTests() {
  staged.clear();
}
