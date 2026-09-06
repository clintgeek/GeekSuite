/**
 * Server-side sanitization for notegeek's HTML-bearing note bodies.
 *
 * ## Which note types this touches, and why only one
 *
 * `Note.type` is one of `text | markdown | code | mindmap | handwritten`, and
 * only ONE of them stores HTML:
 *
 * | type          | what `content` actually holds                              |
 * |---------------|------------------------------------------------------------|
 * | `text`        | **HTML** — TipTap's `editor.getHTML()` (rich-text editor)   |
 * | `markdown`    | markdown source; the client renders it with `react-markdown`, which does not pass raw HTML through (no `rehype-raw`) |
 * | `code`        | `JSON.stringify({ language, code })` — an envelope          |
 * | `mindmap`     | a serialized ReactFlow graph (JSON)                        |
 * | `handwritten` | a serialized tldraw snapshot (JSON)                        |
 *
 * Running an HTML sanitizer over the other four would be actively wrong: it
 * would entity-escape the quotes and angle brackets inside a JSON snapshot and
 * corrupt the document. So `text` is the only type sanitized, and every other
 * `content` is stored byte-for-byte as it arrives, exactly as before.
 *
 * ## Why the server sanitizes at all
 *
 * The render side (`apps/notegeek/frontend/src/utils/sanitizeNoteHtml.js`) is
 * the control that stops script from executing. This is the second layer: it
 * means the hostile markup never reaches the database, so it cannot be served
 * to a future client that forgets to sanitize — an export, an import, a share
 * feature, a different app reading the same collection. Same profile on both
 * sides, so a note that survives one survives the other unchanged.
 *
 * ## The profile
 *
 * A deliberate twin of the client file named above — same `ALLOWED_TAGS`,
 * `ALLOWED_ATTR`, `FORBID_TAGS`, `FORBID_ATTR`, same link/image hooks, same
 * DOMPurify options. They are duplicated rather than shared because they live
 * in different pnpm workspaces with no common runtime package.
 * **Change one, change the other.** `notegeekSanitize.test.js` pins the
 * round-trip properties that keep the two honest.
 *
 * ## Why `dompurify` + `jsdom` and not `isomorphic-dompurify`
 *
 * `isomorphic-dompurify` is exactly these two packages with a wrapper, but
 * every release new enough to carry a current DOMPurify declares
 * `engines.node >= 22`, and this service runs on `node:20-alpine`
 * (`apps/basegeek/Dockerfile`). Depending on the two directly pins DOMPurify
 * to the same `3.4.14` the notegeek client uses, which is what makes the two
 * profiles provably identical.
 *
 * ## Why `jsdom` is pinned to 26.1.0 and not the 28.1.0 the frontends use
 *
 * Not taste — this suite's Jest can't load anything newer. jsdom 27.4+ pulls
 * `html-encoding-sniffer@6`, and 27.0–27.3 pull `cssstyle@5`; both reach an
 * ESM-only package through a CJS `require`, which Node itself handles (>=22.12)
 * but `jest@29`'s own module registry does not — the suite dies at import with
 * "Must use import to load ES Module" before a single test runs. 26.1.0 is the
 * last line whose transitive tree is CJS the whole way down. The part of this
 * that carries the security weight is DOMPurify, which is current; jsdom is
 * only here to supply a DOM and a `parse5`-backed HTML parser, and the tests
 * below pin the behaviour that actually matters. Revisit when the api package
 * moves off jest@29 (or gains `transformIgnorePatterns` for these), and note
 * the frontends keep their own `jsdom@28` — vitest loads ESM natively.
 */
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

/** The only note type whose `content` is HTML. */
export const HTML_NOTE_TYPES = new Set(['text']);

/** Elements a note body may contain. Everything else loses its tags. */
export const ALLOWED_TAGS = [
  // Block
  'p', 'div', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre',
  'ul', 'ol', 'li',
  'figure', 'figcaption',
  // Inline
  'a', 'span', 'code', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'ins', 'mark', 'sub', 'sup', 'small', 'abbr', 'kbd', 'samp', 'var', 'q',
  // Media
  'img',
  // Tables (NoteViewer styles these; pasted content brings them)
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'colgroup', 'col',
];

/**
 * Attributes those elements may carry. No `style`, no `id`/`name` (DOM
 * clobbering), no `on*` — DOMPurify drops every handler regardless.
 */
export const ALLOWED_ATTR = [
  'href', 'target', 'rel',
  'src', 'alt', 'title', 'width', 'height', 'loading',
  'class', 'lang', 'dir',
  'colspan', 'rowspan', 'headers', 'scope', 'span',
  'start', 'reversed', 'value', 'cite', 'datetime',
  // TipTap node markers (task lists, code-block language)
  'data-checked', 'data-type', 'data-language',
];

export const FORBID_TAGS = [
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'applet', 'form', 'input', 'button', 'select', 'option', 'textarea',
  'link', 'meta', 'base', 'svg', 'math', 'template', 'noscript',
];

