/**
 * Poll ONE feed: fetch → parse → normalize → filter → dedupe → store, then
 * write the feed's health bookkeeping. DOCS/NEWSGEEK_PLAN.md "Ingest".
 *
 * Restart safety: nothing here lives only in memory. A poll that dies
 * half-way (fleet restart) leaves the feed's nextPollAt unchanged, so the
 * next boot polls it again; every item already stored is skipped by the
 * dedupe layers below, so a re-poll inserts nothing twice.
 *
 * State writes are targeted `$set`s on `feeds.$[f]` (arrayFilters by the
 * feed's _id): a concurrent admin edit to the source from the gateway is
 * never clobbered by a whole-document save, and a feed an admin removed
 * mid-poll simply matches nothing.
 */
import crypto from 'node:crypto';
import constants from '@geeksuite/schemas/newsgeek/constants';
import { fetchFeed, FetchError } from './fetchFeed.js';
import { parseFeed } from './parse.js';
import {
  cleanTitle, makeExcerpt, canonicalUrl, domainOf, domainMatches, stripPublisherSuffix,
  titleKey as makeTitleKey, resolvePublishedAt, collapseWhitespace,
} from './normalize.js';

const { BROKEN_AFTER_FAILURES, ARTICLE_RETENTION_DAYS } = constants;

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

/** Backoff ceiling: a failing feed is still tried at least every 6 h. */
export const MAX_BACKOFF_MIN = 6 * 60;
/** A Retry-After longer than this is treated as this (a typo'd header must not park a feed for a year). */
export const MAX_RETRY_AFTER_MS = 24 * HOUR_MS;
/** Same source + same normalized title within this window = the same article. */
export const TITLE_DEDUPE_WINDOW_MS = 24 * HOUR_MS;

// Stale rule — see isStale().
export const STALE_GAP_MULTIPLIER = 7;
export const STALE_FLOOR_MS = 3 * DAY_MS;
export const STALE_GAP_SAMPLE = 10;

const ERROR_MAX = 300;

const isDupKey = (err) => err?.code === 11000;

/**
 * Failure backoff: pollEveryMin doubled per consecutive failure, capped at
 * MAX_BACKOFF_MIN; a Retry-After (429/503) wins when it asks for longer.
 * failures=1 → 2× the interval, 2 → 4×, …
 */
export function backoffMs(pollEveryMin, failures, retryAfterMs = null) {
  const base = Math.max(1, Number(pollEveryMin) || 15);
  const exp = Math.min(base * 2 ** Math.max(0, failures), MAX_BACKOFF_MIN);
  let ms = exp * MIN_MS;
  if (Number.isFinite(retryAfterMs) && retryAfterMs > ms) ms = Math.min(retryAfterMs, MAX_RETRY_AFTER_MS);
  return ms;
}

/** sha1 for guids we have to invent or that are too long to index. */
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex');

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * One raw parsed item → an article document, or `{ drop: reason }`.
 * @param {object} raw          from parse.js
 * @param {object} ctx          { source, feed, fetchedAt, matcher, directDomains }
 */
export function normalizeItem(raw, { source, feed, fetchedAt, matcher, directDomains = [] }) {
  const isAggregator = source.kind === 'aggregator';

  // Who wrote it. Aggregator items are credited to their <source>, never to
  // Google News; a direct feed's publisher is the source itself.
  let publisher = source.name;
  let publisherDomain = domainOf(source.homepage);
  if (isAggregator) {
    publisher = collapseWhitespace(raw.sourceName) || null;
    publisherDomain = domainOf(raw.sourceUrl);
    if (!publisher) return { drop: 'no_publisher' };
    if (publisherDomain && (source.blockedDomains || []).some((b) => domainMatches(publisherDomain, b))) {
      return { drop: 'blocked_domain' };
    }
    if (publisherDomain && directDomains.some((d) => domainMatches(publisherDomain, d))) {
      return { drop: 'direct_publisher' };
    }
  }

  let title = cleanTitle(raw.title);
  if (isAggregator) title = stripPublisherSuffix(title, publisher);
  if (!title) return { drop: 'no_title' };

  // The link. N0 keeps a Google News wrapper as-is (unwrapping is a follow-up).
  let url = String(raw.link || '').trim();
  if (!isHttpUrl(url) && isHttpUrl(String(raw.guid || '').trim())) url = String(raw.guid).trim();
  if (!isHttpUrl(url) || url.length > 4000) return { drop: 'no_link' };

  let guid = String(raw.guid || '').trim() || url || hash(`${title}|${raw.date || ''}`);
  if (guid.length > 2000) guid = `sha1:${hash(guid)}`;

  const publishedAt = resolvePublishedAt(raw.date, fetchedAt);
  if (publishedAt.getTime() < fetchedAt.getTime() - ARTICLE_RETENTION_DAYS * DAY_MS) {
    // The purge would delete it tomorrow and the next poll would insert it
    // again: an item older than retention is never ingested at all.
    return { drop: 'too_old' };
  }

  let expiresAt = null;
  if (raw.expires) {
    const t = Date.parse(raw.expires);
    if (Number.isFinite(t)) expiresAt = new Date(t);
    if (expiresAt && expiresAt.getTime() <= fetchedAt.getTime()) return { drop: 'expired' };
  }

  const excerpt = makeExcerpt({ summary: raw.summary, content: raw.content }, { contentLevel: source.access?.content });
  const key = makeTitleKey(title);
  if (!key) return { drop: 'no_title' };

  const sourcePlaces = (source.places || []).map(String);
  const textPlaces = matcher ? matcher.match(`${title} \n ${excerpt}`, sourcePlaces) : [];
  const places = [...new Set([...sourcePlaces, ...textPlaces])];

  const author = collapseWhitespace(raw.author).slice(0, 200) || null;

  return {
    doc: {
      sourceId: source._id,
      feedUrl: feed.url,
      guid,
      url,
      canonicalUrl: canonicalUrl(url),
      title,
      titleKey: key,
      excerpt,
      author,
      publisher: String(publisher).slice(0, 200),
      publisherDomain,
      publishedAt,
      fetchedAt,
      expiresAt,
      places,
    },
  };
}

