/**
 * Compose from several notes — the client's half of the rules in
 * DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md §4–§5. Pure functions, so the
 * wording and the title rule are tested without a dialog.
 */

export const COMPOSE_MANY_MIN = 2;
export const COMPOSE_MANY_MAX = 20;
const TITLE_MAX = 500;

/**
 * U4: the draft's first level-one `#` heading, if it has one (it stays in the
 * body too), else "Composed note". Headings inside a code fence don't count.
 */
export function composedTitle(markdown) {
  let fenced = false;
  for (const raw of String(markdown || '').split('\n')) {
    const line = raw.trimEnd();
    if (/^\s{0,3}(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = /^\s{0,3}#[ \t]+(.+?)(?:[ \t]+#+)?$/.exec(line);
    if (m && m[1].trim()) return m[1].trim().slice(0, TITLE_MAX);
  }
  return 'Composed note';
}

/** C3: oldest `createdAt` first (the gateway orders too; this keeps the request readable). */
export function oldestFirst(notes) {
  return [...(notes || [])].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

const TYPE_WORD = { handwritten: 'a sketch', mindmap: 'a mind map' };

/** Why one note was left out, in the words the dialog uses. */
export function skipLabel(skip, note) {
  switch (skip?.reason) {
    case 'locked': return 'locked';
    case 'unsupported_type': return TYPE_WORD[note?.type] || 'not text';
    case 'empty': return 'empty';
    case 'not_found': return 'not found';
    default: return skip?.reason || 'left out';
  }
}

/**
 * U3: "2 notes left out: Garden plan (locked), Sketch 4 (a sketch)".
 * `notesById` is the selection, so a sketch is called a sketch.
 */
export function skipSummary(skipped, notesById = new Map()) {
  if (!skipped?.length) return '';
  const n = skipped.length;
  const parts = skipped.map((s) => {
    const note = notesById.get(String(s.id));
    const title = s.title || note?.title || 'Untitled';
    return `${title} (${skipLabel(s, note)})`;
  });
  return `${n} note${n === 1 ? '' : 's'} left out: ${parts.join(', ')}`;
}

/**
 * What the action bar says about the notes Compose will skip (U2), from the
 * selection alone — the gateway's `sources.skipped` is the final word.
 */
export function skipHint(skipCount) {
  if (!skipCount) return '';
  return `${skipCount} will be skipped — sketches, mind maps and locked notes can't be composed`;
}
