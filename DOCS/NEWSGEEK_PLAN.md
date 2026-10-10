# NewsGeek — plan and spec

*Written 2026-10-10 from Chef's design conversation (pasted brainstorm: "build the news
reader you wish Google News were") and the decisions below. Status: **planning — nothing
built.***

## What it is

A calm, bounded news briefing that is **local first**. The payoff moments:
- opening it in the morning and being **done in five minutes**: ~25 stories, not 150
  headlines, and an end to the list;
- **one story, many sources**: twelve outlets covering one event is one card that says
  "12 sources", not twelve headlines;
- **Clark and Hot Spring County news nobody else aggregates**: Arkadelphia, Malvern,
  Hot Springs, down to a town that produces two stories a week;
- knowing **why** every story is on the screen.

What it is not: Google News with my name on it, an infinite feed, a reader that
republishes articles, or a recommendation loop.

## Decisions (Chef, 2026-10-10)

| Topic | Decision |
|---|---|
| Name | **NewsGeek**, `newsgeek.clintgeek.com`, host port **1830** (1800/1810/1820 taken) |
| Who | **Any suite user.** Sources, articles and stories are shared (public facts). Follows, mutes, section quotas, read state and saved stories are **per user**. No allowlist. |
| MVP | **Briefing + clustering.** Ingest, feed health, embedding clustering, the bounded briefing, the story page, Saved, follow/mute. **No LLM summaries in v1.** |
| Coverage | **Local + state + national/world + tech/interest sections**, all in v1. |
| Official sources | **In v1, badged separately.** City/county notices and NWS alerts are `official`. They never count as coverage of a journalism story; they can sit beside one as "related official notice". |
| Article text | **Never scraped, never reproduced.** We store the title, the feed's own excerpt, the link and the metadata. Reading happens at the publisher. |
| Identity | **County Gazette**: the suite calls it NewsGeek, and the interface reads like a modern local paper. (Chef, 2026-10-10. Details in N2.) |
| Paywalls | **A per-reader "Free to read" switch** (Chef, 2026-10-10), stored server-side per user, **off by default**. On, stories that need a subscription are hidden from the reader's lists; off, everything shows. Nothing is deleted. **Metered counts as paywalled** (`metered` and `hard` both hide). A direct source is judged by its own `access.paywall`; an aggregator (Google News) item by its real publisher's domain against `PAYWALLED_DOMAINS` (`@geeksuite/schemas/newsgeek/paywalls`, suffix match on a label boundary). Sources show a PAYWALL / METERED badge. |
| AI in the critical path | **Local embeddings only** (`datageek_embeddings`, Ollama `mxbai-embed-large`, the same service NoteGeek uses). On-box, free, no provider. LLM features are phase 2 via aiGeek with `need:` routing. |

## Architecture (the ThingGeek/GameGeek pattern)

- **Data in basegeek's gateway:** `graphql/newsgeek/`, for reading stories, prefs, read state
  and saved stories, and for managing sources (admin-gated writes).
- **Schemas once:** `@geeksuite/schemas/newsgeek/*`, shared by the gateway and the backend.
- **Backend** `apps/newsgeek/backend` owns jobs: feed polling, normalization, dedupe,
  embedding, clustering, feed health, retention purge. The UI never calls it directly
  except for "check this feed now" (admin).
- **Frontend** `apps/newsgeek/frontend`: React 18, MUI 5, `@geeksuite/ui` shell, VitePWA,
  phone-first. Its own identity (see Open questions).
- **Registration:** the GameGeek checklist (`DOCS/GameGeekPlan.md` §9), all 17 rows,
  including the nginx vhost, the compose `dns:` pin, the Watchtower label and the first
  `compose up -d`. No uploads, so the default 1 MB nginx body limit is fine.

## Data model

