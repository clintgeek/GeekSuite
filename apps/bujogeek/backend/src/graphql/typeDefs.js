import { gql } from 'graphql-tag';

export const typeDefs = gql`
  extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  type Task @key(fields: "id") {
    id: ID!
    content: String!
    signifier: String
    status: String
    priority: Int
    note: String
    tags: [String]
    dueDate: String
    originalDate: String
    migratedFrom: String
    migratedTo: String
    isBacklog: Boolean
    taskType: String
    parentTask: Task
    subtasks: [Task]
    completedAt: String
    createdAt: String
    updatedAt: String
  }

  type JournalEntry @key(fields: "id") {
    id: ID!
    title: String!
    content: String!
    type: String
    date: String!
    tags: [String]
    status: String
    preview: String
    createdAt: String
    updatedAt: String
  }

  type TagCount {
    tag: String!
    count: Int!
  }

  type SaveOrderResponse {
    success: Boolean!
    updatedAt: String
  }

  type DeleteResponse {
    success: Boolean!
    message: String
  }

  input UpdateTaskInput {
    content: String
    signifier: String
    status: String
    priority: Int
    note: String
    tags: [String]
    dueDate: String
    isBacklog: Boolean
    taskType: String
  }

  extend type Query {
    # Task Queries
    tasks(status: String, tags: [String]): [Task!]!
    task(id: ID!): Task
    dailyTasks(date: String): [Task!]!
    weeklyTasks(date: String): [Task!]!
    monthlyTasks(startDate: String, endDate: String): [Task!]!
    allTasks: [Task!]!
    taskTags: [TagCount!]!
    tasksByTag(tag: String!): [Task!]!

    # Journal Queries
    journalEntries(type: String, tags: [String]): [JournalEntry!]!
    journalEntry(id: ID!): JournalEntry
  }

  extend type Mutation {
    # Task Mutations
    createTask(content: String!, signifier: String, status: String, priority: Int, tags: [String], dueDate: String, createdAt: String, updatedAt: String): Task!
    updateTask(id: ID!, input: UpdateTaskInput!): Task!
    deleteTask(id: ID!): DeleteResponse!
    updateTaskStatus(id: ID!, status: String!): Task!
    addSubtask(parentId: ID!, content: String!, signifier: String, status: String, priority: Int, tags: [String], dueDate: String): Task!
    migrateTaskToFuture(id: ID!, futureDate: String!): Task!
    saveDailyTaskOrder(dateKey: String!, orderedTaskIds: [ID!]!): SaveOrderResponse!

    # Journal Mutations
    createJournalEntry(title: String!, content: String!, type: String, date: String, tags: [String], status: String): JournalEntry!
    updateJournalEntry(id: ID!, title: String, content: String, type: String, date: String, tags: [String], status: String): JournalEntry!
    deleteJournalEntry(id: ID!): DeleteResponse!
    createJournalFromTemplate(templateId: ID!, date: String): JournalEntry!
  }
`;
