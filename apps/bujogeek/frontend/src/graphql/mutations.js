import { gql } from '@apollo/client';

export const CREATE_TASK = gql`
  mutation CreateTask($content: String!, $signifier: String, $status: String, $priority: Int, $tags: [String], $dueDate: Date, $createdAt: Date, $updatedAt: Date) {
    createTask(content: $content, signifier: $signifier, status: $status, priority: $priority, tags: $tags, dueDate: $dueDate, createdAt: $createdAt, updatedAt: $updatedAt) {
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
  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
    updateTask(id: $id, input: $input) {
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

export const DELETE_TASK = gql`
  mutation DeleteTask($id: ID!) {
    deleteTask(id: $id) {
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
