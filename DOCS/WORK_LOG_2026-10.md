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
