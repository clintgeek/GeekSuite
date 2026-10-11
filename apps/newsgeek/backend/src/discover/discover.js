/**
 * Discovery — "paste a link, see what we'd add". DOCS/NEWSGEEK_PLAN.md
 * "Reader-added sources" → "Discovery: POST /api/discover".
 *
 * Every request goes through the SSRF guard (`fetchImpl` is a safeFetch) and
 * counts against a budget of DISCOVERY_BUDGET requests (each redirect hop
 * counts). Candidate order:
 *   1. the URL itself, if it parses as a feed;
 *   2. the page's <link rel="alternate"> RSS/Atom feeds;
 *   3. the platform paths (WordPress, Blox, CivicPlus, Wix, then the generic
 *      ones), the detected platform's first — only when 1 and 2 found nothing,
 *      and stopping at the first that parses.
 * Each candidate is validated with the ingest parser. One request is kept
 * back for the paywall check on one article from the best feed.
 */
import { parseFeed } from '../ingest/parse.js';
import { readCapped, decode, USER_AGENT, DEFAULT_MAX_BYTES } from '../ingest/fetchFeed.js';
import { cleanTitle, decodeEntities } from '../ingest/normalize.js';
import { buildPlaceMatcher } from '../ingest/places.js';
import { detectPaywall } from '../ingest/paywallMarkers.js';
import { UnsafeUrlError, BudgetExceededError } from '../lib/safeFetch.js';
import feedUrlModule from '@geeksuite/schemas/newsgeek/feedUrl';
import paywallsModule from '@geeksuite/schemas/newsgeek/paywalls';

const { normalizeFeedUrl } = feedUrlModule;
const { isPaywalledDomain } = paywallsModule;

export const DISCOVERY_BUDGET = 10;
export const REQUEST_TIMEOUT_MS = 8_000;
export const DISCOVERY_DEADLINE_MS = 30_000;
export const PAGE_MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ALTERNATES = 6;
export const NO_FEED_MESSAGE = 'No feed found — this site only publishes web pages';

/** The usual paths, in plan order. `platform` marks the one to try first when detected. */
export const PLATFORM_PATHS = [
  { platform: 'wordpress', path: '/feed/' },
  { platform: 'blox', path: '/search/?f=rss&t=article&l=50' },
  { platform: 'civicplus', path: '/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml' },
  { platform: 'wix', path: '/blog-feed.xml' },
  { platform: null, path: '/rss' },
  { platform: null, path: '/rss.xml' },
  { platform: null, path: '/feed.atom' },
  { platform: null, path: '/index.rss' },
];

const ACCEPT_PAGE = 'text/html,application/xhtml+xml,application/rss+xml;q=0.9,application/atom+xml;q=0.9,application/xml;q=0.8,*/*;q=0.5';
const ACCEPT_FEED = 'application/rss+xml, application/atom+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8, */*;q=0.5';
const FEED_TYPES = /^application\/(rss|atom|rdf)\+xml$/i;

export class DiscoverInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DiscoverInputError';
    this.code = 'BAD_URL';
  }
}

/** Accept bare domains ("arkadelphian.com" → https://arkadelphian.com/). http(s) only. */
export function normalizeInputUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) throw new DiscoverInputError('Paste a link to a news site or feed.');
  if (s.length > 2000) throw new DiscoverInputError('That link is too long.');
  // "mailto:x", "javascript:…": a scheme that isn't followed by // (and isn't host:port).
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) {
    throw new DiscoverInputError('Only http and https links can be added.');
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s.replace(/^\/\//, '')}`;
  let u;
  try { u = new URL(withScheme); } catch { throw new DiscoverInputError("That doesn't look like a web address."); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new DiscoverInputError('Only http and https links can be added.');
  if (!u.hostname.includes('.') && !u.hostname.startsWith('[')) throw new DiscoverInputError("That doesn't look like a web address.");
  u.hash = '';
  return u.href;
}

// ---------------------------------------------------------------------------
// HTML scraping (regex, deliberately small)
// ---------------------------------------------------------------------------

function attrsOf(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag)) !== null) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

