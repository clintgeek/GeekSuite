/**
 * NewsGeek's gateway operations. Field and argument names are the N0
 * contract verbatim (DOCS/NEWSGEEK_PLAN.md "Gateway API, N0").
 */
import { gql } from '@apollo/client';

export const PLACE_FIELDS = gql`
  fragment NewsPlaceFields on NewsPlace {
    id
    slug
    name
    kind
    parentId
  }
`;

export const FEED_FIELDS = gql`
  fragment NewsFeedFields on NewsFeed {
    id
    url
    format
    pollEveryMin
    lastFetchAt
    lastOkAt
    lastItemAt
    lastNewItemAt
    consecutiveFailures
    lastError
    lastHttpStatus
    stale
    health
  }
`;

export const SOURCE_FIELDS = gql`
  fragment NewsSourceFields on NewsSource {
    id
    slug
    name
    homepage
    kind
    sections
    status
    places {
      ...NewsPlaceFields
    }
    access {
      paywall
      content
    }
    feeds {
      ...NewsFeedFields
    }
    blockedDomains
    notes
    articlesLast7d
  }
  ${PLACE_FIELDS}
  ${FEED_FIELDS}
`;

export const GET_NEWS_VIEWER = gql`
  query NewsViewer {
    newsViewer {
      isAdmin
    }
  }
`;

export const GET_NEWS_PLACES = gql`
  query NewsPlaces {
    newsPlaces {
      ...NewsPlaceFields
    }
  }
  ${PLACE_FIELDS}
`;

export const GET_NEWS_ARTICLES = gql`
  query NewsArticles($section: String, $placeId: ID, $sourceId: ID, $before: Date, $limit: Int) {
    newsArticles(section: $section, placeId: $placeId, sourceId: $sourceId, before: $before, limit: $limit) {
      items {
        id
        title
        url
        excerpt
        publisher
        publishedAt
        expiresAt
        sourceId
        sourceName
        sourceKind
        sections
        places {
          id
          name
        }
      }
      nextBefore
    }
  }
`;

export const GET_NEWS_SOURCES = gql`
  query NewsSources($status: String) {
    newsSources(status: $status) {
      ...NewsSourceFields
    }
  }
  ${SOURCE_FIELDS}
`;

export const GET_NEWS_SOURCE = gql`
  query NewsSource($id: ID!) {
    newsSource(id: $id) {
      ...NewsSourceFields
    }
  }
  ${SOURCE_FIELDS}
`;
