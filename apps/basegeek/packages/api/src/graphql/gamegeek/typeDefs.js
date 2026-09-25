import { gql } from 'graphql-tag';

// GameGeek — household video game library. Design: DOCS/GameGeekPlan.md.
//
// Tenancy: every query and mutation is scoped by the caller's household
// (`resolveHouseholdId` in @geeksuite/schemas/gamegeek/household). Nothing here
// accepts a householdId from the client.
//
// Split of state: `Game` is the household's catalog entry; `GameMyState` is the
// caller's own shelf/rating/hours for it (`GamePlayer` in Mongo). `me` is null
// until the caller has touched the game.
export const typeDefs = gql`
  type GameSeries {
    name: String
    index: Float
  }

  type GameTimeToBeat {
    main: Float
    extra: Float
    complete: Float
  }

  type GameExternalIds {
    igdb: String
    steamAppId: String
    rawg: String
    gog: String
    epic: String
  }

  type GameCopy {
    id: ID!
    platform: String!
    format: String
    storefront: String
    acquiredAt: Date
    notes: String
    # True when the copy came from a Playnite import (the import updates it by its Playnite id).
    fromPlaynite: Boolean!
    # Playnite's playtime for this copy, in hours (0.1). Null for a copy not from Playnite.
    playtimeHours: Float
  }

  type GamePlaythrough {
    id: ID!
    startedAt: Date
    finishedAt: Date
    hours: Float
    platform: String
    difficulty: String
    completion: String
    notes: String
  }

  type GameSession {
    id: ID!
    playedOn: Date!
    minutes: Int!
    platform: String
    note: String
    createdAt: Date
  }

  type GameMyState {
    shelf: String
    rating: Float
    review: String
    notes: String
    progress: Float
    hoursPlayed: Float
    hoursSource: String
    favorite: Boolean
    lastPlayedAt: Date
    playthroughs: [GamePlaythrough!]!
    # Newest first, capped by the resolver (default 20).
    sessions(limit: Int = 20): [GameSession!]!
  }

  # Another household member's shelf/rating for the same game (never another household).
  type GameHouseholdEntry {
    userId: ID!
    displayName: String
    shelf: String
    rating: Float
    hoursPlayed: Float
  }

  type Game {
    id: ID!
    title: String!
    sortTitle: String
    parentId: ID
    series: GameSeries
    developers: [String!]!
    publishers: [String!]!
    releaseDate: Date
    releaseYear: Int
    description: String
    genres: [String!]!
    # The person's own tags (and Playnite categories).
    tags: [String!]!
    # Enrichment-derived tags from the canonical vocabulary (read-only;
    # apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §A3). Filters read tags ∪ autoTags.
    autoTags: [String!]!
    modes: [String!]!
    maxLocalPlayers: Int
    platformsAvailable: [String!]!
    timeToBeat: GameTimeToBeat
    # Relative URL served by the gamegeek backend, cache-busted by updatedAt. Null = no cover.
    coverUrl: String
    externalIds: GameExternalIds
    # Metadata/cover enrichment record, written by the gamegeek backend
    # (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md). Read-only; null = never tried.
    enrichment: GameEnrichment
    copies: [GameCopy!]!
    owned: Boolean!
    source: String
    createdAt: Date
    updatedAt: Date
    me: GameMyState
    household: [GameHouseholdEntry!]!
  }

  type GameEnrichment {
    # pending | matched | no-match | ambiguous | error | unlinked
    status: String!
    # steam | igdb | rawg
    provider: String
    providerId: String
    # What the provider calls the game — "matched as 'X'".
    matchedTitle: String
    matchedAt: Date
    attempts: Int
    error: String
    # True when a person picked the match (the worker leaves it alone).
    manual: Boolean
  }

  type GamePage {
    games: [Game!]!
    total: Int!
    page: Int!
    pages: Int!
  }

  type GameShelfCount {
    shelf: String!
    count: Int!
  }

  type GameShelfStats {
    total: Int!
    owned: Int!
    # Games in the household the caller has not shelved.
    unshelved: Int!
    shelves: [GameShelfCount!]!
    # Platforms that have at least one copy, with counts (for the platform filter).
    platforms: [GameShelfCount!]!
  }

  type GameCustomShelf {
    id: ID!
    label: String!
  }

  type GameSavedFilter {
    id: ID!
    name: String!
    sortBy: String
    sortDir: String
    searchQuery: String
    shelfFilter: String
    platformFilter: String
    ownedFilter: String
    # The whole GameFilterInput this view was saved with; null for views saved before it existed.
    filter: JSON
  }

  # apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §B1. Every list is any-of.
  input GameFilterInput {
    q: String
    # any-of; "unshelved" allowed
    shelves: [String!]
    genres: [String!]
    # matches tags ∪ autoTags
    tags: [String!]
    # "any" (default) | "all" — applies to genres AND tags
    tagMatch: String
    # any-of over copies.storefront
    storefronts: [String!]
    # any-of over copies.platform
    platforms: [String!]
    # any-of over copies.format (subscription = Game Pass)
    formats: [String!]
    modes: [String!]
    # "never" | "played" | "recent" — the caller's; recent = lastPlayed ≤ 30 days
    played: String
    # the caller's
    favorite: Boolean
    releaseYearMin: Int
    releaseYearMax: Int
    # time-to-beat main: "short" <5h | "medium" 5–15 | "long" 15–40 | "epic" 40+ | "unknown"
    lengths: [String!]
    # enrichment status: matched | no-match | ambiguous | pending | error | unlinked
    metadata: [String!]
    hasCover: Boolean
  }

  type GameFacetValue {
    value: String!
    count: Int!
  }

  type GameYearBucket {
    year: Int!
    count: Int!
  }

  # Each facet's counts apply every active filter EXCEPT its own.
  type GameFacets {
    # games matching the full filter
    total: Int!
    shelves: [GameFacetValue!]!
    genres: [GameFacetValue!]!
    tags: [GameFacetValue!]!
    storefronts: [GameFacetValue!]!
    platforms: [GameFacetValue!]!
    formats: [GameFacetValue!]!
    modes: [GameFacetValue!]!
    # never / played / recent
    played: [GameFacetValue!]!
    lengths: [GameFacetValue!]!
    metadata: [GameFacetValue!]!
    releaseYears: [GameYearBucket!]!
    favorites: Int!
  }

  type GameProfile {
    customShelves: [GameCustomShelf!]!
    savedFilters: [GameSavedFilter!]!
    platformsOwned: [String!]!
    defaultPlatform: String
    # Last Playnite library import: when it ran, when the export was generated, entries in it.
    playniteLastImportAt: Date
    playniteLastGeneratedAtUtc: Date
    playniteLastTotal: Int
  }

  type GameVocabulary {
    shelves: [String!]!
    platforms: [String!]!
    storefronts: [String!]!
    copyFormats: [String!]!
    modes: [String!]!
    completionLevels: [String!]!
  }

  type RemoveGameShelfResult {
    success: Boolean!
    clearedGames: Int!
  }

  input GameSeriesInput {
    name: String
    index: Float
  }

  input GameTimeToBeatInput {
    main: Float
    extra: Float
    complete: Float
  }

  input GameExternalIdsInput {
    igdb: String
    steamAppId: String
    rawg: String
    gog: String
    epic: String
  }

  input GameCopyInput {
    # Omit to add a new copy; pass to keep/edit an existing one. Copies not
    # listed are removed (the array is replaced whole).
    id: ID
    platform: String!
    format: String
    storefront: String
    acquiredAt: Date
    notes: String
  }

  # Catalog fields. On update every field is optional; omitted = unchanged.
  input GameInput {
    title: String
    parentId: ID
    series: GameSeriesInput
    developers: [String!]
    publishers: [String!]
    releaseDate: Date
    description: String
    genres: [String!]
    tags: [String!]
    modes: [String!]
    maxLocalPlayers: Int
    platformsAvailable: [String!]
    timeToBeat: GameTimeToBeatInput
    externalIds: GameExternalIdsInput
    copies: [GameCopyInput!]
    source: String
  }

  # The caller's own state. Omitted = unchanged; explicit null clears.
  input GameStateInput {
    shelf: String
    rating: Float
    review: String
    notes: String
    progress: Float
    hoursPlayed: Float
    favorite: Boolean
  }

  input GameSessionInput {
    playedOn: Date!
    minutes: Int!
    platform: String
    note: String
  }

  input GamePlaythroughInput {
    id: ID
    startedAt: Date
    finishedAt: Date
    hours: Float
    platform: String
    difficulty: String
    completion: String
    notes: String
  }

  input GameProfileInput {
    platformsOwned: [String!]
    defaultPlatform: String
  }

  input GameSavedFilterInput {
    id: ID
    name: String!
    sortBy: String
    sortDir: String
    searchQuery: String
    shelfFilter: String
    platformFilter: String
    ownedFilter: String
    # The whole GameFilterInput, validated like the games query's filter.
    filter: JSON
  }

  extend type Query {
    # sort: title | dateAdded | releaseDate | rating | lastPlayed | hoursPlayed | timeToBeat | random
    # (rating/lastPlayed/hoursPlayed are the CALLER's values; timeToBeat is main,
    # nulls last; random is ordered by seed, stable across pages). sortDir: asc | desc.
    # shelf: a shelf id, or "unshelved". owned: "true" | "false" | omitted.
    # filter is additive and wins where both it and q/shelf/platform are given.
    games(
      page: Int = 1
      limit: Int = 48
      q: String
      shelf: String
      platform: String
      owned: String
      sort: String = "title"
      sortDir: String = "asc"
      filter: GameFilterInput
      seed: Int
    ): GamePage!
    gameFacets(filter: GameFilterInput): GameFacets!
    game(id: ID!): Game
    gameShelves: GameShelfStats!
    gameProfile: GameProfile!
    gameVocabulary: GameVocabulary!
  }

  extend type Mutation {
    # Creates the household game AND the caller's state row (shelf defaults to "backlog").
    createGame(input: GameInput!, shelf: String): Game!
    updateGame(id: ID!, input: GameInput!): Game!
    # Deletes the household game and every member's state for it.
    deleteGame(id: ID!): DeleteResponse!
    setGameState(gameId: ID!, input: GameStateInput!): Game!
    logGameSession(gameId: ID!, input: GameSessionInput!): Game!
    deleteGameSession(gameId: ID!, sessionId: ID!): Game!
    saveGamePlaythrough(gameId: ID!, input: GamePlaythroughInput!): Game!
    deleteGamePlaythrough(gameId: ID!, playthroughId: ID!): Game!
    saveGameProfile(input: GameProfileInput!): GameProfile!
    addGameShelf(label: String!): GameProfile!
    removeGameShelf(id: ID!): RemoveGameShelfResult!
    saveGameFilter(input: GameSavedFilterInput!): GameProfile!
    deleteGameFilter(id: ID!): GameProfile!
  }
`;
