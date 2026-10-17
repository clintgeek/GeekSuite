# Work log — October 2026

What shipped, as it landed. Wanted-but-not-done lives in `SUITE_TODO.md`.

### BookGeek + GameGeek — what-next goes on demand, in a sheet

The AI picks used to load as a tall rail of full-size cards above the library
on every visit. Now a ✨ button in the library header opens them in a
`GeekSheet` (bottom sheet on a phone, dialog on desktop) as compact rows, and
nothing is asked until that button is tapped. Details: `WHAT_NEXT_SPEC.md` §8.

### BookGeek + GameGeek — one set of star labels (2026-10-04)

5 LOVED IT! · 4 It was great! · 3 It was ok · 2 Meh · 1 It actively offended me. Chef's
wording, kept generic so it works for a book and a game alike. It lives in one place,
`@geeksuite/collection` (`RATING_LABELS`, `ratingLabelFor`, `ratingLine`), and both apps
read it from there.

- **GameGeek:** the line under the stars, the tooltip and screen-reader text, and the
  Settings list, which now shows the labels instead of the long quotes. The long quotes are
  still the recommender's definitions (`apps/gamegeek/DOCS/TASTE_MODEL.md`).
- **BookGeek** gains labels: a tooltip and screen-reader text on the stars, the rating toast
  ("4★ It was great! · Title"), and a live line under the edit dialog's stars.

### BookGeek + GameGeek — "Updating…" during the post-deploy reload (2026-10-04)

Chef: both apps "refresh a couple of times before settling", on the first open after a
deploy. Reproduced locally with the service worker on (build A, swap in build B on the same
origin, open again): GameGeek drew the old build at 0.1 s, the new worker downloaded the new
build, and the page reloaded into it at ~5.6 s, so the library was drawn twice, each time
with a splash-to-app swap. It's one reload, not a loop, and it comes from
PWA_STANDARD row 5 (cache-first navigation) together with rule 6 (skipWaiting +
clients.claim).

Chef kept both rules (network-first and "apply on next open" were offered and declined), so
the fix softens it: `GeekUpdateIndicator` in `@geeksuite/ui` shows "Updating to the latest
version…" while an update installs over an existing worker, in both apps. It covers BookGeek's
fast path too, where the takeover can finish before React mounts. Verified end to end in
GameGeek; in BookGeek, one reload and unit tests (the deploy probe's API stubs don't reach
requests that go through BookGeek's worker). Ruled out along the way: a CSRF reload (the token
is double-submit, so a restart doesn't invalidate it), and an in-app reload loop (none with
the worker blocked). PWA_STANDARD rule 9; the other PWAs are in SUITE_TODO.

### Backlog pass — "do the things you can" (2026-10-06)

Shipped:
- **"Updating…" pill** in notegeek, bujogeek, flockgeek, storygeek and thinggeek (`2dfc2e26`). Not in fitnessgeek, which defers updates until the page is hidden, so the pill would never clear. Not in startgeek, which has no MUI.
- **Reduced motion app-wide** in the five framer-motion apps via `<MotionConfig reducedMotion="user">` (`8af3e847`).
- **Login wordmarks:** bujogeek and flockgeek use theme tokens instead of hex (`37aebe63`).
- **Graceful shutdown:** all nine backends go through `installShutdownHooks` (`9725bb97`). The hook itself is pinned by a real-SIGTERM test in `packages/logger` (`d6f1934e`).
- **BuJoGeek performance:** the override fetch is bounded to the view (`291935bc`), counts and streaks are batched (4N queries → 1, N → 1; `37d73e27`), and `TaskRow` is memoised (`26ce9ad5`).
- **FitnessGeek's BP edit test** is cheaper instead of leaning on a raised timeout (`7c9091b7`).
- **RUNBOOK §10:** an nginx 413 / `client_max_body_size` row, the first time it's written down in the repo.

Verified already done, and the todo list corrected:
- **Themed tooltips:** already in the shared theme.
- **BookGeek's 2.8:1 button:** gone with the Used Bookstore restyle.
- **The "grey auth splash":** all 8 apps are themed, checked with `/api/me` delayed by 3 s.
- **CSRF "~5/24 h" warnings:** traced and closed 2026-09-11, then carried forward as open by a later docs consolidation. 46 h of logs show zero warnings, and all 8 proxies forward the header. Only Chef's flip remains (`docker compose up -d basegeek`).
- **Registration gate:** shipped 2026-09-25. **Storefront importer:** superseded by the Playnite-only decision.

