# BookGeek Prep — Plan

Status: **proposal, plan, not started.** Written 2026-09-24. Extracted and re-verified from
`DOCS/GameGeekPlan.md` §1.1 (deletion pass, dead-code audit) and §8.2 (the `@geeksuite/collection`
extraction), so this can be executed on its own without reading the whole GameGeek plan. Every
line reference below was re-checked against the current tree today, not copied from the
source doc unverified.

## 1. Updated sequencing — read this before anything else

`GameGeekPlan.md` originally assumed GameGeek would be built *from* the extracted
`@geeksuite/collection` pieces before GameGeek existed. **That sequencing changed tonight**:
GameGeek is being built now with its own copies of the library components, modelled on
BookGeek's, so it ships fast without waiting on this extraction. That means this plan's job
changes from "extract, then GameGeek consumes it" to:

> **Consolidate BOTH apps onto `@geeksuite/collection` in one pass, later** — BookGeek and
> GameGeek both migrate onto the shared package together, in the same extraction commits,
> instead of GameGeek being the extraction's original trigger.

Practically: steps 1-2 below (the deletion pass, doc fixes) are independent of GameGeek and
worth doing on their own schedule. Steps 3-4 (the actual extraction) should wait until
GameGeek's own library components exist and can be diffed against BookGeek's, so the
generalization in §4 below is informed by two real call sites instead of one imagined one.

## 2. Why prep at all — the verified state

**Short answer, unchanged from the source plan: a little, and only the parts that would leak
into the eventual extraction.** Everything else is either already fixed, or real debt that
doesn't block anything.

| Item | Verified state (2026-09-24) | Blocks the extraction? | Verdict |
|---|---|---|---|
| Four dead library sorts (`pageCount`, `publishedDate`, `datefinished`/`dateFinished`, `owned`) | **Already fixed**, commit `f7ccbfec` ("fix(gateway): frontend/gateway argument parity ... four bookgeek sorts were dead"), covered by `apps/basegeek/packages/api/src/__tests__/bookgeekLibrarySorts.test.js`. `apps/bookgeek/DOCS/CONTEXT.md:525-527` still reads "Four of the eight library sorts do nothing" | No | **Stale doc line only** — fix §3 |
| Dead REST CRUD: `GET /api/books` (`server.js:770`), `POST /api/books` (`:906`), `GET /api/books/:id` (`:1214`), `PATCH /api/books/:id` (`:1232`), `DELETE /api/books/:id` (`:1307`), `GET /api/shelves` (`:1555`) | Still mounted in `apps/bookgeek/api/src/server.js` (2,902 lines total). All plain-data CRUD now goes through basegeek's gateway (`graphql/bookgeek/`); nothing in `apps/bookgeek/web/src` calls any of these six routes | No | **Delete.** ~500 fewer lines, one less "which backend owns this" question |
| `/kindle-test*` routes | `GET /kindle-test` (`:2773`), `/kindle-test/download` (`:2823`), `/kindle-test/epub` (`:2826`) — marked throwaway in the source code's own comments | No | **Delete with the above** |
| Dead models `IngestionJob`, `Recommendation` | `apps/bookgeek/api/src/models/ingestionJob.js` and `recommendation.js` exist; grepped, unreferenced outside `src/models/` itself | No | **Delete** |
| `apps/bookgeek/DOCS/CONTEXT.md` tech-stack paragraph | Reads "**Backend:** Bun + Express" / "**Frontend:** React + Tailwind + shadcn/ui (Bun bundler)" (`CONTEXT.md:47-48`) — wrong; the app is Node/Express + Vite/React 18/MUI 5, same stack as every other app in the suite | No, but every future doc reader trusts this file first | **Fix** — §3 |
| Hand-duplicated `Book` model (bookgeek API + basegeek gateway both define their own Mongoose schema against the same collection) | Still duplicated, kept identical by hand | No — GameGeek uses `@geeksuite/schemas` from day one, so this doesn't block a new app; it's still real drift risk for BookGeek itself | **Later, separate cut.** Moving BookGeek onto `@geeksuite/schemas/bookgeek` (mirroring `packages/schemas/gamegeek/*`) is worth doing but is not this plan's job |
| `App.jsx` at 2,730 lines, a God component | Still one file, confirmed by line count | **No** — the pieces this plan extracts (`ShelfStrip`, `LibraryToolbar`, `FilterSheet`, `StarRating`, `BookCard`/`BookRow`) already live in separate files under `web/src/components/` (`ShelfStrip.jsx`, `LibraryToolbar.jsx`, `FilterSheet.jsx`, `StarRating.jsx`, `BookCard.jsx`, `BookRow.jsx`, `TopBar.jsx`, `Sidebar.jsx`, `WhatNextShelf.jsx`, `navConfig.jsx`, `librarySort.js`) | **Don't refactor it now** — big, risky, zero benefit to the extraction |
| Library components carry book-specific knowledge (props, labels, shelf ids) | Confirmed — they're written for `Book`, not a generic item | **Yes — this is the actual prep** | Extract + migrate, §4 |

## 3. Deletion pass, executed — step-by-step, one commit per step

Each step is independently verifiable in the running app; don't batch them into one commit.

1. **Delete dead REST CRUD + `/kindle-test*`.** Remove the six routes and three routes listed
   above from `apps/bookgeek/api/src/server.js`, plus any test file that only exercises them.
   Verify: `apps/bookgeek/web` still builds and works end-to-end on a phone (add, edit, delete,
   shelf a book — all now confirmed gateway-only paths), and the API's own test suite still
   passes.
2. **Delete dead models.** Remove `apps/bookgeek/api/src/models/ingestionJob.js` and
   `recommendation.js`. Verify: nothing else imports them (already grepped clean; re-grep after
   the REST deletion in case removing those routes orphans an import this pass missed).