```js
// Source — newsgeek.sources (shared, admin-managed)
{ name, homepage,
  kind: 'journalism'|'official'|'aggregator',     // aggregator = Google News search feeds
  sections: ['local'|'state'|'national'|'world'|'tech'|...],
  places: [placeId],                              // what it covers, for locality + the coverage view
  feeds: [{ url, format: 'rss'|'atom'|'nws',
            pollEveryMin, etag, lastModified,
            lastFetchAt, lastOkAt, lastItemAt, consecutiveFailures, lastError }],
  status: 'discovered'|'verified'|'active'|'broken'|'retired',
  access: { paywall: 'none'|'metered'|'hard', content: 'title'|'excerpt'|'full' },
  notes, timestamps }

// Place — newsgeek.places (gazetteer, data not code)
{ name, kind: 'town'|'county'|'region'|'state'|'country', parentId, aliases: [String], fips? }
// Seeded: Caddo Valley, Arkadelphia, Gurdon, Malvern, Hot Springs, Bismarck, Donaldson…,
// Clark County, Hot Spring County, Garland County, Arkansas, US.

// Article — newsgeek.articles (shared, retention 90 days)
{ sourceId, feedUrl, guid, url, canonicalUrl, title, excerpt, author, publishedAt, fetchedAt,
  places: [placeId],          // the source's places + gazetteer matches in title/excerpt
  syndicationKey,             // normalized title hash; AP copy across 3 TV sites = one voice
  embedding: { model, vector } | null,
  storyId }

// Story — newsgeek.stories (shared)
{ title,                      // the earliest-or-best headline; never LLM-written in v1
  section, places: [placeId],
  articleIds, publisherCount, // distinct publishers; syndicated copies count once
  officialArticleIds,         // related official notices, kept apart
  firstSeenAt, lastArticleAt,
  centroid: { model, vector },
  mergedInto: storyId|null }  // merges keep the older id; ids never change meaning

// Per user
// NewsPrefs — newsgeek.prefs (one row per user, created on first write; no row = defaults)
{ userId,                     // String, unique; always from the session, never from args
  freeToReadOnly: false,      // the "Free to read" switch (2026-10-10). Built.
  // N2, not built yet:
  homePlaces: [placeId],
  sectionQuotas: { local: 8, state: 5, national: 5, world: 3, tech: 4 },
  order: 'important'|'chronological',
  followTerms: [String], muteTerms: [String], mutedSourceIds: [ObjectId] }
// StoryState — newsgeek.storystate
{ userId, storyId, seenAt, seenPublisherCount, dismissedAt|null, savedAt|null }
// Saved stories outlive retention: savedAt pins the story and its articles from the purge.
```

## Gateway API, N0 (the contract the frontend builds against)

`graphql/newsgeek/` in basegeek. Reads need a signed-in suite user. Writes need
an **admin** (the `requireAdminUser` rule from `graphql/basegeek/resolvers.js`). Dates use
the shared `Date` scalar. The gateway never calls the NewsGeek backend: "check now" sets
the feeds' `nextPollAt` to now, and the worker (which polls every minute) picks it up.

