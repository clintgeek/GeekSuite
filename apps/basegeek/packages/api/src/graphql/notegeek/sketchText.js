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

/** JSON with object keys sorted, so the hash does not depend on key order. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The tldraw records that make up what is ON the page: shapes and their assets. */
function pageRecords(content) {
  let parsed;
  try {
    parsed = JSON.parse(String(content ?? ''));
  } catch {
    return [];
  }
  const store = parsed?.store && typeof parsed.store === 'object' ? parsed.store : {};
  return Object.values(store)
    .filter((r) => r && (r.typeName === 'shape' || r.typeName === 'asset'))
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
 * The searchable text of a transcript: the machine reading plus the user's
 * corrections when they differ. "[no writing]" is not text.
 */
export function sketchSearchText(transcript) {
  const parts = [];
  for (const t of [transcript?.text, transcript?.edited?.text]) {
    const s = typeof t === 'string' ? t.trim() : '';
    if (s && s !== NO_WRITING && !parts.includes(s)) parts.push(s);
  }
  return parts.join('\n\n');
}
