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
as `customShelves: [{ id, label }]`, `id = "custom-<slug of label>"`. Routes
(bookgeek API, cookie auth): `POST /api/profile/shelves { label }`,
`DELETE /api/profile/shelves/:id`. Deleting a shelf `$unset`s `shelf` on every
book sitting on it. Books are shared across users, so a custom shelf id on a
book is visible to everyone; only the *definition* is per user. Limits: 20
shelves, 40-char labels.

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
