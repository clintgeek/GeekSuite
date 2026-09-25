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
    tags: [String!]!
    modes: [String!]!
    maxLocalPlayers: Int
    platformsAvailable: [String!]!
    timeToBeat: GameTimeToBeat
    # Relative URL served by the gamegeek backend, cache-busted by updatedAt. Null = no cover.
    coverUrl: String
    externalIds: GameExternalIds
    copies: [GameCopy!]!
    owned: Boolean!
    source: String
    createdAt: Date
    updatedAt: Date
    me: GameMyState
    household: [GameHouseholdEntry!]!
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
  }

  type GameProfile {
    customShelves: [GameCustomShelf!]!
    savedFilters: [GameSavedFilter!]!
    platformsOwned: [String!]!
    defaultPlatform: String
    steamId: String
    lastSteamSyncAt: Date
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
    steamId: String
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
  }

  extend type Query {
    # sort: title | dateAdded | releaseDate | rating | lastPlayed | hoursPlayed
    # (rating/lastPlayed/hoursPlayed are the CALLER's values). sortDir: asc | desc.
    # shelf: a shelf id, or "unshelved". owned: "true" | "false" | omitted.
    games(
      page: Int = 1
      limit: Int = 48
      q: String
      shelf: String
      platform: String
      owned: String
      sort: String = "title"
      sortDir: String = "asc"
    ): GamePage!
    game(id: ID!): Game
    gameShelves: GameShelfStats!
    gameProfile: GameProfile!
    gameVocabulary: GameVocabulary!
  }

  extend type Mutation {
    # Creates the household game AND the caller's state row (shelf defaults to "backlog").
    createGame(input: GameInput!, shelf: String): Game!
    # Bulk add (paste-a-list, sample seeding). Max 200. Skips titles that already
    # exist in the household (case-insensitive exact title match) and returns only created games.
    createGames(inputs: [GameInput!]!, shelf: String): [Game!]!
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
