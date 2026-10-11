# NewsGeek — plan and spec

*Written 2026-10-10 from Chef's design conversation (pasted brainstorm: "build the news
reader you wish Google News were") and the decisions below. Status: N0 live (ingest,
Latest, Sources, reader-added sources, the Source sheet); the front page (Today, per-reader
ranking) built 2026-10-11 ahead of clustering; ingest hygiene (platform throttle, path
rules, excerpt boilerplate, display-time duplicate collapse) built 2026-10-11; N1/N2 not started.*

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
  pathExclude: [String],                          // URL-path regexes dropped at ingest (2026-10-11, admin-only)
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
  // Front page (2026-10-11). Built:
  homePlaces: [placeId],      // the ring, ORDERED closest first, ≤12
  favoriteSourceIds: [String], lessSourceIds: [String],   // a source is in at most one
  sectionQuotas: { local?, state?, national?, world?, tech? },  // overrides; defaults 8/5/5/3/4
  // N2, not built yet:
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

## Reader-added sources (Chef, 2026-10-10)

"Anyone should be able to add whatever they want. They can default off for others."

### Rules
- **Anyone signed in can add a source.**
  - It is **on for them and off for everyone else** (`defaultOn: false`, `addedBy: <userId>`).
  - The starter sources and anything an admin promotes are **on for everyone**
    (`defaultOn: true`; a missing field reads as true, so existing rows need no migration).
- **Per-reader switches:** any reader can turn any source on or off for themselves.
  `NewsPrefs.sourcesOn` and `sourcesOff` hold the source ids.
- **What a reader sees:** a reader sees source S when S is not retired and one of these holds:
  - S is default-on and not in their `sourcesOff`;
  - S is in their `sourcesOn`;
  - they added S and it is not in their `sourcesOff`.

  `newsArticles` only ever returns articles from sources the caller sees.
- **One poll per feed.** Creating a source whose feed URL (normalized: lower-case host,
  no trailing slash, no fragment) already belongs to a source fails with
  `DUPLICATE_FEED`, and `extensions.sourceId` points at the existing one so the UI
  can offer "Already here — turn it on".
- **Edit rights:**
  - **The adder** may edit, check-now, and set the status of their own source to
    `active`/`retired`.
  - **Admins** may do all of that on any source, plus `newsSetSourceDefaultOn`
    ("On for everyone").
  - Non-admins can never set `defaultOn` or `kind: 'aggregator'`.
- **Visibility of the adder:** admins see `addedByName`; everyone else gets null. Everyone
  gets `addedByMe`.
- **Abuse limits:** at most **20 sources created per user per rolling 24h** and **200 sources
  added per user in total** (`RATE_LIMITED`).
- **SSRF guard (non-negotiable).** Every outbound fetch (the ingest worker AND discovery)
  goes through one guard in the backend:
  - http(s) only; ports 80, 443 and 8080 only;
  - the hostname is resolved and **every** resolved address is refused if it is private,
    loopback, link-local, CGNAT, multicast or unspecified (v4 and v6, including mapped
    v4), and redirects are followed manually (max 5), re-checking each hop;
  - no credentials in URLs;
  - the existing timeout and body caps apply.

  A refused URL is a clear error ("That address isn't on the public internet"), never a
  fetch.

### Discovery: `POST /api/discover` (newsgeek backend, any signed-in user)
- **Request** `{ url }` → **response**
  `{ ok, site: { name, homepage }, feeds: [{ url, format, items, newest, sampleTitles: [3] }],
  paywall: { level: 'none'|'metered'|'hard'|'unknown', evidence }, suggest: { name, kind,
  sections, placeSlugs }, existingSourceId, message }`.
- **Finding feeds:**
  - the page's `<link rel="alternate">` feeds;
  - if the URL is itself a feed, use it;
  - the usual paths: WordPress `/feed/`, Blox `/search/?f=rss&t=article&l=50`, CivicPlus
    `RSSFeed.aspx?ModID=1&CID=All-newsflash.xml`, Wix `/blog-feed.xml`, `/rss`,
    `/rss.xml`, `/feed.atom`, `/index.rss`.

  Each candidate is validated by parsing it.
