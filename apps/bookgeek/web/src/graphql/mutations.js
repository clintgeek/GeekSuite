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
      shelf
      owned
      rating
      review
      tags
      language
      publisher
      publishedDate
      isbn
      isbn13
      goodreadsId
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
