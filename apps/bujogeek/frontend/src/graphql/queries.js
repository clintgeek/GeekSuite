import { gql } from '@apollo/client';



export const GET_JOURNAL_ENTRY = gql`
    query GetJournalEntry($id: ID!) {
        journalEntry(id: $id) {
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

export const GET_TEMPLATES = gql`
    query GetTemplates($type: String, $isDefault: Boolean) {
        templates(type: $type, isDefault: $isDefault) {
            id
            name
            description
            type
            content
            isDefault
            isPublic
            tags
            variables {
                name
                type
                defaultValue
                required
            }
            createdAt
            updatedAt
            lastUsed
            preview
        }
    }
`;

export const GET_TEMPLATE = gql`
    query GetTemplate($id: ID!) {
        template(id: $id) {
            id
            name
            description
            type
            content
            isDefault
            isPublic
            tags
            variables {
                name
                type
                defaultValue
                required
            }
            createdAt
            updatedAt
            lastUsed
            preview
        }
    }
`;




export const GET_TASKS = gql`
  query GetTasks($status: String, $tags: [String]) {
    tasks(status: $status, tags: $tags) {
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
        content
        status
      }
      subtasks {
        id
        status
      }
    }
  }
`;

export const GET_ALL_TASKS = gql`
  query GetAllTasks {
    allTasks {
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
        content
        status
      }
      subtasks {
        id
        status
      }
    }
  }
`;

export const GET_DAILY_TASKS = gql`
  query GetDailyTasks($date: String) {
    dailyTasks(date: $date) {
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
        content
        status
      }
      subtasks {
        id
        status
      }
    }
  }
`;

export const GET_WEEKLY_TASKS = gql`
  query GetWeeklyTasks($date: String) {
    weeklyTasks(date: $date) {
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
        content
        status
      }
      subtasks {
        id
        status
      }
    }
  }
`;

export const GET_MONTHLY_TASKS = gql`
  query GetMonthlyTasks($startDate: String, $endDate: String) {
    monthlyTasks(startDate: $startDate, endDate: $endDate) {
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
        content
        status
      }
      subtasks {
        id
        status
      }
    }
  }
`;

export const GET_JOURNAL_ENTRIES = gql`
  query GetJournalEntries($type: String, $tags: [String]) {
    journalEntries(type: $type, tags: $tags) {
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

export const GET_TASK_TAGS = gql`
  query GetTaskTags {
    taskTags {
      tag
      count
    }
  }
`;

export const GET_TASKS_BY_TAG = gql`
    query GetTasksByTag($tag: String!) {
        tasksByTag(tag: $tag) {
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
            completedAt
            createdAt
            updatedAt
        }
    }
`;
