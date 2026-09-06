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

  """A tag the user already has, scored against the note being written."""
  type SuggestedTag {
    tag: String!
    score: Float!
  }

  """One of the user's own notes, scored against the note being written."""
  type RelatedNote {
    id: ID!
    title: String!
    score: Float!
    """At most a few words on what the two notes share — only ever set when a model was consulted."""
    why: String
  }

  type NoteSuggestions {
    tags: [SuggestedTag!]!
    related: [RelatedNote!]!
    provenance: AIProvenance!
  }

  # module carrying the same text merges to one type — but the moment anyone

  type Query {
    notes(tag: String, prefix: String, type: String, limit: Int, sort: String): [Note!]!
    note(id: ID!): Note
    noteTags: [String!]!
    searchNotes(q: String!): [SearchSnippet!]!
    folders: [Folder!]!
    suggestForNote(noteId: ID, title: String!, excerpt: String!, tags: [String!]!): NoteSuggestions!
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
