# NewsGeek — context

How NewsGeek actually runs. The spec, meaning what it's *for*, is `DOCS/NEWSGEEK_PLAN.md`
at the repo root. This file is a dated decision log, and it should stay honest.

## Shape

| Piece | Where | Notes |
|---|---|---|
| Public host | `newsgeek.clintgeek.com` | nginx vhost: `/` → :1830, `/graphql` → basegeek :8987 (the frontend calls a relative `/graphql`) |
| Container | `newsgeek`, image `ghcr.io/clintgeek/newsgeek:latest` | host port **1830**; dev frontend 1831 |
| Database | Mongo `newsgeek`: `sources`, `places`, `articles`, `prefs` (per reader) | Shared definitions are in `@geeksuite/schemas/newsgeek/*`. Add fields there, never in a model file. |
| Gateway | `apps/basegeek/packages/api/src/graphql/newsgeek/` | Reads need any signed-in user. Writes need an admin (`requireAdminUser`). |
| Backend | `apps/newsgeek/backend` (`newsgeek-server`) | auth proxy, `/api/health`, the static frontend, the **ingest worker**, the retention purge |
| Frontend | `apps/newsgeek/frontend` (`newsgeek-frontend`) | "County Gazette": Newsreader + Libre Franklin, newsprint `#F4F0E6`, blue reserved for *official* |

## The ingest worker

- **When it runs:** in production, or with `INGEST_AUTORUN=1`. `INGEST_DISABLED=1` is the
  kill switch. It ticks every 60s.
- **Concurrency:** 4 feeds at a time (`INGEST_CONCURRENCY`), never more than one request
  per host. All state lives in Mongo, so a restart mid-tick re-polls and the dedupe
  absorbs the repeats.
- **The gateway never calls it.** "Check now" sets `feeds.nextPollAt = now`, and the next
  tick picks that up.
- **Backoff:** each failure doubles the interval, capped at 6h. `Retry-After` wins when it
  asks for longer (capped at 24h). After 12 consecutive failures the source goes `broken`.
  Status is per *source*, so one dead NPR feed marks all of NPR broken.
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
  `INGEST_DISABLED`, `INGEST_CONCURRENCY`, `PURGE_DISABLED`.

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
    host at a time). No jitter yet.

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
