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
