import { gql } from '@apollo/client';

export const GET_STORIES = gql`
  query GetStories($status: String) {
    stories(status: $status) {
      id
      title
      genre
      description
      status
      stats {
        totalInteractions
        totalDiceRolls
        lastActive
      }
      worldState {
        setting
        currentSituation
        mood
        weather
        timeOfDay
      }
      createdAt
      updatedAt
    }
  }
`;

export const GET_STORY = gql`
  query GetStory($id: ID!) {
    story(id: $id) {
      id
      title
      genre
      description
      status
      worldState {
        setting
        currentSituation
        mood
        weather
        timeOfDay
      }
      characters {
        name
        description
        personality
        appearance
        background
        currentState
        isActive
      }
      locations {
        name
        description
        type
        atmosphere
        history
        isDiscovered
      }
      events {
        type
        description
        diceResults {
          diceType
          result
          interpretation
          context
          timestamp
        }
        timestamp
      }
      diceResults {
        diceType
        result
        interpretation
        context
        timestamp
      }
      stats {
        totalInteractions
        totalDiceRolls
        lastActive
      }
      currentLocation {
        name
        description
        atmosphere
      }
      createdAt
      updatedAt
    }
  }
`;
