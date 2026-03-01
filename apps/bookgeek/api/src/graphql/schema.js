import { gql } from "graphql-tag";

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0",
          import: ["@key", "@shareable"])

  type Book @key(fields: "id") {
    id: ID!
    title: String!
    authors: [String]
    series: Series
    isbn: String
    isbn13: String
    goodreadsId: String
    openLibraryId: String
    asin: String
    googleBooksId: String
    publisher: String
    publishedDate: String
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
    dateAdded: String
    dateStarted: String
    dateFinished: String
    readCount: Int
    readingProgress: Float
    source: String
    createdAt: String
    updatedAt: String
  }

  type Series @shareable {
    name: String
    index: Int
  }

  type BookFile @shareable {
    format: String
    path: String
    size: Int
    addedAt: String
  }

  type BookPage {
    items: [Book]!
    total: Int!
    page: Int!
    pageSize: Int!
  }

  type ShelfStats {
    total: Int!
    owned: Int!
    unowned: Int!
    shelves: [ShelfCount!]!
  }

  type ShelfCount @shareable {
    id: String!
    count: Int!
  }

  type Query {
    books(
      page: Int
      limit: Int
      sort: String
      sortDir: String
      author: String
      tag: String
      shelf: String
      owned: String
      q: String
    ): BookPage!
    book(id: ID!): Book
    shelves: ShelfStats!
  }

  type Mutation {
    updateBook(id: ID!, input: UpdateBookInput!): Book
    deleteBook(id: ID!, deleteFiles: Boolean): DeleteBookResponse
  }

  input UpdateBookInput {
    title: String
    authors: [String]
    shelf: String
    owned: Boolean
    rating: Float
    review: String
    tags: [String]
    language: String
    publisher: String
    publishedDate: String
    isbn: String
    isbn13: String
    goodreadsId: String
  }

  type DeleteBookResponse {
    success: Boolean!
    deletedId: ID!
  }
`;
