import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type Note {
    id: ID!
    title: String
    content: String!
    userId: ID!
    type: String!
    tags: [String!]!
    isLocked: Boolean!
    isEncrypted: Boolean!
    createdAt: Date!
    updatedAt: Date!
  }

  type Query {
    notes(tag: String, prefix: String): [Note!]!
    note(id: ID!): Note
    noteTags: [String!]!
  }

  type Mutation {
    createNote(title: String, content: String!, type: String, tags: [String!]): Note!
    updateNote(id: ID!, title: String, content: String, type: String, tags: [String!]): Note!
    deleteNote(id: ID!): Boolean!
  }
`;
