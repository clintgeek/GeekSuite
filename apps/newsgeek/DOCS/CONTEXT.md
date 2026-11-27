# NewsGeek — context

How NewsGeek actually runs. The spec, meaning what it's *for*, is `DOCS/NEWSGEEK_PLAN.md`
at the repo root. This file is a dated decision log, and it should stay honest.

## Shape

| Piece | Where | Notes |
|---|---|---|
| Public host | `newsgeek.clintgeek.com` | nginx vhost: `/` → :1830, `/graphql` → basegeek :8987 (the frontend calls a relative `/graphql`) |
| Container | `newsgeek`, image `ghcr.io/clintgeek/newsgeek:latest` | host port **1830**; dev frontend 1831 |
| Database | Mongo `newsgeek`: `sources`, `places`, `articles`, `prefs` (per reader), `stories` (2026-11-27, written by the backend only) | Shared definitions are in `@geeksuite/schemas/newsgeek/*`. Add fields there, never in a model file. |
| Gateway | `apps/basegeek/packages/api/src/graphql/newsgeek/` | Reads need any signed-in user. Any reader may add a source (off for others); its adder may edit it; everything else needs an admin (`requireAdminUser`). |
| Backend | `apps/newsgeek/backend` (`newsgeek-server`) | auth proxy, `/api/health`, `POST /api/discover`, the static frontend, the **ingest worker**, the **embedding indexer**, the **story assigner**, the retention purge. Every outbound request goes through the SSRF guard (`src/lib/safeFetch.js`). |
| Frontend | `apps/newsgeek/frontend` (`newsgeek-frontend`) | "County Gazette": Newsreader + Libre Franklin, newsprint `#F4F0E6`, blue reserved for *official* |

## The ingest worker

- **When it runs:** in production, or with `INGEST_AUTORUN=1`. `INGEST_DISABLED=1` is the
  kill switch. It ticks every 60s.
- **Concurrency:** 4 feeds at a time (`INGEST_CONCURRENCY`), never more than one request
  per host. **Blox (TownNews) feeds count as one host** (`platform:blox`): one in flight,
  ≥90 s between requests, at most one per tick, polled no faster than hourly. Every
  `nextPollAt` is jittered ±10 % (2026-10-11). All state lives in Mongo, so a restart mid-tick re-polls and the dedupe
  absorbs the repeats.
- **The gateway never calls it.** "Check now" sets `feeds.nextPollAt = now`, and the next
  tick picks that up.
- **Backoff:** each failure doubles the interval, capped at 6h. `Retry-After` wins when it
  asks for longer (capped at 24h). After 12 consecutive failures the source goes `broken`.
  Status is per *source*, so one dead NPR feed marks all of NPR broken.
- **Broken is not for ever (2026-11-27).** A broken source's feeds are still tried **once a
  day**, and the first one that answers puts the source back to `active`. Before, only
  `active` sources were polled. `worker.activeSources` in `/api/health` counts active ones only.
- **Stale:** an OK fetch with no new item for longer than max(7 × median gap, 3 days).
  NWS is exempt.
- **Seed:** insert-if-absent by slug, on every boot. It never overwrites an existing row.
  **A deleted starter source comes back on the next boot. Retire it instead.** Retired
  sources are left alone.
- **Retention:** items older than 90 days are never ingested and are purged daily.
  `pinnedArticleIds()` is the hook for N2's saved stories.

## Env (`apps/newsgeek/.env.production`, names only)

