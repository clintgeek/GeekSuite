/**
 * links.js — `[[Note title]]` links between notes, and the backlinks they make.
 *
 * ## The syntax
 *
 * `[[Title]]` and `[[Title|shown text]]` in a markdown or rich-text note. The
 * title is matched case-insensitively against the owner's own note titles.
 * Code (fenced blocks, inline spans, `<pre>`/`<code>`) is skipped, so a
 * snippet of bash with `[[ -f x ]]` is not a link. An in-app link written as
 * `[text](/notes/<id>)` or `<a href="/notes/<id>">` (what "Insert link" in the
 * suggestion strip writes) counts too: it is already resolved, by id.
 *
 * ## Stored as
 *
 * `Note.links: [{ key, title, noteId }]`, computed on every save that changes
 * the body. `key` is the lowercased title (or `id:<hex>` for an id link);
 * `noteId` is the target once resolved, `null` while no note has that title.
 *
 * ## Resolution, and what a rename does
 *
 *   - On save, each link keeps the note it ALREADY pointed at (same key, and
 *     that note still exists); otherwise it resolves by title, oldest note
 *     first when two share a title; otherwise it is stored unresolved.
 *   - Creating a note, or retitling one, resolves every unresolved link to
 *     that title across the owner's notes (one updateMany).
 *   - Deleting a note unresolves the links that pointed at it (they come back
 *     if another note has that title).
 *   - Renaming a target does NOT rewrite anyone's text. `[[Old title]]` keeps
 *     pointing at the renamed note, by id, for as long as that text stays;
 *     the UI renders it as a link to the note. Rewriting other notes' bodies
 *     would be a silent edit to notes you aren't looking at — new history
 *     entries, new `updatedAt`s, re-embeds — for a cosmetic gain.
 *
 * ## Archived notes (spec §3 A2)
 *
 * A link TO an archived note still resolves — the note exists, and opening it
 * shows the archived banner. But when a title is shared by an archived and an
 * active note, the active one wins: title lookups sort `archived` ascending
 * (missing < false < true in BSON order) before age, and a kept resolution
 * that points at an archived note gives way to an active note with that
 * title. Backlinks list no archived source.
 *
 * ## Cost
 *
 * Nothing at all unless the body contains `[[` or `/notes/`. Then: one
 * projected title lookup, plus one updateMany when a title changes. Backlinks
 * are one indexed find.
 */

import mongoose from 'mongoose';
import Note, { active } from './models/Note.js';
import { htmlToText } from './chunking.js';

export const MAX_LINKS_PER_NOTE = 200;
export const LINK_TITLE_MAX = 500;
export const BACKLINKS_LIMIT = 50;
const CONTEXT_CHARS = 70;
const LINKABLE = new Set(['markdown', 'text']);

