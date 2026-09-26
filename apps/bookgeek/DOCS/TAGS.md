# BookGeek — tags

*Written 2026-09-26. Chef: "Is there a way to handle tags in BookGeek similarly to how we do
them in gamegeek?" The pattern is GameGeek's (`apps/gamegeek/DOCS/TAGS_AND_FILTERS.md`,
Part A): a curated vocabulary plus a synonym table, and the person's own tags kept apart
from derived ones.*

## Where we start (measured on production 2026-09-26, 554 books)

- **752 distinct tags, 484 of them used once.** 15 books have none. All of them came from
  `calibre-import`.
- **Too broad to filter on:** Fiction (410), General (86), Novels (69), Adult (53),
  Literature (48).
- **Duplicates and mashups:** Thriller / Thrillers / Mystery Thriller; Memoir / memoirs /
  Biography Memoir; Science Fiction Fantasy; Action & Adventure.
- **Library-catalogue headings:** "Wiggin, Ender (Fictitious character) -- Fiction", dates
  like "1922-2007", non-English terms ("Novela juvenil", "Sites Web"), and oddities such as
  "Courses & Dishes" and "Web sites".
- **Not tags at all:**
  - AUTO (153): an import marker.
  - Audiobook (180): the books are all ebooks. BookGeek has no audio files; see "Follow-up".
  - Some look personal: jonestown, kurt, growing-up-poor, Must Read, Book Club. **Chef: some
    tags are his own.** The Goodreads export only carries the three built-in shelves, so it
    can't say which tags are his.

## Decisions (Chef, 2026-09-26)

- **Audiobook is removed** ("Just remove it and we'll follow up on it in the future").
- **Some tags are Chef's own.** Nothing that might be his is silently dropped: see
  "Unsorted".

## The design

### 1. A curated vocabulary
It lives in `packages/schemas/bookgeek/tags.js`: about 60 canonical tags in groups, shown
grouped in the facet. Start from the data above; extend deliberately.

| Group | Starting set |
|---|---|
| Genre | Fantasy, Sci-fi, Mystery, Thriller, Horror, Romance, Literary, Historical Fiction, Classics, Short Stories, Poetry, Graphic Novel, Western, Adventure, Humor |
| Nonfiction | Memoir, Biography, History, True Crime, Science, Popular Science, Religion, Philosophy, Politics, Business, Self-help, Travel, Food, Essays |
| Audience | Young Adult, Middle Grade, Children's |
| Flavour | Space Opera, Dystopia, Post-apocalyptic, Urban Fantasy, Epic Fantasy, Cyberpunk, Time Travel, Magic, Supernatural, Cults, Crime, Suspense, Coming of Age, War, Dark, Cozy |

### 2. The synonym table
Every raw tag is lowercased and punctuation-folded, then:
- **mapped** to one or more canonical tags: *Thrillers* → Thriller; *Science Fiction
  Fantasy* → Sci-fi + Fantasy; *Biography Memoir* → Biography + Memoir; *Mystery Thriller*
  → Mystery + Thriller; *sf_horror* → Sci-fi + Horror;
- **parsed**, for catalogue headings: "X -- Fiction" and "X (Fictitious character)" are
  split, and any part that matches is kept;
- **dropped**, if on the drop list: Fiction, General, Novels, Adult, Literature, AUTO,
  Audiobook, dates, and non-English catalogue terms;
- **Unsorted** otherwise.

Each book gets at most 12 canonical tags.

