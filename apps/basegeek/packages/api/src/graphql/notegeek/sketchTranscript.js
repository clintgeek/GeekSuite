/**
 * sketchTranscript.js — automatic handwriting transcription for sketches
 * (apps/notegeek/DOCS/AUTO_TRANSCRIBE_SPEC.md).
 *
 * The sketch (its tldraw strokes) is the source of truth. A transcript is
 * derived, searchable metadata stored beside it on the Note
 * (`sketchTranscript`), never written into `content`.
 *
 * Who does what:
 *   - The open sketch in the browser decides WHEN (90 s after the last pen
 *     stroke, never on autosave) and draws the page with the same export
 *     Convert uses. It calls `autoTranscribeSketch`.
 *   - This module decides WHETHER and keeps the result honest: it hashes what
 *     is SAVED (never a hash the client claims), skips unchanged content,
 *     lets one request per sketch run (an atomic claim), writes a result only
 *     if no newer claim replaced it, and hands the text to the existing
 *     indexer (`embeddingState: 'stale'`) and word search (`wordText`).
 *
 * The user's own corrections (made in Convert's review box) are kept in
 * `sketchTranscript.edited`, tied to the content hash they were made against.
 * An automatic run never touches them; when the sketch changes later, both
 * the old corrections and the new machine reading stay searchable.
 *
 * Quota: automatic runs share Convert's `transcribe` counter but pass a cap
 * of 30, so they stop once 30 of the day's 40 are used — the last 10 are
 * always Convert's (aiFeatureRunner's claim is `count < cap`).
 */

import mongoose from 'mongoose';
import logger from '../../lib/logger.js';
import Note from './models/Note.js';
import { transcribeSketch as defaultTranscribe } from './transcribe.js';
import { sketchContentHash, hasPhotoPages, sketchSearchText } from './sketchText.js';

export { sketchContentHash, hasPhotoPages, sketchSearchText };

/** Automatic runs stop at 30 of the day's 40; Convert keeps the last 10. */
export const AUTO_TRANSCRIBE_DAILY_CAP = 30;
/** A claim older than this was abandoned (a crashed gateway); it can be retaken. */
export const CLAIM_STALE_MS = 2 * 60 * 1000;
/** Transient failures back off 2 min → 4 → 8 … capped at an hour. */
export const RETRY_BASE_MS = 2 * 60 * 1000;
export const RETRY_MAX_MS = 60 * 60 * 1000;
/** After this many transient failures in a row the content is given up on. */
export const MAX_ATTEMPTS = 6;
/** The preference key notegeek's Settings page writes (User.appPreferences.notegeek). */
export const AUTO_PREF_KEY = 'autoTranscribeSketches';

const log = logger.child({ module: 'notegeek-sketch-transcript' });

// ── state, as the client sees it ───────────────────────────────────────────

/**
 * empty        nothing drawn (no status shown)
 * off          not read automatically (locked/encrypted, photo pages)
 * waiting      the content has no current transcript yet
 * transcribing a request is running
 * searchable   the current content has a transcript (machine or corrected)
 * retry        a transient failure; it will try again after `retryAt`
 * failed       this content could not be read; not retried until it changes
 */
export function transcriptView(note, { now = Date.now(), autoEnabled = true } = {}) {
  const t = note?.sketchTranscript || {};
  const contentHash = note?.type === 'handwritten' ? sketchContentHash(note.content) : null;
  let status;
  if (!contentHash) status = 'empty';
  else if (note.isLocked || note.isEncrypted) status = 'off';
  else if (t.status === 'processing' && t.claimedAt && new Date(t.claimedAt).getTime() > now - CLAIM_STALE_MS) status = 'transcribing';
  else if ((t.hash === contentHash && typeof t.text === 'string') || t.edited?.hash === contentHash) status = 'searchable';
  // Photographed pages are never read automatically (Chef, 2026-11-14: 2a).
  // Their reviewed text, stored when the photo note was made (1b), stays
  // searchable even after S Pen markup changes the hash.
  else if (hasPhotoPages(note.content)) status = 'off';
  else if (t.failedHash === contentHash) status = 'failed';
  else if (t.retryAt && new Date(t.retryAt).getTime() > now) status = 'retry';
  else status = 'waiting';

  const current = status === 'searchable';
  const editedCurrent = t.edited?.hash === contentHash && typeof t.edited?.text === 'string';
  return {
    status,
    contentHash,
    current,
    // What Convert should show for this exact content: the user's
    // corrections if they were made against it, else the machine reading.
    text: current ? (editedCurrent ? t.edited.text : t.text) : null,
    edited: current && editedCurrent,
    source: current ? (editedCurrent ? 'user' : (t.source || null)) : null,
    provider: t.provider || null,
    model: t.model || null,
    at: t.at ? new Date(t.at).toISOString() : null,
    retryAt: status === 'retry' && t.retryAt ? new Date(t.retryAt).toISOString() : null,
    error: status === 'retry' || status === 'failed' ? (t.error || null) : null,
    sentTaskKeys: Array.isArray(t.sentTaskKeys) ? t.sentTaskKeys : [],
    autoEnabled,
  };
}