Gates: full basegeek API suite (142 suites, 3,086 tests), the other eight backends, and every touched frontend. Mobile harness, phone and desktop with `--enforce-a11y`, for the seven touched apps.

### BookGeek — a mix of real shop stickers (2026-10-09)

Chef rejected the uniform sunburst (2026-10-08): real used-bookstore covers carry *different* stickers, in different spots and at different angles. `PriceSticker` now draws four kinds:
- a round dot;
- a printed label with a header band, a barcode and a peeled corner;
- a hand-priced tag in Caveat with a curled corner;
- a solid block with a paper window.

Shape, corner, tilt (≤ 12°) and offset are seeded from the book id. A book showing a ribbon is always stickered on the left. FNV-1a gained a murmur finalizer, because ids that differed only in their last character clustered. Tests were revert-checked (4 red against the old component). Harness: phone and desktop, `--enforce-a11y`.

### StartGeek — dock: Flock out, Games and Things in (2026-10-09)

The dock is now Notes, Bujo, Fitness, Books, Games and Things, with new line icons for a gamepad and a parcel box. On phones the labels drop their letter-spacing so all six fit at 390px with "FITNESS" whole. Lint 0, tests 24/24, harness phone + desktop `--enforce-a11y`.

### GameGeek — Playnite import: uninstalled → Backlog, hidden → removed, deletes remembered (2026-10-09)

Chef: uninstalled games weren't leaving Playing, and DLC he hid in Playnite stayed in GameGeek. Three changes:
- **Uninstalled:** a Playing game whose Playnite copies are all uninstalled moves to Backlog automatically. This replaces the "how did it end?" flag-and-ask, and an Android or Switch copy no longer keeps it on Playing. A game put on Playing by hand stays there until it's installed and uninstalled again.
- **Hidden in Playnite:** the import removes that copy, or the whole game if it was the last copy. Unhiding brings it back.
- **Deleted in GameGeek:** remembered in a new `PlayniteTombstone` collection, written by the gateway's `deleteGame` and when a Playnite copy is removed in edit. The import never brings these back.

Spec: `apps/gamegeek/DOCS/PLAYNITE_IMPORT.md`. Tests were revert-checked: 20 backend and 4 gateway tests fail against the old code. The delete guard was checked against an in-memory Mongo.

## 2026-10-10 — basegeek survives a cold start

After a power cut every login failed with `users.findOne()` buffering timeouts for an hour. Docker started all containers in the same second, basegeek's userGeek connection failed its first connect, and mongoose never retries that. Boot now exits 1 when userGeek can't connect (`lib/requireConnection.js`), so Docker's restart policy tries again. The test was revert-checked: it fails without the exit.

Also: `docker.service` enabled at boot (it was socket-activated only, so Docker waited for a cron job), dev stacks set to on-demand, and ~113 GB of Docker leftovers cleared. See the RUNBOOK troubleshooting rows.

## 2026-10-10 — BuJoGeek renamed TodoGeek

The look had become a todo app, so the name followed: `apps/todogeek`, app key and Mongo DB `todogeek`, image `ghcr.io/clintgeek/todogeek`, domain `todogeek.clintgeek.com`. The old domain and the `bujo.` alias are retired with a 410, not a redirect (Chef: so nothing keeps using them). History (`DOCS/ARCHIVE`, `archive/`, dated logs) keeps the old name. Live data moves with a DB copy plus `scripts/rename-bujogeek-to-todogeek.js` (app key in user prefs, app registry, aiGeek configs/spends/keys). Push reminders belong to an origin, so each phone re-enables them on the new domain. Refresh now ignores an app claim that isn't a valid app.

## 2026-10-10 — NewsGeek N0 live

A new app: **NewsGeek**, a local-first news briefing at `newsgeek.clintgeek.com` (port 1830).
Spec: `DOCS/NEWSGEEK_PLAN.md`; context: `apps/newsgeek/DOCS/CONTEXT.md`. Its look is "County
Gazette": newsprint, Newsreader serif headlines, a front-page masthead, and blue reserved
for official notices.

N0 is the skeleton plus ingest, so a week of real articles piles up before N1's clustering
is tuned against a labelled golden set.
- **Sources:** 30 sources (32 feeds), each fetched and verified before it was seeded: 3
  local, 8 state, 5 national/world, 5 tech, 4 official (NWS alerts for Clark and Hot
  Spring County, plus city feeds), and 5 Google News gap-fill searches credited to the
  real publisher.
