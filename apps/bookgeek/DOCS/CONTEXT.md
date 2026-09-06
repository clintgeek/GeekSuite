# BookGeek - Project Context

## System Overview

BookGeek is the **authoritative library manager** — replacing both CalibreWeb and Goodreads.

- **BookGeek owns** the database, metadata, files, reading history, and recommendations
- **Calibre CLI** is a headless processor (format conversion, metadata extraction)
- **Gemini (via aiGeek)** provides AI-powered recommendations

---

## Data Sources (One-Time Import)

| Source | Location | Records | Purpose |
|--------|----------|---------|---------|
| Calibre Library | `/Volumes/Media/Docker/calibreWeb/books/` | 510 books | Import existing ebooks + metadata |
| Goodreads Export | `./goodreads_library_export.csv` | 223 books | Import reading history, ratings, reviews |

After import, BookGeek is the sole source of truth.

### Calibre Schema (for import reference)
- `books` - id, title, timestamp, pubdate, series_index
- `authors` + `books_authors_link`
- `series` + `books_series_link`
- `tags` + `books_tags_link`
- `identifiers` - type (isbn, goodreads, asin, google), val, book
- `publishers` + `books_publishers_link`
- `comments` - book, text (description)
- `data` - book, format, name, uncompressed_size

### Goodreads CSV Columns
```
Book Id, Title, Author, Author l-f, Additional Authors,
ISBN, ISBN13, My Rating, Average Rating, Publisher, Binding,
Number of Pages, Year Published, Original Publication Year,
Date Read, Date Added, Bookshelves, Bookshelves with positions,
Exclusive Shelf, My Review, Spoiler, Private Notes, Read Count, Owned Copies
```

---

## Tech Stack

- **Runtime:** node:20-alpine (build stage) / node:20-slim (production stage) — see Dockerfile
- **Language:** JavaScript (not TypeScript)
- **Backend:** Bun + Express
- **Frontend:** React + Tailwind + shadcn/ui (Bun bundler)
- **Database:** MongoDB via baseGeek
- **Caching:** Redis via baseGeek
- **Auth:** User management via baseGeek
- **AI:** Gemini via aiGeek
- **Ebook Processing:** Calibre CLI (ebook-meta, ebook-convert, fetch-ebook-metadata)
- **External APIs:** OpenLibrary (free), Google Books (optional)
- **Deployment:** Docker (API: 1800, Frontend: 1801)
- **UI:** Dark mode default, Inter/Geist fonts

---

## Storage Paths

| Path | Purpose |
|------|---------|
| `/data/library/` | Book files (organized by author/title) |
| `/data/covers/` | Cover images |
| `/data/temp/` | Temporary upload storage |

---

## Commands

```bash
# Project root
cd /Users/ccrocker/projects/bookgeek

# Start services
docker compose up --build

# Calibre CLI (inside container)
ebook-meta /path/to/book.epub
fetch-ebook-metadata -t "Book Title" -a "Author Name"
ebook-convert input.mobi output.epub
```

---

## Key Architectural Decisions

1. **BookGeek owns everything** — database, files, metadata, reading history
2. **Calibre is CLI-only** — never touches the database, just processes files
3. **One-time import** — Calibre library and Goodreads are imported once, then retired
4. **Gemini for recommendations** — on-demand, seed-based, via aiGeek
5. **ISBN is primary key** — best identifier for matching and deduplication

---

## Shelves (2026-09-03)

A book has one `shelf` string. Built-in ids: `reading`, `on-reader`, `unread`,
`read`, `want-to-read`, `abandoned`, `need-to-find` (`unread` also matches a
missing/empty shelf that is not finished). `on-reader` means "loaded on the
e-reader"; its sidebar icon is a tablet.

**Custom shelves** are per-user definitions stored on the bookgeek `Profile`
as `customShelves: [{ id, label }]`, `id = "custom-<slug of label>"`. Since
2026-09-05 they are **GraphQL on basegeek's gateway**, not bookgeek REST:
`addBookShelf(label)` and `removeBookShelf(id)` (the `POST/DELETE
/api/profile/shelves` routes are deleted). Removing a shelf `$unset`s `shelf`
on every book sitting on it and returns `clearedBooks`. Books are shared across
users, so a custom shelf id on a book is visible to everyone; only the
*definition* is per user. Limits: 20 shelves, 40-char labels.

**Where the list lives.** The live GraphQL for bookgeek is basegeek's
`graphql/bookgeek/` module. (The unmounted dead copy that used to live under
`api/src/graphql/` was deleted 2026-09-05 — see `DOCS/SUITE_TODO.md`.)
Its `shelves` query counts the built-ins and then aggregates every other
non-empty `shelf` value, so custom shelves get badge counts without basegeek
knowing about profiles. The web app composes `BUILT_IN_SHELVES` plus
`profile.customShelves` into one `shelves` list (App.jsx) that every picker,
pill, and filter reads; custom shelves fall back to the closed-book icon in
`Sidebar.jsx`.

---

## Which calls go where (2026-09-05, consolidation step 3)

Two backends, one rule: **pure data is GraphQL on basegeek's gateway; bookgeek's
own REST API is for bytes and long jobs.** Before this pass the split was
accidental — library CRUD went through Apollo while profiles and AI status went
through `authFetch` — and `SUITE_TODO.md`'s "Apollo → basegeek" audit called it
out. Step 3 finished the split.

