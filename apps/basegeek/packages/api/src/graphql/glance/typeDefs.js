import { gql } from 'graphql-tag';

export const typeDefs = gql`
  """Everything the StartGeek front page needs, in one round-trip."""
  type GlanceToday {
    date: String!
    tasks: GlanceTasks!
    habits: [GlanceHabit!]!
    recentNotes: [GlanceNote!]!
    reading: [GlanceBook!]!
    fitness: GlanceFitness
    flock: GlanceFlock
  }

  type GlanceTasks {
    due: [GlanceTask!]!
    overdue: [GlanceTask!]!
    events: [GlanceTask!]!
    completedCount: Int!
    blockedCount: Int!
  }

  type GlanceTask {
    id: ID!
    content: String!
    signifier: String
    status: String!
    priority: Int
    dueDate: Date
    tags: [String!]!
  }

  type GlanceHabit {
    id: ID!
    name: String!
    color: String
    doneToday: Boolean!
    currentStreak: Int!
  }

  type GlanceNote {
    id: ID!
    title: String!
    type: String!
    tags: [String!]!
    updatedAt: Date!
    snippet: String
  }

  type GlanceBook {
    id: ID!
    title: String!
    authors: [String!]!
    readingProgress: Int
    pageCount: Int
    coverPath: String
  }

  type GlanceFitness {
    calories: Float
    calorieGoal: Float
    mealsLogged: Int!
    loginStreak: Int
  }

  type GlanceFlock {
    activeBirds: Int!
    todayEggs: Int!
    weekEggs: Int!
  }

  type GlanceSearchResult {
    id: ID!
    app: String!
    type: String!
    title: String!
    snippet: String
    url: String!
    updatedAt: Date
  }

  extend type Query {
    glanceToday(date: String): GlanceToday!
    glanceSearch(query: String!, limit: Int = 12): [GlanceSearchResult!]!
  }
`;
