/**
 * Inline `#tags` — the reader for `#house/garage` written in running text.
 * Moved here from NoteGeek (`frontend/src/utils/inlineTags.js`, 2026-09-30) so
 * BuJoGeek's add box reads `#tags` by the same rule.
 *
 * ## The token rule
 *
 * `#`, at the start of the text or after whitespace or `(`, then a LETTER,
 * then letters / marks / digits / `_` / `-` / `/`. It stops at anything else —
 * whitespace or punctuation (`#house.` is `house`). A trailing `/` is dropped,
 * and the token is normalized to the suite standard (`normalize.js`), so
 * `#GeekSuite` is `geek-suite` and `#Road_Map` is `road-map`.
 *
 * Not tags:
 *   - a Markdown heading: `# Heading` (hash then space — no letter follows);
 *   - a hash glued to a word: `C#`, `a#b`, `&#35;`, `\#escaped`;
 *   - anything starting with a digit: `#1`, `#42`, `#2nd`;
 *   - hex colours (option `hexColours`, on by default): exactly 3, 4, 6 or 8
 *     hex characters — `#fff`, `#a1b2c3`, `#ffffffff`. The price: a tag that
 *     happens to be all hex (`#cafe`, `#beef`, `#add`) reads as a colour;
 *   - a tag over `TAG_MAX_LENGTH` once normalized.
 *
 * `parseInlineTags` additionally, for `markdown` / `html` text, ignores code
 * (fenced, inline, `<pre>`, `<code>`), URLs and link targets
 * (`https://x.com/#s`, `[a](#anchor)`, `<a href="#x">`, `[ref]: url`).
 */
import { normalizeTag, TAG_MAX_LENGTH, TAGS_MAX } from './normalize.js';

const HEX_COLOUR = /^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TOKEN = /(^|[\s(])#(\p{L}[\p{L}\p{M}\p{N}_\-/]*)/gu;

/**
 * Every tag-shaped `#token` in plain text, with where it sits.
 *
 * @param {string} text
 * @param {{ atStart?: boolean, hexColours?: boolean }} [options]
 *   `atStart` — whether the very beginning of `text` counts as a boundary
 *   (false when the text continues a word from an earlier node).
 *   `hexColours` — skip `#fff`-shaped tokens (default true).
 * @returns {Array<{ tag: string, raw: string, start: number, end: number }>}
 *   `tag` normalized; `raw` as written (no `#`, no trailing `/`); `start` is
 *   the index of the `#`; `end` is just past the token as written.
 */
export function findTagTokens(text, { atStart = true, hexColours = true } = {}) {
  if (typeof text !== 'string' || !text.includes('#')) return [];
  const out = [];
  const re = new RegExp(TOKEN.source, TOKEN.flags);
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length;
    if (start === 0 && !atStart) continue;
    const raw = m[2].replace(/\/+$/, '');
    const tag = normalizeTag(raw);
    if (!tag || tag.length > TAG_MAX_LENGTH) continue;
    if (hexColours && HEX_COLOUR.test(raw)) continue;
    out.push({ tag, raw, start, end: start + 1 + raw.length });
  }
  return out;
}

// ── Markdown → the prose in it ────────────────────────────────────────────

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

/** Drop fenced code blocks (an unclosed fence runs to the end, as CommonMark says). */
function stripFences(md) {
  const lines = md.split('\n');
  const kept = [];
  let fence = null;
  for (const line of lines) {
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      kept.push('');
      continue;
    }
    const open = line.match(FENCE_OPEN);
    if (open) {
      fence = open[1];
      kept.push('');
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/\S+|\bwww\.\S+/gi;

/** The prose of a Markdown document: code, link targets, HTML and URLs blanked. */
export function markdownProse(md) {
  return stripFences(String(md).replace(/\r\n?/g, '\n'))
    // inline code, any run length: `x`, ``a `b` c``
    .replace(/(`+)(?:(?!\1)[\s\S])*?\1/g, ' ')
    // reference-link definitions: [ref]: https://…
    .replace(/^ {0,3}\[[^\]\n]+\]:[^\n]*$/gm, ' ')
    // inline link / image targets: ](url "title") — keep the bracketed text
    .replace(/\]\([^)\n]*\)/g, '] ')
    // autolinks and raw HTML: <https://…>, <a href="#x">
    .replace(/<[^>\n]*>/g, ' ')
    .replace(URL_RE, ' ');
}

// ── Rich text (HTML) → the prose in it ────────────────────────────────────

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, name) => {
    const lower = name.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16) || 32);
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10) || 32);
    return whole;
  });
}

// Tags that end a line of text. Anything else (strong, em, a, span…) is
// inline, and stripping it leaves the words it wrapped touching, as on screen.
const BLOCK_BOUNDARY = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|blockquote|tr|td|th|table|hr)\b[^>]*>/gi;

/** The prose of an HTML fragment: code removed, blocks → lines, entities decoded, URLs blanked. */
export function htmlProse(html) {
  const text = String(html)
    .replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(BLOCK_BOUNDARY, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text).replace(URL_RE, ' ');
}

/**
 * The inline tags in a piece of text, normalized, deduped, in first-seen
 * order, at most `TAGS_MAX`.
 *
 * @param {string} text
 * @param {{ format?: 'markdown'|'html'|'plain', hexColours?: boolean }} [options]
 *   `format` (default `markdown`) decides what counts as prose.
 * @returns {string[]}
 */
export function parseInlineTags(text, { format = 'markdown', hexColours = true } = {}) {
  if (typeof text !== 'string' || !text) return [];
  const prose = format === 'html' ? htmlProse(text) : format === 'plain' ? text : markdownProse(text);
  const seen = new Set();
  const out = [];
  for (const { tag } of findTagTokens(prose, { hexColours })) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= TAGS_MAX) break;
  }
  return out;
}
