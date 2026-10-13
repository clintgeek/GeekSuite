# Per-reader shelves — Plan

*Status: APPROVED by Chef 2026-10-13 (decisions in §2). Built by Sage.*

> "The books can/should be all one big happy library, but my reading shelf is my
> reading shelf." — Chef, 2026-10-13

## 1. The problem

`Book` is one shared document per book, and it carries two kinds of field:

- **Catalog** — about the book itself: title, authors, series, identifiers,
  files, cover, description, imported `tags` and their derived
  `libraryTags`/`unsortedTags`, `owned`, `dateAdded`, `source`.
- **Reader** — about ONE person's relationship to the book: `shelf`, `rating`,
  `review`, `dateStarted`, `dateFinished`, `readCount`, `readingProgress`,
  `myTags`.

Storing reader fields on the shared row means Heather moving a book to
"Reading" moves it for Chef. Her rating overwrites his, and whoever saved last
owns the progress. Custom shelves were already per-user (`Profile.customShelves`),
yet their id was written onto the shared `Book.shelf`.

## 2. Decisions (Chef, 2026-10-13)

| Question | Decision |
|---|---|
| Whose are today's reader values? | **All Chef's.** They migrate to Chef's records; Heather and everyone else start with every book unread. |
| `myTags` | **Per reader.** |
| Can readers see each other's shelves? | **No.** Private, like every other per-user app. |
| The catalog | **Stays shared.** One library; anyone signed in can add, edit or delete *catalog* data, as today. |

## 3. Design

### 3.1 `BookReading` — one row per (reader, book)

`packages/schemas/bookgeek/bookReading.js`, collection `bookreadings`:

```
userId:          String, required        // basegeek user id
bookId:          ObjectId → Book, required
shelf:           String                  // 'reading' | 'read' | 'to-read' | 'on-reader' | … | 'custom-<slug>'
rating:          Number 0–5
review:          String
dateStarted:     Date
dateFinished:    Date
readCount:       Number, default 0
readingProgress: Number 0–100
myTags:          [String]
timestamps
unique index { userId: 1, bookId: 1 }; index { userId: 1, shelf: 1 }
```

**No row = unread, for you.** The 2026-09-30 backfill that set
`shelf: 'unread'` on 325 shared rows only means that for Chef, and the
migration carries it over as his.

### 3.2 Reads: overlay, don't rewrite

The GraphQL `Book` type **keeps** `shelf`, `rating`, `review`, `dateStarted`,
`dateFinished`, `readCount`, `readingProgress` and `myTags`, and they now
resolve to the **caller's** values. The web app's queries don't change.

Every gateway read that filters, sorts, facets or returns books starts from one
pipeline prefix, `readerOverlay(userId)`. The prefix:

1. `$lookup`s the caller's `bookreadings` row (on `bookId` and `userId`);
2. `$addFields` overwrites each reader field with the caller's value, or null
   (`myTags` becomes `[]`), so the shared row's legacy values can never show
   through;
3. drops the lookup array.

The existing `$match`, `$sort`, facet and count code then runs unchanged on the
same field names. `Book.find(filter)` becomes
`Book.aggregate([...readerOverlay(uid), { $match: filter }, …])`.

### 3.3 Writes: split

`createBook` and `updateBook` split their input in two:

- catalog fields go to `Book`, as before;
- reader fields are upserted into the caller's `BookReading`.

Shelf mutations and anything else writing `shelf` write `BookReading` only.
`deleteBook` also deletes every `BookReading` for that book.

### 3.4 Other writers

- **BookGeek API** (`apps/bookgeek/api`):
  - The Goodreads import writes the importing user's `BookReading`.
  - The Kindle "on reader" basket writes the sender's.
  - Anything else that sets `shelf` or `rating` does the same.
- **StartGeek glance**:
  - The Reading block becomes the caller's books on `reading`.
  - Search's book hits are overlaid the same way.
- **whatNext / recommendations**: "finished", "loved" and "not finished" are
  the caller's, through the overlay.

### 3.5 Migration — at gateway boot, deprecate-first

`migrateReaderFields` runs once at gateway start-up, like BookGeek's tag
migration:

- For every `Book` with any reader field set, it upserts a `BookReading` for
  **Chef** (`6818c2bddcf626909f6a93a1`, the id `DOCS/THINGGEEK_PLAN.md`
  documents) with those values.
- It uses `$setOnInsert`, so it is idempotent and never overwrites a record a
  reader has since changed.
- **The legacy fields stay on `Book`, untouched**, so rolling back is
  "redeploy the previous image". Removing them is a later, separate step,
  after this has run in production (deprecate first:
  `project_schema_removal_stale_bundles`).

A boot migration means the code and the data arrive together: there is no
window where Chef's shelves read empty, or where an edit lands on the wrong
model.

## 4. Done means

- [ ] Heather moves a book to Reading. Chef's copy of that book is unmoved, and
      neither sees the other's shelf, rating, progress or tags.
- [ ] Chef's library looks exactly as it did before the deploy (same shelves,
      ratings, dates, counts, facets).
- [ ] A new reader sees every book as unread, and the full catalog.
- [ ] StartGeek's Reading block shows only the caller's reading shelf.
- [ ] Two-reader isolation tests (Alice/Bob) on every read and write path, each
      reverted to red.
- [ ] Gateway full suite, BookGeek API and web suites, and the harness (with
      `--enforce-a11y`) all green.

## 5. Out of scope

- Households for the catalog (`DOCS/SUITE_HOUSEHOLDS_PLAN.md`). Every signed-in
  account still sees the shared catalog. userGeek holds two accounts besides
  Chef and Heather, and registration is closed.
- Removing the legacy reader fields from `Book` (follow-up, after this ships).
