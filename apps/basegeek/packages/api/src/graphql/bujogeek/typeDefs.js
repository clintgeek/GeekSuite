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
    parentTask: Task
    subtasks: [Task]
    completedAt: Date
    createdAt: Date
    updatedAt: Date
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

  input UpdateTaskInput {
    content: String
    signifier: String
    status: String
    priority: Int
    note: String
    tags: [String]
    dueDate: Date
    isBacklog: Boolean
    taskType: String
    createdAt: Date
    updatedAt: Date
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
    journalEntries(type: String, tags: [String]): [JournalEntry!]!
    journalEntry(id: ID!): JournalEntry
  }

  type Mutation {
    createTask(content: String!, signifier: String, status: String, priority: Int, tags: [String], dueDate: Date, createdAt: Date, updatedAt: Date): Task!
    updateTask(id: ID!, input: UpdateTaskInput!): Task!
    deleteTask(id: ID!): DeleteResponse!
    updateTaskStatus(id: ID!, status: String!): Task!
    addSubtask(parentId: ID!, content: String!, signifier: String, status: String, priority: Int, tags: [String], dueDate: Date): Task!
    migrateTaskToFuture(id: ID!, futureDate: Date!): Task!
    saveDailyTaskOrder(dateKey: String!, orderedTaskIds: [ID!]!): SaveOrderResponse!
    createJournalEntry(title: String!, content: String!, type: String, date: Date, tags: [String], status: String): JournalEntry!
    updateJournalEntry(id: ID!, title: String, content: String, type: String, date: Date, tags: [String], status: String): JournalEntry!
    deleteJournalEntry(id: ID!): DeleteResponse!
    createJournalFromTemplate(templateId: ID!, date: Date): JournalEntry!
    updateBujoPreferences(theme: String!): FitnessJSON!
  }
`;
