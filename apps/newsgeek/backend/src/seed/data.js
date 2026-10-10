/**
 * Seed data: the gazetteer and the verified starter sources
 * (DOCS/NEWSGEEK_PLAN.md "Starter sources", verified 2026-10-10).
 * The plan's "No working feed" list is deliberately NOT here.
 *
 * Places reference parents by slug; sources reference places by slug. The
 * seeder (./seed.js) resolves slugs to ids.
 *
 * Poll intervals (plan "Ingest"): TV/state/national 15 min, small local
 * 30–60, Malvern Daily Record 60 with that exact URL only (it 429s after 3–4
 * requests a minute), NWS 10, Google News 60 (be polite to the aggregator too).
 */

import { SOUTH_PLACES, SOUTH_SOURCES } from './southArkansas.js';

const BASE_PLACES = [
  { slug: 'us', name: 'United States', kind: 'country', parent: null, aliases: ['U.S.', 'U.S.A.', 'United States of America'], fips: null },
  { slug: 'arkansas', name: 'Arkansas', kind: 'state', parent: 'us', aliases: [], fips: '05' },

  // Counties. "Hot Spring County" (no s) is not the city of Hot Springs, which
  // is in Garland County — no alias here may be a bare "Hot Spring(s)".
  { slug: 'clark-county-ar', name: 'Clark County', kind: 'county', parent: 'arkansas', aliases: ['Clark Co.'], fips: '05019' },
  { slug: 'hot-spring-county-ar', name: 'Hot Spring County', kind: 'county', parent: 'arkansas', aliases: ['Hot Spring Co.'], fips: '05059' },
  { slug: 'garland-county-ar', name: 'Garland County', kind: 'county', parent: 'arkansas', aliases: ['Garland Co.'], fips: '05051' },

  // Clark County towns.
  { slug: 'caddo-valley-ar', name: 'Caddo Valley', kind: 'town', parent: 'clark-county-ar', aliases: [] },
  { slug: 'arkadelphia-ar', name: 'Arkadelphia', kind: 'town', parent: 'clark-county-ar', aliases: [] },
  { slug: 'gurdon-ar', name: 'Gurdon', kind: 'town', parent: 'clark-county-ar', aliases: [] },
  { slug: 'amity-ar', name: 'Amity', kind: 'town', parent: 'clark-county-ar', aliases: [] },
  { slug: 'okolona-ar', name: 'Okolona', kind: 'town', parent: 'clark-county-ar', aliases: [] },

  // Hot Spring County towns.
  { slug: 'malvern-ar', name: 'Malvern', kind: 'town', parent: 'hot-spring-county-ar', aliases: [] },
  { slug: 'bismarck-ar', name: 'Bismarck', kind: 'town', parent: 'hot-spring-county-ar', aliases: [] },
  { slug: 'donaldson-ar', name: 'Donaldson', kind: 'town', parent: 'hot-spring-county-ar', aliases: [] },
  { slug: 'rockport-ar', name: 'Rockport', kind: 'town', parent: 'hot-spring-county-ar', aliases: [] },
  { slug: 'magnet-cove-ar', name: 'Magnet Cove', kind: 'town', parent: 'hot-spring-county-ar', aliases: [] },

  // Garland County towns.
  { slug: 'hot-springs-ar', name: 'Hot Springs', kind: 'town', parent: 'garland-county-ar', aliases: ['Hot Springs National Park'] },
  { slug: 'hot-springs-village-ar', name: 'Hot Springs Village', kind: 'town', parent: 'garland-county-ar', aliases: [] },
];

const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const feed = (url, pollEveryMin, format = 'rss') => ({ url, format, pollEveryMin });

const EXCERPT = { paywall: 'none', content: 'excerpt' };
const FULL = { paywall: 'none', content: 'full' };
const TITLE = { paywall: 'none', content: 'title' };

// Google News: weather.com answers town searches with forecast pages (first
// live tick, 2026-10-10) — not news. Obituaries (legacy.com, ~25% of a
// "Malvern" search) are KEPT: Chef, 2026-10-10, "keep obits" — in a small
// town they are news.
const AGG_BLOCKED = ['weather.com'];

