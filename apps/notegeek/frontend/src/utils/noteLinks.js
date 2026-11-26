/**
 * noteLinks.js — how a link to another note is written in a Markdown body.
 *
 * NoteGeek has no wiki-link syntax of its own for this. What it does have is a
 * route — `/notes/<id>` — that `App.jsx` serves and that the viewer, the list
 * and the search results all already link to. So a link to a note is a
 * Markdown link to that route: `[Title](/notes/<id>)`.
 */

/** The route a note lives at. One place, so the convention cannot drift. */
export function noteHref(id) {
  return `/notes/${ encodeURIComponent(String(id)) }`;
}

/**
 * A link to `{ id, title }`. Markdown's `[]()` delimiters are escaped in the
 * title so a note called "Re: [draft] plans" does not produce a broken link.
 */
export function noteLinkMarkup({ id, title }) {
  const label = String(title || 'Untitled note').trim() || 'Untitled note';
  return `[${ label.replace(/[[\]]/g, '\\$&') }](${ noteHref(id) })`;
}
