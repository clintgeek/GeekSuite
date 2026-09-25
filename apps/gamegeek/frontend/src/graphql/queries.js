import { gql } from '@apollo/client';

// Every field here exists in
// apps/basegeek/packages/api/src/graphql/gamegeek/typeDefs.js; CI's
// tools/gql-arg-audit.mjs cross-checks the arguments against it.

/** What a card or a row needs. The detail fragment is a strict superset. */
export const GAME_CARD_FIELDS = gql`
  fragment GameCardFields on Game {
    id
    title
    sortTitle
    releaseYear
    releaseDate
    developers
    coverUrl
    owned
    platformsAvailable
    updatedAt
    copies {
      id
      platform
      format
      storefront
    }
    me {
      shelf
      rating
      progress
      hoursPlayed
      hoursSource
      favorite
      lastPlayedAt
    }
  }
`;

export const GAME_DETAIL_FIELDS = gql`
  fragment GameDetailFields on Game {
    ...GameCardFields
    parentId
    series {
      name
      index
    }
    publishers
    description
    genres
    tags
    autoTags
    modes
    maxLocalPlayers
    timeToBeat {
      main
      extra
      complete
    }
    externalIds {
      igdb
      steamAppId
      rawg
      gog
      epic
    }
    enrichment {
      status
      provider
      providerId
      matchedTitle
      matchedAt
      attempts
      error
      manual
    }
    copies {
      id
      platform
      format
      storefront
      acquiredAt
      notes
      fromPlaynite
      playtimeHours
    }
    source
    createdAt
    me {
      shelf
      rating
      review
      notes
      progress
      hoursPlayed
      hoursSource
      favorite
      lastPlayedAt
      playthroughs {
        id
        startedAt
        finishedAt
        hours
        platform
        difficulty
        completion
        notes
      }
      sessions(limit: 20) {
        id
        playedOn
        minutes
        platform
        note
        createdAt
      }
    }
    household {
      userId
      displayName
      shelf
      rating
      hoursPlayed
    }
  }
  ${GAME_CARD_FIELDS}
`;

/**
 * The library page. Every narrowing travels in `filter` (GameFilterInput,
 * DOCS/TAGS_AND_FILTERS.md §B1); `seed` keeps a shuffle stable across pages;
 * `owned` is the one legacy argument with no filter field, kept for old links.
 */
export const GET_GAMES = gql`
  query GetGames(
    $page: Int
    $limit: Int
    $owned: String
    $sort: String
    $sortDir: String
    $filter: GameFilterInput
    $seed: Int
  ) {
    games(page: $page, limit: $limit, owned: $owned, sort: $sort, sortDir: $sortDir, filter: $filter, seed: $seed) {
      games {
        ...GameCardFields
      }
      total
      page
      pages
    }
  }
  ${GAME_CARD_FIELDS}
`;

/** Live counts for every filter-panel section. Each facet excludes its own selections (server rule). */
export const GET_GAME_FACETS = gql`
  query GetGameFacets($filter: GameFilterInput) {
    gameFacets(filter: $filter) {
      total
      shelves {
        value
        count
      }
      genres {
        value
        count
      }
      tags {
        value
        count
      }
      storefronts {
        value
        count
      }
      platforms {
        value
        count
      }
      formats {
        value
        count
      }
      modes {
        value
        count
      }
      played {
        value
        count
      }
      lengths {
        value
        count
      }
      metadata {
        value
        count
      }
      releaseYears {
        year
        count
      }
      favorites
    }
  }
`;

export const GET_GAME = gql`
  query GetGame($id: ID!) {
    game(id: $id) {
      ...GameDetailFields
    }
  }
  ${GAME_DETAIL_FIELDS}
`;

export const GAME_SHELVES_FIELDS = gql`
  fragment GameShelvesFields on GameShelfStats {
    total
    owned
    unshelved
    shelves {
      shelf
      count
    }
    platforms {
      shelf
      count
    }
  }
`;

export const GET_GAME_SHELVES = gql`
  query GetGameShelves {
    gameShelves {
      ...GameShelvesFields
    }
  }
  ${GAME_SHELVES_FIELDS}
`;

export const GAME_PROFILE_FIELDS = gql`
  fragment GameProfileFields on GameProfile {
    customShelves {
      id
      label
    }
    savedFilters {
      id
      name
      filter
      sortBy
      sortDir
      searchQuery
      shelfFilter
      platformFilter
      ownedFilter
    }
    platformsOwned
    defaultPlatform
    steamId
    lastSteamSyncAt
    playniteLastImportAt
    playniteLastGeneratedAtUtc
    playniteLastTotal
  }
`;

export const GET_GAME_PROFILE = gql`
  query GetGameProfile {
    gameProfile {
      ...GameProfileFields
    }
  }
  ${GAME_PROFILE_FIELDS}
`;

export const GET_GAME_VOCABULARY = gql`
  query GetGameVocabulary {
    gameVocabulary {
      shelves
      platforms
      storefronts
      copyFormats
      modes
      completionLevels
    }
  }
`;
