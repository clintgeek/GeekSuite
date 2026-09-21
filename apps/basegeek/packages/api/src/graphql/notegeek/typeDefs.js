import { gql } from 'graphql-tag';

export const typeDefs = gql`
  """
  A note as it was before a change. Written after an update succeeds, so a
  rejected write leaves none behind. The content field is omitted from list
  queries and fetched one at a time — see noteVersion.
  """
  type NoteVersion {
    id: ID!
    noteId: ID!
    title: String
    content: String
    type: String
    tags: [String!]
    isLocked: Boolean
    isEncrypted: Boolean
    """What replaced this version: edit, tidy, compose, restore."""
    reason: String
    createdAt: String
  }

  """
  A document built out of a pile of scraps. Never something to write over the
  source: the caller saves it as a new note, or replaces deliberately after
  seeing it.
  """
  type ComposedNote {
    markdown: String!
    stats: ComposeStats!
    provenance: AIProvenance
  }

  """
  What the compose actually did. chunksFailed is the important one: a batch
  that failed means material missing from a document that still looks
  complete, and the caller is expected to say so.
  """
  type ComposeStats {
    inputChars: Int!
    fragments: Int!
    chunks: Int!
    chunksFailed: Int!
    strategy: String!
  }

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

  type TidyMarkdownResult {
    formatted: String!
    provenance: AIProvenance!
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
    """A note's history, newest first. The content field is null here —
    fetch one version with noteVersion rather than pulling every body."""
    noteVersions(noteId: ID!): [NoteVersion!]!
    noteVersion(id: ID!): NoteVersion
    noteTags: [String!]!
    searchNotes(q: String!): [SearchSnippet!]!
    suggestForNote(noteId: ID, title: String!, excerpt: String!, tags: [String!]!): NoteSuggestions!
  }

  type Mutation {
    createNote(title: String, content: String!, type: String, tags: [String!]): Note!
    updateNote(
      id: ID!
      title: String
      content: String
      type: String
      tags: [String!]
      """
      Labels the history entry this update creates: edit (default), tidy,
      compose, restore. Only affects what the history list shows.
      """
      changeReason: String
    ): Note!
    """Put a note back to an earlier version. Snapshots the current state
    first, so a restore is itself undoable."""
    restoreNoteVersion(versionId: ID!): Note!
    """Build a document from a pile of scraps. Returns a NEW document and
    changes nothing — saving or replacing is the caller's separate act."""
    composeNote(content: String!): ComposedNote!
    deleteNote(id: ID!): Boolean!
    renameTag(oldTag: String!, newTag: String!): Boolean!
    deleteTag(tag: String!): Boolean!
    tidyMarkdown(content: String!): TidyMarkdownResult!
  }
`;
