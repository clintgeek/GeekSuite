/**
 * The suite tag standard — one spelling for every free-form tag in NoteGeek,
 * BuJoGeek and ThingGeek (Chef, 2026-10-01: "case-insensitive Kebab case is
 * the standard we need to move to"). BookGeek and GameGeek genres are curated
 * vocabularies and do NOT use this.
 *
 * A tag is one or more lowercase kebab-case SEGMENTS joined by `/`:
 *
 *     work          house/garage          work/geek-suite          café/日記
 *
 * `/` is nesting (Bear-style): `house/garage` is a tag of its own AND sits
 * under `house`. Nothing about the tree is stored; it is read off the strings,
 * which is why every write path normalizes.
 *
 * ## normalizeTag(raw), step by step
 *
 *   1. Not a string → `''`. Unicode NFKC (full-width `ＡＢＣ` → `ABC`, the
 *      `ﬁ` ligature → `fi`), then trim. Leading `#`s are stripped.
 *   2. Split on `/`. For each segment:
 *      a. camelCase / PascalCase boundaries become word breaks:
 *         `geekSuite` → `geek Suite`, `GeekSuite` → `Geek Suite`,
 *         `HTTPServer` → `HTTP Server`, `v2Plan` → `v2 Plan`.
 *         A letter→digit boundary is NOT split (`v2`, `covid19`, `plan2`
 *         stay whole); digit→capital is (`2Plan` → `2 Plan`). An acronym's
 *         plural stays whole: `URLs`, `IDs`, `APIs` → `urls`, `ids`, `apis`.
 *      b. Everything outside the allowed set below is DROPPED (not turned
 *         into a hyphen): `R&D` → `rd`, `don't` → `dont`, `C++` → `c`,
 *         `rock & roll` → `rock-roll` (the spaces around it still separate).
 *      c. Every run of separators — whitespace, `_`, `-`, `.`, and the
 *         Unicode dashes U+2010–U+2015 and U+2212 — becomes ONE `-`.
 *      d. `toLowerCase()` (locale-independent).
 *      e. Leading/trailing `-` are trimmed.
 *      f. A segment left empty is dropped.
 *   3. Rejoin with `/`. A tag with no segments left is `''` — not a tag.
 *
 * ## The allowed character set (after normalization)
 *
 *   - Unicode letters `\p{L}` (any script: `café`, `日記`, `ß`, `ж`)
 *   - Unicode combining marks `\p{M}` (so decomposed or Indic text survives)
 *   - Unicode numbers `\p{N}`
 *   - `-` between words, `/` between segments
 *
 *   Everything else — punctuation (`& + ' " ! ? , ; : @ # $ % ^ * ( ) [ ] { }
 *   < > = | \ ~ \``), symbols, emoji, control and format characters — is
 *   dropped. A tag made only of those normalizes to `''`.
 *
 * Matching is case-insensitive BY CONSTRUCTION: every stored tag is
 * lowercase, so comparing normalized strings exactly is the comparison.
 *
 * Limits: 100 characters a tag (`TAG_MAX_LENGTH`, NoteGeek/BuJoGeek; ThingGeek
 * keeps its own 60) and 50 tags an item (`TAGS_MAX`). The normalizer does not
 * enforce them — the validators do, on the NORMALIZED value, because
 * normalizing can lengthen a tag (`GeekSuite` → `geek-suite`).
 *
 * Known costs, accepted: `iPhone` → `i-phone`, `McDonald` → `mc-donald`;
 * `c#` and `c` are the same tag; emoji tags vanish.
 */

/** The longest a tag may be, in characters, once normalized. */
export const TAG_MAX_LENGTH = 100;
/** The most tags one item may carry. */
export const TAGS_MAX = 50;

const SEPARATOR_RUN = /[\s_.‐-―−-]+/gu;
// Kept: letters, marks, numbers — and the separators, which (c) then folds.
const DISALLOWED = /[^\p{L}\p{M}\p{N}\s_.‐-―−-]/gu;

/** `geekSuite` → `geek Suite`; `HTTPServer` → `HTTP Server`; `URLs` stays. */
function splitCamel(segment) {
  return segment
    // lower or digit, then a capital: geekSuite, v2Plan, 2Plan
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    // a run of capitals, then Capital+lower: HTTPServer → HTTP Server.
    // Not when that lower is a lone plural `s` (URLs, IDs, APIs).
    .replace(/(\p{Lu})(\p{Lu})(\p{Ll})/gu, (whole, a, b, c, offset, str) => {
      const next = str[offset + whole.length] ?? '';
      if (c === 's' && !/\p{Ll}/u.test(next)) return whole;
      return `${a} ${b}${c}`;
    });
}

/** One path segment → kebab-case. May return `''`. */
export function normalizeSegment(segment) {
  if (typeof segment !== 'string') return '';
  return splitCamel(segment)
    .replace(DISALLOWED, '')
    .replace(SEPARATOR_RUN, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
}

/**
 * Any string → the standard spelling, or `''` when nothing tag-like is left.
 * `" #GeekSuite / Road_Map "` → `geek-suite/road-map`.
 */
export function normalizeTag(raw) {
  if (typeof raw !== 'string') return '';
  const text = raw.normalize('NFKC').trim().replace(/^#+/, '');
  return text
    .split('/')
    .map(normalizeSegment)
    .filter(Boolean)
    .join('/');
}

/**
 * Normalize every tag, drop the ones that end up empty, and dedupe (exact,
 * after normalization — so `Work` and `work` are one) keeping the FIRST
 * occurrence's position. A non-array is `[]`.
 */
export function normalizeTags(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** True when `raw` is already in the standard spelling (and is a tag). */
export const isNormalizedTag = (raw) => typeof raw === 'string' && raw !== '' && normalizeTag(raw) === raw;

// ── Paths ─────────────────────────────────────────────────────────────────

/** Escape a string for use inside a RegExp. */
export const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `tag` is `root` or sits beneath it. `house` is not over `houseboat`. */
export const isUnder = (tag, root) =>
  typeof tag === 'string' && typeof root === 'string' && root !== '' &&
  (tag === root || tag.startsWith(`${root}/`));

/** True when `tag` sits strictly beneath `root`. */
export const isDescendant = (tag, root) => isUnder(tag, root) && tag !== root;

/** `house/garage` with `house` → `home` becomes `home/garage`; others unchanged. */
export const swapPrefix = (tag, oldRoot, newRoot) =>
  isUnder(tag, oldRoot) ? newRoot + tag.slice(oldRoot.length) : tag;

/** `house/garage` → `house`; a top-level tag → `''`. */
export const parentTag = (tag) => {
  const i = typeof tag === 'string' ? tag.lastIndexOf('/') : -1;
  return i === -1 ? '' : tag.slice(0, i);
};

/**
 * A RegExp matching `root` and everything beneath it, and nothing else:
 * `^house(?:/|$)`. Escaped, so it is safe for Mongo `$regex` / `$in`.
 * Pass an already-normalized root.
 */
export const subtreeRegex = (root) => new RegExp(`^${escapeRegex(root)}(?:/|$)`);
