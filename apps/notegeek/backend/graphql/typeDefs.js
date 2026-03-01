import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type Note @key(fields: "id") {
    id: ID!
    title: String
    content: String!
    userId: ID!
    type: String!
    tags: [String!]!
    isLocked: Boolean!
    isEncrypted: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    notes(tag: String, prefix: String): [Note!]!
    note(id: ID!): Note
    tags: [String!]!
  }

  extend type Mutation {
    createNote(title: String, content: String!, type: String, tags: [String!]): Note!
    updateNote(id: ID!, title: String, content: String, type: String, tags: [String!]): Note!
    deleteNote(id: ID!): Boolean!
  }
`;
