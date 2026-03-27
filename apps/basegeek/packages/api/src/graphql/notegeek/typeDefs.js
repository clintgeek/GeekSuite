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

  type SearchSnippet {
    _id: ID!
    title: String
    type: String!
    tags: [String!]!
    isLocked: Boolean!
    isEncrypted: Boolean!
    createdAt: Date!
    updatedAt: Date!
    score: Float
    snippet: String
    message: String
  }

  type Folder {
    id: ID!
    name: String!
    userId: ID!
    parentId: ID
    icon: String
    color: String
    createdAt: Date!
    updatedAt: Date!
  }

  type Query {
    notes(tag: String, prefix: String): [Note!]!
    note(id: ID!): Note
    noteTags: [String!]!
    searchNotes(q: String!): [SearchSnippet!]!
    folders: [Folder!]!
  }

  type Mutation {
    createNote(title: String, content: String!, type: String, tags: [String!]): Note!
    updateNote(id: ID!, title: String, content: String, type: String, tags: [String!]): Note!
    deleteNote(id: ID!): Boolean!
    renameTag(oldTag: String!, newTag: String!): Boolean!
    deleteTag(tag: String!): Boolean!
    createFolder(name: String!, parentId: ID, icon: String, color: String): Folder!
    updateFolder(id: ID!, name: String, parentId: ID, icon: String, color: String): Folder!
    deleteFolder(id: ID!, deleteNotes: Boolean): Boolean!
  }
`;
