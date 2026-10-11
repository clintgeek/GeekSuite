/**
 * Normalization — pure functions, no I/O. DOCS/NEWSGEEK_PLAN.md "Ingest".
 *
 * We store the title, the feed's own excerpt (capped), the link and metadata.
 * Never the article body: a full-text feed's content is cut to EXCERPT_MAX.
 */
import constants from '@geeksuite/schemas/newsgeek/constants';

const { EXCERPT_MAX } = constants;

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  sbquo: '‚', bdquo: '„', laquo: '«', raquo: '»', bull: '•', middot: '·', copy: '©',
  reg: '®', trade: '™', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', times: '×',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í', oacute: 'ó', uacute: 'ú',
  ntilde: 'ñ', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', thinsp: ' ',
  ensp: ' ', emsp: ' ', zwnj: '', zwj: '', shy: '', prime: '′', Prime: '″', dagger: '†',
  euro: '€', pound: '£', cent: '¢', sect: '§', para: '¶',
};

/** Decode HTML character references (named — the common set — and numeric). */
export function decodeEntities(s) {
  if (!s) return '';
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '';
      try { return String.fromCodePoint(code); } catch { return ''; }
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, ref) ? NAMED_ENTITIES[ref] : m;
  });
}

export function collapseWhitespace(s) {
  return String(s ?? '').replace(/[\s\u00a0\u200b]+/g, ' ').trim();
}

/** HTML → plain text: drop script/style/figure captions' markup, tags → spaces, entities decoded. */
export function stripHtml(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|iframe|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  // Block-level tags separate words; inline ones (<em>, <a>, <b>) don't —
  // "<em>new</em>." must stay "new.", not "new .".
  s = s.replace(/<\/?(p|div|br|hr|li|ul|ol|h[1-6]|tr|td|th|table|blockquote|section|article|header|footer|figure|figcaption|pre|dd|dt|dl)\b[^>]*>/gi, ' ');
  s = s.replace(/<[^>]*>/g, '');
  // Entities after tags: an escaped "&lt;b&gt;" in a feed is text, not
  // markup. Twice, because plenty of feeds double-escape ("&amp;nbsp;").
  s = decodeEntities(decodeEntities(s));
  return collapseWhitespace(s);
}

/** Cap at `max` characters on a word boundary, with an ellipsis that fits inside `max`. */
export function capOnWord(text, max = EXCERPT_MAX) {
  const s = collapseWhitespace(text);
  if (s.length <= max) return s;
  const room = max - 1; // for the ellipsis
  let cut = s.slice(0, room);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > room * 0.6) cut = cut.slice(0, lastSpace);
  return `${cut.replace(/[\s,;:.\-–—]+$/, '')}…`;
}

// ---------------------------------------------------------------------------
// Excerpt boilerplate (2026-10-11, plan "Ingest hygiene"). Production had 567
// excerpts ending in WordPress's "The post … appeared first on …." and 64 in
// "Continue reading" / "Read more". Every pattern is anchored at the END of
// the excerpt, so nothing in the middle of the text is ever removed; the
// "Continue reading" / "Read more" ones must also start a sentence (or the
// excerpt), so "…where you can read more." stays.
// ---------------------------------------------------------------------------

