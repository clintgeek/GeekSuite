import { gql } from '@apollo/client';
import { TASK_FAMILY, TEMPLATE_FIELDS } from './queries';



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

// Both select the full card/apply shape (TEMPLATE_FIELDS). They used to return
// `{ id, name }`, which TemplateContext then spliced into its list — so a newly
// created template had no `content` and applying it created nothing, and an
// edited one lost its body until the next page load.
export const CREATE_TEMPLATE = gql`
    mutation CreateTemplate($name: String!, $description: String, $type: String, $content: String!, $isDefault: Boolean, $isPublic: Boolean, $tags: [String]) {
        createTemplate(name: $name, description: $description, type: $type, content: $content, isDefault: $isDefault, isPublic: $isPublic, tags: $tags) {
            ...TemplateFields
        }
    }
    ${TEMPLATE_FIELDS}
`;

export const UPDATE_TEMPLATE = gql`
    mutation UpdateTemplate($id: ID!, $name: String, $description: String, $type: String, $content: String, $isDefault: Boolean, $isPublic: Boolean, $tags: [String]) {
        updateTemplate(id: $id, name: $name, description: $description, type: $type, content: $content, isDefault: $isDefault, isPublic: $isPublic, tags: $tags) {
            ...TemplateFields
        }
    }
    ${TEMPLATE_FIELDS}
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
      blockedReason
      blockedAt
      taskType
      recurrencePattern
      recurrenceRule
      seriesId
      isSeriesMaster
      collectionId
      createdAt
      updatedAt
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
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
      blockedReason
      blockedAt
      taskType
      recurrencePattern
      recurrenceRule
      seriesId
      isSeriesMaster
      collectionId
      createdAt
      updatedAt
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
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
      blockedReason
      blockedAt
      taskType
      createdAt
      updatedAt
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
`;

/**
 * Park a task. `reason` is optional (280 chars max, enforced by the gateway);
 * re-blocking an already-blocked task rewrites the reason and keeps the
 * original `blockedAt`, so "parked since" never drifts.
 */
export const BLOCK_TASK = gql`
  mutation BlockTask($id: ID!, $reason: String) {
    blockTask(id: $id, reason: $reason) {
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
      blockedReason
      blockedAt
      taskType
      createdAt
      updatedAt
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
`;

/** Un-park a task: back to `pending`, blocked fields cleared, dueDate untouched. */
export const UNBLOCK_TASK = gql`
  mutation UnblockTask($id: ID!) {
    unblockTask(id: $id) {
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
      blockedReason
      blockedAt
      taskType
      createdAt
      updatedAt
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
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
      blockedReason
      blockedAt
      taskType
      createdAt
      updatedAt
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
`;

/**
 * Add a step to an entry. The gateway creates an ordinary task carrying
 * `parentTask` and appends it to the parent's ordered list, so the returned
 * child plus a `cache.modify` on the parent is all a list needs.
 */
export const ADD_SUBTASK = gql`
  mutation AddSubtask($parentId: ID!, $content: String!, $signifier: String, $priority: Int, $tags: [String], $dueDate: Date) {
    addSubtask(parentId: $parentId, content: $content, signifier: $signifier, priority: $priority, tags: $tags, dueDate: $dueDate) {
      id
      content
      signifier
      status
      priority
      note
      tags
      dueDate
      originalDate
      taskType
      collectionId
      completedAt
      cancelledAt
      createdAt
      updatedAt
      parentTask {
        id
        content
        status
      }
    }
  }
`;

/**
 * Rewrite the order of an entry's steps. Must name every child exactly once —
 * the gateway rejects a partial list rather than dropping the remainder — and
 * returns the parent with its steps in the new order.
 */
export const REORDER_SUBTASKS = gql`
  mutation ReorderSubtasks($parentId: ID!, $orderedSubtaskIds: [ID!]!) {
    reorderSubtasks(parentId: $parentId, orderedSubtaskIds: $orderedSubtaskIds) {
      id
      status
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
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
  mutation CreateJournalEntry($title: String!, $content: String!, $type: String, $date: Date, $tags: [String], $status: String, $aiDrafted: Boolean) {
    createJournalEntry(title: $title, content: $content, type: $type, date: $date, tags: $tags, status: $status, aiDrafted: $aiDrafted) {
      id
      title
      content
      type
      date
      tags
      status
      preview
      aiDrafted
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

export const SAVE_PUSH_SUBSCRIPTION = gql`
  mutation SavePushSubscription($input: PushSubscriptionInput!) {
    savePushSubscription(input: $input) {
      id
      endpoint
    }
  }
`;

export const REMOVE_PUSH_SUBSCRIPTION = gql`
  mutation RemovePushSubscription($endpoint: String!) {
    removePushSubscription(endpoint: $endpoint) {
      success
    }
  }
`;
