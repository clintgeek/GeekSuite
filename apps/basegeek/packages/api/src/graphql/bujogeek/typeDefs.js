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
    templates(type: String, isDefault: Boolean): [Template!]!
    template(id: ID!): Template
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
    createTemplate(name: String!, description: String, type: String, content: String!, isDefault: Boolean, isPublic: Boolean, tags: [String]): Template!
    updateTemplate(id: ID!, name: String, description: String, type: String, content: String, isDefault: Boolean, isPublic: Boolean, tags: [String]): Template!
    deleteTemplate(id: ID!): DeleteResponse!
  }
`;
