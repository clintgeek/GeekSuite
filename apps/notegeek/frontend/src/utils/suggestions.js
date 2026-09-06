/**
 * suggestions.js — the non-visual half of the suggestion strip.
 *
 * Two things that are worth testing on their own and that have no business
 * inside a component file: what the gateway is told about the note, and where
 * a dismissal is remembered.
 */

import { previewText } from './previewText';

const DISMISS_PREFIX = 'notegeek:suggest-dismissed:';

/** How much of the body the gateway sees. The server truncates to the same. */
export const EXCERPT_CHARS = 500;

/**
 * The excerpt the gateway is given: the first 500 characters of readable body
 * text. Mind-map and handwritten bodies are serialized editor snapshots — the
 * "text" in them is coordinates and style ids, so those notes are ranked on
 * their title alone rather than on JSON noise.
 */
export function excerptFor(content, noteType) {
  if (noteType === 'mindmap' || noteType === 'handwritten') return '';
  return previewText(content || '', noteType, EXCERPT_CHARS);
}

/** Dismissal is per note; an unsaved note shares the one 'new' slot. */
export function dismissKey(noteId) {
  return `${ DISMISS_PREFIX }${ noteId || 'new' }`;
}

/**
 * Read/write the dismissal in `sessionStorage`: a strip waved away stays away
 * for the rest of the tab's life and comes back tomorrow. `localStorage` would
 * be a promise this feature has not earned, and a row on the server would be a
 * write we said we would not make. Both accessors throw outright in some
 * privacy modes, so both are guarded — a dismissal we cannot remember is a
 * strip that comes back, which is the harmless direction.
 */
export function readDismissed(noteId) {
  try {
    return sessionStorage.getItem(dismissKey(noteId)) === '1';
  } catch {
    return false;
  }
}

export function writeDismissed(noteId) {
  try {
    sessionStorage.setItem(dismissKey(noteId), '1');
  } catch {
    // Nothing to do: the strip will simply reappear on the next save.
  }
}
