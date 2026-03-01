import { gql } from 'graphql-tag';

export const typeDefs = gql`
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

  extend type Query {
    tasks(status: String, tags: [String]): [Task!]!
    journalEntries(type: String, tags: [String]): [JournalEntry!]!
  }

  extend type Mutation {
    createTask(content: String!, signifier: String, status: String, priority: Int, tags: [String], dueDate: String): Task!
    createJournalEntry(title: String!, content: String!, type: String, date: String, tags: [String], status: String): JournalEntry!
  }
`;
