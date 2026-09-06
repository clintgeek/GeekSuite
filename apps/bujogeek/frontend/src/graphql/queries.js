import { gql } from '@apollo/client';

/**
 * TASK_FAMILY — the parent/child link, selected as one piece so the five log
 * queries and every task mutation payload agree on its shape.
 *
 * Two rules are baked in:
 *   - A child is selected in full, because an expanded row renders it as a
 *     real entry (content, signifier, priority, tags, its own due date) and
 *     the `2/5` chip counts statuses out of this same array.
 *   - A child selects no `subtasks` of its own. Nesting stops at one level in
 *     the gateway, and a self-referential fragment would not terminate.
 *
 * Selecting it on a mutation payload is what keeps the normalised cache
 * honest: a completed child comes back inside its parent's array, so every
 * cached copy of that parent updates itself.
 */
export const TASK_FAMILY = gql`
  fragment TaskFamily on Task {
    parentTask {
      id
      content
      status
    }
    subtasks {
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
      completedAt
      cancelledAt
      createdAt
      updatedAt
    }
  }
`;



/**
 * TEMPLATE_FIELDS — everything a template card and the Apply dialog read.
 *
 * Shared with `createTemplate` / `updateTemplate` in `mutations.js` on
 * purpose: `TemplateContext` splices a mutation result straight into its
 * `templates` array, and those two mutations used to select only `{ id, name }`.
 * A freshly created template therefore entered the list with no `content`, and
 * "Apply Template" on it produced zero tasks — `TemplateApply` splits
 * `template.content` into lines and `undefined` has none.
 */
export const TEMPLATE_FIELDS = gql`
  fragment TemplateFields on Template {
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
`;

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




/**
 * The log views' selection set.
 *
 * `collectionId`, `recurrenceRule`, `seriesId` and `isSeriesMaster` are not
 * decoration — they are load-bearing, and leaving them out is a data-loss bug
 * rather than a missing chip. `TaskEditor` seeds its form from whatever the
 * task object carries and **always resends** the collection and the recurrence
 * frequency; a task fetched without them seeds `collectionId: ''` and
 * `recurrenceFreq: 'none'`, so saving an unrelated field (a priority, a tag)
 * posts `collectionId: null` + `recurrenceRule: null` and the gateway
 * dutifully files the entry out of its collection and demotes the series to a
 * plain task (`services/taskService.js` updateTask). The same four fields
 * decide whether `TaskRow` draws the recurrence glyph and whether
 * `TaskContext.deleteTask` asks "this occurrence or the whole series?".
 *
 * `GET_COLLECTION` and `GET_BLOCKED_TASKS` always selected them; the five log
 * queries did not, which is why the bug only showed up when the edit started
 * from Today / Review / Plan / Search / Tags. If a field is added to
 * `UpdateTaskInput`, add it here too.
 */
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
      blockedReason
      blockedAt
      taskType
      collectionId
      recurrenceRule
      seriesId
      isSeriesMaster
      completedAt
      cancelledAt
      createdAt
      updatedAt
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
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
      blockedReason
      blockedAt
      taskType
      collectionId
      recurrenceRule
      seriesId
      isSeriesMaster
      completedAt
      cancelledAt
      createdAt
      updatedAt
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
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
      blockedReason
      blockedAt
      taskType
      collectionId
      recurrenceRule
      seriesId
      isSeriesMaster
      completedAt
      cancelledAt
      createdAt
      updatedAt
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
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
      blockedReason
      blockedAt
      taskType
      collectionId
      recurrenceRule
      seriesId
      isSeriesMaster
      completedAt
      cancelledAt
      createdAt
      updatedAt
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
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
      blockedReason
      blockedAt
      taskType
      collectionId
      recurrenceRule
      seriesId
      isSeriesMaster
      completedAt
      cancelledAt
      createdAt
      updatedAt
      ...TaskFamily
    }
  }
  ${TASK_FAMILY}
`;

/**
 * Parked tasks — `status: 'blocked'`, newest-parked first (the gateway sorts by
 * `blockedAt`). Blocked tasks are filtered out of the daily/weekly/monthly log
 * views server-side, so this is the only list view that shows them.
 */
export const GET_BLOCKED_TASKS = gql`
  query GetBlockedTasks {
    blockedTasks {
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

export const GET_COLLECTIONS = gql`
  query GetCollections {
    collections {
      id
      name
      description
      archived
      taskCount
      completedCount
      createdAt
      updatedAt
    }
  }
`;

export const GET_COLLECTION = gql`
  query GetCollection($id: ID!) {
    collection(id: $id) {
      id
      name
      description
      archived
      taskCount
      completedCount
      tasks {
        id
        content
        signifier
        status
        priority
        note
        tags
        dueDate
        originalDate
        isBacklog
        blockedReason
        blockedAt
        taskType
        recurrenceRule
        seriesId
        isSeriesMaster
        collectionId
        completedAt
        cancelledAt
        createdAt
        updatedAt
        ...TaskFamily
      }
    }
  }
  ${TASK_FAMILY}
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
            blockedReason
            blockedAt
            taskType
            collectionId
            recurrenceRule
            seriesId
            isSeriesMaster
            completedAt
            cancelledAt
            createdAt
            updatedAt
            ...TaskFamily
        }
    }
    ${TASK_FAMILY}
`;

export const GET_HABITS = gql`
  query GetHabits($includeArchived: Boolean) {
    habits(includeArchived: $includeArchived) {
      id
      name
      daysOfWeek
      color
      archived
      currentStreak
    }
  }
`;

export const GET_HABIT_LOGS = gql`
  query GetHabitLogs($startDate: String!, $endDate: String!) {
    habitLogs(startDate: $startDate, endDate: $endDate) {
      id
      habitId
      date
    }
  }
`;

export const GET_PUSH_VAPID_KEY = gql`
  query GetPushVapidKey {
    pushVapidKey
  }
`;
