/**
 * sketchToText.js — the note a sketch's handwriting becomes
 * (DOCS/HANDWRITING.md §2, step 5).
 *
 * Always a NEW markdown note. The sketch is the original and is never
 * replaced; this is a derived copy, so its first line says where it came from.
 */
import { noteLinkMarkup } from './noteLinks';

const sketchLabel = (sketchTitle) => String(sketchTitle || '').trim() || 'Untitled sketch';

/**
 * Where the text came from: a sketch (§2), or photographed pages kept as a
 * photo sketch note (§3). Only the words change; the shape is the same.
 */
const PREFIX = { sketch: 'From sketch', photo: 'From photos' };
const prefixFor = (source) => PREFIX[source] || PREFIX.sketch;

/** The text of the first Markdown heading (any level), or null. */
export function firstHeading(markdown) {
  const m = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(markdown || '');
  return m ? m[1].trim() || null : null;
}

/**
 * The new note's title: the composed document's first heading, or
 * "From sketch: <sketch title>" (always that for the plain-text path;
 * "From photos: …" for photographed pages).
 */
export function derivedNoteTitle({ sketchTitle, body, composed, source = 'sketch' }) {
  const heading = composed ? firstHeading(body) : null;
  return (heading || `${prefixFor(source)}: ${sketchLabel(sketchTitle)}`).slice(0, 500);
}

/** The first line: a link back to the sketch, in NoteGeek's markdown link convention. */
export function backLinkLine({ sketchId, sketchTitle, source = 'sketch' }) {
  return `${prefixFor(source)}: ${noteLinkMarkup('markdown', { id: sketchId, title: sketchLabel(sketchTitle) })}`;
}

/**
 * A transcript kept as plain text, made to read the same in Markdown.
 *
 * Markdown joins consecutive lines into one paragraph, which turned a
 * handwritten list of lines into one run-on sentence. A line followed by
 * another non-blank line gets a hard break (two trailing spaces). Nothing
 * else changes: no words, no order, no markup the writer did not write.
 */
export function plainTextAsMarkdown(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  return lines
    .map((line, i) => {
      const next = lines[i + 1];
      const breaks = line.trim() !== '' && next !== undefined && next.trim() !== '' && !/ {2}$/.test(line);
      return breaks ? `${line}  ` : line;
    })
    .join('\n')
    .trim();
}

/** The whole body of the new note: back-link, blank line, then the text. */
export function derivedNoteContent({ sketchId, sketchTitle, body, composed, source = 'sketch' }) {
  const text = composed ? String(body || '').trim() : plainTextAsMarkdown(body);
  return `${backLinkLine({ sketchId, sketchTitle, source })}\n\n${text}\n`;
}
