import { gql } from '@apollo/client';

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
