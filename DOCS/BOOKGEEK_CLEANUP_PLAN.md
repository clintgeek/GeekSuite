# BookGeek — cleanup plan

*Written 2026-09-25. Chef: "Let's clean up bookgeek, it's an important app." This replaces
the sequencing in `DOCS/BOOKGEEK_PREP_PLAN.md`, whose verified facts and deletion list
still stand.*

## What changed since the prep plan

The prep plan assumed BookGeek was the library to copy. GameGeek now does everything
BookGeek's library does, and more: faceted filters with storefront-style counts, URL
state, saved views, stable cached pagination, scroll memory, the `/` focus and a
contrast-audited UI. So the shared `@geeksuite/collection` pieces should be extracted
**from GameGeek**, with BookGeek adopting them. The two apps then share one
implementation instead of two copies.

The state as measured on 2026-09-25:
- 554 books.
- `api/src/server.js` is 2,902 lines.
- `web/src/App.jsx` is 2,730 lines and owns nearly all state (`useState` for books,
  filters, selection, baskets…). `react-router` is mounted but unused.
- Rows are patched in place, so there is no scroll-reset bug.
- The `Book` model is still hand-duplicated in the api and the gateway.

## Phase A — remove the rot (no behaviour change) — **in progress**

1. **Delete** the dead REST CRUD (`GET/POST /api/books`, `GET/PATCH/DELETE /api/books/:id`,
   `GET /api/shelves`), the `/kindle-test*` routes, and the dead models `IngestionJob` and
   `Recommendation`. Re-verify zero callers first.
2. **One `Book` definition:** `@geeksuite/schemas/bookgeek/{book,profile}`, the
   fitnessgeek/gamegeek pattern. Both the api and the gateway build their models from it,
   which ends the hand-synced drift tripwire. A parity test pins it.
3. **Docs:** fix `apps/bookgeek/DOCS/CONTEXT.md`'s stack paragraph (it says
   Bun/Tailwind/shadcn; the app is Node/Express + Vite/React 18/MUI 5) and the stale "four
   dead sorts" line (fixed in `f7ccbfec`).

The Kindle flows (`/kindle*`, `/download-basket*`, send-to-Kindle, device baskets), the
Calibre import, ebook conversion, covers and the reader all stay working and are
re-verified.

**Progress (2026-09-25), done, awaiting commit.** Details are in
`apps/bookgeek/DOCS/CONTEXT.md` → "Phase A cleanup (2026-09-25)".
- Step 1 **done**: the dead CRUD, `/api/shelves` and `/kindle-test*` are gone
  (`server.js` 2,902 → 2,447 lines), and `IngestionJob`/`Recommendation` are
  gone from both the api and the gateway. **Exception:** `DELETE /api/books/:id`
  is kept. It is the only code that deletes a book's files from disk, and the
  gateway's `deleteBook` ignores the UI's "Also delete files". That is a live
  bug, and this route is its fix. Chef's call.
- Step 2 **done**: `packages/schemas/bookgeek/{book,profile}.js`. The two
  copies were identical. Both writers build from the factories, parity tests
  are on both sides (red/green verified), and production was checked read-only
  (554 books, 0 dropped paths, indexes match). The api imports the factory
  by relative path until it declares `@geeksuite/schemas`, which needs a
  lockfile update.
- Step 3 **done**: CONTEXT.md stack paragraph, the sorts line, and the stale
  "still live" and "Chef's call" notes.

## Phase B — structure — **approved by Chef 2026-09-25** ("B and C need to be done, for sure"); starts after Phase A lands

- **`App.jsx` → routes and per-view state.** Real routes (`/`, `/book/:id`, `/settings`,
  deep-linkable like GameGeek), state moved into hooks per view, and the book list moved
  into the Apollo cache with a field policy instead of hand-managed `setBooks`.
- **`server.js` → an `app.js` plus route modules** (kindle, baskets, covers, files,
  imports). That makes the app importable without listening, so boot-smoke finally covers
  it instead of three routers.
- Behaviour-preserving, one module per commit, with BookGeek's 224 web tests, api tests
  and harness scenes green at every step.

## Phase C — parity with GameGeek — **approved 2026-09-25**; C1 (extract from GameGeek into `packages/collection`, with GameGeek moved onto it) is running in parallel with Phase A; C2 (BookGeek adopts it) comes after Phase B

- **Extract `@geeksuite/collection` from GameGeek:** the facet panel and sheet, active
  chips, sort menu, saved views, the URL filter codec, the paginated-list cache policy,
  scroll memory, and the server-side `buildSearchFilter` / facet `$facet` helpers.
  GameGeek switches to the package in the same commit, so there's no second copy.
- **BookGeek adopts them.** A `bookFacets` gateway query (shelf, author, series, tags,
  format, owned, has-file, read year, rating), the BookGeek filter panel, and saved views
  migrated from its existing `savedFilters`.
- Genre and tag normalization for books if Calibre's tags need it (they're user-curated,
  so likely **no** vocabulary mapping).

## Later, not in this plan

- Suite households (`DOCS/SUITE_HOUSEHOLDS_PLAN.md`): BookGeek is the app with the real
  `householdId` migration.
- A taste model for books, like GameGeek's `TASTE_MODEL.md`, if Chef wants a book
  recommender.
