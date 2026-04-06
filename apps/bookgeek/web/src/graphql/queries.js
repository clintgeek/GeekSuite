import { gql } from '@apollo/client';

export const GET_BOOKS = gql`
  query GetBooks($page: Int, $limit: Int, $sort: String, $sortDir: String, $author: String, $tag: String, $shelf: String, $owned: String, $q: String) {
    books(page: $page, limit: $limit, sort: $sort, sortDir: $sortDir, author: $author, tag: $tag, shelf: $shelf, owned: $owned, q: $q) {
      items {
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
      total
      page
      pageSize
    }
  }
`;

export const GET_BOOK = gql`
  query GetBook($id: ID!) {
    book(id: $id) {
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

export const GET_SHELVES = gql`
  query GetShelves {
    shelves {
      total
      owned
      unowned
      shelves {
        id
        count
      }
    }
  }
`;
