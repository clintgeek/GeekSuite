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
    tags: [String]
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
    tags: [BookFacetValue!]!
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
    tags: [String]
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

  type Query {
    # The flat args are the pre-C2 library's and keep working unchanged; "filter" is the faceted
    # library's. sort adds "random" (seeded by "seed", stable across pages).
    books(page: Int, limit: Int, sort: String, sortDir: String, author: String, tag: String, shelf: String, owned: String, q: String, filter: BookFilterInput, seed: Int): BookPage!
    bookFacets(filter: BookFilterInput): BookFacets!
    book(id: ID!): Book
    shelves: ShelfStats!
    bookProfile: BookProfile
    libraryFilters: [BookSavedFilter!]!
    bookAiStatus: BookAiStatus!
    whatNext(limit: Int = 5): WhatNextResult!
    draftBookMetadata(bookId: ID!): BookMetadataDraft!
  }

  type Mutation {
    createBook(input: CreateBookInput!): Book
    updateBook(id: ID!, input: UpdateBookInput!): Book
    deleteBook(id: ID!, deleteFiles: Boolean): DeleteBookResponse
    saveBookProfile(input: BookProfileInput!): BookProfile
    saveLibraryFilter(input: SaveLibraryFilterInput!): [BookSavedFilter!]!
    deleteLibraryFilter(id: String!): [BookSavedFilter!]!
    addBookShelf(label: String!): BookProfile
    removeBookShelf(id: String!): RemoveBookShelfResult!
  }
`;
