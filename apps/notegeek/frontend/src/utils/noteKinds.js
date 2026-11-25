/**
 * Note kinds (DOCS/NOTE_KINDS_SPEC.md): the notes list, partitioned.
 *
 * A daily page (GeekDay), a meeting page and a 1:1 are ordinary notes that
 * carry a tag; nothing else is stored. The Notes list leaves those three
 * out, each has a list of its own, and Everything is the merged stream.
 * Search, links, related notes and the reference picker stay across all of
 * them: a kind decides which LIST a note is in, never whether it is found.
 *
 * Pure: no React, no Apollo.
 */
import { MEETING_PATH, MEETING_TAG } from './oneOnOne';
import { tagHref } from './tagPath';

/** The tag GeekDay puts on every day's page (apps/geekday/frontend/src/lib/days.js). */
export const DAILY_TAG = 'daily';

export const KIND_LISTS = {
  notes: { path: '/notes', label: 'Notes', noun: ['note', 'notes'] },
  dailies: { path: '/dailies', label: 'Dailies', noun: ['day', 'days'], under: DAILY_TAG },
  meetings: { path: '/meetings', label: 'Meetings', noun: ['meeting', 'meetings'], under: MEETING_TAG, newPath: MEETING_PATH, newLabel: 'New meeting' },
  everything: { path: '/everything', label: 'Everything', noun: ['note', 'notes'] },
};

/** The tags whose notes are a kind of their own, given the 1:1 tag in force. */
export const kindRoots = (oneOnOneRoot) => [DAILY_TAG, MEETING_TAG, oneOnOneRoot].filter(Boolean);

/** What a kind's list asks the gateway for: `{ under }`, `{ notUnder }` or nothing. */
export function kindListQuery(kind, oneOnOneRoot) {
  if (kind === 'notes') return { notUnder: kindRoots(oneOnOneRoot) };
  const under = KIND_LISTS[kind]?.under;
  return under ? { under } : {};
}

/** Which kind list a path is, or null. `/notes` only: `/notes/:id` is a note. */
export function kindForPath(pathname) {
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  return Object.keys(KIND_LISTS).find((kind) => KIND_LISTS[kind].path === path) || null;
}

/** 1:1s have had a purpose-built page since 2026-11-22: the 1:1 tag's page (its people). */
export const oneOnOnesPath = (oneOnOneRoot) => tagHref(oneOnOneRoot);

/** True on the 1:1 tag's page or a person's. */
export function isOneOnOnePath(pathname, oneOnOneRoot) {
  if (!oneOnOneRoot || !String(pathname || '').startsWith('/tags/')) return false;
  let tag = '';
  try { tag = decodeURIComponent(pathname.slice('/tags/'.length).replace(/\/+$/, '')); } catch { return false; }
  return tag === oneOnOneRoot || tag.startsWith(`${oneOnOneRoot}/`);
}
