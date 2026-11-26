/**
 * noteLists.js — what a note list reads, and how it pages.
 *
 * ## Reading only what was asked for (plan 5.1)
 *
 * A sketch's `content` is a tldraw snapshot of up to 5 MB, and the list used
 * to load and send the full content of up to 200 notes on every visit. When a
 * query's selection does not include `content`, the find leaves it — and the
 * other bulky bookkeeping fields — out (`noteProjection`). `preview` is what
 * a list row shows instead.
 *
 * ## Keyset paging (plan 5.2)
 *
 * `notesPage` sorts pinned first, then by the chosen key, then `_id`, and its
 * cursor is the last row's values. A note edited while you scroll moves, but
 * never makes a page repeat or skip another note, which offset paging does.
 * The cursor is opaque to clients (base64url JSON).
 */
import mongoose from 'mongoose';
import Note from './models/Note.js';
import { previewFor } from './noteDerived.js';

/** Fields never needed by the GraphQL Note type: bulky or internal. */
const ALWAYS_HIDDEN = {
  wordText: 0,
  sketchTranscript: 0,
  sketchHash: 0,
  lockHash: 0,
  embeddingHash: 0,
  embeddingError: 0,
  embeddingTicket: 0,
};

/**
 * The field names selected at `path` below the root field (`[]` = the root
 * field's own selection; `['notes']` = notesPage's notes), through fragments
 * and inline fragments. Null when the selection can't be read (then read
 * everything).
 */
export function selectedFields(info, path = []) {
  try {
    let nodes = info.fieldNodes;
    for (const name of path) {
      nodes = nodes.flatMap((n) => collect(n.selectionSet, info.fragments)).filter((f) => f.name.value === name);
    }
    const names = new Set(nodes.flatMap((n) => collect(n.selectionSet, info.fragments)).map((f) => f.name.value));
    return names.size ? names : null;
  } catch {
    return null;
  }
}

function collect(selectionSet, fragments) {
  if (!selectionSet) return [];
  const out = [];
  for (const sel of selectionSet.selections) {
    if (sel.kind === 'Field') out.push(sel);
    else if (sel.kind === 'InlineFragment') out.push(...collect(sel.selectionSet, fragments));
    else if (sel.kind === 'FragmentSpread') out.push(...collect(fragments?.[sel.name.value]?.selectionSet, fragments));
  }
  return out;
}

/**
 * A Mongo projection for a Note selection: `content` only when selected (or
 * when the selection can't be read). Always an exclusion, so a field this
 * module doesn't know about is never dropped by accident.
 */
export function noteProjection(info, path = []) {
  const fields = info ? selectedFields(info, path) : null;
  if (!fields || fields.has('content')) return { ...ALWAYS_HIDDEN };
  return { ...ALWAYS_HIDDEN, content: 0 };
}

// ── sorting and cursors ────────────────────────────────────────────────────

const SORT_KEYS = {
  updatedat_desc: { key: 'updatedAt', dir: -1 },
  updatedat_asc: { key: 'updatedAt', dir: 1 },
  createdat_desc: { key: 'createdAt', dir: -1 },
  createdat_asc: { key: 'createdAt', dir: 1 },
  title_asc: { key: 'title', dir: 1 },
  title_desc: { key: 'title', dir: -1 },
};

/** A sort name (any case) → `{ key, dir }`; unknown → newest edit first. */
export function sortSpec(sort) {
  return SORT_KEYS[String(sort || '').toLowerCase()] || SORT_KEYS.updatedat_desc;
}

/** A–Z ignores case (and accents' case); dates sort as stored. */
export const TITLE_COLLATION = { locale: 'en', strength: 2 };

/**
 * Date sorts page by keyset (the last row's pinned, date and `_id`). Title
 * sorts page by offset: untitled notes store `null` or `''`, which Mongo
 * orders as two different values while a person reads them as one, and a
 * keyset across that is easy to get wrong; A–Z is a short, rarely-paged view.
 */
export function encodeCursor(row, { key }, offset = 0) {
  const body = key === 'title'
    ? { k: key, o: offset }
    : { p: row.pinned === true, k: key, v: new Date(row[key]).toISOString(), id: String(row._id) };
  return Buffer.from(JSON.stringify(body)).toString('base64url');
}

/** The cursor, checked against the sort it was made for; null when unusable (start over). */
export function decodeCursor(after, { key }) {
  if (!after) return null;
  try {
    const c = JSON.parse(Buffer.from(String(after), 'base64url').toString('utf8'));
    if (c?.k !== key) return null;
    if (key === 'title') return Number.isInteger(c.o) && c.o >= 0 ? { offset: c.o } : null;
    if (!mongoose.isValidObjectId(c.id) || typeof c.v !== 'string') return null;
    const v = new Date(c.v);
    if (Number.isNaN(v.getTime())) return null;
    return { pinned: c.p === true, v, id: new mongoose.Types.ObjectId(c.id) };
  } catch {
    return null;
  }
}

/** The page's sort, and the "after this row" condition for a date sort. */
export function pageQuery({ key, dir }, cursor) {
  const sort = { pinned: -1, [key]: dir, _id: dir };
  if (!cursor || key === 'title') return { sort, after: null, skip: cursor?.offset || 0 };
  const cmp = dir === 1 ? '$gt' : '$lt';
  const samePin = cursor.pinned ? { pinned: true } : { pinned: { $ne: true } };
  const or = [
    { ...samePin, [key]: { [cmp]: cursor.v } },
    { ...samePin, [key]: cursor.v, _id: { [cmp]: cursor.id } },
  ];
  // Past the pinned block: every unpinned note comes after.
  if (cursor.pinned) or.push({ pinned: { $ne: true } });
  return { sort, after: { $or: or }, skip: 0 };
}

/**
 * Rows read without `content` whose note predates `preview` (written before
 * 2026-11-15 and not yet re-derived by wordIndex.js at start-up — or a raw
 * insert): their preview is computed from a second, by-id read of just those
 * bodies. Normally nothing to do.
 */
export async function fillMissingPreviews(rows) {
  const missing = rows.filter((r) => typeof r.preview !== 'string' && !r.isLocked && !r.isEncrypted);
  if (!missing.length) return rows;
  const bodies = await Note.find(
    { _id: { $in: missing.map((r) => r._id) } },
    { type: 1, title: 1, content: 1, sketchTranscript: 1, isLocked: 1, isEncrypted: 1 },
  ).lean();
  const byId = new Map(bodies.map((b) => [String(b._id), b]));
  for (const r of missing) {
    const b = byId.get(String(r._id));
    r.preview = b ? previewFor({ type: 'markdown', ...b }) : '';
  }
  return rows;
}
