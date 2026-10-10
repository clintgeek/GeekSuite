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