// ── the preference ─────────────────────────────────────────────────────────

/** On unless the user switched it off (Chef, 2026-11-14: default ON). */
export async function isAutoTranscribeOn(userId) {
  if (!userId || !mongoose.isValidObjectId(userId)) return false;
  try {
    const { User } = await import('../../models/user.js');
    const user = await User.findById(userId).select('appPreferences').lean();
    return user?.appPreferences?.notegeek?.[AUTO_PREF_KEY] !== false;
  } catch (err) {
    // An unreadable preference is a reason not to send anything out.
    log.warn({ err: err?.message }, 'preference read failed; treating automatic transcription as off');
    return false;
  }
}

// ── writes ─────────────────────────────────────────────────────────────────

const NOTE_FIELDS = { type: 1, content: 1, isLocked: 1, isEncrypted: 1, sketchTranscript: 1 };

function notFound() {
  return new Error('Note not found or you do not have permission to edit it');
}

/** Hand changed text to word search and the semantic indexer. Never an edit. */
function indexFields(transcript) {
  return {
    wordText: sketchSearchText(transcript),
    embeddingState: 'stale',
    embeddingAttempts: 0,
    embeddingRetryAt: null,
  };
}

function nextUtcMidnight(now) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

/**
 * Store a successful reading for `hash`, but only while `filter` still holds
 * (the claim is ours). Status is `searchable` when the saved sketch is still
 * the one that was read, `stale` when it changed meanwhile — the text is kept
 * either way (better than nothing), and the newer content gets its own run.
 */
async function storeReading({ noteId, userId, hash, text, provenance, source, filter, now }) {
  const fresh = await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean();
  if (!fresh) return null;
  const stillCurrent = sketchContentHash(fresh.content) === hash;
  // Field by field, never the whole subdocument: `edited` (the user's own
  // corrections) is not part of a reading and must survive any race with one.
  const reading = {
    text,
    hash,
    source,
    provider: provenance?.provider || null,
    model: provenance?.model || null,
    at: new Date(now),
    status: stillCurrent ? 'searchable' : 'stale',
    error: null,
    attempts: 0,
    retryAt: null,
    failedHash: null,
    claimedAt: null,
  };
  const $set = Object.fromEntries(Object.entries(reading).map(([k, v]) => [`sketchTranscript.${k}`, v]));
  const res = await Note.updateOne(
    { _id: noteId, userId, ...filter },
    { $set: { ...$set, ...indexFields({ ...reading, edited: fresh.sketchTranscript?.edited }) } },
    { timestamps: false },
  );
  return res.modifiedCount ? reading : null;
}

/**
 * The automatic run. Returns the transcript state; transcription failures are
 * reported in it (status `retry` / `failed`), never thrown, so the client's
 * background work can't surface as an error.
 */
export async function autoTranscribeSketch({ noteId, userId, image, mediaType, now = Date.now(), transcribe = defaultTranscribe }) {
  if (!mongoose.isValidObjectId(noteId)) throw notFound();
  const note = await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean();
  if (!note) throw notFound();
  const autoEnabled = await isAutoTranscribeOn(userId);
  const view = transcriptView(note, { now, autoEnabled });

  // Nothing to do — and nothing sent: switched off, nothing drawn, not a
  // candidate, already read, given up on, or backing off.
  if (!autoEnabled || note.type !== 'handwritten') return view;
  if (['empty', 'off', 'searchable', 'failed', 'retry', 'transcribing'].includes(view.status)) return view;

  const hash = view.contentHash;
  // One request per sketch: take the claim atomically, or leave it alone.
  const claim = await Note.updateOne(
    {
      _id: noteId,
      userId,
      $or: [
        { 'sketchTranscript.status': { $ne: 'processing' } },
        { 'sketchTranscript.claimedAt': { $lt: new Date(now - CLAIM_STALE_MS) } },
      ],
    },
    { $set: { 'sketchTranscript.status': 'processing', 'sketchTranscript.submittedHash': hash, 'sketchTranscript.claimedAt': new Date(now) } },
    { timestamps: false },
  );
  if (!claim.modifiedCount) {
    return transcriptView(await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean(), { now, autoEnabled });
  }
  const ours = { 'sketchTranscript.submittedHash': hash, 'sketchTranscript.status': 'processing' };

  try {
    const { text, provenance } = await transcribe({ image, mediaType, source: 'sketch', userId, dailyCap: AUTO_TRANSCRIBE_DAILY_CAP });
    await storeReading({ noteId, userId, hash, text, provenance, source: 'auto', filter: ours, now });
  } catch (err) {
    const code = err?.extensions?.code || null;
    const prior = note.sketchTranscript || {};
    const attempts = (prior.submittedHash === hash ? prior.attempts || 0 : 0) + 1;
    // Permanent: the model read this page and the answer was unusable, or the
    // input was refused. Retrying the same page costs a request for the same
    // answer. Transient: an outage, a timeout, today's cap.
    const permanent = code === 'AI_DEGENERATE' || code === 'AI_EMPTY' || code === 'BAD_USER_INPUT' || attempts >= MAX_ATTEMPTS;
    const retryAt = permanent ? null
      : code === 'AI_CAP' ? nextUtcMidnight(now)
        : new Date(now + Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS));
    log.info({ noteId: String(noteId), code, attempts, permanent }, 'automatic transcription did not succeed');
    await Note.updateOne(
      { _id: noteId, userId, ...ours },
      {
        $set: {
          'sketchTranscript.status': permanent ? 'failed' : 'pending',
          'sketchTranscript.failedHash': permanent ? hash : null,
          'sketchTranscript.retryAt': retryAt,
          'sketchTranscript.attempts': attempts,
          'sketchTranscript.error': String(err?.message || 'Transcription failed').slice(0, 300),
          'sketchTranscript.claimedAt': null,
        },
      },
      { timestamps: false },
    );
  }
  return transcriptView(await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean(), { now, autoEnabled });
}

