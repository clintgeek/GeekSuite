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