/** Case-insensitive, whitespace-collapsed title → the key links match on. */
export const linkKey = (title) => String(title ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const cleanTitle = (title) => String(title ?? '').replace(/\s+/g, ' ').trim();

const WIKI = /\[\[([^[\]\n|]+?)(?:\|([^[\]\n]*))?\]\]/g;
const ID_LINK = /(?:\]\(|href=["'])\/notes\/([0-9a-f]{24})\b/gi;

/** The body with code removed (so `[[ -f x ]]` in a script is not a link). */
function prose(content, type) {
  let s = String(content ?? '');
  if (type === 'text') {
    s = s.replace(/<pre[\s\S]*?<\/pre>/gi, ' ').replace(/<code[\s\S]*?<\/code>/gi, ' ');
    // Keep hrefs for id links; strip the rest of the markup.
    const ids = [...s.matchAll(ID_LINK)].map((m) => `](/notes/${ m[1] })`).join(' ');
    return `${ htmlToText(s) } ${ ids }`;
  }
  return s
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

/**
 * The links a body makes, in order, one per key.
 * @returns {{ key: string, title: string, noteId: string|null }[]}
 */
export function parseLinks(content, type) {
  if (!LINKABLE.has(type)) return [];
  const raw = String(content ?? '');
  if (!raw.includes('[[') && !raw.includes('/notes/')) return [];
  const text = prose(raw, type);
  const out = new Map();
  for (const m of text.matchAll(WIKI)) {
    const title = cleanTitle(m[1]).slice(0, LINK_TITLE_MAX);
    const key = linkKey(title);
    if (key && !out.has(key)) out.set(key, { key, title, noteId: null });
    if (out.size >= MAX_LINKS_PER_NOTE) break;
  }
  for (const m of text.matchAll(ID_LINK)) {
    if (out.size >= MAX_LINKS_PER_NOTE) break;
    const id = m[1].toLowerCase();
    const key = `id:${ id }`;
    if (!out.has(key)) out.set(key, { key, title: '', noteId: id });
  }
  return [...out.values()];
}

/**
 * Parse and resolve a body's links for `userId`. `previous` is the note's
 * stored `links` (for keeping a resolution across a rename).
 */
export async function resolveLinks({ userId, content, type, previous = [] }) {
  const parsed = parseLinks(content, type);
  if (!parsed.length) return [];
  const prevByKey = new Map((previous || []).filter((l) => l?.noteId).map((l) => [l.key, String(l.noteId)]));

  // Which earlier targets and id links still exist (owner-scoped).
  const idCandidates = new Set();
  for (const l of parsed) {
    if (l.noteId) idCandidates.add(l.noteId);
    else if (prevByKey.has(l.key)) idCandidates.add(prevByKey.get(l.key));
  }
  const titles = parsed.filter((l) => !l.noteId).map((l) => l.title);
  const [alive, byTitle] = await Promise.all([
    idCandidates.size
      ? Note.find({ userId, _id: { $in: [...idCandidates].filter((id) => mongoose.isValidObjectId(id)) } }, { _id: 1, archived: 1 }).lean()
      : [],
    // Active before archived (missing/false sort before true), then oldest.
    titles.length
      ? Note.find({ userId, title: { $in: titles } }, { _id: 1, title: 1, createdAt: 1, archived: 1 })
        .collation({ locale: 'en', strength: 2 })
        .sort({ archived: 1, createdAt: 1 })
        .lean()
      : [],
  ]);
  const aliveIds = new Set(alive.map((n) => String(n._id)));
  const archivedIds = new Set(alive.filter((n) => n.archived === true).map((n) => String(n._id)));
  const firstByKey = new Map();
  const activeByKey = new Map();
  for (const n of byTitle) {
    const k = linkKey(n.title);
    if (!firstByKey.has(k)) firstByKey.set(k, String(n._id));
    if (n.archived !== true && !activeByKey.has(k)) activeByKey.set(k, String(n._id));
  }

  return parsed
    .map((l) => {
      if (l.noteId) return aliveIds.has(l.noteId) ? l : null; // an id link to nothing is dropped
      const kept = prevByKey.get(l.key);
      if (kept && aliveIds.has(kept)) {
        // An archived target keeps the link unless an active note now has the title.
        const heir = archivedIds.has(kept) ? activeByKey.get(l.key) : null;
        return { ...l, noteId: heir || kept };
      }
      return { ...l, noteId: firstByKey.get(l.key) || null };
    })
    .filter(Boolean)
    .map((l) => ({ ...l, noteId: l.noteId ? new mongoose.Types.ObjectId(l.noteId) : null }));
}

/** A note now answers to `title`: resolve everyone's unresolved links to it. */
export async function resolvePendingLinks({ userId, noteId, title }) {
  const key = linkKey(title);
  if (!key) return 0;
  const { modifiedCount } = await Note.updateMany(
    { userId, links: { $elemMatch: { key, noteId: null } }, _id: { $ne: noteId } },
    { $set: { 'links.$[l].noteId': noteId } },
    { arrayFilters: [{ 'l.key': key, 'l.noteId': null }], timestamps: false },
  );
  return modifiedCount;
}

/**
 * A note is gone: links to it go back to unresolved (id links are removed —
 * there is no title to wait for), then re-resolve to another note with the
 * same title, if there is one.
 */
export async function detachLinksTo({ userId, noteId, title }) {
  const id = new mongoose.Types.ObjectId(String(noteId));
  await Note.updateMany(
    { userId, 'links.noteId': id },
    { $pull: { links: { key: `id:${ String(noteId).toLowerCase() }` } } },
    { timestamps: false },
  );
  await Note.updateMany(
    { userId, 'links.noteId': id },
    { $set: { 'links.$[l].noteId': null } },
    { arrayFilters: [{ 'l.noteId': id }], timestamps: false },
  );
  const key = linkKey(title);
  if (!key) return;
  const heir = await Note.findOne({ userId, title: cleanTitle(title) }, { _id: 1 })
    .collation({ locale: 'en', strength: 2 }).sort({ archived: 1, createdAt: 1 }).lean();
  if (heir) await resolvePendingLinks({ userId, noteId: heir._id, title });
}

/** ~70 characters either side of the first link in `content` that uses one of `keys`. */
export function linkContext(content, type, keys) {
  const text = prose(content, type).replace(/\s+/g, ' ');
  const want = new Set(keys);
  let hit = null;
  for (const m of text.matchAll(WIKI)) {
    if (want.has(linkKey(m[1]))) { hit = { index: m.index, length: m[0].length }; break; }
  }
  if (!hit) {
    for (const m of text.matchAll(/\[([^\]]*)\]\(\/notes\/([0-9a-f]{24})\)/gi)) {
      if (want.has(`id:${ m[2].toLowerCase() }`)) { hit = { index: m.index, length: m[0].length }; break; }
    }
  }
  if (!hit) return null;
  const start = Math.max(0, hit.index - CONTEXT_CHARS);
  const end = Math.min(text.length, hit.index + hit.length + CONTEXT_CHARS);
  let s = text.slice(start, end).trim();
  if (start > 0) s = `…${ s.replace(/^\S*\s/, '') }`;
  if (end < text.length) s = `${ s.replace(/\s\S*$/, '') }…`;
  return s;
}

/** Notes that link to `noteId`, newest first, with the sentence that does it. */
export async function backlinks({ userId, noteId }) {
  if (!mongoose.isValidObjectId(noteId)) return [];
  const id = new mongoose.Types.ObjectId(String(noteId));
  const rows = await Note.find(
    { userId, ...active(), 'links.noteId': id, _id: { $ne: id } },
    { title: 1, type: 1, content: 1, updatedAt: 1, links: 1, isLocked: 1, isEncrypted: 1 },
  ).sort({ updatedAt: -1 }).limit(BACKLINKS_LIMIT).lean();
  return rows.map((n) => {
    const keys = (n.links || []).filter((l) => String(l.noteId) === String(id)).map((l) => l.key);
    return {
      id: String(n._id),
      title: n.title || '',
      type: n.type,
      updatedAt: n.updatedAt,
      snippet: n.isLocked || n.isEncrypted ? null : linkContext(n.content, n.type, keys),
    };
  });
}
