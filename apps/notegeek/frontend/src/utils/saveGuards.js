import { NOTE_TYPES } from '../components/notes/NoteTypeRouter';

/**
 * saveGuards.js — the two things the editor has to know about a failed save.
 *
 * Both were missing entirely before the 2026-09-05 going-over, and together
 * they were how a note that could not be saved looked exactly like one that
 * had been: `NoteEditorPage` set `saveStatus` to an error string, and
 * `NoteActions` — the only consumer — compares that string against `'Saved'`
 * and renders nothing else. Every error message went nowhere.
 */

/**
 * The gateway's `content` ceilings, mirrored.
 *
 * `apps/basegeek/packages/api/src/graphql/notegeek/validation.js` caps prose
 * (`text` / `markdown` / `code`) at 100 000 characters and editor snapshots
 * (`mindmap` / `handwritten`) at 5 000 000. A tldraw sketch is the realistic
 * way to hit this — the snapshot grows with every stroke — and the failure was
 * invisible: autosave retried on each new stroke, failed each time, and the
 * work was lost on navigation.
 */
export const DOC_CONTENT_MAX = 100_000;
export const SNAPSHOT_CONTENT_MAX = 5_000_000;

const SNAPSHOT_TYPES = new Set([NOTE_TYPES.MINDMAP, NOTE_TYPES.HANDWRITTEN]);

/** The ceiling that applies to a note of this type. */
export function contentMaxFor(type) {
  return SNAPSHOT_TYPES.has(type) ? SNAPSHOT_CONTENT_MAX : DOC_CONTENT_MAX;
}

/** True when this body is a snapshot (a sketch or a map), not prose. */
export function isSnapshotType(type) {
  return SNAPSHOT_TYPES.has(type);
}

/**
 * What to tell the writer when the body is too big, or `null` when it isn't.
 *
 * Said before the round trip, so the answer is immediate and specific rather
 * than a silent failure followed by a retry loop.
 */
export function overSizeMessage(content, type) {
  if (typeof content !== 'string') return null;
  const max = contentMaxFor(type);
  if (content.length <= max) return null;
  return isSnapshotType(type)
    ? 'This sketch is too large to save. Try removing some strokes.'
    : `This note is too long to save (${ content.length.toLocaleString() } of ${ max.toLocaleString() } characters).`;
}

/**
 * The message a human can act on, out of an Apollo error.
 *
 * The gateway raises `GraphQLError('Invalid input', { extensions: { details:
 * [{ path, message }] } })` (`graphql/shared/validation.js`), so surfacing
 * `error.message` alone tells the user literally nothing — it is the flat
 * string "Invalid input". The useful sentence is in `details`.
 */
export function saveErrorMessage(error) {
  const gql = error?.graphQLErrors?.[0];
  const details = gql?.extensions?.details;
  if (Array.isArray(details) && details.length) {
    const joined = details.map((d) => d?.message).filter(Boolean).join('; ');
    if (joined) return joined;
  }
  if (gql?.message) return gql.message;
  if (error?.networkError) return 'Could not reach the server — your changes are not saved yet.';
  return error?.message || 'Failed to save';
}
