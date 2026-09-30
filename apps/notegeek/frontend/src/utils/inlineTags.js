/**
 * Inline `#tags` — type `#house/garage` in a note's body and, on save, the
 * note is tagged `house/garage`.
 *
 * ## The rule
 *
 * A tag is `#`, at the start of the text or after whitespace or `(`, then a
 * LETTER, then letters / digits / `_` / `-` / `/` (Unicode letters and marks
 * welcome: `#café`, `#日記`). It stops at anything else — whitespace or
 * punctuation (`#house.` is `house`). A trailing `/` is dropped, and the
 * result is normalized exactly as the gateway normalizes a stored tag
 * (`tagPath.js`).
 *
 * Not tags:
 *   - a Markdown heading: `# Heading` (hash then space — no letter follows);
 *   - anything in fenced or inline code (``` ``` ```, `` `#x` ``, <pre>, <code>);
 *   - URLs and link targets: `https://x.com/#section`, `[a](#anchor)`,
 *     `<a href="#x">`, a `[ref]: url` definition;
 *   - a hash glued to a word: `C#`, `a#b`, `&#35;`, `\#escaped`;
 *   - pure digits and anything starting with one: `#1`, `#2nd`;
 *   - hex colours: 3, 4, 6 or 8 hex characters and nothing else —
 *     `#fff`, `#a1b2c3`, `#ffffffff`. The price: a tag that happens to be
 *     all hex (`#cafe`, `#beef`, `#add`) is read as a colour. Rename it or
 *     add it as a chip.
 *
 * Applies to `markdown` and `text` (rich-text HTML) notes only — code, mind
 * maps and sketches have no prose to read. Additive only: deleting the text
 * does not delete the tag; the chip is how a tag is removed.
 */
import { normalizeTag } from './tagPath';

/** Which note types have inline tags read from their body. */
export const INLINE_TAG_TYPES = new Set(['markdown', 'text']);
export const supportsInlineTags = (type) => INLINE_TAG_TYPES.has(type || 'text');

/** The gateway's limits (`validation.js`): 100 characters a tag, 50 tags a note. */
export const TAG_MAX_LENGTH = 100;
export const TAGS_MAX = 50;

const HEX_COLOUR = /^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Every tag-shaped `#token` in plain text, with where it sits. The one regex
 * both the extractor and the Markdown renderer's highlighter use.
 *
 * `atStart` says whether the very beginning of `text` counts as a boundary —
 * false when the text continues a word from an earlier node.
 *
 * @returns {Array<{ tag: string, start: number, end: number }>} `start` is the
 *   index of the `#`; `end` is just past the token as written.
 */
export function findTagTokens(text, { atStart = true } = {}) {
  if (typeof text !== 'string' || !text.includes('#')) return [];
  const out = [];
  const re = /(^|[\s(])#(\p{L}[\p{L}\p{M}\p{N}_\-/]*)/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length;
    if (start === 0 && !atStart) continue;
    const raw = m[2];
    const token = raw.replace(/\/+$/, '');
    const tag = normalizeTag(token);
    if (!tag || HEX_COLOUR.test(tag) || tag.length > TAG_MAX_LENGTH) continue;
    out.push({ tag, start, end: start + 1 + token.length });
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

function markdownProse(md) {
  return stripFences(md.replace(/\r\n?/g, '\n'))
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

// ── Rich text (TipTap HTML) → the prose in it ─────────────────────────────

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

function htmlProse(html) {
  const text = html
    .replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(BLOCK_BOUNDARY, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text).replace(URL_RE, ' ');
}

/**
 * The inline tags in a note body, normalized, in first-seen order, deduped
 * case-insensitively (the first spelling wins).
 */
export function extractInlineTags(content, type) {
  if (typeof content !== 'string' || !content || !supportsInlineTags(type)) return [];
  const prose = (type === 'markdown') ? markdownProse(content) : htmlProse(content);
  const seen = new Set();
  const out = [];
  for (const { tag } of findTagTokens(prose)) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * The note's tags after a save reads its body.
 *
 * Additive: every inline tag the note does not already carry (compared
 * case-insensitively, so `#work` does not add a second `Work`) is appended,
 * up to the gateway's 50. Nothing the user put on the note is taken off.
 *
 * Two session-only memories keep autosave honest:
 *   - `provisional` — tags THIS session added from the body. Autosave fires
 *     mid-word, so typing `#house/garage` can save `#hou` first. A
 *     provisional tag that has left the body AND is a prefix of an inline tag
 *     that is there now (`hou` → `house`, `house/gar` → `house/garage`) was
 *     a word still being typed, and is taken back off. Anything else stays.
 *   - `suppressed` — tags the user removed by chip this session. The body is
 *     not allowed to put them straight back.
 *
 * @returns {{ tags: string[], provisional: Set<string>, changed: boolean }}
 */
export function applyInlineTags({ tags, content, type, provisional = new Set(), suppressed = new Set() }) {
  const current = Array.isArray(tags) ? tags : [];
  const nextProvisional = new Set(provisional);
  if (!supportsInlineTags(type)) return { tags: current, provisional: nextProvisional, changed: false };

  const found = extractInlineTags(content, type);
  const foundSet = new Set(found);
  const isPartial = (t) => !foundSet.has(t) && found.some((f) => f !== t && f.startsWith(t));

  let next = current.filter((t) => {
    if (nextProvisional.has(t) && isPartial(t)) {
      nextProvisional.delete(t);
      return false;
    }
    return true;
  });
  for (const t of nextProvisional) if (!next.includes(t)) nextProvisional.delete(t);

  const have = new Set(next.map((t) => t.toLowerCase()));
  const blocked = new Set([...suppressed].map((t) => String(t).toLowerCase()));
  for (const tag of found) {
    if (next.length >= TAGS_MAX) break;
    const key = tag.toLowerCase();
    if (have.has(key) || blocked.has(key)) continue;
    have.add(key);
    next.push(tag);
    nextProvisional.add(tag);
  }

  const changed = next.length !== current.length || next.some((t, i) => t !== current[i]);
  return { tags: changed ? next : current, provisional: nextProvisional, changed };
}