/**
 * Dedupe + insert, in the plan's order:
 *   1. (sourceId, guid) — the unique index; checked up front in one query,
 *      and an insert that races it anyway is a duplicate-key no-op;
 *   2. canonicalUrl, any source;
 *   3. same source + same titleKey with publishedAt within 24 h.
 * Items are stored one by one so an item later in the same batch is deduped
 * against one stored earlier in it.
 */
export async function storeArticles(Article, docs, { sourceId }) {
  const counts = { inserted: 0, dupGuid: 0, dupUrl: 0, dupTitle: 0, invalid: 0 };
  const insertedDocs = [];
  if (!docs.length) return { counts, insertedDocs };

  const existing = await Article.find({ sourceId, guid: { $in: docs.map((d) => d.guid) } }, { guid: 1 }).lean();
  const seen = new Set(existing.map((e) => e.guid));

  for (const doc of docs) {
    if (seen.has(doc.guid)) { counts.dupGuid += 1; continue; }
    seen.add(doc.guid);
    if (await Article.exists({ canonicalUrl: doc.canonicalUrl })) { counts.dupUrl += 1; continue; }
    const t = doc.publishedAt.getTime();
    if (await Article.exists({
      sourceId,
      titleKey: doc.titleKey,
      publishedAt: { $gte: new Date(t - TITLE_DEDUPE_WINDOW_MS), $lte: new Date(t + TITLE_DEDUPE_WINDOW_MS) },
    })) { counts.dupTitle += 1; continue; }
    try {
      await Article.create(doc);
      counts.inserted += 1;
      insertedDocs.push(doc);
    } catch (err) {
      if (isDupKey(err)) counts.dupGuid += 1;
      else if (err?.name === 'ValidationError') counts.invalid += 1;
      else throw err;
    }
  }
  return { counts, insertedDocs };
}

/**
 * STALE RULE (DOCS/NEWSGEEK_PLAN.md "Ingest": "200 with no new items for 7×
 * its normal gap"). Evaluated on every OK answer (200 or 304):
 *   - a poll that stored a new item → not stale;
 *   - otherwise the feed's typical gap is the MEDIAN gap between the
 *     publishedAt of its newest STALE_GAP_SAMPLE stored articles (fewer than
 *     two → unknown); the threshold is max(7 × typical gap, 3 days);
 *   - stale when the time since lastNewItemAt (or, for a feed that has never
 *     produced an item, since the source was created) exceeds it.
 * NWS alerts are exempt: no alerts for weeks is the weather being quiet, not
 * the feed dying.
 */
export async function isStale({ Article, source, feed, now }) {
  if (feed.format === 'nws') return false;
  const since = feed.lastNewItemAt || source.createdAt || null;
  if (!since) return false;
  const quietMs = now.getTime() - new Date(since).getTime();

  const recent = await Article.find({ sourceId: source._id, feedUrl: feed.url }, { publishedAt: 1 })
    .sort({ publishedAt: -1 }).limit(STALE_GAP_SAMPLE).lean();
  let threshold = STALE_FLOOR_MS;
  if (recent.length >= 2) {
    const gaps = [];
    for (let i = 1; i < recent.length; i += 1) {
      gaps.push(new Date(recent[i - 1].publishedAt).getTime() - new Date(recent[i].publishedAt).getTime());
    }
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    threshold = Math.max(STALE_GAP_MULTIPLIER * median, STALE_FLOOR_MS);
  }
  return quietMs > threshold;
}

function feedSet(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [`feeds.$[f].${k}`, v]));
}

async function writeFeedState(Source, source, feed, fields) {
  await Source.updateOne(
    { _id: source._id },
    { $set: feedSet(fields) },
    { arrayFilters: [{ 'f._id': feed._id }], timestamps: false },
  );
}

