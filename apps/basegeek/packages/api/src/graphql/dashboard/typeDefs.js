import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type DashBujoSummary {
    date: String!
    openTasks: Int!
    completedToday: Int!
    totalTasks: Int!
    upcomingEvents: [DashBujoEntry]
  }

  type DashBujoEntry {
    id: ID!
    content: String!
    type: String
    status: String
    date: String
  }

  type DashRecentNote {
    id: ID!
    title: String!
    updatedAt: Date
    tags: [String]
    snippet: String
  }

  type DashBookProgress {
    id: ID!
    title: String!
    authors: [String]
    status: String
    currentPage: Int
    totalPages: Int
    percentComplete: Float
    coverUrl: String
  }

  type DashNutritionSummary {
    date: String!
    calories: Float
    protein: Float
    carbs: Float
    fat: Float
    calorieGoal: Float
    mealsLogged: Int
  }

  type DashWeightTrend {
    entries: [DashWeightEntry]
    direction: String
    changeFromFirst: Float
  }

  type DashWeightEntry {
    date: String!
    weight: Float!
  }

  type DashFlockStatus {
    activeBirds: Int!
    totalBirds: Int!
    todayEggs: Int
    weekEggs: Int
    activePairings: Int
    activeHatches: Int
  }

  type DashSearchResult {
    id: ID!
    app: String!
    type: String!
    title: String!
    snippet: String
    url: String!
    updatedAt: Date
    score: Float
  }

  type DashWeeklyDigest {
    weekStart: String!
    weekEnd: String!
    bujo: DashBujoDigest
    books: DashBookDigest
    fitness: DashFitnessDigest
    flock: DashFlockDigest
    notes: DashNoteDigest
    aiSummary: String
  }

  type DashBujoDigest {
    tasksCompleted: Int
    tasksCreated: Int
    completionRate: Float
  }

  type DashBookDigest {
    booksFinished: Int
    pagesRead: Int
    currentlyReading: [String]
  }

  type DashFitnessDigest {
    avgCalories: Float
    avgProtein: Float
    weightChange: Float
    daysLogged: Int
  }

  type DashFlockDigest {
    totalEggs: Int
    avgEggsPerDay: Float
    hatchEvents: Int
    chicksHatched: Int
  }

  type DashNoteDigest {
    notesCreated: Int
    notesUpdated: Int
    topTags: [String]
  }

  extend type Query {
    dashBujoSummary(date: String): DashBujoSummary
    dashRecentNotes(limit: Int): [DashRecentNote]
    dashBookProgress: [DashBookProgress]
    dashNutritionSummary(date: String): DashNutritionSummary
    dashWeightTrend(days: Int): DashWeightTrend
    dashFlockStatus: DashFlockStatus
    dashSearch(query: String!, apps: [String], limit: Int): [DashSearchResult]
    dashWeeklyDigest(weekStart: String): DashWeeklyDigest
  }
`;