- **Ingest:** conditional GET, one request per host at a time, backoff that honours
  Retry-After, `broken` and `stale` feed health, three-layer dedupe, and gazetteer place
  tagging.
- **Screens:** Latest (chronological, sections) and Sources (health, admin add/edit/check-now).
- **Chef's calls:**
  - obituaries are kept (legacy.com is not blocked; weather.com forecast pages are);
  - News replaced Things in the StartGeek dock.
- **Verified:**
  - Tests: backend 82/82, frontend 136/136, basegeek api 148/148 suites,
    themeContrast 595.
  - Harness: 28 scenes, 0 violations; StartGeek 16, 0 violations.
  - CI, release and harness green on `e7e35923`.
  - First production tick: 1,116 articles.
- **Open:**
  - Malvern Daily Record answers 429 even to our first request. The worker backs off,
    and if this continues the Sources screen will show it `broken`.
  - nginx now warns that `server_names_hash` is at capacity. It's harmless today, but
    the next vhost may need `server_names_hash_bucket_size 128`.


## 2026-10-10 — nginx host cleanup

nginx went from 69 live host names to 51, using Chef's list.
- **Root and www:** `clintgeek.com` and `www.` now 301 to `start.clintgeek.com`. Nothing
  had been running on :8081.
- **Vhosts archived** to `zzz_*.fnoc`: musicgeek, photogeek, git, code, retro, ai-scaling,
  geekpr, about (with aboutme and portfolio) and geeksuite.
- **Aliases dropped:** `base.`, `subs.`, `jelly.`, `radar.`, `sonar.`, `myfitnessgeek.` and
  `nutrition-tracker.`.
- **Unknown names:** DNS is a wildcard, so any retired or unknown name lands on the root
  block and is sent to Start.
- **Hash setting:** `server_names_hash_bucket_size 128` added to `nginx.conf`.
  `nginx.conf` is a single-file bind mount: an editor that renames files (`sed -i`) leaves
  the container reading the old inode, so this one needed `docker restart NGINX`, not a
  reload.
- **Backup** of the pre-change `sites-available/` and `nginx.conf` is in the session scratchpad.
- **Repo leftovers, harmless:** dead CORS origins for `geeksuite.` and `geekpr.`, and a
  geekPR entry in `appRegistrySeed.js`.

## 2026-10-10 — NewsGeek: "Free to read" + the south half of Arkansas

**Free to read** (Chef: "an easy button" for sources that need a subscription; metered counts):
- **The switch:** per reader, stored server-side (`newsPrefs`), on the Latest view. When
  on, the gateway leaves paywalled stories out of every list and says how many it hid.
  Nothing is deleted.
- **What counts as paywalled:**
  - A source is judged by its own `access.paywall`.
  - Google News items are judged by `PAYWALLED_DOMAINS` (Reuters, WEHCO papers, Gannett,
    NYT/WSJ/WaPo and similar).
  - The sources were set from each publisher's own markup (`isAccessibleForFree:false`,
    Zephr): Sentinel-Record, Democrat-Gazette, The Verge, BBC (US metering).
  - Malvern Daily Record per Chef.
  - Applied to production with `docker exec newsgeek node scripts/set-paywalls.js`
    (idempotent).
- **Deploy:** two pushes. Gateway `b908fb95` went live first, then the UI `79011075`.

**Sources** (Chef: "find all the sources you can" for the southern half of the state):
- **Research:** five parallel passes; every feed fetched once.
- **Live in production:** 30 → 88 sources, 117 places, ~2,400 articles after the first tick.
  - New: Magnolia Reporter, Pine Bluff Commercial, KTAL, KTBS, Stuttgart Daily Leader,
    Helena World, Hope-Prescott News, OBU Signal, Fordyce News-Advocate.
  - New official feeds: the Governor, AG, State Police, ARDOT, Health, AGFC, UA Extension,
    NPS Hot Springs, USACE, Clark County.
  - New weather: NWS alerts for central/SW/SE Arkansas.
  - New gap-fill: Google News searches for Gurdon, Hot Springs, Texarkana, Camden,
    El Dorado and Hope.
- **Place tagging is stricter:** Title Case or ALL CAPS only; Arkansas context by default;
  common-word towns (Hope, Stamps, Magnolia) need strong context.
- **Three spam domains** that took over old newspaper names are pinned out of the seed by a
  test.
