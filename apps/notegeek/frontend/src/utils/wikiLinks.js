/**
 * [[Wiki links]] — the client half of DOCS/CONTEXT.md §12. The gateway
 * (`links.js`) parses and resolves them on save; this file has the same
 * syntax rule so the editor and the renderer agree with it. Change both.
 *
 *   [[Title]]            → a link to the note called Title (case-insensitive)
 *   [[Title|shown text]] → the same link, reading "shown text"
 *
 * A title cannot contain `[`, `]`, `|` or a line break — the gateway's rule.
 * A note whose title has one is linked by id instead (`[text](/notes/<id>)`),
 * which the gateway also counts.
 */

export const WIKI_LINK = /\[\[([^[\]\n|]+?)(?:\|([^[\]\n]*))?\]\]/g;

/** Case-insensitive, whitespace-collapsed — the gateway's `linkKey`. */
export const linkKey = (title) => String(title ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Every [[link]] in a string: `{ start, end, title, label, key }`. */
export function findWikiLinks(text) {
    const out = [];
    const re = new RegExp(WIKI_LINK.source, 'g');
    let m;
    while ((m = re.exec(String(text ?? ''))) !== null) {
        const title = m[1].replace(/\s+/g, ' ').trim();
        if (!title) continue;
        const label = (m[2] ?? '').trim() || title;
        out.push({ start: m.index, end: m.index + m[0].length, title, label, key: linkKey(title) });
    }
    return out;
}

/** A title the [[...]] syntax can carry as-is. */
export const isWikiSafeTitle = (title) => !/[[\]|\n]/.test(String(title ?? '')) && String(title ?? '').trim() !== '';

/** Where an unresolved [[Title]] leads: a new note with that title. */
export const newNoteHref = (title) => `/notes/new?title=${ encodeURIComponent(title) }`;

/**
 * An open `[[` just before the caret, still being typed: `{ start, query }`
 * (start = index of the first `[`), or null. Stops at a line break, a `]`,
 * a `|` (the alias part is free text), or after 80 characters.
 */
export function openWikiLink(text, caret) {
    const before = String(text ?? '').slice(0, caret);
    const m = /\[\[([^[\]\n|]{0,80})$/.exec(before);
    if (!m) return null;
    return { start: m.index, query: m[1] };
}

/**
 * Replace the open `[[query` (from `start` to `caret`) with a finished link
 * to `note`, swallowing a `]]` the writer already typed after the caret.
 * Returns `{ text, caret }`.
 */
export function completeWikiLink(text, { start, caret }, note) {
    const s = String(text ?? '');
    let end = caret;
    if (s.slice(end, end + 2) === ']]') end += 2;
    const markup = note.id && !isWikiSafeTitle(note.title)
        ? `[${ String(note.title || 'Untitled note').replace(/[[\]]/g, '\\$&') }](/notes/${ encodeURIComponent(note.id) })`
        : `[[${ String(note.title).trim() }]]`;
    return { text: s.slice(0, start) + markup + s.slice(end), caret: start + markup.length };
}

/** `[{ key, noteId }]` from the gateway → key → noteId (resolved only). */
export function linkMap(links) {
    const map = new Map();
    for (const l of links || []) if (l?.noteId && l.key && !l.key.startsWith('id:')) map.set(l.key, l.noteId);
    return map;
}
