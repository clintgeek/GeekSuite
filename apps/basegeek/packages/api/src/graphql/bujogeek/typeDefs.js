import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type Task {
    id: ID!
    content: String!
    signifier: String
    status: String
    priority: Int
    note: String
    tags: [String]
    dueDate: Date
    originalDate: Date
    migratedFrom: String
    migratedTo: String
    isBacklog: Boolean
    taskType: String
    recurrencePattern: String @deprecated(reason: "Legacy recurrence enum. Use recurrenceRule (RRULE) — tasks created with recurrencePattern are translated server-side and this field is left as 'none'.")
    recurrenceRule: String
    seriesId: String
    isSeriesMaster: Boolean
    originalDueDate: Date
    parentTask: Task
    subtasks: [Task]
    completedAt: Date
    cancelledAt: Date
    collectionId: ID
    createdAt: Date
    updatedAt: Date
  }

  """
  A named list of entries that lives outside the daily log — "Books to Read",
  "Project X", "Gift Ideas". Its entries are ordinary Tasks carrying this
  collection's id; an undated entry stays out of the daily/weekly/monthly log
  entirely, and only joins the log once it is given a dueDate.
  """
  type Collection {
    id: ID!
    name: String!
    description: String
    archived: Boolean
    taskCount: Int!
    completedCount: Int!
    tasks: [Task!]!
    createdAt: Date
    updatedAt: Date
  }

  """
  A habit — something done on a repeating schedule, tracked by presence rather
  than by task state. Habits never enter the daily log and are never "completed"
  once; their history is a set of HabitLogs, one per day done.
  """
  type Habit {
    id: ID!
    name: String!
    "JS day numbers, 0 = Sunday. Empty means every day."
    daysOfWeek: [Int!]!
    color: String
    archived: Boolean!
    "Consecutive scheduled days done, counting back from today. Unscheduled days are skipped; today unlogged does not break it."
    currentStreak: Int!
    createdAt: Date
    updatedAt: Date
  }

  "One day a habit was done. There is no negative row — absence is 'not done'."
  type HabitLog {
    id: ID!
    habitId: ID!
    date: Date!
  }

  type ToggleHabitLogResult {
    "The day's state AFTER the toggle."
    done: Boolean!
    "The log that now exists, or null when the day was un-marked."
    log: HabitLog
    "The habit, with its streak recomputed."
    habit: Habit!
  }

  type JournalEntry {
    id: ID!
    title: String!
    content: String!
    type: String
    date: Date!
    tags: [String]
    status: String
    preview: String
    createdAt: Date
    updatedAt: Date
  }

  type TemplateVariable {
    name: String
    type: String
    defaultValue: String
    required: Boolean
  }

  type Template {
    id: ID!
    name: String!
    description: String
    type: String
    content: String!
    isDefault: Boolean
    isPublic: Boolean
    tags: [String]
    variables: [TemplateVariable]
    createdAt: Date
    updatedAt: Date
    createdBy: ID
    lastUsed: Date
    preview: String
  }

  enum EditScope {
    THIS_INSTANCE
    ALL_INSTANCES
    FUTURE_INSTANCES
  }

  """
  A browser registered to receive task reminders. One row per device; the push
  service's \`endpoint\` URL is the device's identity.
  """
  type PushSubscription {
    id: ID!
    endpoint: String!
    userAgent: String
    createdAt: Date
  }

  input PushSubscriptionKeysInput {
    p256dh: String!
    auth: String!
  }

  "The shape \`PushSubscription#toJSON()\` produces in the browser, plus a UA."
  input PushSubscriptionInput {
    endpoint: String!
    keys: PushSubscriptionKeysInput!
    userAgent: String
  }

  input UpdateTaskInput {
    content: String
    signifier: String
    status: String
    priority: Int
    note: String
    tags: [String]
    dueDate: Date
    isBacklog: Boolean
    recurrencePattern: String @deprecated(reason: "Legacy recurrence enum — translated to recurrenceRule server-side. Send recurrenceRule instead.")
    recurrenceRule: String
    "Set to file this task into a collection, or null to take it out of one."
    collectionId: ID
  }

  type Query {
    tasks(status: String, tags: [String]): [Task!]!
    task(id: ID!): Task
    dailyTasks(date: String): [Task!]!
    weeklyTasks(date: String): [Task!]!
    monthlyTasks(startDate: String, endDate: String): [Task!]!
    allTasks: [Task!]!
    taskTags: [TagCount!]!
    tasksByTag(tag: String!): [Task!]!
    collections: [Collection!]!
    collection(id: ID!): Collection
    habits(includeArchived: Boolean = false): [Habit!]!
    "Every habit log in a calendar-date window, inclusive. Dates are yyyy-MM-dd."
    habitLogs(startDate: String!, endDate: String!): [HabitLog!]!
    journalEntries(type: String, tags: [String]): [JournalEntry!]!
    journalEntry(id: ID!): JournalEntry
    templates(type: String, isDefault: Boolean): [Template!]!
    template(id: ID!): Template
    """
    The server's VAPID application server key, base64url-encoded — what the
    browser needs to call \`pushManager.subscribe\`. Null when reminders are not
    configured on this deployment, which the client reads as "unsupported".
    """
    pushVapidKey: String
    "Every push subscription (device) the caller has registered."
    pushSubscriptions: [PushSubscription!]!
  }

  type Mutation {
    """
    Recurrence is expressed as \`recurrenceRule\` — an RRULE string of the form
    \`DTSTART:20260315T090000Z\\nRRULE:FREQ=WEEKLY\`. A task created with one
    becomes a series master and its occurrences are expanded per view window.
    \`recurrencePattern\` is accepted for backward compatibility only and is
    translated to an equivalent RRULE at create time.
    """
    createTask(content: String!, signifier: String, status: String, priority: Int, tags: [String], dueDate: Date, createdAt: Date, updatedAt: Date, note: String, recurrencePattern: String @deprecated(reason: "Legacy recurrence enum — translated to recurrenceRule server-side. Send recurrenceRule instead."), recurrenceRule: String, isSeriesMaster: Boolean, collectionId: ID): Task!
    updateTask(id: ID!, input: UpdateTaskInput!, editScope: EditScope): Task!
    deleteTask(id: ID!, editScope: EditScope): DeleteResponse!
    updateTaskStatus(id: ID!, status: String!): Task!
    addSubtask(parentId: ID!, content: String!, signifier: String, status: String, priority: Int, tags: [String], dueDate: Date): Task!
    migrateTaskToFuture(id: ID!, futureDate: Date!): Task!
    saveDailyTaskOrder(dateKey: String!, orderedTaskIds: [ID!]!): SaveOrderResponse!
    createCollection(name: String!, description: String): Collection!
    updateCollection(id: ID!, name: String, description: String, archived: Boolean): Collection!
    """
    Deleting a collection detaches its entries by default (they keep existing
    as ordinary tasks). Pass \`deleteTasks: true\` to remove them with it.
    """
    deleteCollection(id: ID!, deleteTasks: Boolean = false): DeleteResponse!
    createHabit(name: String!, daysOfWeek: [Int!], color: String): Habit!
    updateHabit(id: ID!, name: String, daysOfWeek: [Int!], color: String, archived: Boolean): Habit!
    "Deleting a habit takes its whole log history with it."
    deleteHabit(id: ID!): DeleteResponse!
    """
    Mark a day done, or un-mark it — whichever the day currently is not.
    \`date\` is a calendar date (yyyy-MM-dd); the toggle is idempotent per day.
    """
    toggleHabitLog(habitId: ID!, date: String!): ToggleHabitLogResult!
    createJournalEntry(title: String!, content: String!, type: String, date: Date, tags: [String], status: String): JournalEntry!
    updateJournalEntry(id: ID!, title: String, content: String, type: String, date: Date, tags: [String], status: String): JournalEntry!
    deleteJournalEntry(id: ID!): DeleteResponse!
    createJournalFromTemplate(templateId: ID!, date: Date): JournalEntry!
    updateBujoPreferences(theme: String!): JSON!
    createTemplate(name: String!, description: String, type: String, content: String!, isDefault: Boolean, isPublic: Boolean, tags: [String]): Template!
    updateTemplate(id: ID!, name: String, description: String, type: String, content: String, isDefault: Boolean, isPublic: Boolean, tags: [String]): Template!
    deleteTemplate(id: ID!): DeleteResponse!
    """
    Register (or refresh) this browser for task reminders. Keyed by endpoint,
    so calling it repeatedly from the same device is idempotent.
    """
    savePushSubscription(input: PushSubscriptionInput!): PushSubscription!
    "Unregister one device. Returns false when the endpoint was not the caller's."
    removePushSubscription(endpoint: String!): DeleteResponse!
  }
`;
