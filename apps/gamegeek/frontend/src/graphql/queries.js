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
    copies {
      id
      platform
      format
      storefront
      acquiredAt
      notes
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

export const GET_GAMES = gql`
  query GetGames(
    $page: Int
    $limit: Int
    $q: String
    $shelf: String
    $platform: String
    $owned: String
    $sort: String
    $sortDir: String
  ) {
    games(
      page: $page
      limit: $limit
      q: $q
      shelf: $shelf
      platform: $platform
      owned: $owned
      sort: $sort
      sortDir: $sortDir
    ) {
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
