/**
 * sketchText.js — the pure half of automatic transcription: what a sketch's
 * content hash is, and what search reads from its transcript. No Mongo, no
 * network, nothing from the AI stack, so chunking.js (which must import
 * nothing that could send note text anywhere) can use it.
 */
import { createHash } from 'node:crypto';

/** What the prompt answers for an empty page (transcribe.js rule 7). */
export const NO_WRITING = '[no writing]';

// ── content hash ───────────────────────────────────────────────────────────

/**
 * JSON with object keys sorted, so the hash does not depend on key order.
 * Byte-for-byte what `JSON.stringify` of a key-sorted copy gives (stored
 * hashes depend on it — a different string would re-read every sketch). The
 * sorted key order is cached per key set: a sketch is thousands of points
 * with the same three keys. ~30% faster than sorting every object (2026-11-15,
 * 6 MB snapshot: 390 ms → 270 ms); the bigger win is not recomputing it at all
 * (sketchTranscript.js keeps the hash on the note).
 */
const keyOrders = new Map();
function keyOrder(keys) {
  const sig = keys.join('\u0000');
  let order = keyOrders.get(sig);
  if (!order) {
    order = keys.slice().sort().map((k) => [k, `${JSON.stringify(k)}:`]);
    if (keyOrders.size > 5000) keyOrders.clear();
    keyOrders.set(sig, order);
  }
  return order;
}
export function stable(value) {
  if (Array.isArray(value)) {
    let s = '[';
    for (let i = 0; i < value.length; i += 1) { if (i) s += ','; s += stable(value[i]); }
    return `${s}]`;
  }
  if (value && typeof value === 'object') {
    const order = keyOrder(Object.keys(value));
    let s = '{';
    for (let i = 0; i < order.length; i += 1) { if (i) s += ','; s += order[i][1] + stable(value[order[i][0]]); }
    return `${s}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * A template sheet (DOCS/TEMPLATES_SPEC.md): the printed form under the ink,
 * one locked image shape and its asset. It is paper, not writing — never part
 * of the hash (placing or moving it is no reason to read the page), never a
 * "photographed page" (that switched automatic reading OFF for every sketch
 * on a template until 2026-11-22), and a page with nothing else is empty.
 * Same test as `isPaperSheetShape` in @geeksuite/ui.
 */
export const PAPER_SHEET_SHAPE_ID = 'shape:paper-template';
const isSheetRecord = (r) => r.id === PAPER_SHEET_SHAPE_ID || typeof r.meta?.paperTemplate === 'string';
const SHEET_ID_TEXT = `"id":"${PAPER_SHEET_SHAPE_ID}"`;
/** Does this snapshot carry a template sheet? A text scan, not a parse. */
export const hasPaperSheet = (content) => typeof content === 'string' && content.includes(SHEET_ID_TEXT);

/** The tldraw records that make up what is WRITTEN on the page: shapes and their assets, never a template sheet. */
function pageRecords(content) {
  let parsed;
  try {
    parsed = JSON.parse(String(content ?? ''));
  } catch {
    return [];
  }
  const store = parsed?.store && typeof parsed.store === 'object' ? parsed.store : {};
  return Object.values(store)
    .filter((r) => r && (r.typeName === 'shape' || r.typeName === 'asset') && !isSheetRecord(r))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * A hash of the sketch content that matters to a transcription: shape and
 * asset records only. The camera, selection, page names, the document record
 * (where the paper colour lives) and everything outside the snapshot (title,
 * tags) are left out, so none of them can trigger a transcription. `null`
 * for a sketch with nothing drawn.
 */
export function sketchContentHash(content) {
  const records = pageRecords(content);
  if (!records.some((r) => r.typeName === 'shape')) return null;
  const h = createHash('sha256');
  for (const r of records) h.update(stable(r)).update('\n');
  return h.digest('hex');
}

/** Photographed pages (HANDWRITING.md §3) keep manual Convert; they are not auto-read. */
export function hasPhotoPages(content) {
  return pageRecords(content).some((r) => r.typeName === 'shape' && r.type === 'image');
}

// ── what search sees ───────────────────────────────────────────────────────

/**
 * Does a tldraw snapshot have anything drawn on it? A text scan, not a parse:
 * cheap enough to run on every sketch save (a 6 MB snapshot in well under a
 * millisecond when it has shapes). A template sheet alone is not "drawn".
 */
export function hasAnyShape(content) {
  const text = String(content ?? '');
  const shape = /"typeName"\s*:\s*"shape"/g;
  if (!shape.test(text)) return false;
  // A template sheet is one shape record: with a sheet, it takes a second.
  return hasPaperSheet(text) ? shape.test(text) : true;
}

/**
 * The searchable text of a transcript: the machine reading plus the user's
 * corrections when they differ. "[no writing]" is not text.
 *
 * Corrections made for an older drawing stay searchable while that drawing
 * is still on the page (ink was added: the new reading keeps most of the old
 * one's lines), and stop being searchable once it is not (erased or
 * rewritten) — `editedSearchable`, decided when a new reading lands
 * (sketchTranscript.js `correctionsStillApply`). Before 2026-11-15 they stayed
 * findable forever.
 */
export function sketchSearchText(transcript) {
  const parts = [];
  const edited = transcript?.edited;
  const editedCounts = Boolean(edited) && (edited.hash === transcript?.hash || transcript?.editedSearchable !== false);
  for (const t of [transcript?.text, editedCounts ? edited?.text : null]) {
    const s = typeof t === 'string' ? t.trim() : '';
    if (s && s !== NO_WRITING && !parts.includes(s)) parts.push(s);
  }
  return parts.join('\n\n');
}

const lineSet = (text) => new Set(String(text ?? '').split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean));

/**
 * Do corrections made against reading `before` still describe a page now
 * read as `after`? True when at least half of `before`'s lines are still
 * there (ink was added around them); false when most are gone.
 */
export function correctionsStillApply(before, after) {
  const old = lineSet(before);
  if (!old.size) return true;
  const now = lineSet(after);
  let kept = 0;
  for (const l of old) if (now.has(l)) kept += 1;
  return kept / old.size >= 0.5;
}