- **The gap list** (Facebook-only sheriffs, closed weeklies, bot-blocked sites) is in
  `apps/newsgeek/DOCS/CONTEXT.md`.
- **Open:** three TownNews/Blox sites answer 429 (Malvern, Magnolia Reporter, Saline
  Courier), most likely tripped by the day's research. The worker backs off; if they
  stay red, the Sources screen shows it.

## 2026-10-10 — NewsGeek: anyone can add sources; open-with links

Chef: "anyone should be able to add whatever they want. They can default off for others."
- **Add a source** (every reader): paste any link. `POST /api/discover` finds the feed and
  returns a preview (feeds with counts, 3 headlines, paywall verdict, suggested
  places). Tap **Add**. A new source is on for its adder and off for everyone else, and
  others can switch it on under "From other readers". Admins can make one **On for
  everyone**. A feed already in the system gets "Already here — turn it on" (one poll
  per feed).
- **Per-reader switches** on every source. **Suggested** ranks publishers seen in Google
  News results that we don't read directly.
- **SSRF guard** on every outbound fetch (worker and discovery):
  - public addresses only, checked after DNS, with the vetted IP pinned against rebinding;
  - each redirect re-checked;
  - ports 80/443/8080 only.

  Verified inside the production container: the LAN gateway, localhost, the metadata IP,
  a mapped-v6 private address, userinfo, ftp and an odd port were all refused.
- **Limits:** 20 adds/24h and 200 total per reader; 30 discoveries/hour (in memory,
  resets on restart). Reader feeds poll at most every 30 min.
- **Open-with links** (Settings): up to 5 per reader, http(s) templates with `{url}` and
  `{title}`. Each placeholder value is encoded on its own. Tapping a story always opens
  the publisher; the links live in a ⋯ menu. Nothing is preconfigured.
- **Checks:**
  - Tests: basegeek 151/151 suites (3237), backend 192, frontend 194.
  - Harness: 80 scenes, 0 violations.
  - Revert checks: guard 27/27, discovery 33/33, gateway 61, frontend 44, all red when
    broken.
- **Deploy:** two pushes, server `eb37495a` then UI `b88ab650`.
- **Declined:** a built-in paywall-bypass link (skipthepaywall/archive mirrors). The
  open-with feature is generic and nothing is preset.

## 2026-10-10 — NewsGeek: tap a publisher for its settings

Chef: "click a source in the newslist and get to settings like marking it paid."
- **The sheet:** every story's publisher line opens a Source sheet. Tapping the headline
  still opens the publisher.
  - **Direct source:** In my paper, **I subscribe** (keeps it when Free to read is on),
    More from this source (Latest filtered with a "Showing: <name> ×" chip), and Source
    details.
  - **Google News item:** Hide this publisher (per-reader domain mute), I subscribe (by
    domain), Look for a direct feed (opens Add a source prefilled), and More from the
    search.
- **Elsewhere:**
  - an I subscribe switch on source detail;
  - Settings → Publishers lists subscribed sources and subscribed or hidden domains.
- **Rules:**
  - Subscribed sources and domains survive Free to read.
  - Muted domains only ever drop Google News items. Direct sources are muted with their
    own on/off switch.
- **Checks:**
  - Tests: basegeek 152/152 suites (3274), frontend 218.
  - Harness: 100 scenes, 0 violations.
  - Revert checks: 40 mutations, all red.
- **Deploy:** two pushes, server `95fbb67c` then UI `1d96212c`.
- Follow-up (Chef): the Source sheet moved from the publisher name to the ⋯ menu as **Source settings** (last item, after a rule). The publisher name is plain text again. Frontend 218/218, 2 revert checks red, harness 100 scenes / 0 violations.

## 2026-10-11 — NewsGeek: Today front page and fair ranking

Chef: sections were jumbled and The Arkadelphian never appeared.
- **Measured:** 662 articles/day, all sorted newest-first. The Arkadelphian (7/week, posted in
  one batch) had its newest story at #1,282. The top 4 sources made up 38% of everything,
  and the first 50 stories held nothing from Clark or Hot Spring County.
- **Today** is the new home screen. It has Local / State / National / World / Tech blocks,
  with quotas as caps (8/5/5/3/4) and at most 5 stories per source per block (Google News
  is counted per publisher domain). Every story shows chips saying why it's there.
  **Everything** is the old newest-first list. The tabs are Today · Everything · Sources.
- **Per-story sections from the reader's home ring.** Chef's ring: Arkadelphia → Clark
  County → Hot Springs → Little Rock → Conway → Garland County → Hot Spring County.
