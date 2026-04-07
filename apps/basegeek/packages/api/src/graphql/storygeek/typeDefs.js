import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type StoryCharacter {
    name: String!
    description: String!
    personality: String
    appearance: String
    background: String
    currentState: String
    isActive: Boolean!
  }

  type StoryLocation {
    name: String!
    description: String!
    type: String
    atmosphere: String
    history: String
    isDiscovered: Boolean!
  }

  type DiceResult {
    diceType: String!
    result: Int!
    interpretation: String!
    context: String
    timestamp: Date
  }

  type StoryEvent {
    type: String!
    description: String!
    diceResults: [DiceResult!]
    timestamp: Date
  }

  type WorldState {
    setting: String
    currentSituation: String
    mood: String
    weather: String
    timeOfDay: String
  }

  type StoryStats {
    totalInteractions: Int!
    totalDiceRolls: Int!
    lastActive: Date
  }

  type CurrentLocation {
    name: String
    description: String
    atmosphere: String
  }

  type Story {
    id: ID!
    userId: ID!
    title: String!
    genre: String!
    description: String
    worldState: WorldState
    characters: [StoryCharacter!]!
    locations: [StoryLocation!]!
    diceResults: [DiceResult!]!
    events: [StoryEvent!]!
    stats: StoryStats
    status: String!
    currentLocation: CurrentLocation
    createdAt: Date!
    updatedAt: Date!
  }

  type Query {
    stories(status: String): [Story!]!
    story(id: ID!): Story
  }

  type Mutation {
    createStory(title: String!, genre: String!, description: String): Story!
    updateStoryStatus(id: ID!, status: String!): Story!
    deleteStory(id: ID!): Boolean!
  }
`;