3. **Fix `CONTEXT.md`.** Correct the stack paragraph (`:47-48`) to Node/Express + Vite/React
   18/MUI 5, and correct the sort-status line (`:525-527`) to say the four sorts were fixed in
   `f7ccbfec` and are covered by `bookgeekLibrarySorts.test.js`. This step is purely
   documentation — no behavior change, no verification beyond re-reading the corrected lines.

Steps 1-3 have **no GameGeek dependency** and can ship on their own whenever there's a spare
hour, independent of the rest of this plan.

## 4. The extraction — new `@geeksuite/collection`

**Rule, unchanged from the source plan and still the point of doing this at all:** each piece
is extracted **and BookGeek switches to it in the same commit**, verified against BookGeek's
existing tests and harness scenes. Extracting into a shared package and leaving BookGeek on
its own copy "for now" is the same drift disease as the hand-duplicated `Book` model above —
two copies that quietly diverge. BookGeek's own test suite is the extraction's safety net;
GameGeek (already shipped with its own copies per §1) becomes the second consumer once its
components exist to diff against.

| Piece | From BookGeek (verified path) | Generalization for the shared package |
|---|---|---|
| `coverFetch` (server) | `apps/bookgeek/api/src/coverFetch.js` | Caller-supplied host allow-list; SSRF hardening (per-hop redirect validation) unchanged |
| Search-term escaping (server) | `searchRegex()`, `apps/basegeek/packages/api/src/graphql/bookgeek/resolvers.js:173-177` — escapes every regex metacharacter and bounds input at `SEARCH_TERM_MAX = 200` chars before it reaches `$regex` | Generalize to `(value, maxLength)`; GameGeek's own search needs the identical ReDoS guard from day one per `GameGeekPlan.md` §4.1 |
| Shelf helpers (server) | Shelf-count aggregation at `resolvers.js:304-317` (`shelfCounts` array built from a `Promise.all` of per-shelf counts) and `removeBookShelf` (`resolvers.js:552`, `typeDefs.js:223`) | `shelfCounts(model, builtIns, match)` / `clearShelf(...)`, parameterized on the model and the built-in shelf list rather than hardcoded to `Book` |
| Profile subdocs | BookGeek's `Profile` model: `customShelves`, `savedFilters` | Exported schema fragments GameGeek's own `Profile` (per `packages/schemas/gamegeek/profile.js`) can reuse rather than redefine |
| `ShelfStrip` | `apps/bookgeek/web/src/components/ShelfStrip.jsx` | Items + counts as props, no `Book`-specific labels |
| `LibraryToolbar` + grid/list toggle | `apps/bookgeek/web/src/components/LibraryToolbar.jsx` | Sort options passed in — BookGeek's own `librarySort.js` pattern (and its test, `web/src/__tests__/components/librarySort.test.js`) stays app-side, only the toolbar shell moves |
| `FilterSheet` shell | `apps/bookgeek/web/src/components/FilterSheet.jsx` | Filter fields passed as children |
| `StarRating` + optimistic rating | `apps/bookgeek/web/src/components/StarRating.jsx`, `apps/bookgeek/web/src/utils/rateBook.js` (both have existing tests: `__tests__/components/StarRating.test.jsx`, `__tests__/utils/rateBook.test.js`) | The mutation itself passed in as a prop/callback; the optimistic-update-plus-Undo shape stays |
| `useInfiniteSentinel` | Currently inline in BookGeek's `LibraryView` | `(onMore, { guardRef })` |
| Selection bar (bulk actions) | Currently inline in `LibraryView` | Actions array passed in |
| Cover tools | BookGeek's detail-view cover components | Endpoints passed in |
| CSV export walker | BookGeek's `utils/exportBooksCsv.js` | Column spec passed in |
| Cover card "plate" | The visual frame inside `BookCard.jsx` | An `aspect` prop (BookGeek's covers and GameGeek's box art aren't the same ratio) |

**Not extracted, on purpose:** `BookCard`/`BookRow` themselves stay app-specific (only the
plate around them is shared — the card body's fields are domain-specific), anything
Kindle/basket/reader-related, and the AI rail pattern (`WhatNextShelf.jsx` — small enough to
write per app rather than generalize).

## 5. Verification per step

For every extraction commit, in order:

1. `apps/bookgeek/api` and `apps/bookgeek/web` test suites both green.
2. The relevant mobile-harness scenes for BookGeek (currently 9 scenes) still pass with zero
   new findings, in both themes.
3. Manual check on a phone for the specific interaction the extracted piece drives (shelving a
   book after `ShelfStrip` moves, rating after `StarRating` moves, filtering after
   `FilterSheet` moves) — CI green is necessary, not sufficient, per the suite's standing "not
   shipped until verified in the real app" rule.
4. Once GameGeek's own equivalent component exists, confirm it can consume the same shared
   piece with no BookGeek-specific assumption leaking through the new props/callbacks
   interface — this is the actual test of whether the generalization in §4 was done right.

## 6. Open questions

1. **Timing**: does the deletion pass (§3) happen now, independent of GameGeek's own timeline,
   or wait until the extraction starts? Recommended: now — it's small, safe, and doesn't
   depend on anything else in this plan.
2. **Extraction timing**: start once GameGeek's own library components exist (per §1's
   updated sequencing), or attempt it speculatively now based on BookGeek alone? Recommended:
   wait — a generalization designed from one call site tends to guess wrong about what's
   actually app-specific.
3. **The hand-duplicated `Book` model**: worth a separate, later cut onto
   `@geeksuite/schemas/bookgeek`, modelled on `packages/schemas/gamegeek/*`? Not blocking
   anything here, but flagged so it doesn't get lost. Not part of this plan's scope.