// "The post <title> appeared first on <site>." The tempered token stops the
// title part at another "The post ", so a body that mentions "the post
// office" earlier is never swallowed: only the LAST "The post …" can match.
const WP_FOOTER = /\s*The post (?:(?!The post ).){1,300}? appeared first on [^!?\n]{1,120}?\.?\s*$/;
// After a sentence end (or at the very start): an optional "[", the phrase,
// an optional quoted title (WordPress: Continue reading "Title"), an optional
// arrow or ellipsis, an optional "]". Case-sensitive on purpose.
const CONTINUE_READING = /(?:^|(?<=[.!?…"”')\]]))\s*(?:\[\s*)?Continue reading(?:\s+[“"][^”"]{1,200}[”"])?(?:\s*(?:→|»|›|\.{3}|…))?(?:\s*\])?\s*$/;
const READ_MORE = /(?:^|(?<=[.!?…"”')\]]))\s*(?:\[\s*)?Read [Mm]ore(?:\s*(?:→|»|›|\.{3}|…))?(?:\s*\])?\s*$/;
// "[…]" / "[...]" (WordPress's excerpt_more): the text WAS cut, so it becomes
// a plain "…" rather than vanishing.
const BRACKET_ELLIPSIS = /\s*\[\s*(?:…|\.{3})\s*\]\s*$/;

/** Strip feed boilerplate from the END of an excerpt; whitespace collapsed. Pure, idempotent. */
export function cleanExcerpt(text) {
  let s = collapseWhitespace(text);
  for (let i = 0; i < 4; i += 1) {
    const before = s;
    s = s.replace(WP_FOOTER, '');
    s = s.replace(CONTINUE_READING, '');
    s = s.replace(READ_MORE, '');
    s = s.replace(BRACKET_ELLIPSIS, '…');
    s = s.trim();
    if (s === before) break;
  }
  return s;
}

/**
 * The excerpt we store: the feed's own summary/description, stripped,
 * cleaned of boilerplate and capped; if there is none, a capped slice of the
 * content stripped of HTML. Sources marked `access.content: 'title'`
 * (Hacker News, Google News) store none.
 */
export function makeExcerpt({ summary, content }, { contentLevel } = {}) {
  if (contentLevel === 'title') return '';
  const fromSummary = cleanExcerpt(stripHtml(summary));
  if (fromSummary) return capOnWord(fromSummary);
  // Only the opening of a full text: cut the HTML before stripping so a
  // 1.4 MB feed never makes us strip whole articles.
  const fromContent = cleanExcerpt(stripHtml(String(content ?? '').slice(0, EXCERPT_MAX * 8)));
  return capOnWord(fromContent);
}

export function cleanTitle(title) {
  return collapseWhitespace(stripHtml(title)).slice(0, 500);
}

// Tracking params stripped from canonical URLs. Prefix rules end with '*'.
// Conservative on purpose: over-stripping (a `cid` that is really a content
// id) would make two different articles one URL and silently drop one of
// them; under-stripping only costs a missed dedupe.
const TRACKING_PARAMS = [
  'utm_*', 'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'yclid', 'twclid', 'igshid',
  'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'mkt_tok', 'ocid', 'cmpid', 'at_medium',
  'at_campaign', 'at_custom*', 'ref_src', 'sr_share', 'smid', 'ns_*',
  'guccounter', 'guce_*', 'wt.mc_id', 'wt_mc_id',
];

function isTrackingParam(name) {
  const n = name.toLowerCase();
  return TRACKING_PARAMS.some((p) => (p.endsWith('*') ? n.startsWith(p.slice(0, -1)) : n === p));
}

/**
 * Canonical URL for dedupe: tracking params stripped, fragment removed,
 * scheme + host lowercased, default port dropped. Path case and the rest of
 * the query are kept (they can be meaningful). Unparseable → the input, trimmed.
 */
export function canonicalUrl(raw) {
  const s = String(raw ?? '').trim();
  let u;
  try { u = new URL(s); } catch { return s; }
  u.hash = '';
  // (The URL parser already lowercases the host and drops a default port.)
  for (const name of [...u.searchParams.keys()]) {
    if (isTrackingParam(name)) u.searchParams.delete(name);
  }
  let out = u.toString();
  if (out.endsWith('?')) out = out.slice(0, -1);
  return out;
}

/** Hostname without a leading www., lowercased; null when not a URL. */
export function domainOf(raw) {
  if (!raw) return null;
  try {
    const host = new URL(String(raw).trim()).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** True when `domain` is `base` or a subdomain of it (suffix match on a label boundary). */
export function domainMatches(domain, base) {
  if (!domain || !base) return false;
  const d = String(domain).toLowerCase().replace(/^www\./, '');
  const b = String(base).toLowerCase().replace(/^www\./, '');
  return d === b || d.endsWith(`.${b}`);
}

/** Strip a trailing " - Publisher" (Google News titles) when it names this publisher. */
export function stripPublisherSuffix(title, publisher) {
  const t = collapseWhitespace(title);
  if (!publisher) return t;
  const p = collapseWhitespace(publisher);
  for (const sep of [' - ', ' – ', ' — ', ' | ']) {
    const suffix = `${sep}${p}`;
    if (t.length > suffix.length && t.toLowerCase().endsWith(suffix.toLowerCase())) {
      return t.slice(0, t.length - suffix.length).trim();
    }
  }
  return t;
}

/**
 * Normalized title for dedupe and (N1) syndication: aggregator suffix
 * removed, lowercased, punctuation stripped, whitespace collapsed.
 */
export function titleKey(title, { publisher } = {}) {
  let t = collapseWhitespace(decodeEntities(title));
  if (publisher) t = stripPublisherSuffix(t, publisher);
  return t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')       // accents
    .replace(/['\u2018\u2019`]/g, '')                 // don't → dont, not "don t"
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * publishedAt: the item's date, or fetchedAt when it is missing,
 * unparseable, or more than an hour in the future (a bad feed clock must not
 * pin an item to the top of a chronological list).
 */
export function resolvePublishedAt(raw, fetchedAt) {
  if (raw == null || raw === '') return fetchedAt;
  const t = Date.parse(String(raw).trim());
  if (!Number.isFinite(t)) return fetchedAt;
  if (t > fetchedAt.getTime() + HOUR_MS) return fetchedAt;
  return new Date(t);
}

export default {
  decodeEntities, stripHtml, capOnWord, makeExcerpt, cleanExcerpt, cleanTitle, canonicalUrl, domainOf,
  domainMatches, stripPublisherSuffix, titleKey, resolvePublishedAt, collapseWhitespace,
};