// Paywalls, from the 2026-10-10 check (apps/newsgeek/DOCS/CONTEXT.md has the
// evidence): the publisher's own markup says `isAccessibleForFree: false`
// and loads Zephr (hotsr, arkansasonline, theverge); BBC meters US readers
// (2025); Malvern Daily Record is Chef's word (it rate-limits us, so we never
// fetched its pages). The reader's "Free to read" switch hides metered and
// hard alike. scripts/set-paywalls.js applies exactly this map to an
// existing database; the seed only covers fresh installs.
export const PAYWALL_BY_SLUG = {
  'malvern-daily-record': 'hard',
  'sentinel-record': 'hard',
  'arkansas-democrat-gazette': 'hard',
  'the-verge': 'metered',
  'bbc-world': 'metered',
};
const walled = (slug, access) => ({ ...access, paywall: PAYWALL_BY_SLUG[slug] });

const BASE_SOURCES = [
  // ---- Local journalism -------------------------------------------------
  {
    slug: 'arkadelphian', name: 'The Arkadelphian', homepage: 'https://arkadelphian.com',
    kind: 'journalism', sections: ['local'], places: ['clark-county-ar', 'arkadelphia-ar'],
    feeds: [feed('https://arkadelphian.com/feed/', 30)], access: EXCERPT,
    notes: 'The best Clark County signal (~7 items).',
  },
  {
    slug: 'malvern-daily-record', name: 'Malvern Daily Record', homepage: 'https://www.malvern-online.com',
    kind: 'journalism', sections: ['local'], places: ['hot-spring-county-ar', 'malvern-ar'],
    feeds: [feed('https://www.malvern-online.com/search/?f=rss&t=article&l=50', 60)], access: walled('malvern-daily-record', EXCERPT),
    notes: 'RATE-LIMITS HARD (429 after 3–4 requests a minute). Poll every 60 min, this exact URL only. The only Hot Spring County source.',
  },
  {
    slug: 'sentinel-record', name: 'Sentinel-Record', homepage: 'https://www.hotsr.com',
    kind: 'journalism', sections: ['local'], places: ['garland-county-ar', 'hot-springs-ar'],
    feeds: [feed('https://www.hotsr.com/rss/headlines/', 30)], access: walled('sentinel-record', EXCERPT),
    notes: 'Hot Springs daily (~150 items).',
  },

  // ---- State / regional -------------------------------------------------
  {
    slug: 'katv', name: 'KATV', homepage: 'https://katv.com', kind: 'journalism', sections: ['state'], places: ['arkansas'],
    feeds: [feed('https://katv.com/news/local.rss', 15)], access: EXCERPT, notes: 'Only the section feeds work.',
  },
  {
    slug: 'kark', name: 'KARK', homepage: 'https://www.kark.com', kind: 'journalism', sections: ['state'], places: ['arkansas'],
    feeds: [feed('https://www.kark.com/news/feed/', 15)], access: EXCERPT, notes: '',
  },
  {
    slug: 'thv11', name: 'THV11', homepage: 'https://www.thv11.com', kind: 'journalism', sections: ['state'], places: ['arkansas'],
    feeds: [feed('https://www.thv11.com/feeds/syndication/rss/news', 15)], access: EXCERPT, notes: '',
  },
  {
    slug: 'little-rock-public-radio', name: 'Little Rock Public Radio', homepage: 'https://www.ualrpublicradio.org',
    kind: 'journalism', sections: ['state'], places: ['arkansas'],
    feeds: [feed('https://www.ualrpublicradio.org/local-regional-news.rss', 15)], access: EXCERPT,
    notes: 'The site-wide /index.rss is empty.',
  },
  {
    slug: 'arkansas-advocate', name: 'Arkansas Advocate', homepage: 'https://arkansasadvocate.com',
    kind: 'journalism', sections: ['state'], places: ['arkansas'],
    feeds: [feed('https://arkansasadvocate.com/feed/', 15)], access: FULL,
    notes: 'Full-text feed, 1.4 MB a fetch: conditional GET matters.',
  },
  {
    slug: 'arkansas-democrat-gazette', name: 'Arkansas Democrat-Gazette', homepage: 'https://www.arkansasonline.com',
    kind: 'journalism', sections: ['state'], places: ['arkansas'],
    feeds: [feed('https://www.arkansasonline.com/rss/headlines/', 15)], access: walled('arkansas-democrat-gazette', EXCERPT),
    notes: 'Paywalled (hard: isAccessibleForFree false + Zephr, 2026-10-10).',
  },
  {
    slug: 'arkansas-times', name: 'Arkansas Times', homepage: 'https://arktimes.com', kind: 'journalism', sections: ['state'], places: ['arkansas'],
    feeds: [feed('https://arktimes.com/feed', 15)], access: FULL, notes: 'Full-text feed.',
  },
  {
    slug: 'talk-business-politics', name: 'Talk Business & Politics', homepage: 'https://talkbusiness.net',
    kind: 'journalism', sections: ['state'], places: ['arkansas'],
    feeds: [feed('https://talkbusiness.net/feed/', 15)], access: FULL, notes: 'Full-text feed.',
  },

  // ---- National / world -------------------------------------------------
  {
    slug: 'npr', name: 'NPR', homepage: 'https://www.npr.org', kind: 'journalism', sections: ['national', 'world'], places: ['us'],
    feeds: [
      feed('https://feeds.npr.org/1001/rss.xml', 15),
      feed('https://feeds.npr.org/1003/rss.xml', 15),
      feed('https://feeds.npr.org/1004/rss.xml', 15),
    ],
    access: EXCERPT, notes: 'Top (1001), national (1003), world (1004).',
  },
  {
    slug: 'pbs-newshour', name: 'PBS NewsHour', homepage: 'https://www.pbs.org/newshour', kind: 'journalism', sections: ['national'], places: ['us'],
    feeds: [feed('https://www.pbs.org/newshour/feeds/rss/headlines', 15)], access: EXCERPT, notes: '',
  },
  {
    slug: 'bbc-world', name: 'BBC News', homepage: 'https://www.bbc.com/news', kind: 'journalism', sections: ['world'], places: [],
    feeds: [feed('https://feeds.bbci.co.uk/news/world/rss.xml', 15)], access: walled('bbc-world', EXCERPT), notes: 'World feed.',
  },
  {
    slug: 'guardian-us', name: 'The Guardian', homepage: 'https://www.theguardian.com', kind: 'journalism', sections: ['national'], places: ['us'],
    feeds: [feed('https://www.theguardian.com/us-news/rss', 15)], access: EXCERPT, notes: 'US news feed.',
  },
  {
    slug: 'the-hill', name: 'The Hill', homepage: 'https://thehill.com', kind: 'journalism', sections: ['national'], places: ['us'],
    feeds: [feed('https://thehill.com/feed/', 15)], access: EXCERPT, notes: 'Redirects to a Nexstar partner feed.',
  },

  // ---- Tech -------------------------------------------------------------
  {
    slug: 'ars-technica', name: 'Ars Technica', homepage: 'https://arstechnica.com', kind: 'journalism', sections: ['tech'], places: [],
    feeds: [feed('https://feeds.arstechnica.com/arstechnica/index', 30)], access: EXCERPT, notes: '',
  },
  {
    slug: 'the-verge', name: 'The Verge', homepage: 'https://www.theverge.com', kind: 'journalism', sections: ['tech'], places: [],
    feeds: [feed('https://www.theverge.com/rss/index.xml', 30, 'atom')], access: walled('the-verge', EXCERPT), notes: 'Atom feed.',
  },
  {
    slug: '404-media', name: '404 Media', homepage: 'https://www.404media.co', kind: 'journalism', sections: ['tech'], places: [],
    feeds: [feed('https://www.404media.co/rss/', 30)], access: EXCERPT, notes: '',
  },
  {
    slug: 'engadget', name: 'Engadget', homepage: 'https://www.engadget.com', kind: 'journalism', sections: ['tech'], places: [],
    feeds: [feed('https://www.engadget.com/rss.xml', 30)], access: EXCERPT, notes: '',
  },
  {
    slug: 'hacker-news', name: 'Hacker News', homepage: 'https://news.ycombinator.com', kind: 'journalism', sections: ['tech'], places: [],
    feeds: [feed('https://hnrss.org/frontpage', 30)], access: TITLE,
    notes: 'Description holds only link, points and comment count: title-only.',
  },

  // ---- Official ---------------------------------------------------------
  {
    slug: 'nws-alerts', name: 'National Weather Service', homepage: 'https://www.weather.gov/lzk',
    kind: 'official', sections: ['local'], places: ['clark-county-ar', 'hot-spring-county-ar'],
    feeds: [feed('https://api.weather.gov/alerts/active?zone=ARC019,ARC059,ARZ053,ARZ054', 10, 'nws')], access: EXCERPT,
    notes: 'Active alerts. ARC = county zones (warnings), ARZ = forecast zones (watches, advisories). Needs a User-Agent.',
  },
  {
    slug: 'hot-springs-news-flash', name: 'City of Hot Springs', homepage: 'https://www.hotspringsar.gov',
    kind: 'official', sections: ['local'], places: ['hot-springs-ar'],
    feeds: [feed('https://www.hotspringsar.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml', 60)], access: EXCERPT,
    notes: 'News Flash. Valid but sparse.',
  },
  {
    slug: 'malvern-agendas', name: 'City of Malvern agendas', homepage: 'https://malvernar.gov',
    kind: 'official', sections: ['local'], places: ['malvern-ar'],
    feeds: [feed('https://malvernar.gov/RSSFeed.aspx?ModID=65&CID=All-0', 60)], access: EXCERPT,
    notes: 'Valid, nearly empty.',
  },
  {
    slug: 'arkadelphia-agendas', name: 'City of Arkadelphia agendas', homepage: 'https://www.arkadelphia.gov',
    kind: 'official', sections: ['local'], places: ['arkadelphia-ar'],
    feeds: [feed('https://www.arkadelphia.gov/RSSFeed.aspx?ModID=65&CID=All-0', 60)], access: EXCERPT,
    notes: 'Valid, nearly empty.',
  },

  // ---- Aggregator gap-fill (Google News search) -------------------------
  {
    slug: 'gnews-malvern', name: 'Google News: Malvern', homepage: 'https://news.google.com',
    kind: 'aggregator', sections: ['local'], places: ['hot-spring-county-ar', 'malvern-ar'],
    feeds: [feed(gnews('"Malvern" Arkansas'), 60)], access: TITLE, blockedDomains: AGG_BLOCKED,
    notes: 'Title-only; credited to the item\'s <source>.',
  },
  {
    slug: 'gnews-arkadelphia', name: 'Google News: Arkadelphia', homepage: 'https://news.google.com',
    kind: 'aggregator', sections: ['local'], places: ['clark-county-ar', 'arkadelphia-ar'],
    feeds: [feed(gnews('"Arkadelphia" Arkansas'), 60)], access: TITLE, blockedDomains: AGG_BLOCKED,
    notes: 'Title-only; credited to the item\'s <source>.',
  },
  {
    slug: 'gnews-clark-hot-spring', name: 'Google News: Clark & Hot Spring counties', homepage: 'https://news.google.com',
    kind: 'aggregator', sections: ['local'], places: ['arkansas'],
    feeds: [feed(gnews('"Hot Spring County" OR "Clark County" Arkansas when:7d'), 60)], access: TITLE, blockedDomains: AGG_BLOCKED,
    notes: 'Either county; places come from the text match.',
  },
  {
    slug: 'gnews-ap', name: 'Google News: AP', homepage: 'https://news.google.com',
    kind: 'aggregator', sections: ['national', 'world'], places: ['us'],
    feeds: [feed(gnews('site:apnews.com when:1d'), 30)], access: TITLE, blockedDomains: AGG_BLOCKED,
    notes: 'AP has no public RSS.',
  },
  {
    slug: 'gnews-reuters', name: 'Google News: Reuters', homepage: 'https://news.google.com',
    kind: 'aggregator', sections: ['national', 'world'], places: [],
    feeds: [feed(gnews('site:reuters.com'), 30)], access: TITLE, blockedDomains: AGG_BLOCKED,
    notes: 'Reuters has no public RSS.',
  },
];

// The south half of Arkansas (2026-10-10 research): its own module so the
// starter list above stays readable. Same insert-if-absent seeding.
export const PLACES = [...BASE_PLACES, ...SOUTH_PLACES];
export const SOURCES = [...BASE_SOURCES, ...SOUTH_SOURCES];

export default { PLACES, SOURCES };