### 3. Unsorted: nothing that might be Chef's is lost
A tag that is neither mapped nor on the drop list goes into an **Unsorted** group. It's
shown last and collapsed in the facet, and it still filters. The build also produces
`apps/bookgeek/DOCS/TAGS_REVIEW.md` (kept local and gitignored, because it is built from Chef's real tags): every Unsorted tag with its book count. Chef marks
each one *mine*, *map to X* or *drop* in one pass, and those answers become entries in the
vocabulary, synonyms or drop list.

### 4. Storage: the raw tags are never rewritten
- **`Book.tags` stays exactly as imported.** The Calibre import owns it. Find out whether a
  re-import overwrites or merges it, and record the answer here.
- **`Book.libraryTags: [String]`** holds the canonical tags derived from `tags`. It's
  recomputed on every write (import, gateway create/update) and by an idempotent one-time
  pass over existing books, which logs what it changed once.
- **`Book.unsortedTags: [String]`** holds the raw tags that landed in Unsorted, derived the
  same way.
- **Tags Chef adds in BookGeek from now on** are his, and always show as-is in a **My tags**
  group. Decide the cleanest storage (a `myTags` field, or keeping `tags` as the edit
  target when it isn't import-owned) once the import behaviour is known. The rule is that
  an edit in BookGeek must never be lost to a Calibre re-import.

### 5. Facet, search and saved views
- **The Tags facet** shows My tags, the vocabulary groups, then Unsorted (collapsed), with
  Any/All kept. Counts ignore their own filter, as they do today.
- **`tag:`** in search matches canonical names and their synonyms.
- **Saved views** that name a raw tag keep working: the raw tag is mapped through the
  synonym table when the view loads.
- **The book page** shows the canonical tags, with the raw ones behind a "source tags"
  disclosure.

## Follow-up (not now)
- **Audiobooks:** Chef has audiobooks outside BookGeek and "never thought to manage them"
  here. Revisit whether BookGeek should hold them. It's on `DOCS/SUITE_TODO.md`.

## Import behaviour (found 2026-09-26)

- **`POST /api/import/calibre` overwrites, and not only `tags`.** It deletes every
  `source: "calibre-import"` book and inserts the library again from `metadata.db`
  (`api/src/routes/importRoutes.js`). The new documents get new `_id`s, and every field
  that lives only in BookGeek (shelf, rating, review, reading progress, dates, Goodreads
  merges) is gone. Nothing in the web app calls it; Settings only offers the rescan. It's
  kept as the one-time import it was built as. **Outside this work: re-running it today
  would wipe Chef's reading history. It needs a guard or a merge before anyone uses it
  again.**
- **`POST /api/import/calibre/rescan` never touches `tags` on a book it recognises.** It
  only merges `files`, sets `owned` and fills a missing `coverPath`. A book it doesn't
  recognise is created with Calibre's tags.
- **Enrich (`POST /api/books/:id/enrich`) merges into `tags`.** It appends OpenLibrary
  subjects and ebook-meta tags, never removes any, and is where the catalogue headings came
  from.
- **The Goodreads import, dedupe and manual merge never write `tags`.**

## As built (2026-09-26)

**Storage for Chef's own tags.** `Book.myTags: [String]`. `tags` stays the edit target of
nothing in BookGeek:
- the rescan never touches `tags` or `myTags`;
- the destructive `/calibre` re-import reads every Calibre book that has `myTags` before
  it deletes anything. Each new document inherits the `myTags` of the book it replaces,
  matched by ISBN, then Goodreads id, then title plus first author. A book with `myTags`
  that is no longer in Calibre is kept instead of deleted, so it duplicates nothing and
  loses nothing. The response reports `myTagsCarried` and `keptForMyTags`;
- the manual merge unions both books' `myTags`.

**The web edit path moved.** "Edit metadata" had a *Tags* field that wrote `tags`. It is now
*My tags* and writes `myTags`. `UpdateBookInput.tags` still exists for old tabs. A write
to it rederives `libraryTags` and `unsortedTags`. The AI "Draft description & tags" fills
My tags: nothing is saved until Chef saves, and what he saves is his. Existing raw tags
were not moved into My tags.

**Vocabulary (`packages/schemas/bookgeek/tags.js`).**
- **60 tags.** The table above plus 12 that the data asked for:
  - Genre: Contemporary;
  - Nonfiction: Psychology, Health, Technology (about 40 raw programming and web tags);
  - Flavour: Aliens, Mythology, Alternate History, Zombies, Espionage, Survival, Legal,
    LGBTQ+.
- **Normalisation is GameGeek's:** NFKC, lowercase, `&` → "and", apostrophes removed,
  other punctuation → space.
- **Classification order:**
  1. The whole string in the table: a mapping, or `null` for a considered drop.
  2. The drop shapes: dates, centuries, "Reading Level-Grade N", machine tags like
     `award:…`/`nyt:…`, subject codes and call numbers, FAST/OCLC ids.
  3. The heading parser. It splits on `--`, ` / `, `->`, `;` and ` - `. A segment without a
     trailing "(…)" is then split on commas. A part qualified "(Fictitious character)" or
     "(Imaginary place)" is dropped. Any other trailing qualifier is stripped before lookup
     ("JavaScript (Computer program language)" → JavaScript). A flattened "… Fiction" /
     "… Juvenile fiction" suffix is read as its own part. Every part that maps is kept. If
     none maps, the tag is dropped only when *every* part is on the drop list. Otherwise it
     stays Unsorted, whole and as written.
- **A sub-genre also counts under its genre:** Epic, Urban and Dark Fantasy → + Fantasy;
  Space Opera and Cyberpunk → + Sci-fi; Aliens → + Sci-fi.
- **Ordering and the cap:** by group (Genre, Nonfiction, Audience, Flavour), then first
  appearance, capped at 12, so Flavour is cut first (GameGeek's rule). No production book
  hits the cap.
- **Left Unsorted on purpose, for Chef:**
  - the ones this doc calls personal (jonestown, kurt, growing-up-poor, Must Read, Book
    Club), every lowercase one-word tag, and every specific group name (FLDS, Scientology,
    nxivm, Branch Davidians…), although Cults exists;
  - Nonfiction / Non Fiction / Non-Fiction: broad, but a useful filter at 27 books, so
    the call is Chef's;
  - Speculative Fiction and Psychological (ambiguous).
- **Judgement calls:**
  - `sf_fantasy` (FB2's code for fantasy) → Fantasy only;
  - Historical → Historical Fiction;
  - Space → Sci-fi;
  - Christian / Christian Fiction → Religion;
  - "Adult Fiction" is dropped with Adult.
  Non-English catalogue terms are dropped, not mapped, as §2 says, even where the meaning
  is plain (Fantasía, Magia).

**Against production (554 books, 752 distinct raw tags, 2026-09-26):**
- 358 tags mapped, 109 dropped and 285 Unsorted;
- 45 books have no canonical tag: 15 have no tags at all, and 30 have only AUTO,
  Fiction/General or Unsorted tags;
- top canonical tags: Sci-fi 219, Fantasy 207, Adventure 132, Thriller 121, Classics 100,
  Humor 99, Young Adult 96, Mystery 82, Suspense 79, Horror 67.
- Cozy is unused so far.

**Derived on write.**
- Gateway:
  - `createBook` writes empty derived fields;
  - `updateBook` rederives when `tags` is written, and stores `myTags` trimmed and deduped,
    never mapped.
- Api:
  - `/calibre` and the rescan's new books go through `withDerivedTags`;
  - enrich derives in the same `$set` as its merged `tags`.
- The Book type resolves `libraryTags` and `unsortedTags` from `tags` when a document
  predates them, so the book page is never blank before the migration.

**The one-time pass is a boot migration** (`api/src/migrations/tags.js`, run from
`server.js` after connect and before listen; GameGeek's genre pattern). The vocabulary is
meant to change as Chef answers TAGS_REVIEW.md, and a boot migration re-derives on the next
deploy with nobody remembering a script.
- It writes only `libraryTags` and `unsortedTags`, only where they differ. Each write is
  guarded on the exact `tags` array it read.
- It logs one line, and a second run changes nothing.
- A failure is logged, never fatal.
- `api/scripts/tags-migration.mjs` runs the same code on demand. It is dry by default,
  and `--apply` writes.

**Facet and filter (gateway `filters.js`).**
- The Tags facet counts `libraryTags ∪ myTags ∪ unsortedTags` once per book.
- A new `bookFacets.myTags` says which values are someone's own, under the same
  exclude-own match.
- A value is one value wherever it comes from. A My tag spelled exactly like a canonical
  tag is that tag and groups under the vocabulary. A My tag spelled differently
  ("fantasy") stays the person's.
- Filter matching:
  - a canonical value matches `libraryTags` or `myTags`;
  - any other value matches `myTags`, the raw `tags`, or the canonical tags it maps to.
    Old links (`?tag=science+fiction`) and pre-vocabulary views therefore still find their
    books. The flat `tag` arg keeps its exact old semantics.
- Web: the groups are a local mirror (`web/src/utils/tagGroups.js`, parity-tested
  against the schema, as GameGeek's is). My tags come first, then the four groups, then
  Unsorted.
- **Package change (additive):** `@geeksuite/collection`'s grouped section takes
  `collapsedGroups`. Folded headings sit last as a disclosure row ("Unsorted 285"),
  outside the top-12 limit and "Show all". A selected value in them still shows, and
  search looks inside them. Default `[]`: GameGeek and ThingGeek are unchanged.

**Search.**
- `tag:x` or `tag:"two words"` matches the canonical tags `x` names or maps to, and the raw
  and My tags equal to it, ignoring case, as an escaped literal (`searchRegex`).
- Several `tag:` terms must all match.
- Free text also searches `libraryTags` and `myTags`, and still searches raw `tags`, so
  the production views "Cults" and "Must Read" (both plain searches) are unchanged.

**Saved views.**
- `BookSavedFilter.viewTags` is new. It holds the view's tags (its `filter.tags`, else the
  legacy `tagFilter`) mapped through the vocabulary when the view loads, and nothing is
  stored. A later vocabulary change maps the view again.
- The web opens views with it: "Unread sci-fi" (`tagFilter: "science fiction"`) opens on
  Sci-fi, and "Five-star memoirs" (`filter.tags: ["memoir"]`) opens on Memoir.
- The two views on production are text searches and don't name a tag.

**Book page.**
- Tags and My tags show as chip rows.
- "Source tags N" is a disclosure that lists the raw `tags` exactly as imported. Unsorted
  tags appear there, not as chips.

**GraphQL is additive only.** New:
- `Book.libraryTags/unsortedTags/myTags`;
- `UpdateBookInput.myTags`;
- `BookFacets.myTags`;
- `BookSavedFilter.viewTags`.
No root field or argument was added, so `gatewayInputObjectParity` is untouched.

**The review list.** `DOCS/TAGS_REVIEW.md` comes from `api/scripts/tags-review.mjs`,
which is read-only and takes `--from-json` or the database. Re-run it after each
vocabulary change.
