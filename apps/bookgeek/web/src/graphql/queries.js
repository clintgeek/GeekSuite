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

// ---------------------------------------------------------------------------
// Per-user profile data. These used to be `authFetch` REST calls against
// bookgeek's own API (`/api/profile/*`, `/api/ai/status`); they moved to the
// gateway 2026-09-05 — pure data belongs in GraphQL, and the REST that stays
// is binary/long-job work only. See apps/bookgeek/DOCS/CONTEXT.md.
// ---------------------------------------------------------------------------

export const SAVED_FILTER_FIELDS = `
  id
  name
  sortBy
  sortDir
  searchQuery
  authorFilter
  tagFilter
  shelfFilter
  ownedOnly
  ownedFilter
`;

export const GET_BOOK_PROFILE = gql`
  query GetBookProfile {
    bookProfile {
      userId
      kindleEmail
      deviceWord
      customShelves {
        id
        label
      }
      savedFilters {
        ${SAVED_FILTER_FIELDS}
      }
    }
  }
`;

export const GET_LIBRARY_FILTERS = gql`
  query GetLibraryFilters {
    libraryFilters {
      ${SAVED_FILTER_FIELDS}
    }
  }
`;

export const GET_AI_STATUS = gql`
  query GetBookAiStatus {
    bookAiStatus {
      enabled
      apiKeyConfigured
      baseGeekUrl
      model
      providers
    }
  }
`;

// ---------------------------------------------------------------------------
// The library assistant (DOCS/AI_IDEAS.md #4). Both are drafts: `whatNext`
// ranks books the gateway itself picked out as unfinished, and
// `draftBookMetadata` proposes fields the user edits and saves through the
// ordinary `updateBook` mutation. Nothing here writes, and both carry the
// provenance line the UI shows under the "AI-drafted" mark.
//
// Behind the "Library assistant" switch in Settings (default off). When it is
// off the client does not send these at all — and the resolver would answer
// with its deterministic fallback anyway.
// ---------------------------------------------------------------------------

const AI_PROVENANCE_FIELDS = `
  source
  reason
  model
  provider
  cached
  callsToday
  cap
`;

export const GET_WHAT_NEXT = gql`
  query GetWhatNext($limit: Int) {
    whatNext(limit: $limit) {
      picks {
        bookId
        why
      }
      provenance {
        ${AI_PROVENANCE_FIELDS}
      }
    }
  }
`;

export const DRAFT_BOOK_METADATA = gql`
  query DraftBookMetadata($bookId: ID!) {
    draftBookMetadata(bookId: $bookId) {
      description
      tags
      provenance {
        ${AI_PROVENANCE_FIELDS}
      }
    }
  }
`;
