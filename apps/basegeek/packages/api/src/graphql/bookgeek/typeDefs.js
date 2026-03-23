import { gql } from 'graphql-tag';

export const typeDefs = gql`
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
  }

  type Query {
    books(page: Int, limit: Int, sort: String, sortDir: String, author: String, tag: String, shelf: String, owned: String, q: String): BookPage!
    book(id: ID!): Book
    shelves: ShelfStats!
  }

  type Mutation {
    updateBook(id: ID!, input: UpdateBookInput!): Book
    deleteBook(id: ID!, deleteFiles: Boolean): DeleteBookResponse
  }
`;
