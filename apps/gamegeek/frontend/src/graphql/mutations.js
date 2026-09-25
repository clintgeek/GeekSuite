import { gql } from '@apollo/client';
import { GAME_DETAIL_FIELDS, GAME_PROFILE_FIELDS } from './queries';

// Every Game-returning mutation selects the full detail fragment, so the
// normalized `Game:<id>` entry never loses a field a mounted view still reads.

export const CREATE_GAME = gql`
  mutation CreateGame($input: GameInput!, $shelf: String) {
    createGame(input: $input, shelf: $shelf) {
      ...GameDetailFields
    }
  }
  ${GAME_DETAIL_FIELDS}
`;

export const CREATE_GAMES = gql`
  mutation CreateGames($inputs: [GameInput!]!, $shelf: String) {
    createGames(inputs: $inputs, shelf: $shelf) {
      id
      title
    }
  }
`;

export const UPDATE_GAME = gql`
  mutation UpdateGame($id: ID!, $input: GameInput!) {
    updateGame(id: $id, input: $input) {
      ...GameDetailFields
    }
  }
  ${GAME_DETAIL_FIELDS}
`;

export const DELETE_GAME = gql`
  mutation DeleteGame($id: ID!) {
    deleteGame(id: $id) {
      success
      message
    }
  }
`;

export const SET_GAME_STATE = gql`
  mutation SetGameState($gameId: ID!, $input: GameStateInput!) {
    setGameState(gameId: $gameId, input: $input) {
      ...GameDetailFields
    }
  }
  ${GAME_DETAIL_FIELDS}
`;

export const LOG_GAME_SESSION = gql`
  mutation LogGameSession($gameId: ID!, $input: GameSessionInput!) {
    logGameSession(gameId: $gameId, input: $input) {
      ...GameDetailFields
    }
  }
  ${GAME_DETAIL_FIELDS}
`;

export const DELETE_GAME_SESSION = gql`
  mutation DeleteGameSession($gameId: ID!, $sessionId: ID!) {
    deleteGameSession(gameId: $gameId, sessionId: $sessionId) {
      ...GameDetailFields
    }
  }
  ${GAME_DETAIL_FIELDS}
`;

export const SAVE_GAME_PLAYTHROUGH = gql`
  mutation SaveGamePlaythrough($gameId: ID!, $input: GamePlaythroughInput!) {
    saveGamePlaythrough(gameId: $gameId, input: $input) {
      ...GameDetailFields
    }
  }
  ${GAME_DETAIL_FIELDS}
`;

export const DELETE_GAME_PLAYTHROUGH = gql`
  mutation DeleteGamePlaythrough($gameId: ID!, $playthroughId: ID!) {
    deleteGamePlaythrough(gameId: $gameId, playthroughId: $playthroughId) {
      ...GameDetailFields
    }
  }
  ${GAME_DETAIL_FIELDS}
`;

export const SAVE_GAME_PROFILE = gql`
  mutation SaveGameProfile($input: GameProfileInput!) {
    saveGameProfile(input: $input) {
      ...GameProfileFields
    }
  }
  ${GAME_PROFILE_FIELDS}
`;

export const ADD_GAME_SHELF = gql`
  mutation AddGameShelf($label: String!) {
    addGameShelf(label: $label) {
      ...GameProfileFields
    }
  }
  ${GAME_PROFILE_FIELDS}
`;

export const REMOVE_GAME_SHELF = gql`
  mutation RemoveGameShelf($id: ID!) {
    removeGameShelf(id: $id) {
      success
      clearedGames
    }
  }
`;

export const SAVE_GAME_FILTER = gql`
  mutation SaveGameFilter($input: GameSavedFilterInput!) {
    saveGameFilter(input: $input) {
      ...GameProfileFields
    }
  }
  ${GAME_PROFILE_FIELDS}
`;

export const DELETE_GAME_FILTER = gql`
  mutation DeleteGameFilter($id: ID!) {
    deleteGameFilter(id: $id) {
      ...GameProfileFields
    }
  }
  ${GAME_PROFILE_FIELDS}
`;