- **Required:** `MONGODB_URI` (db `newsgeek`), `JWT_SECRET` (the suite's shared secret),
  `BASEGEEK_URL`.
- **Optional:** `LOG_LEVEL`, `BASEGEEK_TIMEOUT_MS`, `CSRF_GUARD`, `CORS_ORIGINS`,
  `INGEST_DISABLED`, `INGEST_CONCURRENCY`, `PURGE_DISABLED`, `EMBEDDINGS_URL` (default
  `http://datageek_embeddings:11434`), `EMBEDDINGS_MODEL` (experiments only), `EMBED_DISABLED`,
  `STORIES_DISABLED`. None is needed in production: the defaults are production's.

A new variable only takes effect after `docker compose up -d` in `apps/newsgeek/`.
Watchtower recreates the container with its old env.

## Log

### 2026-10-10: N0 built (skeleton + ingest)

- **Built:** the gateway module, the ingest backend, the County Gazette frontend
  (Latest + Sources), and the harness scenes.
- **Deployed the same day** (`e7e35923`): vhost `clintgeek.com_newsGeek.conf` (ThingGeek's
  with port 1830 and a 1m body limit), `.env.production` (4 keys), and the first
  `compose up -d` after Watchtower's session completed. The first production tick polled
  32 feeds with 1 failure (Malvern 429 again) and stored 1,116 articles.
- **StartGeek dock:** News replaced Things (Chef).
- **First live tick** against real feeds, in a local container with a scratch Mongo:
  - 1,084 articles from 29 of the 30 sources in one tick (41 ms per tick afterwards).
  - **Malvern Daily Record answered 429 to our very first request.** Possibly it was still
    rate-limited from the feed survey earlier that day, or it may refuse non-browser
    clients outright. The worker backs off (the next try was 2h later). If it keeps
    answering 429 it will go `broken` in about 3 days and show on the Sources screen.
    Don't hammer it to find out.
  - Google News town searches also return weather.com forecast pages and obituaries
    (Dignity Memorial, AL.com, Sports Illustrated high-school pages). weather.com is now
    in the blocklist. **Obituaries stay** (Chef, the same day: "keep obits"), so legacy.com
    is not blocked.
- **Known follow-ups:**
  - Google News links are still news.google.com redirect wrappers.
  - NWS links point at the api.weather.gov alert URL, not a page for humans.
  - The first tick after a fresh deploy polls all 32 feeds at once (still one request per
    host at a time). No jitter yet (added 2026-10-11).

### 2026-10-10: "Free to read" (paywalls)

- **What it is:** a per-reader switch on Latest, stored in `newsgeek.prefs`
  (`freeToReadOnly`, off by default). On, the gateway leaves paywalled stories out of
  `newsArticles` and reports `hiddenPaywalled` ("14 paywalled stories hidden"). Nothing is
  deleted. **Metered counts as paywalled** (Chef).
- **Two tests for "paywalled":** a direct source by its own `access.paywall` (`metered` or
  `hard`). An aggregator (Google News) item by its publisher's domain against
  `PAYWALLED_DOMAINS` in `packages/schemas/newsgeek/paywalls.js`, matched as a suffix on a label
  boundary (`obits.nwaonline.com` matches, `notreuters.com` doesn't). The domain list never
  overrides a direct source's own setting. **Add domains there, not in the gateway.**
- **Evidence (2026-10-10):**

  | Source / domain | Level | How we know |
  |---|---|---|
  | Sentinel-Record (`hotsr.com`) | hard | the article markup says `isAccessibleForFree: false`; loads Zephr |
  | Arkansas Democrat-Gazette (`arkansasonline.com`) | hard | the same markup and Zephr (WEHCO, like hotsr and nwaonline) |
  | The Verge (`theverge.com`) | metered | `isAccessibleForFree: false` + Zephr; a metered allowance |
  | BBC (`bbc.com`, `bbc.co.uk`) | metered | BBC began metering US readers in 2025 |
  | Malvern Daily Record (`malvern-online.com`) | hard | **Chef confirmed.** Not detected: it rate-limits us, so we never fetched its article pages |
  | Reuters (`reuters.com`) | (domain list) | paywall since 2024; reaches us only through Google News |
  | NWA Democrat-Gazette (`nwaonline.com`) | (domain list) | WEHCO, the same stack as arkansasonline |
  | Baxter Bulletin (`baxterbulletin.com`) | (domain list) | Gannett, metered |
  | nytimes, wsj, washingtonpost, bloomberg, ft, economist, theatlantic, newyorker, wired, businessinsider, latimes, bostonglobe, newsweek | (domain list) | well-known subscription publishers |

- **Existing databases:** the seed is insert-if-absent, so it never changes a live source's
  paywall. `npm run set-paywalls` (`apps/newsgeek/backend/scripts/set-paywalls.js`) `$set`s
  `access.paywall` on exactly the five slugs in `PAYWALL_BY_SLUG` (`src/seed/data.js`). It
  touches no other field, prints `slug: old → new [set|unchanged|missing]`, is safe to run
  twice, and takes `--dry-run`. In production, once the image that contains it is live:

  ```
  docker exec newsgeek node scripts/set-paywalls.js --dry-run
  docker exec newsgeek node scripts/set-paywalls.js
  ```
- **Deploy order:** the gateway (new fields and ops, all additive) goes first. The frontend
  calls `newsPrefs`, `newsSetPrefs` and `hiddenPaywalled`, so it ships only after basegeek is
  live.
- **Client cache:** the switch isn't a query argument, so a flip drops every cached
  `newsArticles` list once the gateway has saved it, then refetches
  (`resetArticleLists` in `graphql/cachePolicies.js`). Putting the mode into `keyArgs` through a
  module variable was tried and dropped: Apollo memoizes reads per field and served the old
  list after the write.


### 2026-10-10: south half of Arkansas (sources research)

Chef asked for every source covering Clark County (Arkadelphia, Gurdon, Malvern), Hot Springs,
Little Rock, Texarkana, Conway and the southern half of the state.
- **How it was done:** five parallel research passes: home counties, central, southwest,
  southeast/Delta, and statewide official.
- **Verification:** each feed was fetched once with the honest UA and had to return items.
- **Paywall check:** one article page per source. The check looked for publisher markup
  (`isAccessibleForFree`), the Zephr/Piano, CherryRoad and PMPro plugins, and "premium
  content" text. Metered counts as paywalled.
- **Result:** 58 sources in `backend/src/seed/southArkansas.js` and 100 new gazetteer places
  (37 counties with FIPS, 78 towns). New sources are inserted on the next boot; existing
  rows are untouched.
  - 26 journalism, 26 official and 6 Google News gap-fill searches.
  - The official sources include three NWS alert zones (central/LZK, southwest/SHV,
    southeast/JAN), each with county AND forecast-zone codes from `api.weather.gov/zones`.
  - The gap-fill searches cover Gurdon, Hot Springs/Garland, Texarkana, Camden, El Dorado
    and Hope/Prescott.
  - Paywalled (metered): Log Cabin Democrat, Saline Courier, Dumas Clarion, Ashley County
    Ledger, Ashley News Observer, Chicot County Spectator (CherryRoad plugin).
- **Dropped after verifying:** KTVE (mostly Louisiana), Texarkana College (TX campus),
  Entergy's all-company newsroom (the `tag/arkansas` feed is used instead), Philander
  Smith (low-volume PR), and the Ashley/Chicot `/feed/` (classifieds; the news category
  feeds are used).
- **Hijacked domains, never add** (a seed test enforces it): `banner-news.com` (Magnolia
  Banner-News), `hsuoracle.com` (HSU Oracle), `crossettar.com`. All three now serve spam.
- **Place tagging changed** (`ingest/places.js`), because names like Union County, Conway,
  Benton and Stuttgart exist elsewhere and Hope, Stamps and Magnolia are ordinary words:
  - **Case:** a match must be Title Case or ALL CAPS, never lower case.
  - **Default:** every town and county needs Arkansas context, except `UNIQUE_PLACE_SLUGS`.
  - **Common words** (`COMMON_WORD_PLACE_SLUGS`) need strong context: the source covers
    the place or its county, the text names the county, or the text says "<Name>, Ark."
  - Revert-checked: 8 mutations, each red.
- **Gaps** (so nobody researches them again):
  - Home:
    - Gurdon Times: Facebook only.
    - Siftings Herald and Glenwood Herald: gone.
    - Pike County: no outlet at all.
    - Montgomery County News, Sheridan Headlight, Hot Springs Village Voice: HTML only.
    - Henderson State: no feed.
    - Sheriffs, police and fire, and small-town city halls: Facebook only.
    - Hot Spring County gov and Lake Ouachita: WordPress with zero posts.
    - No radio newsroom feeds.
  - Central:
    - Arkansas Business, FOX 16 and Lonoke News block bots.
    - The Cabot/Lonoke/Maumelle/Sherwood/Jacksonville/NLR weeklies folded in 2017.
    - The Cabot and Jacksonville CivicPlus feeds exist but are empty; recheck later.
  - Southwest:
    - Texarkana Gazette and El Dorado News-Times: WEHCO hard paywall, no RSS (Google News only).
    - Camden News: parked.
    - Hope Star, Nevada County Picayune and Little River News: closed.
    - Hope and Magnolia city sites: behind a Cloudflare challenge.
  - Southeast:
    - McGehee Times, Warren Eagle Democrat and Lincoln Ledger: placeholder sites.
    - Cleveland County Herald: feed stale since 2022.
    - Advance-Monticellonian: feed is syndicated filler.
    - UAM and Phillips CC: no RSS.
  - Statewide:
    - No feed for the Secretary of State, the Legislature, the Supreme Court or State Parks.
    - Dept of Education: bad TLS.
    - The Arkansas Press Association member list
      (`arkansaspress.org/apa-newspaper-members/`) is the place to look for new papers.

### 2026-10-10: reader-added sources (server side)

- **What:** the plan's "Reader-added sources" section. Any reader can add a source, which is
  off for everyone else. Readers can switch sources on and off for themselves, and discovery
  is at `POST /api/discover`. The built details are in the plan's "Built: the server side".
- **Every outbound request goes through `src/lib/safeFetch.js`.** That covers the worker's
  feeds as well as discovery. Never call `fetch` directly for a URL that came from a source
  or a reader.
  - The guard resolves the host and refuses any private, loopback, link-local or CGNAT
    address, v4 or v6. It then connects to the address it vetted, through a custom `lookup`.
  - It follows at most 5 redirects, checking each one again.
  - Feeds whose host resolves to a private address now fail with
    "That address isn't on the public internet." Every seeded feed is public.
- **Tests never use the network.** A local server sits behind a test-only allow-list that
  pairs an address with a port, so 127.0.0.1 is reachable on the fixture's port only. A
  request body can't reach that allow-list.
- **The discovery rate limit is in memory** (30 per user per hour, per process). Every
  Watchtower restart resets it.
- **Deploy order:** the gateway and backend go first. They only add fields and operations and
  loosen permissions, so the live frontend keeps working. The frontend follows.
- **"Open with…" links** (the same day, Chef): `NewsPrefs.readerLinks`, up to 5
  `{ label, template }` per reader.
  - The gateway validates and stores them and never fetches them.
  - A template needs `{url}`, may also use `{title}`, and must be http(s) once filled in.
  - The plan's "Open-with links" section has the details.
- **New sources start `active`**, whether a reader or an admin adds them, so the next worker
  tick polls them. The old `discovered` default is gone.
- **Paywall `unknown` from discovery is stored as `none`** until someone marks it, because
  the source enum has no `unknown`.

### 2026-10-10: the Source sheet (Chef: "click a source … marking it paid")

- **What:** the publisher line on each story opens a sheet with the reader's own settings for
  that source (in my paper, I subscribe) or, for a Google News story, for that publisher's
  domain (hide, I subscribe, look for a direct feed). The plan's "Source sheet" has the rules
  and the contract.
- **Two change sets, gateway first.** The server part (prefs fields, `publisherDomain` /
  `viaAggregator` / `subscribedByMe`, `newsSetSourceSubscribed`, `newsSetPublisherPref`, and the
  `newsArticles` rules) is additive. The UI selects the new fields, so it ships only once
  basegeek is live.
- **Mutes are domain mutes for aggregator items only.** A direct source is switched off per
  source. A test pins that a muted domain never hides a direct source on the same domain.
- **Matching** reuses `paywalledDomainRegex()` from `packages/schemas/newsgeek/paywalls.js` for
  the reader's own lists, so "subscribed" and "hidden" match exactly as the paywall list does.
- **Client cache:** `NewsPrefs` merges (`cachePolicies.js`), because `GET_NEWS_PREFS` and the
  new `GET_NEWS_PUBLISHER_PREFS` select different fields of the same object. Every sheet
  switch drops the cached `newsArticles` lists and refetches, like Free to read.

### 2026-10-11: the front page (Today) and per-reader ranking

- **Measured in production first** (the reason for it):
  - 662 articles a day. "Latest/All" was pure newest-first, so volume won.
  - Stories a week: Democrat-Gazette 278, AP via Google News 248, Sentinel-Record 174,
    Reuters 152; The Arkadelphian 7, posted in one weekly batch.
  - The Arkadelphian's newest story ranked **#1,282** in All. The first 50 stories in All
    held **zero** from Clark or Hot Spring County (The Hill 10, AP 6, Engadget 6, Hacker
    News 5…).
  - Sections were source labels, and "All" interleaved them.
- **What was built:** `newsFrontPage` (Today), ranked per reader by
  `graphql/newsgeek/ranking.js`: per-story sections from the reader's ring (`homePlaces`),
  pace-normalised freshness, ring-position locality, ★ Favorite / Less, at most
  **5 stories per source per section** (Google News per publisher domain), quotas as caps.
  The formula and constants are in the plan's "Ranking: the front page" and in the
  module's header. `newsArticles(section)` now filters by the same per-story section.
- **Behaviour change:** `newsArticles(section: "national")` no longer returns a
  tech + national source's stories. A story belongs to exactly one section per reader, the
  source's FIRST label when no place decides it. The five section pages partition
  Everything (a test pins it).
- **Inherited places don't make a story Local.** Ingest gives every article its source's
  places, so the ranking subtracts them and only adds them back when the source is
  ring-local (every place it covers, ignoring state/country, is in the ring). Otherwise
  Arkansas TV (Little Rock + Pulaski) would make every one of its stories Local for anyone
  with Little Rock in their ring. Cost: a Little Rock station story that names only
  Little Rock reads as State, not Local.
- **Cost:** `newsFrontPage` is six reads (a test counts them through the Mongoose debug
  hook). The candidates are the last 10 days of visible articles with five fields each;
  only the ~25 chosen are read in full. No new index: `publishedAt` already serves the
  window.
- **Deploy order:** the gateway first (everything is additive except the section filter
  above, which the live Latest survives: it still gets articles, now per story). The UI
  selects `newsFrontPage`, `why`, `priorityForMe` and `homePlaces`, so it ships only
  once basegeek is live.
- **Set Chef's ring after the deploy** (Settings → Home places): Arkadelphia, Clark County,
  Hot Springs, Little Rock, Conway, Garland County, Hot Spring County. Until a reader has a
  ring, Local is the source label, as before.

### 2026-10-11: feed hygiene (step 2)

- **Audit (production, 2026-10-11):**
  - All six TownNews/Blox sites answer **429**: malvern-daily-record, saline-courier,
    ashley-county-ledger, log-cabin-democrat, magnolia-reporter, ktbs (feeds
    `…/search/?f=rss…`). The platform throttles us collectively, so the per-host limiter
    doesn't help.
  - Blox generic feeds are junk:
    - Malvern: 50 of 50 article URLs under `/online_features/press_releases/`.
    - Saline Courier: 50 of 50 the same.
    - Ashley County Ledger: 27 press releases, 14 `/news/national/`, and more
      `/online_features/…`.
  - The Guardian US: 12 `/sport/` and 2 `/football/` of ~65 (TV listings like "NFL today:
    How to watch…").
  - Excerpts: **567** end in WordPress's "The post … appeared first on …", and **64** in
    "Continue reading" / "Read more".
  - Cross-source duplicates: **118** same-titleKey groups covering **248** articles in 7
    days:
    - AP copy across the TV sites, the Sentinel-Record and the Log Cabin;
    - Advocate / Arkansas Times / KUAR co-publishing;
    - obituaries as "Elendle Buck" (The Arkadelphian) and as "Elendle Buck Obituary (2026)
      - Arkadelphia, AR - Smith Family Funeral Home" (Google News).
  - Wire leak: AP stories carried by local and state papers have no Arkansas place of their
    own, so per-story sectioning put them in State.
- **What was built** (the rules are in the plan's "Ingest hygiene (2026-10-11)"):
  - the Blox platform throttle with a 60-min floor, plus ±10 % jitter;
  - per-source URL path rules (`pathExclude`, admin-only, validated in
    `@geeksuite/schemas/newsgeek/pathRules`), dropped at ingest as `drops.path_excluded`;
  - the excerpt cleaner (end-anchored);
  - display-time duplicate collapse in the gateway (`dedupe.js`: `alsoIn`, the wire rule,
    a group counts once in Today).
- **New sources** (insert-if-absent, on the next boot):
  - four Google News **location** feeds: `gnews-geo-hot-springs`, `-little-rock`,
    `-conway`, `-malvern`;
  - `texarkana-today` (free, WordPress);
  - `camden-news` and `el-dorado-news-times` (WEHCO, hard paywall; their 150-item feeds
    carry wire too). These two now have RSS, which supersedes the 2026-10-10 "no RSS" and
    "Camden News: parked" gap notes.
  - `camdenarknews.com` and `eldoradonews.com` are in `PAYWALLED_DOMAINS`.
  - 95 seeded sources in all (was 88).
- **The Blox throttle is in memory.** A restart (every main push) forgets the last Blox
  request, so the first one after a deploy can come early. Six Blox feeds now take about
  12 minutes to come round once, one every 2 minutes, because the gap is 90 s and ticks
  are 60 s apart. If they keep answering 429, raise `BLOX_MIN_GAP_MS` rather than adding
  feeds.
- **Duplicate collapse is display only.** The database keeps every copy. Clustering (N1)
  will replace it. Section pages collapse within the page, and an `alsoIn` there lists
  only the copies within ±72 h of that page.
- **Deploy order:** change set A (backend + gateway + schemas) is additive. The live UI
  ignores `alsoIn` and `pathExclude`, and the backend only drops items and spaces out
  polls. Change set B (UI) selects the new fields, so it ships after basegeek is live.
- **After the image with A is live, in production, in this order** (each script prints
  what it would do first; none prints the connection string):

  ```
  docker exec newsgeek node scripts/set-path-rules.js --dry-run
  docker exec newsgeek node scripts/set-path-rules.js
  docker exec newsgeek node scripts/purge-path-excluded.js
  docker exec newsgeek node scripts/purge-path-excluded.js --apply
  docker exec newsgeek node scripts/clean-excerpts.js
  docker exec newsgeek node scripts/clean-excerpts.js --apply
  ```
  `set-path-rules` touches only `pathExclude` on the seven listed slugs.
  `purge-path-excluded` deletes only articles whose URL path matches **their own**
  source's rules. `clean-excerpts` writes only `excerpt`, only where the cleaner changes
  it. All three are safe to run twice.

### 2026-10-11: Opening, Around Arkansas, and the per-source cap

- **Opening (Chef):** two new per-reader settings, `openInNewTab` (default true, the old
  behaviour) and per-publisher `openers`. Each reader link now has an `id`, a 12-hex hash of
  its template. Renaming a link keeps the id; editing the template changes it, and the
  openers that used it go back to the original link (they are removed from the row, not
  hidden). The rules are in the plan's "Opening (Chef, 2026-10-11)".
- **The tap rule changed:** a story opens with the reader's chosen opener for that publisher.
  "Open at publisher" and the Also-in links still always open the original URL.
- **Around Arkansas** (Chef approved): State had filled up with another town's local news (the
  DeWitt Era-Enterprise's "Calendar of Events", "Stuttgart Clean-Up"). For a reader with a ring,
  State is now a statewide source or a story with an **own** Arkansas place. A local paper off
  the ring reporting its own town goes to the new last section, `around` (default quota 3,
  `/s/around`). Readers with no ring keep the old rule.
- **The per-source cap is relative to the block:** `perSourceCap(quota)` is 5 for a quota of
  8 or more, otherwise ceil(quota / 2). With the defaults that gives Local 5, State 3,
  National 3, World 2, Tech 2 and Around 2.
- **Deploy order:** change set A (gateway + schemas) is additive except for the section
  rule, which the live UI survives: an `around` front-page section renders with its gateway
  title. Its "More Around Arkansas →" link goes back to Today until B ships, because the live
  UI only routes `/s/` for the five old sections. Change set B (UI) selects
  `openInNewTab`, `openers` and `readerLinks.id`, so it ships only after basegeek is live.
- **No migration:** a missing `openInNewTab` reads as true, and missing `openers` and
  `sectionQuotas.around` read as the defaults.

### 2026-11-16: paging by cursor, resume refresh (suite review, wave 3)

- `newsArticles(cursor)` returns `NewsArticlePage.nextCursor`; the list pages by it, so a
  tick that stores new stories no longer shifts or repeats rows on "older stories".
- Coming back to the app refetches quietly and shows an "N new stories" bar; the list
  does not move until it is tapped. Scroll position is remembered across article opens.
- A failed "older stories" load says so, with a retry.
- Deploy order: gateway first (the UI selects `nextCursor`).

### 2026-11-27: stories, coverage in the ranking, Top Stories, feeds that come back

Chef: "tell me exactly what the hell is wrong with it and why I keep turning to an ad riddled
Google News", then "Do whatever you think will fix this app before I give up on it." The
measurements and every rule are in the plan's "Stories on the front page (2026-11-27)".

- **What was wrong, measured:** the eight most-covered stories of a morning were on Today 0, 3,
  1 and 0 times out of 8 over four mornings; 48,672 articles had vectors and none had a story;
  the pace-normalised freshness made a daily paper's story dead in three hours, so for ten
  mornings Local held no Sentinel-Record, KATV, KARK, THV11 or Democrat-Gazette story; eight
  sources had been `broken`, and so never polled, for six weeks.
- **Built, backend** (the newsgeek image):
  - **The story assigner** (`src/jobs/storyAssigner.js`, rule in `src/cluster/stories.js`,
    details in `CLUSTERING.md` "Phase 2"). Every 60 s it gives each article that has a vector
    and no story a `storyId`, oldest first, and writes the `stories` collection. It looks back
    **14 days**; older articles never get a story and still show on their own.
  - `/api/health` → `stories: { enabled, lastRunAt, lastRunAssigned, lastRunJoined, pending,
    lastError }`.
  - The daily purge also strips the vectors of stories closed for 21 days and deletes stories
    past retention.
  - Broken sources retried daily (above). Four world sources. File-name titles dropped.
    Capital-letter entities decoded.
  - A new index on `articles`: `{ storyId: 1, publishedAt: 1 }` (the assigner's queue). It is
    built at boot by `Article.init()`.
- **Built, gateway** (the basegeek image; `graphql/newsgeek/ranking.js`, `dedupe.js`):
  `newsFrontPage` groups by `storyId`, scores with coverage, and leads with `top`. **No schema
  change**: "N sources" is a why-chip, the other outlets are `alsoIn`, and `top` is one more
  `NewsFrontSection`. The live UI renders all of it as it is, so there is no UI change set.
- **Deploy order: none.** The gateway treats a missing `storyId` as "on its own", so either
  image can go first. Until the backend has assigned stories, Today is the old paper with the
  new scoring.
- **After the deploy** (nothing to run by hand):
  ```
  curl -s http://localhost:1830/api/health | jq .stories
  ```
  `pending` starts near 12,000 (14 days of articles) and drains in batches of 400 within a
  20 s budget per minute. Measured on the live box on 2026-11-27 as a dry run: 12,600 articles
  into 8,800 stories in about 50 s of work, so expect it empty within about ten minutes.
  `lastError` stays null. The eight broken sources are each tried once on the first ticks (the
  six Blox ones one per tick, through the platform throttle), then daily.
- **Turning it off:** `STORIES_DISABLED=1` in `.env.production`, then `docker compose up -d`
  in `apps/newsgeek/` (Watchtower keeps the old env). Articles keep the stories they have.
- **Undoing it** (nothing here deletes an article):
  - the ranking: revert the gateway commit;
  - the data, if ever wanted: `db.articles.updateMany({}, { $set: { storyId: null } })` and
    `db.stories.drop()`. With the assigner on, it simply rebuilds the last 14 days.
- **Changing JOIN or SEED_FLOOR** (`cluster/stories.js`) only affects articles assigned
  afterwards. To re-cluster, undo the data as above and let it rebuild.
- **Known and left:**
  - Everything and the section pages do not group by story (the plan lists this).
  - A story told only by AP or Reuters is shown through a Google News redirect, with no
    excerpt.
  - Wire copy with no wire byline (THV11's, some of the Democrat-Gazette's) is still filed
    under State.
  - The threshold was read by hand on live stories (the numbers are beside the constants);
    the October golden set (200 labelled pairs) was in a session scratchpad and is gone, so
    nothing was re-measured against it.
  - Titles stored before today keep "&Aacute;" until they age out.
- **Tests:** backend 296 (was 264); gateway NewsGeek suites 261 (was 207), the full api suite
  3,936 in 198 suites; 41 revert-checks (a rule broken on purpose), each red. Two of the first
  tests written for the favourite rules passed either way and were rewritten until they did not.
- **Checked on live data, read-only, before anything was deployed:** the rule and the ranking
  were run inside the newsgeek container over the last 14 days of articles (nothing written),
  and Today was replayed for the last four mornings. Top Stories held: Nov 23 the House
  majority, a cartel capture, the climate talks; Nov 24 Nvidia's CEO (15 outlets); Nov 25 the
  Huawei verdict; Nov 26 Ábrego García, the Iowa detonation, SpaceX. Local held the Little
  Rock arson arrest (4 outlets, one item) and a Garland County felony beside The Arkadelphian.

### 2026-11-27, later: deployed; then story grouping on every list and the story page

- **The first change set is live.** Pushed `65245322..760508e4` on Chef's word ("push and keep
  going"). CI, the image release and the mobile harness passed on that commit.
  - newsgeek rolled at 02:22; the story backfill was empty at 02:27 (12,683 articles, 8,871
    stories, 978 of them told by two or more outlets). `stories.lastError` null.
  - **basegeek rolled nine minutes later** (02:31): its image publishes last and missed
    Watchtower's pass. In between, the old gateway served the old paper. Nothing broke, because
    the first change set had no schema change. **A UI that selects a new field must not ride
    in the same push as its gateway change.**
  - Two broken sources came back by themselves on the first ticks (DeWitt Era-Enterprise, SAU
    Tech). The six Blox ones still answer 429 and are now tried once a day. 94 active, 6 broken.
  - The four world sources were polled within a minute. World on Today went from one or two BBC
    stories to three outlets (Al Jazeera, France 24, BBC).
  - `newsFrontPage` for Chef, warm: about 600 ms over 9,300 candidates, as before stories. The
    first call after a gateway restart: about 1.4 s.
- **Second change set** (the rules are in the plan's "Stories on the front page" and "The story
  page"):
  - **A, gateway** (additive): `newsArticles` groups by story on Everything and the section
    pages (not on one source's own page); `NewsArticle.storyId`; `newsStory(id)`.
  - **B, UI** (selects `storyId`, calls `newsStory`): the story page `/story/:id`, and "All
    coverage →" at the end of a story's opened "Also in" list.
  - **Deploy order: A, confirm basegeek is running it, then B.** Confirm with
    `docker exec basegeek grep -c newsStory src/graphql/newsgeek/typeDefs.js` (not 0).
  - Harness: Today's fixture leads with Top Stories; scenes 53 (Also in, opened), 54 (the story
    page), 55 (a story that is gone). 220 scenes, phone and desktop, a11y enforcing: 0
    violations.
- **Dropped while building it:** a guard for a story "whose section none of its articles is
  filed under". A revert-check showed its test passed either way; working the vote through
  showed the case cannot happen (the vote always picks some member's own section), so the guard
  and the test were removed.