- **Paywall:** one article page, checked with the same markers as the 2026-10-10 check
  (`isAccessibleForFree`, Zephr/Piano, CherryRoad, PMPro, "premium content",
  "subscribers only").
- **Suggestions:**
  - `kind`: `official` for .gov/.us/.mil/k12 hosts or CivicPlus, else `journalism`.
  - `placeSlugs`: gazetteer matches over the site name and sample titles, using the same
    matcher.
- **Budget:** at most **10 requests** per discovery, and **30 discoveries per user per hour**.
- **No feed:** respond `ok:false` with a plain message ("No feed found — this site only
  publishes web pages").

### Gateway additions
```graphql
type NewsSource {   # added fields
  defaultOn: Boolean!  onForMe: Boolean!  addedByMe: Boolean!  canEdit: Boolean!
  addedByName: String  # admins only, else null
}
type NewsSuggestion { domain: String!  count: Int!  lastSeenAt: Date!  places: [NewsPlace!]!  sampleTitles: [String!]!  paywalled: Boolean! }
extend type Query {
  newsSuggestedSources: [NewsSuggestion!]!   # aggregator articles, last 30 days, grouped by publisherDomain,
                                             # minus domains any source already reads directly; top 30 by count
}
extend type Mutation {
  newsSetSourceOn(id: ID!, on: Boolean!): NewsSource!         # any reader, own prefs
  newsSetSourceDefaultOn(id: ID!, on: Boolean!): NewsSource!  # admin
}
# Changed: newsCreateSource is open to any signed-in user (rules above);
# newsUpdateSource / newsSetSourceStatus / newsCheckSourceNow are open to the adder of that source.
```

### Screens (phone first)
- **Sources:**
  - A **+** button opens the **Add a source** sheet: paste a link, then a preview card
    (name, feed, item count, newest, 3 headlines, paywall, suggested places), then
    **Add**.
  - On `DUPLICATE_FEED` the sheet offers "Already here — turn it on".
  - Sections: **In your paper** (on for me), **From other readers** (off for me,
    reader-added), **Turned off** (default-on but switched off). Each row has an on/off
    switch.
  - **Suggested** lists publishers seen in Google News results that we don't read
    directly: "magnoliareporter.com — 14 stories — Magnolia, El Dorado". "Check" opens the
    sheet prefilled with `https://<domain>`.
- **Source detail:**
  - for the adder or an admin: edit, check now, retire;
  - for admins: **On for everyone**.

### Open-with links (Chef, 2026-10-10)
Each reader can keep up to five "Open with…" link templates, used to open an article in a
reader service of their choosing.
- **Stored per reader:** `NewsPrefs.readerLinks: [{ label, template }]`. Set it through
  `newsSetPrefs(input: { readerLinks: [...] })`.
  - Sending a list replaces the whole list, and `[]` clears it.
  - Leaving it out leaves it unchanged, the same as `freeToReadOnly`.
- **Rules** (otherwise `BAD_USER_INPUT`, with a message that names the link):
  - at most 5 links;
  - the label is trimmed and must be 1 to 40 characters;
  - the template is at most 500 characters and must contain `{url}`;
  - only `{url}` and `{title}` may appear as placeholders;
  - once the placeholders are filled, the template must be an absolute `http:` or `https:` URL,
    for example `https://example.com/read?u={url}`.
- **The gateway only stores templates and never fetches them.** The client fills them in. No
  defaults are seeded.

```graphql
type NewsReaderLink { label: String!  template: String! }
type NewsPrefs { freeToReadOnly: Boolean!  readerLinks: [NewsReaderLink!]! }
input NewsReaderLinkInput { label: String!  template: String! }
input NewsPrefsInput { freeToReadOnly: Boolean  readerLinks: [NewsReaderLinkInput!] }
```

### Built: the server side (2026-10-10)
The frontend ships after this; everything here is additive or loosens a permission, so the
live frontend keeps working.
- **SSRF guard:** `apps/newsgeek/backend/src/lib/safeFetch.js`. Both `fetchFeed` (the worker)
  and discovery use it by default.
  - Hand-written CIDR checks: v4 private, loopback, link-local, CGNAT, multicast, reserved and
    TEST-NETs. v6 must be global unicast (2000::/3) outside documentation and 2001::/23.
    Mapped, NAT64 and 6to4 addresses are judged by the v4 address inside.
  - **IP pinning:** `http(s).request` gets a custom `lookup` that answers with the address that
    was vetted, and `agent: false`. Host, SNI and the certificate check still use the hostname.
  - A refused feed records `lastError: "That address isn't on the public internet."` and backs
    off like any other failure.
- **Discovery:** `POST /api/discover` (`src/discover/discover.js`, `src/routes/discoverRoutes.js`).
  - It returns the plan's shape. When `ok` is false it adds `code`: `NO_FEED` or
    `UNREACHABLE`.
  - A bad or unsafe URL gets a 400 with `{ ok:false, code:'BAD_URL'|'UNSAFE_URL', message }`.
  - Too many requests get a 429 with `{ ok:false, code:'RATE_LIMITED', retryAfterSec }` and a
    `Retry-After` header.
  - The 30-per-hour limit is in memory, per process, so a restart resets it.
  - Each redirect hop counts against the 10-request budget, and one request is kept back for
    the paywall check.
  - A domain on `PAYWALLED_DOMAINS` reports `metered` even when the markup shows nothing.
  - Paywall markers live in one function, `src/ingest/paywallMarkers.js`.
- **Feed identity:** `packages/schemas/newsgeek/feedUrl.js` (`normalizeFeedUrl`) is used by
  both the gateway and discovery. It also folds `http` into `https`, because two spellings of
  one feed would mean two polls.
- **Gateway codes:**
  - `DUPLICATE_FEED` sets `extensions { sourceId, sourceName, feedUrl }`. It applies to
    `newsUpdateSource` too, ignoring the source's own feeds.
  - `RATE_LIMITED` sets `extensions { limit: 20|200, window: '24h'|'total' }`.
  - Admin-only actions answer `ADMIN_REQUIRED`: someone else's source, a status other than
    active/retired, `kind: 'aggregator'`, `defaultOn`.
  - Admins are exempt from the add limits.
- **`NewsSourceInput.defaultOn`** (optional, admins only): an admin's new source is on for
  everyone unless it says `defaultOn: false`.
- **Sources keep `addedBy` for admins too.** Only seeded rows have none.
- **Every new source starts `active`**, the admin's included, and is polled on the next tick.
  N0's `discovered` default existed only for the hand-entry form.
- **Discovery can report `paywall.level: 'unknown'`, but `NewsSourceInput.paywall` only takes
  none, metered or hard.** The sheet sends `none` until someone marks the source.
- **`onForMe`** is exactly "the caller sees its articles", so it is false for a retired source.
  `newsSetSourceOn(on: true)` on a retired source returns `BAD_USER_INPUT`.

### Source sheet (Chef, 2026-10-10)
"Click a source in the newslist/newspaper and get to settings like marking it paid or whatever
else we can configure about it."

- **Where:** the publisher line above every headline on Latest is a button ("Settings for
  <publisher>", 44px) that opens a sheet (bottom sheet on a phone, dialog from md up). The
  headline still opens the article at the publisher.
- **A direct source:** name, kind and paywall badges, feed health and stories this week;
  **In my paper** (`newsSetSourceOn`), **I subscribe** ("Keeps it when Free to read is on",
  heavier when the source is paywalled), **More from this source** (`/?source=<id>`) and
  **Source details** (`/sources/:id`).
- **A story through an aggregator** (Google News): the real publisher, its domain and "via
  <aggregator>"; **Hide this publisher** and **I subscribe** by domain
  (`newsSetPublisherPref`), **Look for a direct feed** (the Add a source sheet on
  `https://<domain>`, already looking) and **More from <aggregator>**.
- **`/?source=<id>`:** Latest asks `newsArticles(sourceId)`, shows a "Showing: <name> ×" pill,
  and puts the section flags away until the pill is dismissed (a source has fixed sections, so
  most flags would only show an empty page).
- **I subscribe** is also on every source's detail page, for every reader. **Settings →
  Publishers** lists subscribed sources (linked), subscribed publishers and hidden publishers
  (each with Remove).
- **Rules (per reader, the caller's own prefs row only):**
  - Free to read on: a subscribed source is never hidden, paywall or not; an aggregator item
    whose publisher domain is (under) a subscribed domain is never hidden. `hiddenPaywalled`
    counts only what was actually hidden.
  - A hidden publisher's aggregator items never show, whatever the switch. **Direct sources are
    never hidden by domain**: they have their own on/off.
  - Domains match like `PAYWALLED_DOMAINS`: a suffix on a label boundary (`nwaonline.com`
    covers `obits.nwaonline.com`). Turning a switch off in the sheet removes the entry that
    covers the story's domain.
  - A domain is stored lower-case without `www.` and must be a bare hostname (URLs, paths,
    ports and IP addresses are `BAD_USER_INPUT`). At most 100 subscribed and 200 hidden.

```graphql
type NewsArticle { publisherDomain: String  viaAggregator: Boolean! }   # added
type NewsSource  { subscribedByMe: Boolean! }                           # added
type NewsPrefs   { subscribedSourceIds: [ID!]!  subscribedDomains: [String!]!  mutedDomains: [String!]! }  # added
extend type Mutation {
  newsSetSourceSubscribed(id: ID!, on: Boolean!): NewsSource!   # NOT_FOUND / BAD_USER_INPUT like newsSetSourceOn
  newsSetPublisherPref(domain: String!, subscribed: Boolean, muted: Boolean): NewsPrefs!  # omitted flag = unchanged
}
```
Stored in `newsgeek.prefs` (`packages/schemas/newsgeek/prefs.js`): `subscribedSourceIds`,
`subscribedDomains`, `mutedDomains`. All additive: the gateway ships first, the UI after it is
live.

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

### Ingest hygiene (2026-10-11)

Measured in production on 2026-10-11 (the numbers are in `apps/newsgeek/DOCS/CONTEXT.md`):
the six Blox papers all answered 429, Blox generic feeds were press releases and national
wire, 631 excerpts ended in boilerplate, and 118 same-title groups (248 articles) in a week
were one story told several times. Four fixes, none of them clustering.

**1. Platform throttle** (backend, `src/ingest/platform.js`, `src/jobs/worker.js`).
- Blox (TownNews) throttles us across all its sites, so the per-host limiter can't help. A
  feed is Blox when its path is `/search/` and it has `f=rss` (`isBloxFeed`).
- Every Blox feed shares ONE limiter key, `platform:blox`: one in flight, and at least
  **90 s** from the end of one Blox request to the start of the next, across ticks. At most
  one Blox feed per tick; the rest stay due and go oldest-first on later ticks (so six Blox
  feeds take about 12 minutes to come round).
- The last-request time is kept in memory only. A restart forgets it, so the first Blox
  request after a deploy can come early. Accepted.
- Blox feeds poll no faster than every **60 min**, whatever `pollEveryMin` says. Failure
  backoff starts from that floor too.
- **Jitter:** every computed `nextPollAt` (success, failure backoff, Retry-After) is spread
  by ±10 % of its interval, so feeds stop polling in lockstep after a deploy. A Retry-After
  is never brought forward. Tests inject the jitter.
- `/api/health` reports `worker.lastTickDeferred` (Blox feeds held back by the last tick).

**2. Per-source URL path rules** (`Source.pathExclude`).
- A list of regular-expression sources, tested against the item URL's **pathname** and its
  canonical URL's pathname (never the host or the query).
- An item that matches is never stored. Poll stats count it as `drops.path_excluded`.
- Validated in one place, `@geeksuite/schemas/newsgeek/pathRules` (`cleanPathExclude`):
  entries trimmed, empties and duplicates dropped; at most **20**, each at most **200**
  characters, each must compile (else `BAD_USER_INPUT`). The UI mirrors the same rules.
- **Admins only** (`ADMIN_REQUIRED` otherwise, even for a reader's own source). A rule runs
  on the worker's single thread for every item, so a pathological pattern from any reader
  could stall ingest for everyone.
- Defaults (`backend/src/seed/pathRules.js`, seeded on fresh installs; existing databases
  get them through `scripts/set-path-rules.js`):
  - the six Blox papers: `^/online_features/`, `/press_releases/`,
    `^/news/(national|world|nation)/`, `^/ap/`;
  - `guardian-us`: `^/sport/`, `^/football/`.
- Stored articles that a rule now covers are deleted once by
  `scripts/purge-path-excluded.js`. It is scoped to each article's own source and is a dry
  run unless `--apply`.

**3. Excerpt boilerplate** (`ingest/normalize.js` `cleanExcerpt`, applied before the cap).
- Strips WordPress's `The post <…> appeared first on <…>.` (only the last "The post …",
  so "the post office" earlier in the text survives).
- Strips a trailing `Continue reading…` (with an optional quoted title or arrow) and
  `Read more »` / `Read More` / `[Read more]`. These only count when they start a sentence
  or the excerpt: "…where you can read more." stays.
- `[…]` / `[...]` become a plain `…` (the text *was* cut).
- Whitespace collapsed.
- Every pattern is anchored at the END: nothing in the middle of an excerpt is ever
  removed.
- `scripts/clean-excerpts.js` re-applies the cleaner to stored excerpts (dry run unless
  `--apply`).

**4. Duplicate collapse** (gateway, display time, `graphql/newsgeek/dedupe.js`, pure).
Nothing is merged in the database; clustering (N1) will replace this with real stories.
- **Key:** the title normalised like `titleKey`. An aggregator's trailing " - Publisher"
  is stripped (ingest already does; repeated for older rows).
- **Obituary-shaped titles:** the title says "obituary", or the publisher is a known
  obituary host (`OBITUARY_HOSTS`: legacy.com, dignitymemorial.com, tributearchive.com,
  echovita.com). These keep only the text before the first ` - ` and drop
  `Obituary (YYYY)`. "Elendle Buck Obituary (2026) - Arkadelphia, AR - Smith Family
  Funeral Home" → `elendle buck`.
- **Under-merge guards:**
  - a one-word key never groups;
  - a 2–3-word key groups only around an obituary-shaped member, so two "Police Beat"
    columns stay apart;
  - official sources never group;
  - a group never holds two articles from one source.
- **Group:** equal keys within **72 h** of the group's earliest member.
- **Representative** (per reader):
  1. a ★ Favorite source;
  2. direct over aggregator;
  3. the source's first section, local > state > other;
  4. the earliest `publishedAt`.
  The others become `alsoIn` (at most 5, the representative excluded).
- **The wire rule (the group's section):**
  - When **no member has an own Arkansas place** and some member's source is national or
    world first, the group is filed under that section. "Own" means the article's places
    minus the ones inherited from its source, as in the ranking.
  - So AP copy carried by KATV and the Sentinel-Record stays out of State (and out of
    Local).
  - Otherwise the group takes the representative's per-story section.
  - A lone article keeps the per-story rule unchanged.
- **Today:** collapse runs over all candidates **before** the per-source cap and the
  quotas. A group is one candidate, ranked as its representative in the group's section.
  It counts once against the representative's source cap and once against the quota.
  `moreCount` counts stories, not copies.
- **newsArticles** (Everything and section pages): collapse runs **within each page**.
  - The page fetches `limit × 2` rows (at most 200). One more read finds the other copies
    of those stories within ±72 h, from the same list ignoring the section.
  - A group sits where its newest copy on the page sits.
  - A section page keeps a group only if the **group's** section is that page's, so the
    wire copy leaves the State page for National.
  - `nextBefore` is the `publishedAt` of the last returned group's newest page copy, so no
    story between the copies is skipped.
  - A group with a copy newer than `before` (in this list) was shown on an earlier page, so
    its older copies never reappear as stories of their own. The cost: `alsoIn` lists only
    the copies within reach of that page, and the representative is chosen among them.
- **Cost:** `newsArticles` is one read more than before. `newsFrontPage` is still six reads
  (the candidates now also carry title, titleKey, publisher and url).

**Contract (2026-10-11, additive):**
```graphql
type NewsAlsoIn { publisher: String!  url: String!  sourceId: ID! }
type NewsArticle { alsoIn: [NewsAlsoIn!]! }        # [] when none; ≤5; the representative excluded
type NewsSource  { pathExclude: [String!]! }       # [] when none
input NewsSourceInput { pathExclude: [String!] }   # admin only; replaces the list; ≤20, ≤200 chars, must compile
```
**Screens (change set B):**
- Under a story (Today, Everything, section pages), a quiet "Also in KARK +2" button
  (44px, `aria-expanded`) opens a list of the other copies' links. The headline is
  unchanged.
- The admin source form and the source page get "Skip URLs matching", a list of path
  patterns with add and remove, validated as on the server.

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

## Ranking: the front page (built 2026-10-11, before clustering)

**Why it was built before N1/N2.** Measured in production on 2026-10-11: 662 articles a day,
and newest-first lets volume win. The Democrat-Gazette posts 278 a week, AP via Google
News 248, the Sentinel-Record 174 and Reuters 152, against The Arkadelphian's 7 (one weekly
batch). The Arkadelphian's newest story ranked #1,282 in "All", and the first 50 stories in
"All" held nothing from Clark or Hot Spring County. Sections were source labels, and "All"
interleaved them. Chef's fix, step 1: a front page that ranks **articles** fairly and
personally. When clustering lands, the same rules rank stories and gain a coverage term.

**Every story shows why it's there**: chips like "Arkadelphia", "★ Favorite", "Arkansas",
"Official" (`NewsArticle.why`). If the reason can't be explained in a chip, it doesn't go
into the score. The code is `apps/basegeek/packages/api/src/graphql/newsgeek/ranking.js`
(pure; the header comment is the same formula) and its tests are
`newsgeekRanking.test.js` + `newsgeekFrontPage.test.js`.

### The ring (per reader)
`homePlaces`: an **ordered** list of places, closest first, at most 12. Chef's:
Arkadelphia, Clark County, Hot Springs (city), Little Rock, Conway, Garland County,
Hot Spring County. A place matches a ring entry when the entry is the place itself or one
of its **ancestors** in the gazetteer (Gurdon → Clark County). Hot Springs Village is under
Garland County, not under the city of Hot Springs, so only a Garland County entry catches it.
The best (closest) matching entry wins.

### The story's section (per reader, at query time)
1. **Local**: one of the story's *locality places* is in the ring. Locality places are the
   article's own places (its tags minus the ones it inherited from its source at ingest),
   plus the source's places when the source is **ring-local**: every place it covers,
   ignoring state and country places, is in the ring (The Arkadelphian, the Clark/Hot
   Spring NWS zone; not KATV "Arkansas", not Arkansas TV "Little Rock + Pulaski County +
   Arkansas"). A D-G story tagged Arkadelphia is Local; an AP story tagged Little Rock is
   Local. **A reader with no ring:** Local = the source is labelled local (the old rule).
2. else **State**: the article has any Arkansas place (its ancestry contains `arkansas`),
   or the source is labelled state or local. A Texarkana paper is State for Chef.
3. else the source's **first** section (national, world, tech).

`newsArticles(section)` filters by this same per-story section (`sectionClause`, the rule as
a Mongo filter; a test proves the five section pages partition Everything and agree with
Today). Every article carries `section` and `why`.

### The score (within a section)
```
score     = (0.6 · freshness + 0.4 · locality) × priority
freshness = exp(−(age / typicalGap) / 3) × max(0, 1 − age / window)
typicalGap(source) = 7 days / max(1, its stories in the last 7 days), clamped to [1 h, 3 days]
window    = 10 days for Local, 7 days for every other section (nothing older shows)
locality  = ring weight of the best matching entry: 1.0, 0.9, 0.75, 0.65, 0.55, 0.5, 0.45,
            then 0.4 for entries 8–12; else 0.25 if any place is in Arkansas; else 0
priority  = ★ Favorite 3 · Normal 1 · Less 0.3
```
Freshness is **pace-normalised**: a 2-day-old story from a 7-a-week paper scores 0.37, a
6-hour-old story from a 40-a-day wire 0.13, so the weekly paper's story is "fresh for it".
The second factor is the hard absolute decay.

### The fill (per section, greedy)
1. **Active official alerts that are Local lead Local** (official source, `expiresAt` in the
   future), newest first. They are exempt from the per-source cap.
2. Then **favourites' stories no older than 7 days**, by score.
3. Then everything else by score (ties: newer first).
- **At most 5 stories per source per section** (`PER_SOURCE_CAP`, Chef 2026-10-11). A
  Google News item counts against its real publisher's domain, not against the aggregator.
- **Quotas are caps, never targets.** Defaults: Local 8, State 5, National 5, World 3,
  Tech 4 (`sectionQuotas`, per reader; 0–20). A quiet section stays short, an empty section
  is left out, and `moreCount` says how many stories in the window didn't fit.
- Candidates obey every list rule: visibility (on for me), Free to read with subscriptions,
  hidden publishers, expired alerts. **Nothing else is filtered** (opinion and columns stay).

`newsFrontPage` costs six reads: prefs, sources, the gazetteer, one 7-day count
aggregation, the candidates (one find, scoring fields only) and the chosen stories.

### Not yet (when clustering and read state land)
- **coverage**: log(distinct publishers), so syndication can't inflate it;
- **follows**: a boost for followed terms; **mutes** remove a story outright;
- a **briefing floor** (a minimum score), **spill-over** of unused slots, the
  `chronological` order, and read state (below). Until then the page ends honestly:
  "That's today's paper. Everything, newest first →".

### Contract (2026-10-11, additive)
```graphql
type NewsArticle { section: String!  why: [String!]! }
type NewsSource  { priorityForMe: String! }                 # favorite | normal | less
type NewsPrefs   { homePlaces: [NewsPlace!]!  favoriteSourceIds: [ID!]!  lessSourceIds: [ID!]!
                   sectionQuotas: NewsSectionQuotas! }       # resolved over the defaults
input NewsPrefsInput { sectionQuotas: NewsSectionQuotasInput }   # null for a key = back to the default
type NewsFrontPage { generatedAt: Date!  sections: [NewsFrontSection!]! }
type NewsFrontSection { key: String!  title: String!  items: [NewsArticle!]!  moreCount: Int! }
extend type Query    { newsFrontPage: NewsFrontPage! }
extend type Mutation {
  newsSetHomePlaces(placeIds: [ID!]!): NewsPrefs!                 # ≤12, distinct, known; replaces
  newsSetSourcePriority(id: ID!, priority: String!): NewsSource!  # retired → only normal
}
```

### Screens (change set B)
- **Today** (`/`): the masthead, Free to read, then Local, State, National, World, Tech, each
  a small-caps head, its stories with quiet why-chips, and "More <section> →" to
  `/s/<key>` when `moreCount` > 0. It ends: "That's today's paper. Everything, newest
  first →".
- **Section** (`/s/:section`): that section for this reader, newest first, paged.
- **Everything** (`/everything`): the old Latest (all sections newest first, the section
  flags, the `?source=` chip). The phone tabs are Today · Everything · Sources.
- **Source sheet + source page**: a Priority control, ★ Favorite / Normal / Less.
- **Settings → Home places**: the ring, closest first, with move up/down, remove and
  "Add a place".

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

*As built on 2026-10-11, `/` is **Today** (article-level, "Ranking: the front page" above)
and the old Latest is `/everything`. The Briefing described here is N2's story-level
version of Today.*

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
3. ~~Who can manage sources~~: decided 2026-10-10. Anyone can add one, and it is off for
   everyone else ("Reader-added sources").
4. **The default topic sections**: tech is a given. Which others (gaming, science,
   business, sports — Razorbacks?)?
5. **Phase 2 summaries**: paid-first like NoteGeek/FitnessGeek, under the same caps?