```graphql
type NewsPlace { id: ID! slug: String! name: String! kind: String! parentId: ID }

type NewsFeed {
  id: ID! url: String! format: String! pollEveryMin: Int!
  lastFetchAt: Date lastOkAt: Date lastItemAt: Date lastNewItemAt: Date
  consecutiveFailures: Int! lastError: String lastHttpStatus: Int stale: Boolean!
  health: String!      # ok | stale | failing | broken | never  (derived, see below)
}

type NewsSourceAccess { paywall: String! content: String! }

type NewsSource {
  id: ID! slug: String! name: String! homepage: String
  kind: String!        # journalism | official | aggregator
  sections: [String!]! places: [NewsPlace!]! status: String!
  access: NewsSourceAccess! feeds: [NewsFeed!]! blockedDomains: [String!]! notes: String!
  articlesLast7d: Int!
  paywalled: Boolean!  # access.paywall is metered or hard (PAYWALLED_LEVELS)
}

type NewsArticle {
  id: ID! title: String! url: String! excerpt: String!
  publisher: String! publishedAt: Date! expiresAt: Date
  sourceId: ID! sourceName: String! sourceKind: String! sections: [String!]!
  places: [NewsPlace!]!
}

type NewsArticlePage {
  items: [NewsArticle!]! nextBefore: Date
  hiddenPaywalled: Int!  # what "Free to read" left out of this list (same filters, ignoring the cursor); 0 when off
}

type NewsViewer { isAdmin: Boolean! }

type NewsPrefs { freeToReadOnly: Boolean! }       # per reader; defaults when never set
input NewsPrefsInput { freeToReadOnly: Boolean }

input NewsFeedInput { url: String! format: String pollEveryMin: Int }
input NewsSourceInput {
  slug: String name: String homepage: String kind: String sections: [String!]
  placeIds: [ID!] feeds: [NewsFeedInput!] paywall: String content: String
  blockedDomains: [String!] notes: String
}

extend type Query {
  newsViewer: NewsViewer!
  newsPrefs: NewsPrefs!
  newsPlaces: [NewsPlace!]!
  newsSources(status: String): [NewsSource!]!
  newsSource(id: ID!): NewsSource
  # Chronological, newest first. N0's reading view. The briefing replaces it in N2.
  newsArticles(section: String, placeId: ID, sourceId: ID, before: Date, limit: Int): NewsArticlePage!
}

extend type Mutation {
  newsCreateSource(input: NewsSourceInput!): NewsSource!              # admin
  newsUpdateSource(id: ID!, input: NewsSourceInput!): NewsSource!     # admin; feeds replace by url, keeping poll state
  newsSetSourceStatus(id: ID!, status: String!): NewsSource!          # admin
  newsCheckSourceNow(id: ID!): NewsSource!                            # admin; sets nextPollAt = now
  newsSetPrefs(input: NewsPrefsInput!): NewsPrefs!                    # any signed-in user; own row only (upsert)
}
```

**`health`, derived in one shared function**: `never` (not fetched yet), then `broken` (the
source status is broken, or failures ≥ BROKEN_AFTER_FAILURES), then `failing` (failures > 0),
then `stale`, then `ok`.