### basegeek gateway (`/graphql`, Apollo, `@geeksuite/api-client`)

Schema and resolvers live in `apps/basegeek/packages/api/src/graphql/bookgeek/`;
the web app's documents are in `apps/bookgeek/web/src/graphql/{queries,mutations}.js`
and App.jsx drives them imperatively with `apolloClient.query`/`.mutate`
(`fetchPolicy: "no-cache"` on the reads, matching the REST semantics they replaced).

| Operation | Replaces |
|---|---|
| `books`, `book`, `shelves` | (already GraphQL) |
| `createBook`, `updateBook`, `deleteBook` | (already GraphQL) |
| `bookProfile` | `GET /api/profile/me` |
| `saveBookProfile(input)` | `PUT /api/profile/me` |
| `libraryFilters` | `GET /api/profile/library-filters` |
| `saveLibraryFilter(input)` | `POST /api/profile/library-filters` |
| `deleteLibraryFilter(id)` | `DELETE /api/profile/library-filters/:id` |
| `addBookShelf(label)` | `POST /api/profile/shelves` |
| `removeBookShelf(id)` | `DELETE /api/profile/shelves/:id` |
| `bookAiStatus` | `GET /api/ai/status` |

**Ownership.** `books`/`shelves` stay deliberately *shared* — bookgeek is a
household library and `Book` has no owner field, so the boundary is
"authenticated household member". The Profile resolvers are the opposite: every
read and write is scoped to `userId`. Both use the same `requireUser()` guard.
Covered by `__tests__/bookgeekOwnership.test.js` (shared) and
`__tests__/bookgeekProfile.test.js` (per-user).

**Schema-drift tripwire.** `Profile` is now modelled on both sides against the
same `profiles` collection — `apps/bookgeek/api/src/models/profile.js` and
`apps/basegeek/packages/api/src/graphql/bookgeek/models/profile.js`. Mongoose
strict mode silently *drops* unknown fields on write rather than erroring (this
is how fitnessgeek lost keto config in April 2026), so the two must stay
field-for-field identical. Add a field to both in the same commit;
`bookgeekProfile.test.js` asserts the gateway copy still has every path.

**`bookAiStatus` is not a literal port.** The old REST route reported on
bookgeek's own `AIGEEK_API_KEY` env var — the key it used to call basegeek. At
the gateway the same question is "does basegeek have a usable AI provider", so
the resolver counts `AIConfig` rows and returns the same
`{ enabled, apiKeyConfigured, baseGeekUrl, model }` shape plus `providers`.
No key is read, decrypted, or returned. **`AIGEEK_API_KEY` is therefore dead in
bookgeek** — nothing reads it any more.

### bookgeek's own API (`/api/*`, `authFetch` in App.jsx)

Everything that moves bytes or runs long: `GET /api/health`, book file
upload/download/convert, covers (`GET|POST|DELETE /api/books/:id/cover`,
`/cover/upload`, `/search-covers`), `POST /api/books/:id/enrich`,
`POST /api/books/merge`, `/api/import/*` (Goodreads, dedupe, Calibre rescan),
`/api/device-baskets`, `POST /api/books/:id/send-to-kindle`, and the
server-rendered `/kindle*` and `/download-basket` pages. `authFetch` sends
`credentials: "include"` and 401s log the user out.

The `Profile` **model** stays in the bookgeek API even though its routes are
gone: `send-to-kindle` reads `kindleEmail` and `deviceBasket.js` resolves
`deviceWord`, both server-side.

### The API origin

`apps/bookgeek/web/src/utils/bookDisplay.js`:

```js
export const API_BASE = import.meta.env?.VITE_API_URL || "/api";
```

That is the suite convention (notegeek, storygeek). `vite.config.js` defines
`VITE_API_URL` as `/api` in production and `http://localhost:1800/api` in dev,
and its dev server proxies `/api` → 1800 and `/graphql` → 3002. In production
the bookgeek container serves the built SPA *and* the API from one origin
(`bookgeek.clintgeek.com`, port 1800), so the relative `/api` resolves
correctly behind nginx. **No host is hardcoded anywhere** — the old
`http://localhost:1800/api` literal (which lived in `App.jsx` until this week's
rewrite moved it into `bookDisplay.js`) is gone, and `bookDisplay.test.js`
asserts `API_BASE` never starts with a scheme.

Note the gateway origin is separate and unrelated: `bootstrapUser.js` uses
`VITE_BASEGEEK_URL` (`https://basegeek.clintgeek.com`), and Apollo goes through
`GeekSuiteApolloProvider` from `@geeksuite/api-client`.

---

## Backend — zod input validation (2026-09-05)

