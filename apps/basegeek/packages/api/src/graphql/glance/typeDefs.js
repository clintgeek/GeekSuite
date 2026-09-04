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
    upcoming: [GlanceTask!]!           # pending, dueDate after the day — next 20
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
    lastActivity: GlanceLastActivity
  }

  type GlanceLastActivity {
    activityName: String
    activityType: String
    startTimeLocal: String
    calories: Float
    duration: Float
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

  input CalendarSourceInput {
    url: String!
    color: String
  }

  type CalendarEvent {
    id: String!
    summary: String
    start: Date
    end: Date
    isFullDay: Boolean!
    color: String
    calendarUrl: String
  }

  extend type Query {
    glanceToday(date: String): GlanceToday!
    glanceSearch(query: String!, limit: Int = 12): [GlanceSearchResult!]!
    calendarEvents(sources: [CalendarSourceInput!]!, from: Date, to: Date): [CalendarEvent!]!
  }
`;