/**
 * Manual Convert read this sketch (it passed `noteId`). Keep the reading so
 * the next automatic run — and the next Convert — doesn't pay for it again.
 * Never takes a claim and never displaces a reading of the same content.
 * Best effort: Convert's own result does not depend on it.
 */
export async function rememberConvertReading({ noteId, userId, text, provenance, now = Date.now() }) {
  try {
    if (!mongoose.isValidObjectId(noteId)) return;
    const note = await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean();
    if (!note || note.type !== 'handwritten' || note.isLocked || note.isEncrypted || hasPhotoPages(note.content)) return;
    const hash = sketchContentHash(note.content);
    if (!hash || note.sketchTranscript?.hash === hash) return;
    await storeReading({
      noteId, userId, hash, text, provenance, source: 'convert', now,
      filter: { 'sketchTranscript.status': { $ne: 'processing' } },
    });
  } catch (err) {
    log.warn({ err: err?.message }, 'could not keep the Convert reading');
  }
}

/**
 * The user corrected a transcript in Convert's review box — or reviewed a
 * photo note's pages when it was made (HANDWRITING.md §3). Kept against the
 * content it was made for; automatic runs never overwrite it.
 */
export async function saveSketchTranscriptEdit({ noteId, userId, text, forHash, now = Date.now() }) {
  if (!mongoose.isValidObjectId(noteId)) throw notFound();
  const note = await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean();
  if (!note) throw notFound();
  if (note.type !== 'handwritten') throw new Error('Only a sketch has a transcript.');
  // No hash from the caller (the photo flow, which never sees one): the text
  // is for the sketch as saved right now.
  const hash = forHash || sketchContentHash(note.content);
  const next = { ...(note.sketchTranscript || {}), edited: { text: String(text), hash, at: new Date(now) } };
  await Note.updateOne(
    { _id: noteId, userId },
    { $set: { 'sketchTranscript.edited': next.edited, ...indexFields(next) } },
    { timestamps: false },
  );
  const autoEnabled = await isAutoTranscribeOn(userId);
  return transcriptView(await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean(), { now, autoEnabled });
}

/** How many sent-line keys a sketch keeps (newest win). */
export const MAX_SENT_TASK_KEYS = 500;

/**
 * Journal lines of this sketch were sent to TodoGeek (BUJO_HANDWRITING.md).
 * Remembered per sketch so the "Send tasks" dialog marks them as sent rather
 * than offering them again. Only keys — the tasks themselves live in TodoGeek.
 */
export async function recordSketchTasksSent({ noteId, userId, keys, now = Date.now() }) {
  if (!mongoose.isValidObjectId(noteId)) throw notFound();
  const note = await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean();
  if (!note) throw notFound();
  if (note.type !== 'handwritten') throw new Error('Only a sketch has journal lines.');
  const merged = [...new Set([...(note.sketchTranscript?.sentTaskKeys || []), ...keys])].slice(-MAX_SENT_TASK_KEYS);
  await Note.updateOne(
    { _id: noteId, userId },
    { $set: { 'sketchTranscript.sentTaskKeys': merged } },
    { timestamps: false },
  );
  const autoEnabled = await isAutoTranscribeOn(userId);
  return transcriptView(await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean(), { now, autoEnabled });
}

export async function getSketchTranscript({ noteId, userId, now = Date.now() }) {
  if (!mongoose.isValidObjectId(noteId)) throw notFound();
  const note = await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean();
  if (!note) throw notFound();
  return transcriptView(note, { now, autoEnabled: await isAutoTranscribeOn(userId) });
}
