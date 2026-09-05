import { gql } from '@apollo/client';
import { SAVED_FILTER_FIELDS } from './queries.js';

export const CREATE_BOOK = gql`
  mutation CreateBook($input: CreateBookInput!) {
    createBook(input: $input) {
      id
      title
      authors
      isbn
      shelf
      owned
    }
  }
`;

export const UPDATE_BOOK = gql`
  mutation UpdateBook($id: ID!, $input: UpdateBookInput!) {
    updateBook(id: $id, input: $input) {
      id
      title
      authors
      series {
        name
        index
      }
      isbn
      isbn13
      goodreadsId
      openLibraryId
      asin
      googleBooksId
      publisher
      publishedDate
      pageCount
      description
      language
      tags
      files {
        format
        path
        size
        addedAt
      }
      coverPath
      owned
      shelf
      rating
      review
      dateAdded
      dateStarted
      dateFinished
      readCount
      readingProgress
      source
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_BOOK = gql`
  mutation DeleteBook($id: ID!, $deleteFiles: Boolean) {
    deleteBook(id: $id, deleteFiles: $deleteFiles) {
      success
      deletedId
    }
  }
`;

// ---------------------------------------------------------------------------
// Per-user profile writes — formerly PUT/POST/DELETE against bookgeek's own
// `/api/profile/*`. Moved to the gateway 2026-09-05.
// ---------------------------------------------------------------------------

const BOOK_PROFILE_FIELDS = `
  userId
  kindleEmail
  deviceWord
  customShelves {
    id
    label
  }
`;

export const SAVE_BOOK_PROFILE = gql`
  mutation SaveBookProfile($input: BookProfileInput!) {
    saveBookProfile(input: $input) {
      ${BOOK_PROFILE_FIELDS}
    }
  }
`;

export const SAVE_LIBRARY_FILTER = gql`
  mutation SaveLibraryFilter($input: SaveLibraryFilterInput!) {
    saveLibraryFilter(input: $input) {
      ${SAVED_FILTER_FIELDS}
    }
  }
`;

export const DELETE_LIBRARY_FILTER = gql`
  mutation DeleteLibraryFilter($id: String!) {
    deleteLibraryFilter(id: $id) {
      ${SAVED_FILTER_FIELDS}
    }
  }
`;

export const ADD_BOOK_SHELF = gql`
  mutation AddBookShelf($label: String!) {
    addBookShelf(label: $label) {
      ${BOOK_PROFILE_FIELDS}
    }
  }
`;

export const REMOVE_BOOK_SHELF = gql`
  mutation RemoveBookShelf($id: String!) {
    removeBookShelf(id: $id) {
      profile {
        ${BOOK_PROFILE_FIELDS}
      }
      clearedBooks
    }
  }
`;
