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