TODO_ORDER #22 (input validation), bookgeek slice. Every mutating route in the
binary/long-job REST that stayed after `01d35d4` (see "Which calls go where"
above) now runs a zod schema first: `src/validation/validate.js` (mirrors
`apps/fitnessgeek/backend/src/validation/validate.js` and
`apps/storygeek/backend/src/validation/validate.js` exactly — same 400
envelope, `{ success: false, error: { message, code: 'VALIDATION_ERROR',
details: [{ path, message }] } }`) plus one schema file per route family under
`src/validation/schemas/`. Book ids in params are checked as non-empty bounded
strings (`common.js`'s `idParam`/`bookIdParamsSchema`), **not** Mongo
ObjectIds — same call as storygeek's and bujogeek's zod passes, so a malformed
id still falls through to the route's own existing "not found" or
Mongoose-CastError handling instead of validation reinterpreting it.

**Route families and what they enforce:**
- `books.js` — thin re-export of `bookIdParamsSchema` for every plain
  `/api/books/:id/*` route that reads nothing else: `POST .../cover/upload`,
  `DELETE .../cover`, `POST .../upload`, `GET .../cover`.
- `covers.js` — `GET /api/books/:id/search-covers` (`q` query, bounded, not
  `.strict()` — see below) and `POST /api/books/:id/cover` (the JSON
  "pick a cover found by search" route: `provider` enum, `coverId` as
  string-or-number, `coverUrl` bounded). The *other* two cover/file routes are
  raw multipart uploads with no other body fields — nothing to validate there
  beyond the id param and multer's own handling (file count 1 via
  `.single()`, size per the existing `uploadToTemp`/`upload` configs — both
  already sane, nothing added).
- `enrichMerge.js` — `POST /api/books/:id/enrich` reads only the id param
  (no body at all); `POST /api/books/merge` takes exactly two ids
  (`primaryId`/`secondaryId`), not an array — the general "id arrays <= 200"
  TODO_ORDER guidance for this family doesn't map onto the route as actually
  written, so bounded single ids is what's enforced. The handler's own
  "must be different ids" / "must be exactly one Goodreads-import book"
  business-logic checks are untouched.