- **Pace-fair freshness:** a story's age is judged against its source's own 7-day cadence.
- **Priority:** ★ Favorite / Normal / Less, set in the Source sheet and on source detail.
  Settings → Home places edits the ring.
- **Chef's prefs set in production:** the ring above, and The Arkadelphian as ★ Favorite.
  The deployed resolver was run as Chef: Local leads with 5 Arkadelphian stories, then
  KARK on Little Rock and Hot Springs coverage.
- **Checks:**
  - Tests: basegeek 154/154 suites (3321), frontend 249.
  - Harness: 136 scenes, 0 violations.
  - Revert checks: 62 mutations, all red.
- **Deploy:** two pushes, server `6f3c421b` then UI `4ab6599c`.
- **Next (step 2, feed hygiene):**
  - Blox feeds carry syndicated press releases; Malvern's 50 items were all PR.
  - The same obituary shows twice (direct and via Google News).
  - The Guardian's TV listings.
  - Google location feeds for the ring towns.

## 2026-10-11 — NewsGeek step 2: feed hygiene

Built from a production audit of the whole pipeline.
- **Blox throttle:** six TownNews/Blox papers were returning 429 as a platform. They now
  share one limiter (one request in flight, ≥90 s apart, polled hourly), and every feed's
  next poll gets ±10% jitter.
- **Path rules:** per-source URL path rules (admin-only), applied at ingest. Defaults: the
  Blox papers skip `/online_features/`, `/press_releases/` and `/news/national|world/`;
  the Guardian skips `/sport/` and `/football/`. Applied in production with
  `set-path-rules`, then `purge-path-excluded --apply`, which deleted 164 articles
  (Malvern 50/50 and Saline 50/50 press releases, Ashley 49, Guardian 15).
- **Excerpts:** the end-anchored WordPress footer and "Continue reading" cleanup is live;
  `clean-excerpts --apply` cleaned 784 stored excerpts.
- **Duplicate collapse:** the same headline within 72 h shows as one story with an "Also
  in …" line. Obituaries match by name. A wire copy with no own Arkansas place files
  under National or World.
- **Sources (88 → 95 seeded, 96 live):** Google News location feeds for Hot Springs,
  Little Rock, Conway and Malvern; Texarkana Today; Camden News and El Dorado News-Times
  (hard paywall).
- **Checks:**
  - Tests: basegeek 156/156 suites (3349), backend 219, frontend 271.
  - Harness: 0 violations.
  - Revert checks: 70 mutations, all red.
- **Deploy:** server `e0bf28c9`, then UI `3282288c`.
- **Still open, found on Chef's Today after the deploy:**
  - Same-event stories with different headlines (3 Little Rock homicide items): this is
    clustering, N1.
  - Other towns' local news (DeWitt calendars) filling State.
  - One source can fill a 5-slot block (NPR 4/5 in National).

## 2026-10-11 — NewsGeek: opening prefs, Around Arkansas, fair caps; N1 phase 1

