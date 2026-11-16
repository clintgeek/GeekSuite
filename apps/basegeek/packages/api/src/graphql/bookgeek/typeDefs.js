import { gql } from 'graphql-tag';

export const typeDefs = gql`
  # definitions into one type. It is written out here rather than interpolated
  # the runner would drag aiService and the crypto vault into a file whose whole

  type Book {
    id: ID!
    title: String!
    authors: [String]
    series: BookSeries
    isbn: String
    isbn13: String
    goodreadsId: String
    openLibraryId: String
    asin: String
    googleBooksId: String
    publisher: String
    publishedDate: Date
    pageCount: Int
    description: String
    language: String
    # The tags as imported (Calibre, enrich) — the book page's "source tags".
    tags: [String]
    # Canonical vocabulary tags derived from tags (apps/bookgeek/DOCS/TAGS.md).
    libraryTags: [String!]!
    # Raw tags neither mapped nor dropped, as written.
    unsortedTags: [String!]!
    # Tags added in BookGeek; never touched by an import.
    myTags: [String!]!
    files: [BookFile]
    coverPath: String
    owned: Boolean
    shelf: String
    rating: Float
    review: String
    dateAdded: Date
    dateStarted: Date
    dateFinished: Date
    readCount: Int
    readingProgress: Float
    source: String
    createdAt: Date
    updatedAt: Date
    # Recently deleted (2026-11-15): set while the book is in the trash; it can
    # be restored until purgeAt, when it is removed for good — with every
    # reader's shelf, rating and progress, and its files if deleteFilesOnPurge.
    deletedAt: Date
    purgeAt: Date
    deleteFilesOnPurge: Boolean
  }

  type BookSeries {
    name: String
    index: Int
  }

  type BookFile {
    format: String
    path: String
    size: Int
    addedAt: Date
  }

  type BookPage {
    items: [Book]!
    total: Int!
    page: Int!
    pageSize: Int!
  }

  # ---------------------------------------------------------------------------
  # The faceted library (Phase C2, DOCS/BOOKGEEK_CLEANUP_PLAN.md; filters.js).
  # Every list is any-of, except tags under tagMatch "all".
  # ---------------------------------------------------------------------------

  input BookFilterInput {
    # title / authors / tags contain it (escaped, case-insensitive)
    q: String
    # built-in shelves and custom-<slug>; "unread" = unread or no shelf, and not finished
    shelves: [String!]
    # exact author names (the authors facet's values)
    authors: [String!]
    # authors contain it — the pre-C2 author filter, carried by old saved views
    authorText: String
    # series.name
    series: [String!]
    # canonical, My and Unsorted tag values (the tags facet); a raw tag also
    # matches through the vocabulary
    tags: [String!]
    # "any" (default) | "all" — over tags
    tagMatch: String
    # files[].format, case-insensitive (epub, azw3, mobi, pdf, …)
    formats: [String!]
    languages: [String!]
    owned: Boolean
    # has at least one file (true) / none (false)
    hasFile: Boolean
    # calendar year of dateFinished (UTC)
    readYearMin: Int
    readYearMax: Int
    # whole stars 1–5; a half star counts under its floor (3.5 is a 3)
    ratingMin: Int
    ratingMax: Int
  }

  type BookFacetValue {
    value: String!
    count: Int!
  }

  type BookYearBucket {
    year: Int!
    count: Int!
  }

  type BookRatingBucket {
    rating: Int!
    count: Int!
  }

  # Each facet's counts apply every active filter EXCEPT its own.
  type BookFacets {
    # books matching the full filter
    total: Int!
    shelves: [BookFacetValue!]!
    authors: [BookFacetValue!]!
    series: [BookFacetValue!]!
    # canonical ∪ My ∪ Unsorted tags
    tags: [BookFacetValue!]!
    # the subset of tag values that are someone's own (the "My tags" group)
    myTags: [BookFacetValue!]!
    # lowercased
    formats: [BookFacetValue!]!
    languages: [BookFacetValue!]!
    # books finished per year
    readYears: [BookYearBucket!]!
    # rated books per whole star
    ratings: [BookRatingBucket!]!
    # books owned
    owned: Int!
    # books with at least one file
    hasFile: Int!
  }

  type ShelfStats {
    total: Int!
    owned: Int!
    unowned: Int!
    shelves: [ShelfCount!]!
  }

  type ShelfCount {
    id: String!
    count: Int!
  }

  type DeleteBookResponse {
    success: Boolean!
    deletedId: ID!
  }

  input UpdateBookInput {
    title: String
    authors: [String]
    description: String
    shelf: String
    owned: Boolean
    rating: Float
    review: String
    # Still accepted for old tabs; the web edits myTags. Rederives libraryTags/unsortedTags.
    tags: [String]
    myTags: [String]
    language: String
    publisher: String
    publishedDate: Date
    isbn: String
    isbn13: String
    goodreadsId: String
    readingProgress: Int
    dateStarted: Date
    dateFinished: Date
  }

  input CreateBookInput {
    title: String!
    authors: [String]
    isbn: String
    shelf: String
    owned: Boolean
  }


  # ---------------------------------------------------------------------------
  # Per-user bookgeek data. The library itself is shared (see resolvers.js), but
  # the Profile — Kindle address, device secret word, custom shelves and saved
  # library filters — is per-user and every field below is scoped to the caller.
  # ---------------------------------------------------------------------------

  type BookProfile {
    userId: String
    kindleEmail: String
    deviceWord: String
    customShelves: [BookCustomShelf!]!
    savedFilters: [BookSavedFilter!]!
    createdAt: Date
    updatedAt: Date
  }

  type BookCustomShelf {
    id: String!
    label: String!
  }

  type BookSavedFilter {
    id: String!
    name: String!
    sortBy: String
    sortDir: String
    searchQuery: String
    authorFilter: String
    tagFilter: String
    shelfFilter: String
    ownedOnly: Boolean
    ownedFilter: String
    # The whole BookFilterInput this view was saved with; null for views saved before it existed.
    filter: JSON
    # The view's tags (filter.tags, or the legacy tagFilter) as the library names them now:
    # raw tags mapped through the vocabulary. Nothing is stored; see apps/bookgeek/DOCS/TAGS.md.
    viewTags: [String!]!
  }

  type RemoveBookShelfResult {
    profile: BookProfile
    clearedBooks: Int!
  }

  # Whether the suite's AI subsystem (basegeek itself, which is where bookgeek's
  # AI has always been routed) has a usable provider. Counts only — no key, no
  # hint, nothing derived from a credential.
  type BookAiStatus {
    enabled: Boolean!
    apiKeyConfigured: Boolean!
    baseGeekUrl: String
    model: String
    providers: Int!
  }

  input BookProfileInput {
    kindleEmail: String
    deviceWord: String
  }

  input SaveLibraryFilterInput {
    name: String!
    sortBy: String
    sortDir: String
    searchQuery: String
    authorFilter: String
    tagFilter: String
    shelfFilter: String
    ownedOnly: Boolean
    ownedFilter: String
    # The whole BookFilterInput, validated like the books query's filter.
    filter: JSON
  }

  # ---------------------------------------------------------------------------
  # The library assistant (AI idea #4). Both queries are drafts: nothing here
  # writes, and every result carries the provenance the UI labels it with.
  # See graphql/bookgeek/library.js.
  # ---------------------------------------------------------------------------

  """
  One suggestion on the What-next shelf. "why" is a single sentence.

  "book" is a deliberate superset of the drafted contract: the resolver already
  holds the candidate document, so returning it here makes the shelf one round
  trip instead of "bookId" plus five book(id:) lookups. "bookId" stays the
  identity a client should key on.
  """
  type WhatNextPick {
    bookId: ID!
    book: Book
    why: String
  }

  type WhatNextResult {
    picks: [WhatNextPick!]!
    provenance: AIProvenance!
  }

  """A proposed description and tag list for a book whose import came in without them. Never saved by the server."""
  type BookMetadataDraft {
    description: String
    tags: [String!]!
    provenance: AIProvenance!
  }

  # Meaning search / recommendations over the shared library (MCP_SPEC Stage 1b).
  # matchedBy: keyword | meaning | both. score is the fused rank score.
  type BookSearchHit {
    book: Book!
    score: Float!
    matchedBy: String!
  }
  type BookSearchResult {
    items: [BookSearchHit!]!
  }
  type BookSeedRef {
    id: ID!
    title: String
  }
  type BookLikeHit {
    book: Book!
    score: Float!
    closestTo: BookSeedRef
  }
  type BooksLikeResult {
    items: [BookLikeHit!]!
    # null on success; 'no_seeds', 'not_indexed' or 'embeddings_unavailable' when empty.
    reason: String
  }

  type Query {
    # The flat args are the pre-C2 library's and keep working unchanged; "filter" is the faceted
    # library's. sort adds "random" (seeded by "seed", stable across pages).
    books(page: Int, limit: Int, sort: String, sortDir: String, author: String, tag: String, shelf: String, owned: String, q: String, filter: BookFilterInput, seed: Int): BookPage!
    # Hybrid keyword + meaning search over the catalog vectors (local
    # embeddings only). Keyword-only when the embeddings service is down.
    bookSearch(q: String!, limit: Int): BookSearchResult!
    # Owned, unread books ranked by likeness to the caller's 4★+ books — or
    # to likeIds / q when given. Local embeddings only; no AI spend.
    booksLike(likeIds: [ID!], q: String, limit: Int): BooksLikeResult!
    bookFacets(filter: BookFilterInput): BookFacets!
    book(id: ID!): Book
    shelves: ShelfStats!
    bookProfile: BookProfile
    libraryFilters: [BookSavedFilter!]!
    bookAiStatus: BookAiStatus!
    whatNext(limit: Int = 5, mood: String): WhatNextResult!
    draftBookMetadata(bookId: ID!): BookMetadataDraft!
    # Recently deleted, newest first (default 50, max 200). Household-shared,
    # like the catalog. Purging past 30 days is bookgeek's own API (it owns the files).
    deletedBooks(limit: Int): [Book!]!
  }

  type Mutation {
    createBook(input: CreateBookInput!): Book
    updateBook(id: ID!, input: UpdateBookInput!): Book
    # Moves the book to Recently deleted (since 2026-11-15; it used to remove it).
    # deleteFiles: its files are deleted too when it is purged.
    deleteBook(id: ID!, deleteFiles: Boolean): DeleteBookResponse
    # Back from Recently deleted, with every reader's shelf, rating and progress.
    restoreBook(id: ID!): Book
    saveBookProfile(input: BookProfileInput!): BookProfile
    saveLibraryFilter(input: SaveLibraryFilterInput!): [BookSavedFilter!]!
    deleteLibraryFilter(id: String!): [BookSavedFilter!]!
    addBookShelf(label: String!): BookProfile
    removeBookShelf(id: String!): RemoveBookShelfResult!
  }
`;
