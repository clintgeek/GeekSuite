/**
 * sanitizeNoteHtml — the one place notegeek turns stored note HTML into
 * something safe to hand `dangerouslySetInnerHTML`.
 *
 * ## Why this exists
 *
 * A `type: 'text'` note stores whatever TipTap's `editor.getHTML()` produced,
 * verbatim — the gateway wrote it without inspection and `NoteViewer` rendered
 * it without inspection. Notes are `userId`-scoped, so the realistic attacker
 * is not another user; it is a paste. Copy a block out of a hostile page, an
 * import, or a future share feature, and the markup that comes along executes
 * on `note.clintgeek.com` — a `*.clintgeek.com` origin, which is where the
 * suite's SSO cookie and the double-submit CSRF token both live
 * (`DOCS/CONTEXT.md`, "What it does not do"). Script on a suite origin is the
 * one thing the CSRF design explicitly cannot survive, so it must not run.
 *
 * ## The profile
 *
 * A strict allow-list, sized to what TipTap actually emits (StarterKit +
 * Link + Underline) plus the table/image markup `NoteViewer` already styles
 * for pasted content:
 *
 * - **Tags** — prose, headings, lists, `blockquote`, `pre`/`code`, inline
 *   marks, `a`, `img`, tables. Nothing else. `script`, `style`, `iframe`,
 *   `object`, `embed`, `form`, `svg`, `math`, `base`, `link`, `meta` are not
 *   on the list, so `<svg onload=...>` loses the whole element rather than
 *   just the handler.
 * - **Attributes** — a fixed list. No `on*` (DOMPurify strips every event
 *   handler), and **no `style` at all**: TipTap emits none, and allowing it
 *   would mean policing `expression()`, `url()` and full-viewport overlays in
 *   CSS. Forbidding it is the smaller thing to be right about.
 * - **`href`** — `http`, `https`, `mailto`, `tel`, or scheme-less
 *   (relative/anchor). `javascript:`, `data:` and `vbscript:` are refused,
 *   after unwrapping the control characters and whitespace a browser ignores
 *   when it resolves a URL.
 * - **`<a>`** — every link with an `href` is guaranteed a `rel` containing
 *   `noopener` and `noreferrer`, and gets `target="_blank"` if it had no
 *   target. The `rel` is **augmented, not replaced**: TipTap's own Link
 *   default is `rel="noopener noreferrer nofollow"`, and rewriting it would
 *   make a freshly-saved note change under sanitization.
 * - **`<img src>`** — `http(s)` or a `data:image/<raster>` URI. Not
 *   `data:image/svg+xml`: an SVG is a document, and keeping it out of the
 *   allow-list costs nothing here (no notegeek editor emits one). An image
 *   whose `src` fails is dropped whole, not left as a broken box.
 *
 * ## The same profile runs server-side
 *
 * `apps/basegeek/packages/api/src/graphql/notegeek/sanitize.js` is a
 * deliberate twin of the constants and hooks below, so a note sanitized on
 * save and sanitized again on render is byte-identical. The two copies are
 * duplicated rather than shared because they live in different pnpm
 * workspaces with no common runtime package; if a third caller ever needs it,
 * that is the moment to promote it into `packages/`.
 * **Change one, change the other.**
 */
import DOMPurify from 'dompurify';

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

/**
 * Named explicitly as well as omitted from the allow-list — belt and braces,
 * and it documents the intent for the next reader.
 */
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
 * Strip the characters a browser ignores while resolving a URL — leading and
 * trailing whitespace, and the C0/C1 controls that make `java\0script:` and
 * `java&#09;script:` work — before looking at the scheme.
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
  // No scheme at all: relative path, `#anchor`, `//host` — all inert.
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

/**
 * Install the link/image hooks on a DOMPurify instance. Exported so the
 * gateway twin can be diffed against this file, and so a test can build a
 * throwaway instance.
 */
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
  // `data:` URIs are off by default in DOMPurify's URI regexp; re-open them
  // for `<img>` only, and the hook above still narrows them to raster images.
  ADD_DATA_URI_TAGS: ['img'],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: true,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  // Keep the text inside a dropped element — a pasted `<svg>words</svg>`
  // should lose the element, not the words a human wrote inside it.
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false,
};

// Our own instance, so the hooks above cannot leak into another consumer's
// `DOMPurify.sanitize()` (the default export is a shared singleton).
const purify = addNoteHtmlHooks(
  typeof window === 'undefined' ? DOMPurify : DOMPurify(window)
);

/**
 * Sanitize stored note HTML for rendering.
 *
 * Idempotent: `sanitizeNoteHtml(sanitizeNoteHtml(x)) === sanitizeNoteHtml(x)`.
 *
 * @param {string} html  Raw stored note content.
 * @returns {string}     HTML safe to pass to `dangerouslySetInnerHTML`.
 */
export function sanitizeNoteHtml(html) {
  if (typeof html !== 'string' || html === '') return '';
  return purify.sanitize(html, PURIFY_CONFIG);
}

export default sanitizeNoteHtml;