- **Opening:**
  - Settings → Reading "Open stories in a new tab" (off: this window, and Back returns).
  - Per-publisher "Open stories with" (Original, or one of the reader's open-with links),
    keyed by source or Google News publisher domain.
  - Tapping a story follows the opener. "Open at publisher" and Also-in links always open
    the original.
  - An edited or deleted link falls back to Original.
- **Sections:** State now means a statewide source, or an own Arkansas place off the ring.
  Other towns' papers go to a new **Around Arkansas** block (last, 3 slots).
- **Per-source cap:** 5 when a block has ≥8 slots, otherwise half the slots.
- **N1 phase 1:**
  - Every article is embedded with the local mxbai service. The backfill of 3.5k articles
    ran at ~58/min.
  - Tools: export-cluster-candidates and eval-cluster-threshold. Labelling (Claude, with
    Chef spot-checking 20) comes next.
- **Checks:** basegeek 157/157 suites (3375), frontend 307, backend 264.
- **Deploy:** N1 `f90186a3`, server `dbd86a33`, UI `96d86753`.
- **Landmine:** the session that reported `updated=9` skipped basegeek, because its image
  published after Watchtower had scanned it; the next pass picked it up. Before a UI push,
  check that the gateway itself answers the new field.

## 2026-10-13 — FitnessGeek: household, My Foods, recipes

- **Why nothing logged it:** all three bugs were client↔gateway shape mismatches. The
  gateway answered 200, and the browser threw or rendered empty. REST logs stayed clean.
- **Household** (`5bd8daa9`). Chef's settings row was the only one with a household id:
  Heather had never got in.
  - Join and Create read `response.data.message` off an already-unwrapped
    `{household_id}`. That threw AFTER the server had succeeded, and the toast said "Failed".
  - `HouseholdLogView` and `CopyMealDialog` had the same double-unwrap Settings had until
    09-19. The view said "No household members are sharing" for everyone.
  - Every catch read the Axios `err.response.data.error.message`, which an ApolloError never
    has. The real reason ("Household not found") is now shown, through `utils/errorMessage.js`.
  - Member logs showed 0 kcal: the view reads per-serving `nutrition`, and the query selected
    only the pre-scaled `calculatedNutrition`.
- **My Foods** (gateway `5e428971`, UI `d135ca33`):
  - The search crashed on the first keystroke (`food.source.toLowerCase()`): `source` was not
    on the GraphQL type.
  - "My" foods were the caller's rows plus the whole shared catalog, A→Z, capped at 100. Now
    `fitnessFoods(mine: true)`.
- **Recipes** (spec `apps/fitnessgeek/DOCS/RECIPES_PLAN.md`; Chef chose builder + paste):
  - Schema and gateway `b6f008de`: `FoodItem.recipe`, the shared math in
    `packages/schemas/fitnessgeek/recipe.js`, and the server recomputes totals.
  - Paste endpoint `c052aae1`: `POST /api/foods/recipe/parse`.
  - Builder UI: built by a Sonnet subagent, then reviewed. It uses an ESM mirror of the
    shared math, and a test pins the mirror to the shared file.
- **Meal cards on Home** now open `/food-log?date=&meal=` (Chef asked mid-session). The
  header row is a link stretched over the card, so Add and remove stay their own buttons.
- **Harness caught three issues before push:**
  - The meal links' tap targets were 27px tall.
  - My Foods source labels failed contrast in dark mode (#757575, 3.49:1). Pre-existing:
    no scene had ever shown My Foods.
  - Row text ran under the edit and delete icons.
  - New scenes 26 and 27 cover My Foods and the builder.
- **Checks:**
  - Gateway 158/158 suites (3385 tests). FitnessGeek backend 934. Frontend 512.
  - Harness 152 scenes, 0 violations, a11y enforced.
  - Every new test was reverted to red.
  - One unexplained backend flake: 1 failure in one full run, then 3 green reruns.
- **Not checked:** I could not read production data beyond the household and food counts,
  because the classifier blocked further prod DB reads. Heather's join has not been retried.

## 2026-10-13 — BookGeek: per-reader shelves (`0af432b1`)

- **Why:** Chef: "the books can/should be all one big happy library, but my reading shelf is
  my reading shelf". Shelf, rating, review, dates, readCount, progress and myTags lived on
  the shared `Book` row. Spec: `apps/bookgeek/DOCS/PER_READER_SHELVES_PLAN.md`.
- **Shape:**
  - `BookReading` holds one row per reader per book, unique on `(userId, bookId)`.
  - `readerOverlay(userId)` writes the caller's values over the row's, under the same field
    names. Filters, sorts and facets are unchanged, and the GraphQL contract and web app
    did not change.
- **Who reads what:**
  - Gateway reads and writes are per reader. StartGeek's Reading block and its book search
    are the caller's.
  - Goodreads import, merge and dedupe work per reader.
  - The Kindle page shows the shelves of `KINDLE_UI_USER_ID`, falling back to Chef.
- **Migration:** ran at boot on 2026-10-13 at 23:00Z, logging `books: 553, written: 553`.
  - It is Chef's (his call), runs once (marker `per-reader-shelves-v1` in bookgeek
    `migrations`), and merges per field.
  - The legacy fields are still on `Book`. Remove them in a later step, after a while live.
- **Checks:**
  - Gateway 159/159 suites (3396). BookGeek API 241, web 339.
  - Reverting to the old resolvers turns 6 tests red. The migration guard, the per-field
    merge and `mergeReadings` were each mutation-checked red.
- **Fixed along the way:** `fitnessgeekRecipes.test.js` leaked FoodItems into later suites,
  which share one in-memory Mongo.

## 2026-10-14 — FitnessGeek: the Crocker household, and duplicate settings rows

- **Heather joined** household `7D9169DE1A8F` with a direct data write: shares food logs and
  meals, not weight (the Join defaults).
- **Household names:** the household is named **Crocker**.
  - Gateway `ae194447`, UI `39404c80`.
  - A name is set on create and taken by whoever joins. A rename writes every member.
- **Root cause of the flaky household:** duplicate `usersettings` rows, 9 rows for 5 users.
  Heather had 3, created in the same millisecond. `getOrCreate` was find-then-insert, and the
  "unique" `user_id` index was shadowed by a path-level non-unique one with the same name.
  Mongoose only warned "Duplicate schema index", which shows in every test run.
- **Fix** (`54824242`): `getOrCreate` is now an atomic upsert, and the path index is gone.
- **Production, by hand, Chef approved:**
  - Backed up all 9 rows to the session scratchpad.
  - Deleted 4 duplicates. They differed only in `_id` and timestamps, or were empty defaults.
    One belonged to a third user, `…afba`.
  - Swapped `user_id_1` to a unique index.
- Heather's settings had never been written because she hasn't set a goal yet (Chef, 2026-10-14). Right account; nothing to do.

## 2026-10-14 — FitnessGeek: goal projections measure from the program start (`65d69ecf`)

- **Chef:** "Seeing 2050 as a projection before I ever start a program is a bit discouraging."
- **Cause:** the progress card's rate covered the last 6 weeks of logs and the chart's covered
  the last 28 days, whatever the goal said. Flat weight from before the program gave a slope
  near zero, and remaining ÷ ~0 put the finish decades out.
- **Fix:** `programPace` (in `weightTrend.js`) now drives both the chart and the cards.
  - It counts only weigh-ins on or after the goal's start date.
  - Before the start, or with under 14 days of program weigh-ins, it shows the plan's date
    and no rate.
  - The rate is a least-squares fit over every program weigh-in.
  - A finish more than twice the plan's length out reads "Well behind plan", not a date.
- **Checks:** 5 new tests, all red on the old code. Frontend 517. Harness 152/0.

## 2026-10-15 — FitnessGeek: food amounts in US units

- **Chef:** "I want ounces and other freedom units and not this grams crap." Scope picked:
  food amounts only. Protein, carbs and fat stay in grams, as US labels print them.
- **Display** (`utils/units.js` `formatServing`): metric servings read in US units.
  - Grams become oz, and lb from a pound up. Millilitres become cup, fl oz, tbsp or tsp.
  - Shown in food search rows, the ingredient picker and the recipe unit-mismatch warning.
  - Stored data is unchanged. Foods keep the unit their source gave.
- **Logging:** the serving sheet has a Servings / oz switch (fl oz / cup for poured foods),
  with "1 serving = 3.5 oz". The amount converts to servings when logged.
- **Entry:** new foods default to 1 oz. US units come first in the unit pickers, metric after
  them. The recipe builder's unit list is sorted US-first too.
- **Checks:** 7 new tests. The serving-sheet test is red on the old sheet. Frontend 524.
  Harness 80/0, enforcing. The serving sheet has no harness scene, so it is unaudited there.

## 2026-10-16 — FitnessGeek: full review for real use (`apps/fitnessgeek/DOCS/REVIEW_2026-10.md`)

- **Chef:** complaints of "this or that doesn't work" now that Heather uses it.
- Review only; nothing fixed. Covered: code bugs (19 P1, ~35 P2), a UX walkthrough as Heather,
  a composer redesign for the food box, a phased plan, and 6 open decisions.
- **Production logs:** CalorieNinjas key invalid; Redis caching reports disabled; deep and AI
  search run on 2-letter prefixes.
- Heather's own data was not read (permission guard).

## 2026-10-16 — FitnessGeek: the review, fixed (36 commits, local, not pushed)

- **Chef:** "Let's get it all fixed." Then: "the entry form bounces around a lot on the
  desktop."
- **Decisions:**
  - Household members read each other's foods.
  - Simple: a result card after a describe. Full: a "Just added" strip.
  - Offline is honest; the queue is deferred.
  - All local, one push.
- **How:** two shared helpers first (`useToday`, plain-words `errorMessage`), then five
  agents split by file ownership (suite auth, gateway, backend, food path, rest of the app).
  Then the composer redesign as one commit, then follow-ups. Every fix has a test that is red
  on the old file.
- **What she'll notice:**
  - The add sheet opens on "Tell me what you ate" with a big Log it and a mic. A sentence
    folds the list away, and "Try fewer words" is gone. Rows say "+ Add" and "cal", then
    "Make it 2".
  - Simple stays on "✓ Added to lunch" with Fix and Undo all.
  - The day is named when it isn't today, and day words ask first.
  - Home leads with "What did you eat?".
- **Suite-wide (`5c286484`):** an expired token refreshes and retries instead of signing out,
  and a 502 on `/api/me` keeps the user. basegeek's refresh answers 503, not 401, on a
  database blip (`14135314`).
- **Found while fixing:** the search prefix fallback overwrote the ownership filter, so a
  half-typed word could show another user's private foods (`49351e07`).
- **Desktop bounce (`f8e06eb5`):** the add dialog was centred and grew as results streamed
  in. It moved 24 px while typing and 95 px on the late batch, and a hovered row moved
  119 px. Now it's top-anchored with a fixed height, and harness scene 37 asserts 0 px.
- **Checks at HEAD:**

  | Suite | Result |
  |---|---|
  | Frontend | 752 |
  | Backend | 986 |
  | api (gateway) | 164 suites / 3,456 |
  | auth | 69 |
  | api-client | 24 |
  | themeContrast | 595 |
  | Harness, enforcing | 104 scenes, 0/0/0 |

- **Deploy notes for the push:**
  - Gateway and REST share `packages/schemas/fitnessgeek/dailySummary.js`, so ship both from
    this commit.
  - A frontend that lands before the gateway gets a 400 on a calorie edit for a few minutes.
  - No new env vars, so no `docker compose up -d` is needed.
  - CalorieNinjas: removed as a source (`57175fa4`). It became API Ninjas, whose free tier
    locks calories and protein. Chef: "Well fuck them then."
- **Left over:** `DOCS/SUITE_TODO.md` §4, "Follow-ups from the FitnessGeek review fixes".

## 2026-10-17 — FitnessGeek: second UX and visual review (`apps/fitnessgeek/DOCS/UX_REVIEW_2026-10-17.md`)

- **Chef:** "closely examine the UI/UX … from 'could someone use it without instruction' to the
  colors."
- Report only. Three parallel read-only reviews: learnability, visual, nav/copy/data. The full
  reports are in `ux-review-2026-10-17/`.
- **Verdict:** logging food now works without instruction. The risk has moved to quantity
  display, old screens never made Simple, and a few dishonest numbers (failed Home load, BP
  "Normal", weight pace).
- **Headline claims verified in code** before writing. The "two daily targets" suspicion was
  refuted against production: one stored target per person.
- **Six calls for Chef in §4,** including the SpO2 surfaces that already exist. Six phases in §5.

## 2026-10-17 → 18 (overnight) — FitnessGeek: the UX review, built (local, not pushed)

- **Chef:** "Just make it as perfect as you know how. My wife is both beautiful and
  non-technical. She needs to use it and enjoy it and not need lessons on it." Then: "go for it…
  you're going to be on your own."
- **Waves:**
  - **A (behaviour):** six parallel agents, nine commits.
  - **B:** the copy sweep, one commit.
  - **C:** the colour system (one commit) plus 112 harness scenes. Then a fix round for what the
    new scenes caught.
- **What Heather will notice:**
  - Tap a food twice and it's "Egg ×2", not two entries. "Same as Chef's dinner" is one tap.
  - A Done button and a ribbon from the first item.
  - Home never shows an empty day when it just couldn't load.
  - The Simple Food Log is name / amount / cal, and you tap a row to edit it.
  - Settings is one page, where she can change her name and goal.
  - "Set your daily target" is one question.
  - Adding a med is "What's it called?" / "When do you take it?".
  - BP is judged by the week, and the weight pace is told honestly.
  - Typed words survive closing the sheet.
  - Calm colours: produce colours mean meals only, and one green button per screen.
  - One plain voice throughout.
- **Bugs found along the way:**
  - The BP report had one person's name and date of birth hard-coded (`38ca0408`).
  - Toasts overlapped and were hidden from screen readers inside dialogs: fixed suite-wide in
    `packages/ui` (`3a39011d`).
- **Checks at HEAD:**
  - Frontend 977, backend 986, packages/ui 831 (incl. themeContrast).
  - Harness 610 scene-runs (phone and desktop), 0/0/0, enforcing, no waivers.
- **Deploy notes:**
  - It's frontend-heavy. The backend changed only the meal parser (`f416a3a7`). The gateway is
    unchanged since `463cbdad`.
  - `packages/ui` and `packages/auth` changes ship to every app on the push.
  - No new env vars.
