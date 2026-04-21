import { gql } from '@apollo/client';

export const DASH_BUJO_SUMMARY = gql`
  query DashBujoSummary($date: String) {
    dashBujoSummary(date: $date) {
      date
      openTasks
      completedToday
      totalTasks
      upcomingEvents {
        id
        content
        type
        status
        date
      }
    }
  }
`;

export const DASH_RECENT_NOTES = gql`
  query DashRecentNotes($limit: Int) {
    dashRecentNotes(limit: $limit) {
      id
      title
      updatedAt
      tags
      snippet
    }
  }
`;

export const DASH_BOOK_PROGRESS = gql`
  query DashBookProgress {
    dashBookProgress {
      id
      title
      authors
      status
      currentPage
      totalPages
      percentComplete
      coverUrl
    }
  }
`;

export const DASH_NUTRITION_SUMMARY = gql`
  query DashNutritionSummary($date: String) {
    dashNutritionSummary(date: $date) {
      date
      calories
      protein
      carbs
      fat
      calorieGoal
      mealsLogged
    }
  }
`;

export const DASH_WEIGHT_TREND = gql`
  query DashWeightTrend($days: Int) {
    dashWeightTrend(days: $days) {
      entries {
        date
        weight
      }
      direction
      changeFromFirst
    }
  }
`;

export const DASH_FLOCK_STATUS = gql`
  query DashFlockStatus {
    dashFlockStatus {
      activeBirds
      totalBirds
      todayEggs
      weekEggs
      activePairings
      activeHatches
    }
  }
`;

export const DASH_SEARCH = gql`
  query DashSearch($query: String!, $apps: [String], $limit: Int) {
    dashSearch(query: $query, apps: $apps, limit: $limit) {
      id
      app
      type
      title
      snippet
      url
      updatedAt
      score
    }
  }
`;

export const DASH_WEEKLY_DIGEST = gql`
  query DashWeeklyDigest($weekStart: String) {
    dashWeeklyDigest(weekStart: $weekStart) {
      weekStart
      weekEnd
      bujo { tasksCompleted tasksCreated completionRate }
      books { booksFinished pagesRead currentlyReading }
      fitness { avgCalories avgProtein weightChange daysLogged }
      flock { totalEggs avgEggsPerDay hatchEvents chicksHatched }
      notes { notesCreated notesUpdated topTags }
      aiSummary
    }
  }
`;
