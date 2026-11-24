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
 * of 60, so they stop once 60 of the day's 80 are used — the last 20 are
 * always Convert's (aiFeatureRunner's claim is `count < cap`).
 */

import mongoose from 'mongoose';
import logger from '../../lib/logger.js';
import Note, { staleIndexFields } from './models/Note.js';
import { transcribeSketch as defaultTranscribe } from './transcribe.js';
import { sketchContentHash, hasPhotoPages, sketchSearchText, hasAnyShape, hasPaperSheet, correctionsStillApply } from './sketchText.js';
import { previewFor, DERIVED_VERSION } from './noteDerived.js';

export { sketchContentHash, hasPhotoPages, sketchSearchText };

/** Automatic runs stop at 60 of the day's 80; Convert keeps the last 20. */
export const AUTO_TRANSCRIBE_DAILY_CAP = 60;
/**
 * Reads asked for by the background reader (`sketchesToTranscribe`: pages
 * nobody has open) stop at 40, so a backlog of old pages can never use up the
 * reads the page being written on today needs.
 */
export const BACKGROUND_DAILY_CAP = 40;
/** A page is left alone until it has been unchanged this long (the same 90 s the open sketch waits). */
export const QUIET_MS = 90 * 1000;
/** The hash rule: 2 leaves a template sheet out (2026-11-22). */
export const HASH_VERSION = 2;
/** A claim older than this was abandoned (a crashed gateway); it can be retaken. */
export const CLAIM_STALE_MS = 2 * 60 * 1000;
/** Transient failures back off 2 min → 4 → 8 … capped at an hour. */
export const RETRY_BASE_MS = 2 * 60 * 1000;
export const RETRY_MAX_MS = 60 * 60 * 1000;
/**
 * After this many failures that say something about THIS page (an error the
 * model or the pipeline raised for it) the content is given up on. An outage
 * (AI_UNAVAILABLE: provider down, timeout) or today's cap (AI_CAP) says
 * nothing about the page: those back off and retry but never count, so six
 * capped days no longer mark a sketch `failed` (2026-11-15).
 */
export const MAX_ATTEMPTS = 6;
/** Failures that are about the service or the day, not the page. */
export const NOT_THE_PAGE = new Set(['AI_UNAVAILABLE', 'AI_CAP']);
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
/**
 * The content hash remembered on the note, when it is still for this content
 * (same length and updatedAt as when it was computed); undefined otherwise.
 */
export function rememberedHash(note) {
  const h = note?.sketchHash;
  if (!h || !note?.updatedAt || !h.at || typeof note.content !== 'string') return undefined;
  if (h.len !== note.content.length || new Date(h.at).getTime() !== new Date(note.updatedAt).getTime()) return undefined;
  // Computed when a template sheet still counted as drawing: only wrong for a page that has one.
  if (h.v !== HASH_VERSION && hasPaperSheet(note.content)) return undefined;
  return h.value ?? null;
}

/**
 * The sketch's content hash: remembered on the note when it is still valid,
 * else computed once and remembered (a conditional write, so it never lands
 * on newer content). Never computed on save: autosave runs every couple of
 * seconds while drawing, a transcript read once per saved drawing.
 */
export async function contentHashOf(note) {
  if (note?.type !== 'handwritten') return null;
  const known = rememberedHash(note);
  if (known !== undefined) return known;
  const value = sketchContentHash(note.content);
  if (note._id && note.updatedAt && typeof note.content === 'string') {
    try {
      await Note.updateOne(
        { _id: note._id, updatedAt: note.updatedAt },
        { $set: { sketchHash: { value, len: note.content.length, at: note.updatedAt, v: HASH_VERSION, photo: value ? hasPhotoPages(note.content) : false } } },
        { timestamps: false },
      );
    } catch (err) {
      log.warn({ err: err?.message }, 'could not remember the sketch hash');
    }
  }
  return value;
}

