/**
 * noteLinks.js — how a "related note" chip turns into a link in the body.
 *
 * ## The convention
 *
 * NoteGeek has no wiki-link syntax and never had one. What it *does* have is a
 * route — `/notes/<id>` — that `App.jsx` serves and that the viewer, the list
 * and the search results all already link to. So an inserted link is a link to
 * that route, written in whatever markup the note's own body is:
 *
 *   markdown, code  →  `[Title](/notes/<id>)`   (the markdown preview renders it)
 *   text (TipTap)   →  `<a href="/notes/<id>">Title</a>`  (the body IS HTML;
 *                       a markdown link would show up as literal brackets)
 *
 * Mind-map and handwritten notes store a serialized editor snapshot in the
 * same `content` field. Splicing anything into that JSON corrupts the note, so
 * those two types get tag chips and no link chips at all.
 *
 * ## The caret
 *
 * The markdown and code editors are plain `<textarea>`s, so a real caret
 * position is available and used. The rich-text editor is a ProseMirror
 * document with no offset that means anything in the HTML string, so its links
 * go on the end. Appending is the fallback everywhere: it is never wrong, only
 * occasionally less convenient than the caret would have been.
 */

export const LINKABLE_TYPES = new Set(['text', 'markdown', 'code']);

/** Can a related-note link be inserted into a body of this type at all? */
export function supportsLinkInsertion(noteType) {
  return LINKABLE_TYPES.has(noteType);
}

/** The route a note lives at. One place, so the convention cannot drift. */
export function noteHref(id) {
  return `/notes/${ encodeURIComponent(String(id)) }`;
}

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * A link to `{ id, title }`, in the markup a `noteType` body is written in.
 * Markdown's `[]()` delimiters are escaped in the title so a note called
 * "Re: [draft] plans" does not produce a broken link.
 */
export function noteLinkMarkup(noteType, { id, title }) {
  const label = String(title || 'Untitled note').trim() || 'Untitled note';
  if (noteType === 'text') {
    return `<a href="${ noteHref(id) }">${ escapeHtml(label) }</a>`;
  }
  return `[${ label.replace(/[[\]]/g, '\\$&') }](${ noteHref(id) })`;
}

/**
 * Splice `markup` into `content` at `caret`, or append it when there is no
 * usable caret.
 *
 * Appending adds a blank line for markdown/code (a link welded to the end of a
 * paragraph is not what anyone meant) and a paragraph for HTML. Splicing adds
 * a single leading space only when the character before the caret is not
 * already whitespace, so mid-sentence insertion reads correctly.
 */
export function insertLink(content = '', markup, { caret = null, noteType = 'markdown' } = {}) {
  const body = content || '';
  const isHtml = noteType === 'text';

  if (typeof caret === 'number' && caret >= 0 && caret <= body.length && !isHtml) {
    const before = body.slice(0, caret);
    const after = body.slice(caret);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
    return `${ before }${ needsLeadingSpace ? ' ' : '' }${ markup }${ needsTrailingSpace ? ' ' : '' }${ after }`;
  }

  if (isHtml) {
    return `${ body }<p>${ markup }</p>`;
  }
  if (!body) return markup;
  return `${ body.replace(/\s+$/, '') }\n\n${ markup }`;
}

/** Is this link already in the body? Keeps a double-tap from duplicating it. */
export function containsNoteLink(content = '', id) {
  return String(content || '').includes(noteHref(id));
}
