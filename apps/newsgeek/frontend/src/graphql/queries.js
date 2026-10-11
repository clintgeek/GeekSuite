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
    pathExclude
    notes
    articlesLast7d
    paywalled
    defaultOn
    onForMe
    addedByMe
    canEdit
    addedByName
    subscribedByMe
    priorityForMe
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
        publisherDomain
        viaAggregator
        alsoIn {
          publisher
          url
          sourceId
        }
        sections
        places {
          id
          name
        }
      }
      nextBefore
      hiddenPaywalled
    }
  }
`;

/** The reader's own prefs (per user, server-side). Defaults when never set. */
export const GET_NEWS_PREFS = gql`
  query NewsPrefs {
    newsPrefs {
      freeToReadOnly
      readerLinks {
        label
        template
      }
    }
  }
`;

/**
 * The reader's publisher prefs (plan "Source sheet"): what they subscribe to
 * (kept through Free to read) and the publishers they hid. Its own query so
 * GET_NEWS_PREFS's callers stay as they are; NewsPrefs merges in the cache
 * (cachePolicies.js), so the two never overwrite each other.
 */
export const GET_NEWS_PUBLISHER_PREFS = gql`
  query NewsPublisherPrefs {
    newsPrefs {
      subscribedSourceIds
      subscribedDomains
      mutedDomains
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

/**
 * Publishers Google News keeps showing us that no source reads directly
 * (plan "Reader-added sources" → Gateway additions). "Check" opens the Add
 * sheet on `https://<domain>`.
 */
export const GET_NEWS_SUGGESTED_SOURCES = gql`
  query NewsSuggestedSources {
    newsSuggestedSources {
      domain
      count
      lastSeenAt
      places {
        id
        name
      }
      sampleTitles
      paywalled
    }
  }
`;

/**
 * Today (`/`): the ranked front page (plan "Ranking: the briefing"). The
 * gateway decides the sections, their order and their caps; each story says
 * which section it landed in for this reader and `why` (chips).
 */
export const GET_NEWS_FRONT_PAGE = gql`
  query NewsFrontPage {
    newsFrontPage {
      generatedAt
      sections {
        key
        title
        moreCount
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
          publisherDomain
          viaAggregator
          alsoIn {
            publisher
            url
            sourceId
          }
          sections
          section
          why
          places {
            id
            name
          }
        }
      }
    }
  }
`;

/** The reader's ring, closest first (Settings → Home places). NewsPrefs merges in the cache. */
export const GET_NEWS_HOME_PLACES = gql`
  query NewsHomePlaces {
    newsPrefs {
      homePlaces {
        ...NewsPlaceFields
      }
    }
  }
  ${PLACE_FIELDS}
`;