function trimError(msg) {
  const s = collapseWhitespace(msg);
  return s.length > ERROR_MAX ? `${s.slice(0, ERROR_MAX - 1)}…` : s;
}

async function recordFailure({ Source, source, feed, at, status, message, retryAfterMs, log }) {
  const failures = (feed.consecutiveFailures || 0) + 1;
  const delay = backoffMs(feed.pollEveryMin, failures, retryAfterMs);
  await writeFeedState(Source, source, feed, {
    lastFetchAt: at,
    lastHttpStatus: status ?? null,
    lastError: trimError(message),
    consecutiveFailures: failures,
    nextPollAt: new Date(at.getTime() + delay),
  });
  let broke = false;
  if (failures >= BROKEN_AFTER_FAILURES) {
    // Only an ACTIVE source flips; a retired one stays retired.
    const res = await Source.updateOne({ _id: source._id, status: 'active' }, { $set: { status: 'broken' } });
    broke = (res.modifiedCount || 0) > 0;
    if (broke) {
      log?.warn({ event: 'source_broken', source: source.slug, failures, status: status ?? null }, 'source marked broken after repeated feed failures');
    }
  }
  log?.info({ event: 'feed_failed', source: source.slug, status: status ?? null, failures, retryInMin: Math.round(delay / MIN_MS) }, 'feed poll failed');
  return { ok: false, failures, broke, nextPollAt: new Date(at.getTime() + delay), error: trimError(message), status: status ?? null };
}

/**
 * @param {object} args
 * @param {object} args.source       lean source document (as read this tick)
 * @param {object} args.feed         lean feed subdocument
 * @param {object} args.models       { Source, Article }
 * @param {object} [args.matcher]    from buildPlaceMatcher
 * @param {string[]} [args.directDomains] homepage domains of active non-aggregator sources
 * @param {Function} [args.fetchImpl]
 * @param {object} [args.fetchOptions]  { timeoutMs, maxBytes }
 * @param {() => Date} [args.now]
 */
export async function pollFeed({
  source, feed, models, matcher = null, directDomains = [], fetchImpl, fetchOptions = {}, now = () => new Date(), log,
}) {
  const { Source, Article } = models;
  const at = now();

  let res;
  try {
    res = await fetchFeed(feed, { ...fetchOptions, ...(fetchImpl ? { fetchImpl } : {}), now });
  } catch (err) {
    if (!(err instanceof FetchError)) throw err;
    return recordFailure({ Source, source, feed, at, status: err.status, message: err.message, retryAfterMs: err.retryAfterMs, log });
  }

  let counts = { inserted: 0, dupGuid: 0, dupUrl: 0, dupTitle: 0, invalid: 0 };
  const drops = {};
  let newestItemAt = null;

  if (!res.notModified) {
    let parsed;
    try {
      parsed = parseFeed(res.body, feed.format);
    } catch (err) {
      return recordFailure({ Source, source, feed, at, status: res.status, message: `parse: ${err.message}`, retryAfterMs: null, log });
    }
    const docs = [];
    for (const raw of parsed.items) {
      const out = normalizeItem(raw, { source, feed, fetchedAt: at, matcher, directDomains });
      if (out.drop) {
        drops[out.drop] = (drops[out.drop] || 0) + 1;
        continue;
      }
      docs.push(out.doc);
      if (!newestItemAt || out.doc.publishedAt > newestItemAt) newestItemAt = out.doc.publishedAt;
    }
    ({ counts } = await storeArticles(Article, docs, { sourceId: source._id }));
  }

  const fields = {
    lastFetchAt: at,
    lastOkAt: at,
    lastHttpStatus: res.status,
    lastError: null,
    consecutiveFailures: 0,
    nextPollAt: new Date(at.getTime() + Math.max(1, Number(feed.pollEveryMin) || 15) * MIN_MS),
  };
  // Conditional-GET validators: keep the old ones unless the server sent new ones.
  if (res.etag) fields.etag = res.etag;
  if (res.lastModified) fields.lastModified = res.lastModified;
  if (newestItemAt && (!feed.lastItemAt || newestItemAt > new Date(feed.lastItemAt))) fields.lastItemAt = newestItemAt;
  if (counts.inserted > 0) {
    fields.lastNewItemAt = at;
    fields.stale = false;
  } else {
    fields.stale = await isStale({ Article, source, feed, now: at });
  }
  await writeFeedState(Source, source, feed, fields);

  if (fields.stale && !feed.stale) {
    log?.warn({ event: 'feed_stale', source: source.slug }, 'feed answers but has stopped producing new items');
  }
  log?.debug({ event: 'feed_polled', source: source.slug, status: res.status, ...counts, drops }, 'feed polled');
  return { ok: true, status: res.status, notModified: res.notModified, counts, drops, stale: fields.stale };
}

export default { pollFeed, normalizeItem, storeArticles, isStale, backoffMs };