- `kindle.js` — `GET /api/books/:id/download/:format` (format enum
  `epub`/`azw3`/`mobi`, mirroring the handler's own hand-check exactly) and
  `POST /api/books/:id/send-to-kindle` (id param only — the "recipient" is
  `Profile.kindleEmail`, resolved server-side and never taken from the
  request, and the route only ever looks for an EPUB, so there's no
  request-supplied format here either).
- `importJobs.js` — `POST /api/import/calibre/rescan`'s `limit` query param
  (positive integer, bounded; params only, no body, per the route as
  written). `POST /api/import/goodreads` (multipart CSV) and
  `POST /api/import/goodreads/dedupe` read no other fields today — no
  "Goodreads options" or "dedupe flags" exist in the code to validate without
  inventing one; both keep their existing hand-checks (no file / empty file /
  CSV-parse failure) unchanged.
- `deviceBaskets.js` — `POST /api/device-baskets`, shape only per the task:
  `device` as a bounded string, `bookIds` as an array of bounded strings
  (1–50, mirroring the handler's own `MAX_BOOKS_PER_BASKET`). The handler's
  own per-item `mongoose.isValidObjectId()` check and its Book-existence
  lookup (which reports exactly which ids are missing) stay exactly as they
  were. Device *word* normalisation (`normalizeDeviceWord`/`isValidDeviceWord`
  in `deviceBasket.js`) belongs to the public, unauthenticated
  `POST /download-basket` word lookup — a different route that deliberately
  never 400s on bad input (always the same neutral "no active basket" page,
  so a scanner can't distinguish a bad word from a wrong one) — left
  untouched.

**Query schemas are deliberately not `.strict()`** (`searchCoversQuerySchema`,
`calibreRescanQuerySchema`): an unrecognized query key is silently dropped
rather than rejected, unlike every body/params schema. Body and route params
come from a known, closed set (the client's own JSON, or Express's own route
pattern); a query string is more likely to carry an incidental extra key
(a cache-buster, a tracking param) that would otherwise 400 a caller with no
malicious or malformed intent.

**Behavior a real client could notice:** a handful of routes had hand-rolled
400s that zod now catches first, so the response *body* shape changes (same
400 status) — `GET .../download/:format` on an unsupported format, `POST
.../cover` on an unsupported provider, `POST /api/device-baskets` on a
missing/oversized `bookIds`. `POST /api/import/calibre/rescan?limit=` with a
non-positive or non-numeric value now 400s instead of silently falling back
to the default of 1000 rows. Nothing else — 200-path behavior is unchanged.

zod pinned at `3.25.76` (same version fitnessgeek, basegeek, and storygeek
pin). Installed via the pnpm workspace (`pnpm install` at the repo root;
bookgeek's api has no own lockfile). 45 new node:test tests (78 → 123);
per-schema unit tests in `test/validationSchemas.test.js`, one route-level
suite proving the 400 envelope through a real app in
`test/validationRoute.test.js`. Full route inventory and the reasoning behind
each bound: see the TODO #22 report.

**Left alone, deliberately:** the plain book-CRUD REST handlers
(`GET/POST /api/books`, `GET/PATCH/DELETE /api/books/:id`, `GET
/api/shelves`) still physically exist in `server.js` even though "Which calls
go where" above documents them as replaced by basegeek's gateway
(`createBook`/`updateBook`/`deleteBook`/`books`/`book`/`shelves`) — the web
app calls the gateway, not these. They're out of this pass's scope (the task
enumerated exactly the binary/long-job routes above) and weren't touched;
whether they're genuinely dead and safe to delete, versus still relied on by
something outside the web app, is worth a look but is a separate cleanup, not
a validation gap. Likewise `POST /api/import/calibre` (the *original*,
unauthenticated one-time Calibre import, distinct from `/calibre/rescan`)
wasn't touched — it's not in the "Which calls go where" list of surviving
routes either, and looks like one-time-use legacy left from before the
Calibre import ran.

---

## a11y pass (2026-09-05, TODO_ORDER Q51)

The mobile harness' axe run had bookgeek at **4 findings — 0 now**, and
**both fixes were in `packages/ui`, not in this app**: the drawer's shelf list
and the avatar menu are `GeekSidebar` and `GeekTopBar`. `GeekSidebar` now
wraps every row's `ListItemButton` in a `<ListItem disablePadding>` (a bare
`ListItemButton` renders `div[role=button]` — or an `<a>` for a router link —
straight into the `<ul>`, which is an axe `list` violation), and
`GeekTopBar`'s account identity block moved into the menu list's `subheader`
slot, because MUI's `MenuList` clones `tabIndex: 0` onto the first non-disabled
child and a focusable `div` inside `role="menu"` is `aria-required-children`
(critical). Nothing in `apps/bookgeek/web/src` changed. If a future finding
points at the drawer or the avatar menu, look upstream first.

---

## Feedback primitives (2026-09-05, TODO_ORDER #15 fan-out)

`GeekToastProvider` is mounted in `App.jsx`, inside `GeekShell` and outside
`GeekAppFrame` — the suite's standard placement (see
`THE_UI_UNIFICATION_PLAN.md` §3a). Because `App.jsx` is one large component
that renders its own shell, the provider had to wrap `GeekAppFrame` from
*inside* App's own return rather than from an ancestor; this means `App.jsx`
itself cannot call `useToast()` (it isn't a descendant of the provider it
renders). The pattern used instead: `App.jsx`'s ~30 handler functions are
untouched, still setting the same `useState` pairs they always did, and the
descendant view components (`SettingsView`, `LibraryView`, `BookDetailModal`,
`MoreSheet`) call `useToast()` themselves and fire `notify()` from a
`useEffect` keyed on the prop transitioning to a non-null value. This works
because every one of these handlers resets its error/message state to `null`
before starting a new attempt, so a fresh value is always a real transition.
Keep following this shape for any new async action's terminal notice — do
not thread `notify` down through `App.jsx`'s props.

`LibraryView` and `SettingsView` already carried `GeekEmptyState`/
`GeekErrorState` from the Pocket Pass rewrite (this week, before the fan-out)
for the library grid's empty/error states and the signed-out empty state —
that part needed no conversion. Converted to toast: `SettingsView`'s
Send-to-device save, default-shelf save, custom-shelf add/remove, and the
three Goodreads-import / Goodreads-dedupe / Calibre-rescan jobs' terminal
summaries and errors (each `SpinnerButton`'s loading state stays inline —
only the terminal notice is a toast, and the multi-metric summaries get an
8s duration instead of the 4s default so they stay readable);
`BookDetailModal`'s metadata-enrich terminal notice and its More sheet's
book-file-attach outcome; `LibraryView`'s selection-bar basket/merge
validation captions. `SettingsView`'s AI-status check converts its error to
a compact `GeekErrorState` with `onRetry={handleCheckAiStatus}` in place of
the persistent status line, rather than a toast — same shape as flockgeek's
health-check precedent, because the success case is a standing readout, not
a transient one.

Left alone, deliberately: every error inside an open dialog the user must
resolve right there to proceed (`AddBookDialog`, `EditMetadataDialog`, the
delete-confirm `GeekDialog`, `CoverTools`' cover search, `ProgressRow`'s
reading-progress slider) — moving those to a toast would answer off-surface
while the dialog stays open; `BookDetailModal`'s sticky-bar `statusLines`
ticker for `sendToKindleError`/`sendToKindleStatus` and the "No EPUB yet"
reminder (a reasonable next toast candidate, left with its ticker sibling
rather than fragmenting the array for one entry); `ReaderModal`'s
`readerError` (a persistent inline status in the reader's own bespoke
non-theme-token page/ink chrome, not a transient notice); `Sidebar` and
`FilterSheet`'s duplicated `savedFiltersError` (a background saved-filters
list-load failure already rendered in both places); `SettingsView`'s
`authError` `Alert` inside its `!user` branch, which is dead code in the
real app — `App.jsx` gates on `!user` earlier via the shared `LoginSplash`,
which owns this error through its own `error` prop.

No local `EmptyState`/`ErrorState`/toast component existed to delete. No
`isDark ? lighten(…) : darken(…)` hand-rolled tone helper exists anywhere in
`apps/bookgeek/web/src` — `theme/theme.js`'s own `isDark ? darkColors :
lightColors` is base-palette construction, a different thing from the
domain-color pattern `toneForMode` replaces — and no local `MuiTooltip`
override either, so TODO_ORDER #19 has nothing to convert here.

## Service worker — SW reinstalls on deploy (2026-09-05, Q54)

`web/public/sw.js` had the same landmine as flockgeek (115fb03): a constant
`CACHE_NAME` and a static three-URL precache, so a new deploy never
reinstalled the SW and the `"/"` cached on a user's first visit was served
forever. Fixed the same way: `BUILD_ID`/`PRECACHE_ASSETS` placeholders in
`public/sw.js`, stamped into `dist/sw.js` by `swPrecache()` in
`vite.config.js` from the built `assets/*.js`/`*.css` list; `CACHE_NAME` is
now `bookgeek-cache-${BUILD_ID}`. Dev (`vite dev`) still serves the source
file untouched — no build step there. See DOCS/PWA_STANDARD.md §1a.

---

## Going-over 2026-09-05 — the full read of `api/` and `web/`

A senior-inheritance read of every route, view, component and test in both
halves. Counts: api `npm test` 132 → 171 (169 pass, 2 skipped — see the
better-sqlite3 note below); web `npx vitest run` 104 → 122; web `npx eslint
src` 18 warnings → 18; `npm run build` green; mobile harness
(`--app bookgeek --enforce-a11y --viewports phone`) 12 scenes, 0/0/0.

### Fixed — API

- **P0 `POST /api/import/calibre` was unauthenticated** and its first act is
  `Book.deleteMany({ source: "calibre-import" })`. Anyone who could reach the
  host could wipe every Calibre-imported book with one curl. Now behind
  `authenticateToken`. (This is the route the "Left alone, deliberately"
  section above described as one-time legacy — it was still mounted and still
  destructive, so it is now gated rather than deleted. Whether to delete it is
  Chef's call.)
- **P0 `db.query(...)` is Bun:sqlite's API, not better-sqlite3's** — twelve
  call sites in `routes/importRoutes.js`, all inside the per-book loop, so
  `POST /api/import/calibre/rescan` threw `TypeError: db.query is not a
  function` on the first row of any real library. The Calibre rescan button in
  Settings had never worked on Node. All twelve are `db.prepare` now.
- **P0 the rescan's success payload referenced an undeclared `failed`**
  (`ReferenceError` under ESM strict mode → a 500 on every otherwise-successful
  run) and omitted `rows` and `skippedNoFiles`, the two counters
  `SettingsView.jsx:162` renders. It now returns exactly
  `{ rows, attachedExisting, createdNew, skippedNoFiles }`.
- **P1 path traversal on the cover write.** `POST /api/books/:id/cover`'s
  `coverId` reached `downloadOpenLibraryCover()` and went straight into the
  output filename, so `coverId: "../../../../tmp/x"` walked the write out of
  `LIBRARY_PATH` once `path.join` normalised it — and `Book.coverPath` then
  pointed outside the root for `GET .../cover` to serve back. New
  `src/libraryPaths.js` (`resolveInLibrary` / `safePathSegment`) is now the
  only way this app turns a stored or supplied relative path into an absolute
  one; every file route in `server.js` goes through it, and `coverId` must be
  digits.
- **P1 SSRF + unbounded download on the same route.** The `googlebooks`
  branch fetched an arbitrary `coverUrl` behind nothing but an `^https?://`
  test — a lever into the Docker network (Mongo on 27018, Redis, the other
  apps' internal ports) for any signed-in household member — with no timeout
  and no size cap. New `src/coverFetch.js`: a host allow-list, a 15s deadline,
  an 8MB ceiling. `fetchJson` got the same deadline.
- **P1 `/kindle-test`, `/kindle-test/download`, `/kindle-test/epub` were
  unauthenticated** and streamed a real library file to anyone. Now behind
  `requireKindleAuth`, the same PIN the rest of `/kindle` uses. They are still
  marked "throwaway, delete after Phase 0" — deleting them is Chef's call.
- **P1 `app.set("trust proxy", 1)` was missing.** Behind the suite's nginx
  `req.ip` was the proxy for every caller, which collapsed `deviceBasket.js`'s
  per-IP secret-word rate limit into one global bucket (ten wrong guesses from
  anyone locked out everyone), and `req.secure` was always false so the Kindle
  PIN cookie never got its `Secure` attribute.
- **P1 send-to-kindle claimed success when nothing was sent.** `SMTP_*` is not
  in bookgeek's documented env set, so `sendMail` no-ops and returns
  `{ sent: false, reason: 'smtp_not_configured' }` — and the route answered
  `success: true`. Both the JSON route and the server-rendered `/kindle` page
  now report the failure. **`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
  `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` belong in the RUNBOOK's bookgeek
  env list** (they are read by `services/emailService.js` and are missing from
  it). The same route also `console.log`ged the user's Kindle address; it uses
  the redacting `@geeksuite/logger` now.
- **P1 `GET /api/auth/me` mapped every upstream failure to 500**, including a
  401 — so an expired session got "something went wrong" instead of the
  re-auth the client's 401 path exists for. 401/403 are forwarded.
- **P1 regex injection / ReDoS.** `/api/books?q=&author=` and the `/kindle`
  listing put the raw search string into a Mongo `$regex`. `(a+)+$` pins the
  server. Escaped (`escapeRegex` in `libraryPaths.js`); `importRoutes.js`
  already had the helper, which is what made the omission visible.
- **P2** `better-sqlite3` now opens `metadata.db` with `fileMustExist: true`
  instead of silently creating an empty database in `LIBRARY_PATH` and then
  failing on "no such table"; the rescan's copy-pasted "Readarr addMe import
  failed" error message says Calibre rescan; a dead destructure in
  `/api/auth/refresh` is gone.
- **`routes/authRoutes.js`'s basegeek proxies had no axios timeout** — axios
  defaults to `0`, so a *hung* basegeek parked the handler and the browser
  until the socket died. Now bounded by `BASEGEEK_TIMEOUT_MS` (default 8000),
  the same knob `packages/user`'s `validateToken` uses; a timeout carries no
  `.response` and now 502s explicitly rather than falling into each handler's
  generic 500, and never a 401.

### Fixed — web

- **P0 `publishedDate` rendered a day early west of UTC.** It is a calendar
  day stored at UTC midnight (`historicalDateField` → `toUtcMidnight`) and was
  formatted with a local `toLocaleDateString()` / `getFullYear()`: *Dune*'s
  `1965-01-01` showed as "12/31/1964" in Details and "1964" in the hero. New
  `formatCalendarDate` in `views/detail/bookFacts.js` + `getUTCFullYear` in
  `publishedYear`. `dateAdded`/`dateFinished` are genuine instants
  (`instantField`) and correctly stay local — the split is the point.
- **P1 per-book state leaked between books.** `closeBookModal` reset the
  enrich trio but not `sendToKindleStatus`/`sendToKindleError`/`uploadFile`/
  `uploadMessage`/`uploadError`, so opening book B showed book A's "Sending
  to <address>", toasted A's "File attached to this book" from `MoreSheet`'s
  mount-time effect, and would attach A's picked-but-unsent file to B.
- **P1 a failed download blanked the library.** `handleDownload` wrote into
  the library-load `error`, which `LibraryView` renders as a full-page
  `GeekErrorState` over the whole grid. It has its own `downloadError` now
  (toasted from the detail sheet). Same split for a failed "load more", which
  additionally used to set `hasMore = false` permanently, killing infinite
  scroll for the session on one transient failure.
- **P1 a failed shelf move was `console.error` and nothing else** — the sheet
  closed, the shelf did not move, the user was told nothing. New `shelfError`,
  toasted like `enrichError`.
- **P1 a cancelled "Add book" file was still attached to the next book.**
  `addBookFile` was cleared only on a successful create while the dialog's own
  `fileName` reset on mount, so the UI showed no file and App still held one.
  Cleared by an effect keyed on the dialog closing, which covers Cancel,
  backdrop and Escape.
- **P2** blanking the Title field sent `title: null`, which the gateway's
  deliberately-non-nullable `optionalTitleSchema` rejects — losing every other
  edit in the same save behind "Invalid input"; the infinite-scroll
  `IntersectionObserver` read `loadingMore` from a stale closure and could
  append the same page twice (duplicate cards under duplicate React keys), now
  a ref; `App.jsx` and `CoverTools` computed the cover-candidate key
  differently (`coverCandidateKey`, one helper, in `bookFacts.js`);
  `ReaderModal`'s 4s give-up left its 250ms poll running for the life of the
  reader; the device-basket create rendered the zod envelope's `error` object
  as `[object Object]`; deleting a custom shelf that was the saved default
  reset it in memory but never persisted it, so the next reload landed on a
  shelf that no longer exists; the first-ever SW install fired
  `controllerchange` and reloaded a page the visitor was already reading
  (`index.html`, shared verbatim with storygeek — both fixed).

### Left in place, with reasons

- **Four of the eight library sorts do nothing.** `components/librarySort.js`
  offers `title, author, dateAdded, rating, dateFinished, pageCount,
  publishedDate, owned`; the gateway's `books` resolver
  (`apps/basegeek/packages/api/src/graphql/bookgeek/resolvers.js:233`) has
  cases for only the first four and `default`s the rest to title — so "Page
  count ↑" returns an alphabetical list while the toolbar pill says "Page
  count ↑". bookgeek's own REST `/api/books` handles all eight; the two
  drifted when the read moved to the gateway. The fix is four `case` arms in
  basegeek, which is outside this tree. Trimming the frontend list instead
  would delete working-looking features — reported, not done.
- **`POST /api/import/calibre` and `/kindle-test*` are gated, not deleted.**
  Both look like one-time/throwaway legacy; deleting a feature is Chef's call.
- **`bookify`-adjacent notes from BURN_REVIEW (o), (p), (x)** re-verified as
  still accurate and still deliberate — no change.
- **The Calibre paths cannot be exercised on this box.** `better-sqlite3` is a
  native addon and the workspace has no built binary for the local Node, so
  `new Database()` throws here (the module still imports fine — the binding
  resolves at call time, which is exactly why `db.query` survived a year with
  green CI). `test/importRoutes.test.js` builds a real Calibre-shaped
  `metadata.db` and walks the rescan for real; on a box that cannot load the
  binding those two cases announce themselves as skipped. CI (node 20, where
  `pnpm install` fetches the prebuild) runs them.
- **`GET /api/books`, `POST /api/books`, `PATCH/DELETE /api/books/:id`,
  `GET /api/shelves` are still live REST** with no zod schemas, duplicating
  the gateway. Unchanged from the note above; still worth a deletion pass.

---

## Three rules, from BURN_REVIEW_2 (2026-09-05, after the going-over)

The going-over's hardening was right and did not reach the whole surface —
the review's characteristic failure mode. Three findings in this app were that
shape (#7 `ebookFormats.js`, #8 the Calibre walk, #9 the cover fetcher). The
fixes are in; these are the rules that keep them fixed. API tests 172 → 199
(196 pass, 3 skip locally — the fixture-backed Calibre tests, see the
better-sqlite3 note above; they run on CI).

**1. `libraryPaths.js` is the only way to turn a relative path into an
absolute one — in every module, not just `server.js`.** The going-over routed
each of `server.js`'s file routes through `resolveInLibrary` and left
`ebookFormats.js` joining `path.join(root, relPath)` for the download source
and `path.join(root, book.coverPath)` for the `--cover` it hands the
`ebook-convert` spawn. `ebookFormats.js` is reachable from
`GET /download-basket/:slug/item/:index`, which is secret-word gated and
**otherwise unauthenticated**, so a `Book.files[].path` of
`../secret/private.epub` made `res.download` stream a file from outside
`LIBRARY_PATH`. Both joins, the converted output's path, and the relative path
written back into `Book.files[]` now go through the helper.

Paths that came *out of the database* use `resolveStoredInLibrary()` — same
answer as `resolveInLibrary`, plus a log line, because a stored escape is a
bad row rather than a bad request. Null is 404 (a read) or 400 (a write).
Never "close enough": an escaping row is dropped from the source candidates
rather than converted from, and `convertEbookFile()` refuses an input, output
or cover outside the root whoever calls it.

**2. Anything that ingests paths from outside confines them *before* it stores
them, and counts what it refuses.** The Calibre walk in
`routes/importRoutes.js` (both `POST /api/import/calibre` and
`/calibre/rescan`) joined `metadata.db`'s `books.path` and `data.name` onto
the library root unchecked and wrote the result into `Book.files[].path` /
`Book.coverPath` — the ingestion point that gives rule 1 its payload. A row
whose directory escapes is skipped whole; a file or cover whose derived path
escapes is skipped individually; both are logged and counted. The rescan
summary now carries a fifth counter, `skippedUnsafePaths`, alongside `rows`,
`attachedExisting`, `createdNew` and `skippedNoFiles`, and the one-time import
returns it too. **A non-zero `skippedUnsafePaths` means the Calibre library
holds rows pointing outside `LIBRARY_PATH` — worth looking at, not routine.**

**3. Outbound fetches follow redirects manually, re-validate every hop, and
stop at three.** `coverFetch.js` checked the host allow-list once, on the URL
the client supplied, and then let `redirect: "follow"` chase up to twenty hops
unchecked — so an open redirector on an allowed host reached the Docker
network the allow-list existed to close off, and the bytes on the far side
were written into the library and served back by `GET /api/books/:id/cover`.
Redirects are `manual` now; each `Location` is resolved, re-checked for scheme
and host, and the chain is capped at `MAX_COVER_REDIRECTS = 3`. The list is
exact hosts, not suffixes, and only the ones the callers actually produce:

| Host | Who produces it |
|---|---|
| `covers.openlibrary.org` | `search-covers`' OpenLibrary candidates; `downloadOpenLibraryCover()` |
| `books.google.com` | the Google Books `imageLinks.thumbnail` the `googlebooks` branch is handed |
| `books.googleusercontent.com` | where a `books.google.com/books/content` request redirects to |

Bare `google.com` and bare `googleusercontent.com` are **gone** — the first
carries well-known open redirectors, the second serves arbitrary user-uploaded
bytes, and both were matched as suffixes. There is no Goodreads image CDN on
the list because nothing in this API fetches one: the Goodreads import is a
CSV of metadata, and the only cover providers `POST /api/books/:id/cover`
accepts are `openlibrary` and `googlebooks`. A new provider gets its host
added here in the same commit.

---

## Night 2 — 2026-09-06: the library assistant (AI idea #4, stream R117)

Two AI-assisted helpers, both drafts, both behind one switch. Everything below
is opt-in, off by default, and nothing on either path writes to a book.

### What was built

- **Gateway `graphql/bookgeek/library.js`** (new) — `whatNext()` and
  `draftBookMetadata()`, both through `services/aiFeatureRunner.js` as
  `{ app: 'bookgeek', feature: 'library' }`: one routing row, one shared per-user
  cap of **20 calls a day across both queries**, one provenance shape.
- **`typeDefs.js`** — `WhatNextPick` / `WhatNextResult` / `BookMetadataDraft`,
  the queries `whatNext(limit: Int = 5)` and `draftBookMetadata(bookId: ID!)`,
  a local `type AIProvenance`, and **`description` on `UpdateBookInput`** (it
  was missing: the edit dialog could not save a description at all before this).
- **`validation.js`** — `whatNextArgsSchema`, `draftBookMetadataArgsSchema`,
  `descriptionSchema` on the update input.
- **`resolvers.js`** — the two `Query` resolvers; `requireUser` first, zod second,
  same as the rest of the module.
- **Web**: `components/WhatNextShelf.jsx`, `utils/libraryAssistant.js` (tag merge
  + the provenance wording), the `GET_WHAT_NEXT` / `DRAFT_BOOK_METADATA`
  documents, a **Library assistant** switch in Settings → AI, a "Draft
  description & tags" button plus a real **Description** field in
  `EditMetadataDialog`, and the App state/handlers behind all of it.
- **Tests**: `bookgeekLibraryAI.test.js` (18, gateway), `WhatNextShelf.test.jsx`
  (7), `libraryAssistant.test.js` (7), `EditMetadataDialog.test.jsx` (7), plus 3
  in `SettingsView.test.jsx`.

### The decisions, and why

- **The candidate set is computed, never asked.** `candidateBooks()` is "in the
  library (owned **or** on a non-empty shelf) AND not finished", newest-added
  first, capped at 60. "Not finished" is bookgeek's own four signals — the same
  ones `shelfMatch('unread')` excludes — so `abandoned`, `read`, `readCount > 0`
  and a set `dateFinished` all drop out. **Abandoned counts as finished-with**: a
  book you put down should not be handed back to you as a suggestion. The model
  only ranks and explains, and `validatePicks()` refuses any id it was not
  given — a hallucinated ObjectId settles on the fallback instead of reaching
  the client.
- **`WhatNextPick.book` is a deliberate superset of the drafted contract.** The
  spec asked for `{ bookId, why }`. The resolver already holds the candidate
  document, and `BookCard` needs a book — so the pick carries it, and the shelf
  is one round trip instead of `bookId` plus five `book(id:)` lookups. `bookId`
  is still the identity to key on.
- **`ShelfStrip` is a chip nav, not a book rail**, so `WhatNextShelf` reuses its
  *pattern* (scroll-snap, full-bleed, no scrollbar) and real `BookCard`s, rather
  than the component itself.
- **The opt-in lives where `defaultShelfFilter` already lives** —
  `appPreferences.bookgeek.libraryAssistant`, via `useAppPreferences("bookgeek")`
  → `PATCH /api/users/preferences/bookgeek`. It is checked **server-side too**:
  `libraryAssistantEnabled()` reads it through basegeek's `lib/appPreferences.js`,
  and with it off both queries still answer — with the deterministic fallback and
  `provenance.reason = 'disabled'`, no model call. Anything but an explicit
  `true` is off.
- **The User model is imported lazily** inside `libraryAssistantEnabled()`.
  `models/user.js` opens its own userGeek connection at import time, and the
  bookgeek gateway module is loaded on every boot and by four test suites that
  close only the bookgeek and aiGeek connections.
- **General knowledge is forbidden in `whatNext` and required in
  `draftBookMetadata`.** Ranking must come from Chef's own data or it is a book
  blog; filling a gap a Calibre/Goodreads import left is by definition a question
  about the world. The metadata prompt bounds it the way a library cares about:
  back-cover level only, premise and setup, **no twist, no ending, no spoiler**,
  and "return an empty description rather than inventing one".
- **Tags stay the library's own.** The model gets the library's existing tag
  names (top 200 by use) and may coin **at most 2** new ones, 8 total; a third
  coined tag fails validation and the whole draft falls back. The fallback is
  "tags this author's other books already carry", which is honest and often
  right.
- **A drafted description never overwrites prose.** If the Description field
  already has text, the draft leaves it alone and only merges tags — the feature
  fills gaps, it does not rewrite.
- **The shelf is fetched once per session per switch-on**, not per filter change:
  refetching on every shelf tap would spend the daily cap on a strip nobody asked
  to change. "Start reading" goes through the ordinary `updateBook` shelf
  mutation (`handleUpdateShelf(book, "reading")`) and then drops the card.
- **Metrics** are server-side logger lines with a stable `metric` field:
  `bookgeek.library.whatnext_shown` and `bookgeek.library.metadata_drafted`, each
  carrying the provenance source so "how often did the model actually answer"
  is answerable from the logs.

### What leaves the box

`whatNext`: per candidate — title, authors, tags, page count, shelf, date added;
plus the last 20 finished titles with their ratings. `draftBookMetadata`: one
book's title, authors, publisher and year, plus the library's tag *names*. Not
sent, on either path: reviews, reading progress, file paths, covers, or anything
from the per-user Profile (Kindle address, device word, saved filters).

### Left undone, with reasons

- **`UpdateBookInput.description` is new, so the REST twin never had it either.**
  `apps/bookgeek/api/src/server.js`'s surviving `PATCH /api/books/:id` is a
  different (and per `SUITE_TODO` probably dead) path; it was not touched.
- **The mobile harness fixtures do not stub `GetWhatNext`.** They do not need
  to — the switch is off in the harness session, so the query is never sent and
  the shelf never renders. A future harness scene for the shelf means adding the
  stub in `tools/mobile-harness/apps/bookgeek/fixtures.mjs`, which is outside
  this stream's tree.
- **The shelf is shown whatever the active filter is.** Hiding it when a shelf
  or search is narrowed was considered and rejected as a rule that would be
  invisible and surprising; the Settings switch is the documented way to hide it.

### Verification

Gateway `npm test` 1449 → 1641 passing (67 → 77 suites; the 18 new ones are
`bookgeekLibraryAI.test.js`, the rest of the growth is other night-2 streams).
`node tools/syntax-check.mjs` clean over 837 files; `node tools/gql-arg-audit.mjs`
clean (182 documents, 179 operations). Web `npx vitest run` 121 → 145 passing,
`npx eslint src` 18 → 18 warnings / 0 errors, `pnpm build` green, mobile harness
`--app bookgeek --enforce-a11y --viewports phone` 12 scenes, **0/0/0**.