**`newsArticles` rules:**
- `limit` defaults to 50 and is capped at 100.
- `section` filters by the article's source's sections.
- `placeId` matches the place or any of its descendants.
- Expired NWS alerts are excluded.
- `retired` sources are excluded.
- **"Free to read"** (the caller's `freeToReadOnly`): when on, articles from a source whose
  `access.paywall` is `metered` or `hard` are excluded, and so are aggregator items whose
  `publisherDomain` matches `PAYWALLED_DOMAINS` (one anchored regex, label-boundary suffix).
  The exclusion is in the Mongo query, so pages stay full and the `before` cursor still works.
  `hiddenPaywalled` costs one extra `countDocuments`, and only when the switch is on.

## Ingest

- Poll each feed on its own interval: 15 min for TV, state and national sources, 30–60 min
  for small local sites. Use **conditional GET** (ETag / If-Modified-Since) and an honest
  User-Agent (`NewsGeek/1.0 (+https://newsgeek.clintgeek.com)`).
- Failures back off exponentially. After N consecutive failures (start at 12) the source
  goes `broken` and shows on the Sources screen. **A feed never dies quietly.** A feed that
  returns 200 with no new items for 7× its normal gap gets flagged as "stale" too, because
  that's how small sites usually die.
- Dedupe in this order: guid, then canonical URL with tracking params stripped, then
  (same source + same normalized title within 24h).
- **Google News search feeds** (`kind: aggregator`) fill the gaps for towns with no feed of
  their own. Unwrap the redirect link to the publisher URL where possible, and credit the
  real publisher from the item's `<source>`, never "Google News".
- **NWS alerts**: `api.weather.gov/alerts/active` for the Clark and Hot Spring county zones.
  An alert is an official article; it expires out of the briefing when the alert expires.
- **Times:** stored as UTC, and "today" is **America/Chicago**. That's the UTC-"today"
  landmine from the FitnessGeek sweep.

## Clustering (the interesting part)

**Principle: under-merge.** Two cards for one event is a small annoyance. Merging two
different events into one card destroys trust in the whole app. Every threshold leans
toward keeping stories apart.

Per new article:
1. Embed `title + excerpt` (mxbai passage, 1024 dims). If the embeddings service is down,
   the article waits in a queue and doesn't appear until it's clustered. No fallback
   provider, same rule as NoteGeek.
2. Candidates: stories in the same broad section whose `lastArticleAt` is within **72h**.
3. Join the best candidate only if cosine ≥ `JOIN` **and** a guard passes: they share at
   least one significant term (a proper noun / gazetteer place / number), **and**, for
   local stories, a place matches. Otherwise start a new story.
4. Syndicated copies (same `syndicationKey`) join and count as one publisher.
5. Official notices never join as coverage. If one clears the threshold it's attached as
   `officialArticleIds`.
6. Stories can **merge** (a nightly pass checks pairs of recent stories against a stricter
   threshold). They never split in v1. A bad merge is fixed with an admin "split this
   article out", which also goes into the golden set.

**A golden set before tuning.** After the first week of real ingest, label ~150 pairs
(same event / different event) from live data. `JOIN` and the merge threshold are
picked from that set and re-measured whenever the model or the rule changes (the aiGeek
golden-set pattern). The thresholds are constants with their measurements beside them in
comments.

## Ranking: the briefing

**Every story shows why it's there**: chips like "Clark County", "9 sources", "you follow
*Arkansas legislature*", "official". If the reason can't be explained in a chip, it
doesn't go into the score.

Within a section the score is a plain sum, written down where the code lives:
- **locality**: a home place match beats a county match beats a state match;
- **coverage**: log(distinct publishers), so syndication can't inflate it;
- **freshness**: decay on `lastArticleAt`;
- **follows**: a boost for followed terms. **Mutes** remove the story outright, never just
  down-rank it.

The briefing is **sections in a fixed order with per-user caps**. Each section's quota
and the total (default 25) are **maximums, never targets.**
- A story makes the briefing only if it clears a **briefing floor**: a minimum score,
  tuned on real data in N2. A story that can't clear it stays in the archive, whatever
  slots are free.
- **Unused slots spill over** to other sections' next-best stories that clear the floor,
  highest score first.
- **Nothing pads.** A quiet day gives a short briefing: "Quiet morning. 11 stories." A
  short briefing is the app working, not failing.

It has an end: "That's the briefing. *N* more stories in the archive." There's no
infinite scroll on the briefing; a section's "more" opens that section's list.

`chronological` order is offered for people who want it. Same caps and floor, newest first.

## Read state (written down so it can't drift)

- Opening a story, or scrolling past its card in the briefing, sets `seenAt` and
  `seenPublisherCount`.
- **A seen story is never unread again.** When new coverage arrives it shows
  "+3 sources since you looked".
- A seen story re-enters the briefing only if **≥ 2 new distinct publishers** arrived since
  `seenAt`, or a new official notice attached, or it matches a followed term. Otherwise it
  stays in the archive with its badge.
- "Dismiss" hides a story from this user's briefing for good, even if it grows.

## Screens (phone first)

- **Briefing** (`/`): a date header, then sections with compact cards (headline, publisher
  count, time, why-chips), then the end-of-briefing line. Pull to refresh. Remembers its
  scroll position.
- **Story** (`/story/:id`): the headline, why-chips, then **every source**: publisher,
  their headline, time, excerpt, open-at-publisher. Syndicated copies are folded together.
  Official notices sit in their own band. Save / dismiss / follow a term from here.
- **Section** (`/s/:section`): that section's archive, chronological, paged.
- **Saved** (`/saved`).
- **Sources** (`/sources`): every source with status, last OK fetch, items/week. Admins
  get add-by-URL (feed autodiscovery from the homepage), check-now and retire.
- **Coverage** (`/coverage`): places × active sources × stories in the last 30 days, so
  news deserts show up. A table in v1, not a map.
- **Settings**: home places, section quotas, order, follows/mutes, muted sources.
- **Text first.** No images in v1. Thumbnails are phase 2 via a backend proxy cache, and
  never hotlinked.

## Starter sources

*Verified by fetching on 2026-10-10. The verified table is in the section below; any source
not marked OK there is a candidate, not a source.*

Each feed below was fetched on 2026-10-10 and returned items.

**Local (journalism)**
| Source | Feed | Notes |
|---|---|---|
| The Arkadelphian | `https://arkadelphian.com/feed/` | ~7 items, excerpts. The best Clark County signal. |
| Malvern Daily Record | `https://www.malvern-online.com/search/?f=rss&t=article&l=50` | 50 items, excerpts, images. **Rate-limits hard** (429 after 3–4 requests a minute): poll every 60 min, this exact URL only. The only Hot Spring County source. |
| Sentinel-Record (Hot Springs) | `https://www.hotsr.com/rss/headlines/` | 150 items, excerpts |

**State / regional**
| Source | Feed | Notes |
|---|---|---|
| KATV | `https://katv.com/news/local.rss` | only the section feeds work |
| KARK | `https://www.kark.com/news/feed/` | `/feed/` also works |
| THV11 | `https://www.thv11.com/feeds/syndication/rss/news` | |
| Little Rock Public Radio | `https://www.ualrpublicradio.org/local-regional-news.rss` | the site-wide `/index.rss` is empty |
| Arkansas Advocate | `https://arkansasadvocate.com/feed/` | full text, 1.4 MB a fetch. Conditional GET matters. |
| Democrat-Gazette | `https://www.arkansasonline.com/rss/headlines/` | excerpts, paywall |
| Arkansas Times | `https://arktimes.com/feed` | full text |
| Talk Business & Politics | `https://talkbusiness.net/feed/` | full text |

**National / world**: NPR top `feeds.npr.org/1001/rss.xml`, national `/1003/`, world
`/1004/`; PBS NewsHour `https://www.pbs.org/newshour/feeds/rss/headlines`; BBC World
`https://feeds.bbci.co.uk/news/world/rss.xml`; Guardian US
`https://www.theguardian.com/us-news/rss`; The Hill `https://thehill.com/feed/` (redirects to
a Nexstar partner feed).

**Tech**: Ars Technica `https://feeds.arstechnica.com/arstechnica/index`; The Verge
`https://www.theverge.com/rss/index.xml`; 404 Media `https://www.404media.co/rss/`; Engadget
`https://www.engadget.com/rss.xml`; Hacker News `https://hnrss.org/frontpage` (its
description holds only link, points and comment count, so treat it as title-only).

**Official**
| Source | Feed | Notes |
|---|---|---|
| NWS alerts | `https://api.weather.gov/alerts/active?zone=ARC019,ARC059,ARZ053,ARZ054` | Needs a User-Agent. ARC = county zones (warnings), ARZ = forecast zones (watches and advisories). Query both. |
| Hot Springs News Flash | `https://www.hotspringsar.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml` | valid but sparse (2 items) |
| Malvern agendas | `https://malvernar.gov/RSSFeed.aspx?ModID=65&CID=All-0` | valid, nearly empty |
| Arkadelphia agendas | `https://www.arkadelphia.gov/RSSFeed.aspx?ModID=65&CID=All-0` | valid, nearly empty |

**Aggregator gap-fill (Google News search)**: `https://news.google.com/rss/search?q=<query>&hl=en-US&gl=US&ceid=US:en`
for `"Malvern" Arkansas`, `"Arkadelphia" Arkansas`, and `"Hot Spring County" OR "Clark County" Arkansas when:7d`,
plus `site:apnews.com when:1d` and `site:reuters.com` for wire coverage.
- **Items are title only.** Links are `news.google.com/rss/articles/…` wrappers, and the
  real publisher is in `<source url=…>` and in a " - Publisher" title suffix.
- **Mostly noise, with one exception.** About 25% of the Malvern results are legacy.com
  obituaries. **They stay** (Chef, 2026-10-10: "keep obits"; in a small town they're
  news). The aggregator still has a **source-domain blocklist**, which starts with
  weather.com forecast pages. Items whose publisher we already ingest
  directly are dropped as duplicates.

**No working feed (not sources yet)**
- **Southern Arkansas Tailgate News:** the domain no longer resolves.
- **Clark County government:** ModSecurity blocks the feed check, and the site has no feed.
- **Hot Spring County government:** the domains are parked.
- **Henderson State:** all feed paths return 404.
- **OBU:** the whole site sits behind a Cloudflare challenge.
- **Arkadelphia and Malvern school districts:** Apptegy single-page sites with no feed.
- **AP and Reuters:** no public RSS. Covered through the Google News `site:` searches.
- **Axios:** returns 403.

**What this means:** Clark County has one real local source and Hot Spring County has one.
Government feeds exist but are nearly silent. The Coverage screen will start out showing
deserts, and that's the honest picture.

## Phases

| Phase | Done when |
|---|---|
| **N0 Skeleton + ingest** | Scaffold, schemas, gateway module, full registration checklist, deployed. Backend polls the verified starter feeds and stores articles. The Sources screen shows live health. A week of real data starts piling up. |
| **N1 Clustering** | Embeddings + join/merge running. Golden set labelled from N0's week, thresholds chosen from it, and tests that go red when the threshold or guard is broken (revert-and-confirm-red). |
| **N2 Briefing** | Briefing, Story, Section, Saved, Settings, read state, follow/mute, why-chips. Harness scenes, run locally with `--enforce-a11y`. |
| **N3 Coverage + polish** | Coverage table, stale-feed detection, retention purge, StartGeek dock (Chef's call). |
| **Phase 2** | LLM cluster summaries via aiGeek (`need:`, every claim linked to an article), "what's new since you looked", story timelines, the non-RSS ingest kinds below, thumbnails through a proxy, a source discovery helper. |

## Coverage beyond RSS (phase 2, in this order)

The most important local news often isn't published by a newsroom. It's a sheriff's
post, a school closure, or a council agenda. RSS alone won't reach it, so v1 is honest
about the gap (the Coverage screen) and phase 2 adds ingest kinds, cheapest and
sturdiest first:
1. **Page watcher**: a per-source CSS selector over a news-list page (school district
   news pages, city "news" pages without News Flash, county sites). It diffs the list on
   each poll and creates title-and-link articles. Per-site and fragile, so every watcher
   reports its health like a feed, and **"selector found 0 items" counts as broken, not
   quiet.**
2. **Email newsletters**: an inbound address (`news@…`) where small outlets, schools and
   cities send their newsletters. Each email becomes an official or journalism article
   with a stored excerpt. It's legitimate, it's what these places already do, and no
   scraping is involved.
3. **Alert systems**: check whether Clark and Hot Spring counties publish through
   Nixle/Everbridge/CodeRED, which sometimes have feeds. Investigate before promising.
4. **Social media: out of scope.** Facebook has no legitimate feed for page posts, and
   scraping it breaks its terms and breaks weekly. If a sheriff's office only posts on
   Facebook, the Coverage screen says so ("posts only on Facebook") and links to it.
   That's a known gap, not a hidden one.

## Risks

- **Clustering quality is the product.** That's why it gets the golden set, the guards and
  the under-merge rule.
- **Source coverage.** Small local outlets often have no RSS, publish to Facebook, or die
  without notice. The Google News gap-fill, stale detection and the Coverage screen exist
  for this.
- **Syndication** makes one AP story look like broad coverage. That's why
  `syndicationKey` exists.
- **Google News links** are redirect wrappers and may stop working. Treat them as best-effort.
- **"Today" in UTC.** Covered: America/Chicago.
- **Fleet restarts.** Every main push restarts the fleet via Watchtower, so the ingest
  worker has to resume cleanly from feed state and the embedding queue, with no in-memory
  work that matters.

## Open questions for Chef

1. ~~Identity~~: decided, County Gazette. Newsprint off-white, ink-black serif headlines,
   a small-town weekly masthead with the date, one spot color for "official". Dark mode
   is the same paper at night.
2. **StartGeek dock**: does NewsGeek earn a spot in the one-row dock?
3. **Who can manage sources**: admin only (my default), or can any user propose a feed URL
   that an admin approves?
4. **The default topic sections**: tech is a given. Which others (gaming, science,
   business, sports — Razorbacks?)?
5. **Phase 2 summaries**: paid-first like NoteGeek/FitnessGeek, under the same caps?
