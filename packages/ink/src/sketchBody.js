/**
 * sketchBody.js: is a handwritten note's stored body something the editor can
 * open? Used by NoteGeek's HandwrittenEditor and GeekDay's InkCanvas.
 *
 * A body that cannot be read must never be treated as a blank page: the blank
 * canvas autosaves, and the save replaces the original.
 *
 * tldraw's `loadSnapshot` takes any other object (`{}`) as an editor snapshot
 * with no document and loads nothing, so valid JSON is not enough: the body
 * must hold a store.
 */

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** A body with nothing in it: a new note, or a stored note that has no writing yet. */
export function isEmptySketchBody(body) {
  return body == null || (typeof body === 'string' && body.trim() === '');
}

/**
 * Parse a stored body. Throws unless it is a tldraw store snapshot (what this
 * editor saves) or an editor snapshot (`document.store`).
 */
export function parseSketchBody(body) {
  if (typeof body !== 'string') throw new Error('The saved writing is not text.');
  const snapshot = JSON.parse(body);
  if (!isObject(snapshot) || !(isObject(snapshot.store) || isObject(snapshot.document?.store))) {
    throw new Error('Not a tldraw snapshot');
  }
  return snapshot;
}

/** True for an empty body, or one that parses to a snapshot. (tldraw may still refuse its records.) */
export function isReadableSketchBody(body) {
  if (isEmptySketchBody(body)) return true;
  try {
    parseSketchBody(body);
    return true;
  } catch {
    return false;
  }
}
