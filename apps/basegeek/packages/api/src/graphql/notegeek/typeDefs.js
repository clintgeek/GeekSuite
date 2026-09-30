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
    """What replaced this version: edit, compose, restore."""
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
  What the compose actually did. Three of these are the caller's problem to
  report: chunksFailed means material missing from a document that still looks
  complete, truncated means it stops mid-thought, and degenerate means the
  model talked in circles and the answer was discarded.
  """
  type ComposeStats {
    inputChars: Int!
    fragments: Int!
    chunks: Int!
    chunksFailed: Int!
    strategy: String!
    """
    The model ran out of room mid-answer, so the document stops mid-thought.
    It is still a real document; only the user can say whether that will do.
    """
    truncated: Boolean
    """
    The answer was a loop, not a document, and was thrown away. markdown is
    empty when this is true.
    """
    degenerate: Boolean
  }

  """
  What a page of handwriting says, read by a vision model. A faithful
  transcript, not a document: unreadable words are [?], drawings are
  [drawing: ...]. The caller shows it for correction before anything is saved.
  """
  type SketchTranscript {
    text: String!
    provenance: AIProvenance
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
    """Pinned notes sort first in \`notes\`. Set only by setNotePinned."""
    pinned: Boolean!
    """When this note was pinned; null when it isn't."""
    pinnedAt: Date
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

  type NoteSuggestions {
    tags: [SuggestedTag!]!
    related: [RelatedNote!]!
    provenance: AIProvenance!
  }

  # module carrying the same text merges to one type — but the moment anyone

  """How much of the library a tag subtree covers."""
  type TagUsage {
    """Notes carrying the tag or any tag beneath it."""
    notes: Int!
    """Distinct tags beneath it (house/garage, house/garage/door, ...)."""
    subTags: Int!
  }

  type Query {
    """
    The note list. tag = exactly that tag; prefix = any tag starting with
    the string; under = the nested-tag view, the tag itself or anything
    beneath it (house -> house, house/garage; never houseboat). Sent
    together, they all narrow.
    """
    notes(tag: String, prefix: String, under: String, type: String, limit: Int, sort: String): [Note!]!
    note(id: ID!): Note
    """A note's history, newest first. The content field is null here —
    fetch one version with noteVersion rather than pulling every body."""
    noteVersions(noteId: ID!): [NoteVersion!]!
    noteVersion(id: ID!): NoteVersion
    noteTags: [String!]!
    """Notes carrying the tag or a descendant, and how many sub-tags it has."""
    noteTagUsage(tag: String!): TagUsage!
    searchNotes(q: String!, under: String): [SearchSnippet!]!
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
      Labels the history entry this update creates: edit (default),
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
    """Read the handwriting in a sketch's exported page image. image is
    base64 with no data: prefix; mediaType is image/png or image/jpeg.
    source is 'sketch' (the default) or 'photo' — a photographed notebook
    page, read with rules for ruled lines and printed text.
    Changes nothing. Failures are errors, never an empty transcript."""
    transcribeSketch(image: String!, mediaType: String!, source: String): SketchTranscript!
    """Pin or unpin a note. Scoped to the owner, like every other note mutation."""
    setNotePinned(id: ID!, pinned: Boolean!): Note!
    deleteNote(id: ID!): Boolean!
    """
    Rename or move a tag with its whole subtree: house -> home turns
    house/garage into home/garage; garage -> house/garage moves it. Merges
    into an existing tag without duplicates. Refuses a move into its own
    descendant. True when any note changed.
    """
    renameTag(oldTag: String!, newTag: String!): Boolean!
    """Remove a tag and every tag beneath it from your notes. Notes stay."""
    deleteTag(tag: String!): Boolean!
  }
`;
