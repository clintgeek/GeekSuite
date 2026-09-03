export const GLANCE_TODAY = `
  query GlanceToday($date: String) {
    glanceToday(date: $date) {
      date
      tasks {
        due {
          id
          content
          signifier
          status
          priority
          dueDate
          tags
        }
        overdue {
          id
          content
          signifier
          status
          priority
          dueDate
          tags
        }
        events {
          id
          content
          signifier
          status
          priority
          dueDate
          tags
        }
        upcoming {
          id
          content
          signifier
          status
          priority
          dueDate
          tags
        }
        completedCount
        blockedCount
      }
      reading {
        id
        title
        authors
        readingProgress
        pageCount
        coverPath
      }
      fitness {
        calories
        calorieGoal
        mealsLogged
        loginStreak
      }
    }
  }
`

export const GLANCE_SEARCH = `
  query GlanceSearch($query: String!, $limit: Int) {
    glanceSearch(query: $query, limit: $limit) {
      id
      app
      type
      title
      snippet
      url
      updatedAt
    }
  }
`

export const CREATE_TASK = `
  mutation CreateTask(
    $content: String!
    $signifier: String
    $priority: Int
    $tags: [String]
    $dueDate: Date
    $note: String
    $recurrenceRule: String
  ) {
    createTask(
      content: $content
      signifier: $signifier
      priority: $priority
      tags: $tags
      dueDate: $dueDate
      note: $note
      recurrenceRule: $recurrenceRule
    ) {
      id
      content
      status
      dueDate
      tags
    }
  }
`

export const BLOCK_TASK = `
  mutation BlockTask($id: ID!, $reason: String) {
    blockTask(id: $id, reason: $reason) {
      id
      status
      blockedReason
    }
  }
`

export const CREATE_NOTE = `
  mutation CreateNote(
    $title: String
    $content: String!
    $type: String
    $tags: [String!]
  ) {
    createNote(
      title: $title
      content: $content
      type: $type
      tags: $tags
    ) {
      id
      title
      content
      type
      tags
      updatedAt
    }
  }
`

export const UPDATE_TASK_STATUS = `
  mutation UpdateTaskStatus($id: ID!, $status: String!) {
    updateTaskStatus(id: $id, status: $status) {
      id
      status
    }
  }
`

export const TOGGLE_HABIT_LOG = `
  mutation ToggleHabitLog($habitId: ID!, $date: String!) {
    toggleHabitLog(habitId: $habitId, date: $date) {
      done
      log {
        id
        habitId
        date
      }
      habit {
        id
        name
        color
      }
    }
  }
`
