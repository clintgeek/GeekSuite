/**
 * 1:1 notes (DOCS/ONE_ON_ONE_SPEC.md).
 *
 * A person is a tag one level under the 1:1 tag (`fd/1on1/alex`); a 1:1 is a
 * handwritten note carrying that tag. Nothing else is stored: the people, the
 * log and "last met" are all read off notes and their tags, so notes written
 * before this feature are part of it from the start, untouched.
 *
 * Pure: no React, no Apollo.
 */
import { isDescendant, normalizeSegment, normalizeTag } from '@geeksuite/tags';

/** Where 1:1s live unless Settings says otherwise (app preference `oneOnOneTag`). */
export const DEFAULT_ONE_ON_ONE_TAG = 'fd/1on1';

/** The paper sheet a new 1:1 starts on (packages/ui paper templates). */
export const ONE_ON_ONE_SHEET = 'oneonone';

/** The 1:1 tag in force: the preference if it is a usable tag, else the default. */
export function oneOnOneRoot(prefs) {
  const set = typeof prefs?.oneOnOneTag === 'string' ? normalizeTag(prefs.oneOnOneTag) : '';
  return set || DEFAULT_ONE_ON_ONE_TAG;
}

/** A typed name as a tag segment (`Alex Smith` → `alex-smith`), or '' if nothing usable. */
export function personSlug(name) {
  const words = String(name ?? '').replace(/\//g, ' ').trim();
  return words ? normalizeSegment(words) || '' : '';
}

/** `alex-smith` → `Alex Smith`. */
export function personName(slug) {
  return String(slug ?? '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const personTag = (root, slug) => `${root}/${slug}`;

/** The person a tag belongs to (`fd/1on1/alex/2026` → `alex`), or null. */
export function personOfTag(tag, root) {
  if (typeof tag !== 'string' || !isDescendant(tag, root)) return null;
  return tag.slice(root.length + 1).split('/')[0] || null;
}

/** Is `tag` exactly one person's tag? */
export const isPersonTag = (tag, root) => {
  const slug = personOfTag(tag, root);
  return Boolean(slug) && tag === personTag(root, slug);
};

/** The first person among a note's tags, or null. */
export function personOfNote(tags, root) {
  for (const tag of tags || []) {
    const slug = personOfTag(tag, root);
    if (slug) return slug;
  }
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "2026-11-22 Alex 1:1": the local day first, so a title sort is a date sort. */
export const oneOnOneTitle = (slug, now = new Date()) => `${isoDay(now)} ${personName(slug)} 1:1`;

/** Where "New 1:1" goes: the ordinary new-note route, as a sketch. */
export const oneOnOnePath = (slug) => `/notes/new?type=handwritten&oneOnOne=${encodeURIComponent(slug)}`;

/**
 * What a new 1:1 is seeded with, from `?oneOnOne=<slug>`: title, tags and the
 * sheet. Null when the slug is not a usable tag segment.
 */
export function buildOneOnOne(slugParam, root, now = new Date()) {
  const slug = personSlug(slugParam);
  if (!slug) return null;
  return { slug, title: oneOnOneTitle(slug, now), tags: [personTag(root, slug)], sheet: ONE_ON_ONE_SHEET };
}

const time = (value) => {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

/**
 * Everyone with a note under the 1:1 tag, the one you have gone longest
 * without meeting first. `lastMet` is the newest note's creation time.
 *
 * @param {Array<{tags?: string[], createdAt?: any}>} notes
 * @returns {Array<{slug: string, tag: string, name: string, count: number, lastMet: number|null}>}
 */
export function peopleFrom(notes, root) {
  const people = new Map();
  for (const note of notes || []) {
    const slugs = new Set((note.tags || []).map((t) => personOfTag(t, root)).filter(Boolean));
    for (const slug of slugs) {
      const p = people.get(slug) || { slug, tag: personTag(root, slug), name: personName(slug), count: 0, lastMet: null };
      p.count += 1;
      const at = time(note.createdAt);
      if (at !== null && (p.lastMet === null || at > p.lastMet)) p.lastMet = at;
      people.set(slug, p);
    }
  }
  return [...people.values()].sort((a, b) => (a.lastMet ?? 0) - (b.lastMet ?? 0) || a.name.localeCompare(b.name));
}

/** "today", "yesterday", "12 days ago", "5 weeks ago"; '' when never. */
export function sinceLabel(lastMet, now = new Date()) {
  if (lastMet === null || lastMet === undefined) return '';
  const a = new Date(lastMet);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 21) return `${days} days ago`;
  return `${Math.round(days / 7)} weeks ago`;
}