export const FORBID_ATTR = ['style', 'srcset', 'formaction', 'xlink:href', 'ping'];

/** Schemes an `<a href>` may use. Scheme-less (relative, `#anchor`) passes. */
const ALLOWED_HREF_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/** `data:` image subtypes an `<img src>` may use. SVG is deliberately absent. */
const ALLOWED_DATA_IMAGE = /^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp|x-icon)[;,]/i;

/**
 * Strip the characters a browser ignores while resolving a URL — whitespace
 * and the C0/C1 controls that make `java\0script:` work — before looking at
 * the scheme.
 */
const unwrapUrl = (value) => {
  // Written as a loop rather than a character-class regex on purpose: the
  // class would contain literal control characters, which `no-control-regex`
  // flags — and a lint suppression on a security check is a bad trade.
  let out = '';
  for (const ch of String(value)) {
    const code = ch.codePointAt(0);
    // C0 + space, and DEL through NBSP (C1). All of these are ignored by a
    // browser resolving a URL, so they must not hide a scheme from us.
    if (code <= 0x20 || (code >= 0x7f && code <= 0xa0)) continue;
    out += ch;
  }
  return out;
};

const isSafeHref = (value) => {
  const url = unwrapUrl(value);
  if (url === '') return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (!scheme) return true;
  return ALLOWED_HREF_SCHEMES.has(scheme[1].toLowerCase());
};

const isSafeImageSrc = (value) => {
  const url = unwrapUrl(value);
  if (url === '') return false;
  if (ALLOWED_DATA_IMAGE.test(url)) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (!scheme) return true;
  const name = scheme[1].toLowerCase();
  return name === 'http' || name === 'https';
};

/** Guarantee `rel` carries both tokens without discarding the ones it has. */
const hardenRel = (node) => {
  const existing = (node.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
  const tokens = new Set(existing.map((t) => t.toLowerCase()));
  let changed = !node.hasAttribute('rel');
  for (const required of ['noopener', 'noreferrer']) {
    if (!tokens.has(required)) {
      existing.push(required);
      tokens.add(required);
      changed = true;
    }
  }
  if (changed) node.setAttribute('rel', existing.join(' '));
};

export const addNoteHtmlHooks = (purify) => {
  purify.addHook('afterSanitizeAttributes', (node) => {
    const tag = node.tagName && node.tagName.toLowerCase();
    if (tag === 'a') {
      if (node.hasAttribute('href')) {
        if (!isSafeHref(node.getAttribute('href'))) {
          node.removeAttribute('href');
          node.removeAttribute('target');
          node.removeAttribute('rel');
          return;
        }
        hardenRel(node);
        if (!node.hasAttribute('target')) node.setAttribute('target', '_blank');
      }
      return;
    }
    if (tag === 'img') {
      if (!node.hasAttribute('src') || !isSafeImageSrc(node.getAttribute('src'))) {
        node.remove();
      }
    }
  });
  return purify;
};

export const PURIFY_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  FORBID_TAGS,
  FORBID_ATTR,
  ADD_DATA_URI_TAGS: ['img'],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: true,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false,
};

/**
 * One jsdom window and one DOMPurify instance for the process, built on first
 * use. jsdom costs ~50 ms and a few MB to stand up; the gateway serves eight
 * apps and most requests never touch a rich-text note, so it is not paid at
 * boot.
 */
let purify = null;
const getPurify = () => {
  if (!purify) {
    const { window } = new JSDOM('');
    purify = addNoteHtmlHooks(createDOMPurify(window));
  }
  return purify;
};

/**
 * Sanitize a note body if — and only if — its type stores HTML.
 *
 * Idempotent for `text`: `sanitize(sanitize(x)) === sanitize(x)`. A pass-through
 * for every other type, including an unknown one.
 *
 * @param {string} content  The stored note body.
 * @param {string|null|undefined} type  The note's `type`.
 * @returns {string} `content`, sanitized when the type holds HTML.
 */
export function sanitizeNoteContent(content, type) {
  if (typeof content !== 'string' || content === '') return content;
  if (!HTML_NOTE_TYPES.has(type)) return content;
  return getPurify().sanitize(content, PURIFY_CONFIG);
}

/**
 * Apply `sanitizeNoteContent` to a validated mutation argument bag, given the
 * type the note will actually have. Returns the same object when there is
 * nothing to do, so the resolvers' `{ $set: args }` shape is untouched for
 * every non-HTML note.
 *
 * @param {object} args  Validated `createNote`/`updateNote` arguments.
 * @param {string|null|undefined} effectiveType  `args.type` for create; for an
 *   update that omitted `type`, the type already stored on the row.
 */
export function sanitizeNoteArgs(args, effectiveType) {
  if (typeof args?.content !== 'string') return args;
  const cleaned = sanitizeNoteContent(args.content, effectiveType);
  if (cleaned === args.content) return args;
  return { ...args, content: cleaned };
}

export default sanitizeNoteContent;
