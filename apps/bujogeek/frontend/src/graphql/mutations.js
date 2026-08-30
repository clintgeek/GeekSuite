import { gql } from '@apollo/client';



export const CREATE_JOURNAL_FROM_TEMPLATE = gql`
    mutation CreateJournalFromTemplate($templateId: ID!, $date: Date) {
        createJournalFromTemplate(templateId: $templateId, date: $date) {
            id
            title
            content
            type
            date
            tags
            status
            preview
            createdAt
            updatedAt
        }
    }
`;

export const CREATE_TEMPLATE = gql`
    mutation CreateTemplate($name: String!, $description: String, $type: String, $content: String!, $isDefault: Boolean, $isPublic: Boolean, $tags: [String]) {
        createTemplate(name: $name, description: $description, type: $type, content: $content, isDefault: $isDefault, isPublic: $isPublic, tags: $tags) {
            id
            name
        }
    }
`;

export const UPDATE_TEMPLATE = gql`
    mutation UpdateTemplate($id: ID!, $name: String, $description: String, $type: String, $content: String, $isDefault: Boolean, $isPublic: Boolean, $tags: [String]) {
        updateTemplate(id: $id, name: $name, description: $description, type: $type, content: $content, isDefault: $isDefault, isPublic: $isPublic, tags: $tags) {
            id
            name
        }
    }
`;

export const DELETE_TEMPLATE = gql`
    mutation DeleteTemplate($id: ID!) {
        deleteTemplate(id: $id) {
            success
            message
        }
    }
`;

export const CREATE_COLLECTION = gql`
  mutation CreateCollection($name: String!, $description: String) {
    createCollection(name: $name, description: $description) {
      id
      name
      description
      archived
      taskCount
      completedCount
    }
  }
`;

export const UPDATE_COLLECTION = gql`
  mutation UpdateCollection($id: ID!, $name: String, $description: String, $archived: Boolean) {
    updateCollection(id: $id, name: $name, description: $description, archived: $archived) {
      id
      name
      description
      archived
      taskCount
      completedCount
    }
  }
`;

export const DELETE_COLLECTION = gql`
  mutation DeleteCollection($id: ID!, $deleteTasks: Boolean) {
    deleteCollection(id: $id, deleteTasks: $deleteTasks) {
      success
      message
    }
  }
`;

export const CREATE_TASK = gql`
  mutation CreateTask($content: String!, $signifier: String, $status: String, $priority: Int, $tags: [String], $dueDate: Date, $createdAt: Date, $updatedAt: Date, $note: String, $recurrenceRule: String, $isSeriesMaster: Boolean, $collectionId: ID) {
    createTask(content: $content, signifier: $signifier, status: $status, priority: $priority, tags: $tags, dueDate: $dueDate, createdAt: $createdAt, updatedAt: $updatedAt, note: $note, recurrenceRule: $recurrenceRule, isSeriesMaster: $isSeriesMaster, collectionId: $collectionId) {
      id
      content
      signifier
      status
      priority
      note
      tags
      dueDate
      originalDate
      originalDueDate
      migratedFrom
      migratedTo
      isBacklog
      taskType
      recurrencePattern
      recurrenceRule
      seriesId
      isSeriesMaster
      collectionId
      createdAt
      updatedAt
      parentTask {
        id
      }
      subtasks {
        id
      }
    }
  }
`;

export const UPDATE_TASK = gql`
  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!, $editScope: EditScope) {
    updateTask(id: $id, input: $input, editScope: $editScope) {
      id
      content
      signifier
      status
      priority
      note
      tags
      dueDate
      originalDate
      originalDueDate
      migratedFrom
      migratedTo
      isBacklog
      taskType
      recurrencePattern
      recurrenceRule
      seriesId
      isSeriesMaster
      collectionId
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_TASK = gql`
  mutation DeleteTask($id: ID!, $editScope: EditScope) {
    deleteTask(id: $id, editScope: $editScope) {
      success
      message
    }
  }
`;

export const UPDATE_TASK_STATUS = gql`
  mutation UpdateTaskStatus($id: ID!, $status: String!) {
    updateTaskStatus(id: $id, status: $status) {
      id
      content
      signifier
      status
      completedAt
      cancelledAt
      priority
      note
      tags
      dueDate
      originalDate
      migratedFrom
      migratedTo
      isBacklog
      taskType
      createdAt
      updatedAt
    }
  }
`;

export const MIGRATE_TASK_TO_FUTURE = gql`
  mutation MigrateTaskToFuture($id: ID!, $futureDate: Date!) {
    migrateTaskToFuture(id: $id, futureDate: $futureDate) {
      id
      content
      signifier
      status
      priority
      note
      tags
      dueDate
      originalDate
      migratedFrom
      migratedTo
      isBacklog
      taskType
      createdAt
      updatedAt
    }
  }
`;

export const SAVE_DAILY_TASK_ORDER = gql`
  mutation SaveDailyTaskOrder($dateKey: String!, $orderedTaskIds: [ID!]!) {
    saveDailyTaskOrder(dateKey: $dateKey, orderedTaskIds: $orderedTaskIds) {
      success
      updatedAt
    }
  }
`;

export const CREATE_JOURNAL_ENTRY = gql`
  mutation CreateJournalEntry($title: String!, $content: String!, $type: String, $date: Date, $tags: [String], $status: String) {
    createJournalEntry(title: $title, content: $content, type: $type, date: $date, tags: $tags, status: $status) {
      id
      title
      content
      type
      date
      tags
      status
      preview
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_JOURNAL_ENTRY = gql`
  mutation UpdateJournalEntry($id: ID!, $title: String, $content: String, $type: String, $date: Date, $tags: [String], $status: String) {
    updateJournalEntry(id: $id, title: $title, content: $content, type: $type, date: $date, tags: $tags, status: $status) {
      id
      title
      content
      type
      date
      tags
      status
      preview
      createdAt
      updatedAt
    }
  }
`;

export const DELETE_JOURNAL_ENTRY = gql`
  mutation DeleteJournalEntry($id: ID!) {
    deleteJournalEntry(id: $id) {
      success
      message
    }
  }
`;

export const CREATE_HABIT = gql`
  mutation CreateHabit($name: String!, $daysOfWeek: [Int!], $color: String) {
    createHabit(name: $name, daysOfWeek: $daysOfWeek, color: $color) {
      id
      name
      daysOfWeek
      color
      archived
      currentStreak
    }
  }
`;

export const UPDATE_HABIT = gql`
  mutation UpdateHabit($id: ID!, $name: String, $daysOfWeek: [Int!], $color: String, $archived: Boolean) {
    updateHabit(id: $id, name: $name, daysOfWeek: $daysOfWeek, color: $color, archived: $archived) {
      id
      name
      daysOfWeek
      color
      archived
      currentStreak
    }
  }
`;

export const DELETE_HABIT = gql`
  mutation DeleteHabit($id: ID!) {
    deleteHabit(id: $id) {
      success
      message
    }
  }
`;

export const TOGGLE_HABIT_LOG = gql`
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
        currentStreak
      }
    }
  }
`;