export function transcriptView(note, { now = Date.now(), autoEnabled = true, contentHash: knownHash } = {}) {
  const t = note?.sketchTranscript || {};
  let contentHash = null;
  if (note?.type === 'handwritten') {
    const remembered = knownHash !== undefined ? knownHash : rememberedHash(note);
    contentHash = remembered !== undefined ? remembered : sketchContentHash(note.content);
  }
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
    sentTaskTexts: Array.isArray(t.sentTaskTexts) ? t.sentTaskTexts : [],
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

const NOTE_FIELDS = { type: 1, content: 1, isLocked: 1, isEncrypted: 1, sketchTranscript: 1, sketchHash: 1, updatedAt: 1 };

/** The note's transcript state, hashing through the remembered hash. */
async function viewOf(note, { now, autoEnabled }) {
  return transcriptView(note, { now, autoEnabled, contentHash: await contentHashOf(note) });
}
const readView = async (noteId, userId, opts) => viewOf(await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean(), opts);

function notFound() {
  return new Error('Note not found or you do not have permission to edit it');
}

/**
 * Hand changed text to word search, the list preview and the semantic
 * indexer. Never an edit. `note` is the stored note (lock flags).
 */
function indexFields(transcript, note = {}) {
  return {
    wordText: sketchSearchText(transcript),
    preview: previewFor({ type: 'handwritten', sketchTranscript: transcript, isLocked: note.isLocked, isEncrypted: note.isEncrypted }),
    derivedV: DERIVED_VERSION,
    ...staleIndexFields(),
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
  // Everything was erased while the page was being read: what was read is no
  // longer on it, so it is not stored (or it would be searchable forever —
  // an empty sketch is never read again). The claim is released.
  if (!hasAnyShape(fresh.content)) {
    await Note.updateOne(
      { _id: noteId, userId, ...filter },
      { $set: { 'sketchTranscript.status': 'pending', 'sketchTranscript.claimedAt': null } },
      { timestamps: false },
    );
    return null;
  }
  const stillCurrent = (await contentHashOf(fresh)) === hash;
  // Corrections made for an older drawing: still searchable while that
  // drawing is still on the page (the reading they corrected is mostly in
  // this one), not once it was erased or rewritten.
  const prior = fresh.sketchTranscript || {};
  let editedSearchable = prior.editedSearchable !== false;
  if (prior.edited && prior.edited.hash !== hash && prior.edited.hash === prior.hash) {
    editedSearchable = correctionsStillApply(prior.text, text);
  }
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
    retries: 0,
    retryAt: null,
    failedHash: null,
    claimedAt: null,
    editedSearchable,
  };
  const $set = Object.fromEntries(Object.entries(reading).map(([k, v]) => [`sketchTranscript.${k}`, v]));
  const res = await Note.updateOne(
    { _id: noteId, userId, ...filter },
    { $set: { ...$set, ...indexFields({ ...reading, edited: fresh.sketchTranscript?.edited }, fresh) } },
    { timestamps: false },
  );
  return res.modifiedCount ? reading : null;
}

/**
 * The automatic run. Returns the transcript state; transcription failures are
 * reported in it (status `retry` / `failed`), never thrown, so the client's
 * background work can't surface as an error.
 */
export async function autoTranscribeSketch({ noteId, userId, image, mediaType, background = false, now = Date.now(), transcribe = defaultTranscribe, validate = null }) {
  if (!mongoose.isValidObjectId(noteId)) throw notFound();
  const note = await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean();
  if (!note) throw notFound();
  const autoEnabled = await isAutoTranscribeOn(userId);
  const view = await viewOf(note, { now, autoEnabled });

  // Nothing to do — and nothing sent: switched off, nothing drawn, not a
  // candidate, already read, given up on, or backing off.
  if (!autoEnabled || note.type !== 'handwritten') return view;
  if (['empty', 'off', 'searchable', 'failed', 'retry', 'transcribing'].includes(view.status)) return view;

  // Only now is the image worth checking (and a bad one is refused before
  // any claim or model call).
  if (validate) ({ image, mediaType } = validate({ image, mediaType }));

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
  if (!claim.modifiedCount) return readView(noteId, userId, { now, autoEnabled });
  const ours = { 'sketchTranscript.submittedHash': hash, 'sketchTranscript.status': 'processing' };

  try {
    // On a template sheet, the client sends the form with the writing (T6).
    const { text, provenance } = await transcribe({ image, mediaType, source: hasPaperSheet(note.content) ? 'form' : 'sketch', userId, dailyCap: background ? BACKGROUND_DAILY_CAP : AUTO_TRANSCRIBE_DAILY_CAP });
    await storeReading({ noteId, userId, hash, text, provenance, source: 'auto', filter: ours, now });
  } catch (err) {
    const code = err?.extensions?.code || null;
    const prior = note.sketchTranscript || {};
    const samePage = prior.submittedHash === hash;
    // An outage or today's cap is about the service, not this page: it backs
    // off but never counts toward giving up (NOT_THE_PAGE).
    const counts = !NOT_THE_PAGE.has(code);
    const attempts = (samePage ? prior.attempts || 0 : 0) + (counts ? 1 : 0);
    const retries = (samePage ? prior.retries || 0 : 0) + 1;
    // Permanent: the model read this page and the answer was unusable, or the
    // input was refused. Retrying the same page costs a request for the same
    // answer.
    const permanent = code === 'AI_DEGENERATE' || code === 'AI_EMPTY' || code === 'BAD_USER_INPUT' || attempts >= MAX_ATTEMPTS;
    const retryAt = permanent ? null
      : code === 'AI_CAP' ? nextUtcMidnight(now)
        : new Date(now + Math.min(RETRY_BASE_MS * 2 ** (retries - 1), RETRY_MAX_MS));
    log.info({ noteId: String(noteId), code, attempts, retries, permanent }, 'automatic transcription did not succeed');
    await Note.updateOne(
      { _id: noteId, userId, ...ours },
      {
        $set: {
          'sketchTranscript.status': permanent ? 'failed' : 'pending',
          'sketchTranscript.failedHash': permanent ? hash : null,
          'sketchTranscript.retryAt': retryAt,
          'sketchTranscript.attempts': attempts,
          'sketchTranscript.retries': retries,
          'sketchTranscript.error': String(err?.message || 'Transcription failed').slice(0, 300),
          'sketchTranscript.claimedAt': null,
        },
      },
      { timestamps: false },
    );
  }
  return readView(noteId, userId, { now, autoEnabled });
}

/**
 * The caller's sketches that are waiting to be read and that nobody is
 * writing on: newest first, at most `limit` ids.
 *
 * Only a browser can draw a page (AUTO_TRANSCRIBE_SPEC.md), and until
 * 2026-11-22 only the browser that had the sketch OPEN did: a page left
 * within 90 s, a tablet closed at the end of a meeting, or a GeekDay page
 * (never opened in NoteGeek at all) stayed unsearchable until somebody opened
 * it there. Now any open app asks this, draws each page off-screen and sends
 * it to `autoTranscribeSketch(background: true)`.
 *
 * Mongo rules out, without loading a drawing, everything whose remembered
 * hash says it is settled (read, corrected, given up on, empty, photo pages),
 * everything locked, deleted or backing off, and everything changed in the
 * last QUIET_MS. What is left is loaded and judged by the same `transcriptView`
 * the open sketch uses, which also remembers its hash, so a settled sketch is
 * loaded here once.
 */
export async function sketchesToTranscribe({ userId, limit = 3, now = Date.now(), quietMs = QUIET_MS }) {
  if (!userId || !mongoose.isValidObjectId(userId)) return [];
  if (!(await isAutoTranscribeOn(userId))) return [];
  const want = Math.min(10, Math.max(1, Math.floor(Number(limit)) || 3));
  const hash = '$sketchHash.value';
  const settled = {
    $and: [
      { $eq: ['$sketchHash.at', '$updatedAt'] },
      {
        $or: [
          { $eq: [{ $ifNull: [hash, null] }, null] },
          { $eq: ['$sketchHash.photo', true] },
          { $eq: ['$sketchTranscript.hash', hash] },
          { $eq: ['$sketchTranscript.edited.hash', hash] },
          { $eq: ['$sketchTranscript.failedHash', hash] },
        ],
      },
    ],
  };
  const candidates = await Note.find(
    {
      userId,
      type: 'handwritten',
      deletedAt: null,
      isLocked: { $ne: true },
      isEncrypted: { $ne: true },
      updatedAt: { $lt: new Date(now - quietMs) },
      'sketchTranscript.retryAt': { $not: { $gt: new Date(now) } },
      $expr: { $not: [settled] },
    },
    { _id: 1 },
  ).sort({ updatedAt: -1 }).limit(want * 4).lean();

  const ids = [];
  for (const { _id } of candidates) {
    if (ids.length >= want) break;
    // One drawing in memory at a time: they run to megabytes.
    // eslint-disable-next-line no-await-in-loop
    const note = await Note.findOne({ _id, userId }, NOTE_FIELDS).lean();
    if (!note) continue;
    // eslint-disable-next-line no-await-in-loop
    const view = await viewOf(note, { now, autoEnabled: true });
    if (view.status === 'waiting') ids.push(String(_id));
    else if (view.status === 'off' && note.sketchHash?.photo !== true) {
      // A hash remembered before `photo` was: say so, or it is loaded every time.
      // eslint-disable-next-line no-await-in-loop
      await Note.updateOne({ _id, updatedAt: note.updatedAt, 'sketchHash.at': note.updatedAt }, { $set: { 'sketchHash.photo': true } }, { timestamps: false })
        .catch((err) => log.warn({ err: err?.message }, 'could not mark a photo sketch'));
    }
  }
  return ids;
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
    const hash = await contentHashOf(note);
    if (!hash || note.sketchTranscript?.hash === hash) return;
    // Never over a running automatic read — but a claim older than
    // CLAIM_STALE_MS is a crashed gateway's (every push restarts it), not a
    // running read. Before 2026-11-15 such a claim made every later Convert
    // reading be paid for and thrown away.
    await storeReading({
      noteId, userId, hash, text, provenance, source: 'convert', now,
      filter: {
        $or: [
          { 'sketchTranscript.status': { $ne: 'processing' } },
          { 'sketchTranscript.claimedAt': { $lt: new Date(now - CLAIM_STALE_MS) } },
          { 'sketchTranscript.claimedAt': null },
        ],
      },
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
  const hash = forHash || await contentHashOf(note);
  const next = { ...(note.sketchTranscript || {}), edited: { text: String(text), hash, at: new Date(now) }, editedSearchable: true };
  await Note.updateOne(
    { _id: noteId, userId },
    { $set: { 'sketchTranscript.edited': next.edited, 'sketchTranscript.editedSearchable': true, ...indexFields(next, note) } },
    { timestamps: false },
  );
  const autoEnabled = await isAutoTranscribeOn(userId);
  return readView(noteId, userId, { now, autoEnabled });
}

/**
 * The `sketchTranscript` a sketch is CREATED with when its reviewed reading
 * comes with it (a photo note, C6): the corrections, for the content being
 * saved. One write, so the note is searchable even if no later save lands.
 */
export function transcriptForCreate({ content, text, now = Date.now() }) {
  return {
    status: 'pending',
    edited: { text: String(text), hash: sketchContentHash(content), at: new Date(now) },
  };
}

/** How many sent-line keys (and texts) a sketch keeps (newest win). */
export const MAX_SENT_TASK_KEYS = 500;
/** A sent line's text is kept to this many characters. */
export const SENT_TASK_TEXT_MAX = 300;

/**
 * Journal lines of this sketch were sent to TodoGeek (BUJO_HANDWRITING.md).
 * Remembered per sketch so the "Send tasks" dialog marks them as sent rather
 * than offering them again. Keys — and, from newer clients, the text sent —
 * never the tasks themselves (they live in TodoGeek).
 *
 * `$addToSet` with `$each`, then a trim to the newest MAX_SENT_TASK_KEYS: two
 * sends that overlap both land. The old read-merge-`$set` let the second
 * write replace the first one's keys (2026-11-15, plan 1.11).
 */
export async function recordSketchTasksSent({ noteId, userId, keys, texts = [], now = Date.now() }) {
  if (!mongoose.isValidObjectId(noteId)) throw notFound();
  const note = await Note.findOne({ _id: noteId, userId }, { type: 1 }).lean();
  if (!note) throw notFound();
  if (note.type !== 'handwritten') throw new Error('Only a sketch has journal lines.');
  const cleanTexts = [...new Set((texts || []).map((t) => String(t).replace(/\s+/g, ' ').trim().slice(0, SENT_TASK_TEXT_MAX)).filter(Boolean))];
  await Note.updateOne(
    { _id: noteId, userId },
    {
      $addToSet: {
        'sketchTranscript.sentTaskKeys': { $each: keys },
        ...(cleanTexts.length ? { 'sketchTranscript.sentTaskTexts': { $each: cleanTexts } } : {}),
      },
    },
    { timestamps: false },
  );
  for (const field of ['sentTaskKeys', 'sentTaskTexts']) {
    // eslint-disable-next-line no-await-in-loop
    await Note.updateOne(
      { _id: noteId, userId, [`sketchTranscript.${ field }.${ MAX_SENT_TASK_KEYS }`]: { $exists: true } },
      { $push: { [`sketchTranscript.${ field }`]: { $each: [], $slice: -MAX_SENT_TASK_KEYS } } },
      { timestamps: false },
    );
  }
  const autoEnabled = await isAutoTranscribeOn(userId);
  return readView(noteId, userId, { now, autoEnabled });
}

export async function getSketchTranscript({ noteId, userId, now = Date.now() }) {
  if (!mongoose.isValidObjectId(noteId)) throw notFound();
  const note = await Note.findOne({ _id: noteId, userId }, NOTE_FIELDS).lean();
  if (!note) throw notFound();
  return viewOf(note, { now, autoEnabled: await isAutoTranscribeOn(userId) });
}