/** <link rel="alternate" type="application/rss+xml|atom+xml" href> → absolute URLs, comments feeds skipped. */
export function extractAlternates(html, baseUrl) {
  const out = [];
  for (const tag of String(html).match(/<link\b[^>]*>/gi) || []) {
    const a = attrsOf(tag);
    const rels = String(a.rel || '').toLowerCase().split(/\s+/);
    if (!rels.includes('alternate') || !FEED_TYPES.test(String(a.type || '').trim()) || !a.href) continue;
    if (/comments/i.test(a.title || '') || /\/comments\/feed\/?$/i.test(a.href)) continue;
    try {
      const u = new URL(a.href.trim(), baseUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') out.push(u.href);
    } catch { /* skip */ }
  }
  return [...new Set(out)];
}

function cleanSiteName(s) {
  return cleanTitle(decodeEntities(s || ''))
    .replace(/\s*[»|–—-]\s*(?:comments\s+)?(?:feed|rss.*)$/i, '')
    .trim()
    .slice(0, 160);
}

export function extractSiteName(html) {
  for (const tag of String(html).match(/<meta\b[^>]*>/gi) || []) {
    const a = attrsOf(tag);
    if ((a.property || a.name || '').toLowerCase() === 'og:site_name' && a.content) return cleanSiteName(a.content);
  }
  const t = /<title[^>]*>([^<]*)<\/title>/i.exec(String(html));
  if (!t) return '';
  // "Home | The Gurdon Times" / "The Gurdon Times – Local news": the longest
  // part that isn't a generic word.
  const parts = cleanSiteName(t[1]).split(/\s+[|–—-]\s+/).map((x) => x.trim()).filter((x) => x && !/^(home|homepage|welcome|news)$/i.test(x));
  return parts.sort((x, y) => y.length - x.length)[0] || '';
}

export function detectPlatform(html) {
  const s = String(html);
  if (/civicplus/i.test(s)) return 'civicplus';
  if (/bloximages|tncms|townnews/i.test(s)) return 'blox';
  if (/wixstatic|wix\.com|_wixCssImports/i.test(s)) return 'wix';
  if (/wp-content|wp-includes|<meta[^>]+generator[^>]+WordPress/i.test(s)) return 'wordpress';
  return null;
}

export function suggestKind(hostname, platform) {
  const h = String(hostname || '').toLowerCase();
  if (/\.(gov|mil|us)$/.test(h) || /(^|\.)k12\./.test(h) || /(^|[.-])k12([.-]|$)/.test(h) || platform === 'civicplus') return 'official';
  return 'journalism';
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function summarizeFeed(url, parsed, now) {
  const limit = now.getTime() + 24 * 3600 * 1000;
  const dated = parsed.items.map((it) => {
    const t = Date.parse(it.date);
    return { it, t: Number.isFinite(t) && t <= limit ? t : null };
  });
  dated.sort((a, b) => (b.t ?? -Infinity) - (a.t ?? -Infinity));
  const newestT = dated.find((d) => d.t != null)?.t ?? null;
  return {
    url,
    format: parsed.kind === 'atom' ? 'atom' : 'rss',
    items: parsed.items.length,
    newest: newestT != null ? new Date(newestT).toISOString() : null,
    sampleTitles: dated.map((d) => cleanTitle(d.it.title)).filter(Boolean).slice(0, 3),
    // internal, stripped before responding
    _title: parsed.title,
    _link: parsed.link,
    _articleLinks: dated.map((d) => d.it.link).filter((l) => /^https?:\/\//i.test(l || '')),
  };
}

const publicFeed = ({ url, format, items, newest, sampleTitles }) => ({ url, format, items, newest, sampleTitles });

/**
 * @param {object} args
 * @param {string} args.url                 raw reader input
 * @param {Function} args.fetchImpl         a safeFetch (never bare fetch)
 * @param {object} args.models              { Place, Source }
 * @param {() => Date} [args.now]
 * @param {number} [args.budget]
 * @returns {Promise<object>} the response body (plan shape, plus `code` when ok is false)
 * @throws {DiscoverInputError|UnsafeUrlError} for the reader's own URL
 */
export async function discover({ url: raw, fetchImpl, models, now = () => new Date(), budget = DISCOVERY_BUDGET }) {
  const inputUrl = normalizeInputUrl(raw);
  const ctx = { budget: { remaining: budget }, deadline: AbortSignal.timeout(DISCOVERY_DEADLINE_MS) };
  const at = now();

  async function get(url, { accept, maxBytes }) {
    const signal = AbortSignal.any([ctx.deadline, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
    const res = await fetchImpl(url, { method: 'GET', headers: { 'User-Agent': USER_AGENT, Accept: accept }, signal, budget: ctx.budget });
    if (res.status < 200 || res.status >= 300) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return { status: res.status, url: res.url || url, body: null };
    }
    const buf = await readCapped(res, maxBytes);
    return { status: res.status, url: res.url || url, body: decode(buf, res.headers.get('content-type')) };
  }

  const feeds = [];
  const seen = new Set();
  /** Fetch + parse one candidate; never throws (a bad candidate is skipped). */
  async function tryCandidate(url) {
    const key = normalizeFeedUrl(url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    try {
      const r = await get(url, { accept: ACCEPT_FEED, maxBytes: DEFAULT_MAX_BYTES });
      if (!r.body) return false;
      const parsed = parseFeed(r.body, 'rss');
      feeds.push(summarizeFeed(r.url, parsed, at));
      return true;
    } catch (err) {
      if (err instanceof BudgetExceededError) throw err;
      return false;
    }
  }

  // 1. The reader's URL. Unsafe → the caller's error (nothing was fetched).
  let first;
  let firstError = null;
  try {
    first = await get(inputUrl, { accept: ACCEPT_PAGE, maxBytes: PAGE_MAX_BYTES });
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    firstError = err;
    first = { status: null, url: inputUrl, body: null };
  }
  const base = new URL(first.url);
  let siteName = '';
  let siteLink = '';
  let platform = null;
  let inputWasFeed = false;

  try {
    if (first.body != null) {
      try {
        const parsed = parseFeed(first.body, 'rss');
        const f = summarizeFeed(first.url, parsed, at);
        feeds.push(f);
        seen.add(normalizeFeedUrl(first.url));
        inputWasFeed = true;
        siteName = cleanSiteName(parsed.title);
        siteLink = parsed.link;
      } catch {
        // A web page: read it for alternates, a name and a platform.
        siteName = extractSiteName(first.body);
        platform = detectPlatform(first.body);
        const alternates = extractAlternates(first.body, first.url).slice(0, MAX_ALTERNATES);
        for (const alt of alternates) {
          if (ctx.budget.remaining <= 1) break; // keep one for the paywall check
          await tryCandidate(alt);
        }
      }
    }

    // 3. Platform paths, only when nothing was found, first hit wins.
    if (!feeds.length && !firstError) { // a network failure on the site itself: guessing paths would only burn the budget
      const ordered = [
        ...PLATFORM_PATHS.filter((p) => p.platform && p.platform === platform),
        ...PLATFORM_PATHS.filter((p) => !p.platform || p.platform !== platform),
      ];
      for (const { path } of ordered) {
        if (ctx.budget.remaining <= 1) break;
        if (await tryCandidate(new URL(path, base.origin).href)) break;
      }
    }
  } catch (err) {
    if (!(err instanceof BudgetExceededError)) throw err;
  }

  const homepage = (() => {
    if (inputWasFeed && /^https?:\/\//i.test(siteLink || '')) {
      try { return `${new URL(siteLink).origin}/`; } catch { /* fall through */ }
    }
    return `${base.origin}/`;
  })();
  const hostname = new URL(homepage).hostname;

  if (!feeds.length) {
    const unreachable = first.body == null;
    return {
      ok: false,
      code: unreachable ? 'UNREACHABLE' : 'NO_FEED',
      site: { name: siteName || hostname.replace(/^www\./, ''), homepage },
      feeds: [],
      paywall: { level: 'unknown', evidence: null },
      suggest: null,
      existingSourceId: null,
      message: unreachable
        ? `Couldn't read that site${first.status ? ` (it answered HTTP ${first.status})` : ''}.`
        : NO_FEED_MESSAGE,
    };
  }

  // Best first: most recent item, then the most items.
  feeds.sort((a, b) => (Date.parse(b.newest) || -Infinity) - (Date.parse(a.newest) || -Infinity) || b.items - a.items);
  const best = feeds[0];
  if (!siteName) siteName = cleanSiteName(best._title) || hostname.replace(/^www\./, '');

  // Paywall: one article page from the best feed.
  let paywall = { level: 'unknown', evidence: 'No article link to check.' };
  const article = best._articleLinks[0];
  if (article) {
    try {
      const r = await get(article, { accept: ACCEPT_PAGE, maxBytes: PAGE_MAX_BYTES });
      if (r.body == null) {
        paywall = { level: 'unknown', evidence: `The article page answered HTTP ${r.status}.` };
      } else {
        const found = detectPaywall(r.body);
        paywall = {
          level: found.level,
          evidence: found.markers.length ? `On ${r.url}: ${found.markers.join(', ')}` : `No paywall markers on ${r.url}`,
        };
      }
    } catch (err) {
      paywall = {
        level: 'unknown',
        evidence: err instanceof BudgetExceededError ? 'Out of requests before the article check.'
          : err instanceof UnsafeUrlError ? `The article link is not on the public internet.`
            : "Couldn't fetch an article page.",
      };
    }
  }
  if ((paywall.level === 'none' || paywall.level === 'unknown') && isPaywalledDomain(hostname)) {
    paywall = { level: 'metered', evidence: `${hostname} is on NewsGeek's paywalled-publisher list` };
  }

  // Suggestions.
  const [places, sources] = await Promise.all([
    models.Place.find({}, { slug: 1, name: 1, aliases: 1, parentId: 1, kind: 1 }).lean(),
    models.Source.find({}, { 'feeds.url': 1 }).lean(),
  ]);
  const matcher = buildPlaceMatcher(places);
  const ids = matcher.match([siteName, ...best.sampleTitles].join('\n'), []);
  const byId = new Map(places.map((p) => [String(p._id), p]));
  const matched = ids.map((id) => byId.get(String(id))).filter(Boolean);
  const sections = matched.some((p) => p.kind === 'town' || p.kind === 'county') ? ['local']
    : matched.some((p) => p.kind === 'state') ? ['state'] : [];

  // Already here? The best feed's owner first, then any other feed's.
  const owner = new Map();
  for (const s of sources) for (const f of s.feeds || []) {
    const k = normalizeFeedUrl(f.url);
    if (k && !owner.has(k)) owner.set(k, String(s._id));
  }
  const existingSourceId = feeds.map((f) => owner.get(normalizeFeedUrl(f.url))).find(Boolean) || null;

  return {
    ok: true,
    site: { name: siteName, homepage },
    feeds: feeds.map(publicFeed),
    paywall,
    suggest: { name: siteName, kind: suggestKind(hostname, platform), sections, placeSlugs: matched.map((p) => p.slug).sort() },
    existingSourceId,
    message: existingSourceId ? 'Already here — turn it on.' : `Found ${feeds.length} feed${feeds.length === 1 ? '' : 's'}.`,
  };
}

export default { discover, normalizeInputUrl, extractAlternates, extractSiteName, detectPlatform, suggestKind };
