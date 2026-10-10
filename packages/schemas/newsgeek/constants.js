/**
 * newsgeek constants — the enums every writer and reader agrees on.
 * DOCS/NEWSGEEK_PLAN.md "Data model".
 */

// What kind of voice a source is. `official` (city notices, NWS alerts) never
// counts as coverage of a journalism story; `aggregator` (Google News search
// feeds) is a gap-filler whose items are credited to their real publisher.
const SOURCE_KINDS = ['journalism', 'official', 'aggregator'];

// Briefing sections, in briefing order.
const SECTIONS = ['local', 'state', 'national', 'world', 'tech'];

// discovered → verified → active; broken after repeated failures (or a stale
// feed); retired by hand. Only `active` sources are polled.
const SOURCE_STATUSES = ['discovered', 'verified', 'active', 'broken', 'retired'];

const FEED_FORMATS = ['rss', 'atom', 'nws'];

const PAYWALLS = ['none', 'metered', 'hard'];
const CONTENT_LEVELS = ['title', 'excerpt', 'full'];

const PLACE_KINDS = ['town', 'county', 'region', 'state', 'country'];

// Consecutive failed polls before a source goes `broken`.
const BROKEN_AFTER_FAILURES = 12;

// Articles older than this are purged unless a saved story pins them.
const ARTICLE_RETENTION_DAYS = 90;

// The briefing's "today" (FitnessGeek's UTC-today landmine).
const NEWS_TIMEZONE = 'America/Chicago';

// Stored excerpts are capped: we keep the feed's own summary, never the article.
const EXCERPT_MAX = 600;

const COLLECTIONS = {
  sources: 'sources',
  places: 'places',
  articles: 'articles',
};

module.exports = {
  SOURCE_KINDS,
  SECTIONS,
  SOURCE_STATUSES,
  FEED_FORMATS,
  PAYWALLS,
  CONTENT_LEVELS,
  PLACE_KINDS,
  BROKEN_AFTER_FAILURES,
  ARTICLE_RETENTION_DAYS,
  NEWS_TIMEZONE,
  EXCERPT_MAX,
  COLLECTIONS,
};
