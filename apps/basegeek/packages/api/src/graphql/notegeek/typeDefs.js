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
    """What replaced this version: edit, compose, restore, fold_in."""
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


  """
  One anchored change Fold-in proposes. The model never writes the note: it
  names a place (an exact heading, list item, table header or quoted text)
  and what to add there, and the gateway checked that place exists exactly
  once in the note as it is now. Only replace_text removes anything.
  """
  type FoldInOperation {
    """op1, op2... — the model's order, stable within one preview."""
    id: ID!
    """insert_after_heading | insert_under_section_end | append_to_list | add_table_row | replace_text | new_section"""
    type: String!
    why: String
    heading: String
    markdown: String
    anchor: String
    items: [String!]
    tableHeaderRow: String
    cells: [String!]
    find: String
    replace: String
    reason: String
    afterHeading: String
    level: Int
    """Where it lands, for a person: Under "## Widow spiders"."""
    location: String!
    """The splice in the note's current content: [start, end) is replaced by text (start = end for an insert)."""
    start: Int!
    end: Int!
    text: String!
  }

  """
  The same operation sent back to foldInApply. The gateway re-validates every
  field against the note as it is at apply time; nothing here is trusted.
  """
  input FoldInOperationInput {
    type: String!
    why: String
    heading: String
    markdown: String
    anchor: String
    items: [String!]
    tableHeaderRow: String
    cells: [String!]
    find: String
    replace: String
    reason: String
    afterHeading: String
    level: Int
  }

  """A proposed change that did not match the note, and why. Its content is in unplaced."""
  type FoldInDropped {
    index: Int!
    type: String
    """anchor_not_found | ambiguous_anchor | text_not_found | ambiguous_text | overlap | inside_code_fence | unbalanced_fence | duplicate_heading | too_many_cells | malformed | too_many | empty | no_change"""
    reason: String!
    detail: String
  }

  """
  What the preview did. failed means no model answer at all (provenance.reason
  says why) — an empty proposal that must not read as "nothing to add".
  """
  type FoldInStats {
    inputChars: Int!
    noteChars: Int!
    """whole (the note went whole) or outline (outline + the most relevant sections)."""
    strategy: String!
    sectionsTotal: Int!
    sectionsSent: Int!
    sentChars: Int!
    proposed: Int!
    valid: Int!
    dropped: [FoldInDropped!]!
    failed: Boolean!
    truncated: Boolean!
  }

  type FoldInProposal {
    operations: [FoldInOperation!]!
    summary: String!
    """New information with no place in the note — the model's own, plus the content of every dropped change. Never lost."""
    unplaced: [String!]!
    stats: FoldInStats!
    """The note's updatedAt the proposal was made against. Send it back to foldInApply."""
    baseUpdatedAt: Date!
    provenance: AIProvenance
  }

  type FoldInResult {
    note: Note!
    """The version holding the note as it was before; restoreNoteVersion(versionId) undoes the fold-in."""
    versionId: ID!
    applied: Int!
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
    """
    Archived notes leave every list, tag count and search, but stay intact
    with their history and are still opened by id. Set only by
    archiveNotes / restoreNotes; never an edit (updatedAt is untouched).
    """
    archived: Boolean!
    """When the note was archived (ISO 8601); null when it isn't."""
    archivedAt: String
    """
    Outgoing [[links]] in the body, one per distinct target. noteId is null
    while no note has that title. Renaming the target keeps the link (by id);
    the typed text is not rewritten.
    """
    links: [NoteLink!]!
  }

  type NoteLink {
    """Lowercased title the link was written with, or id:<hex> for a /notes/<id> link."""
    key: String!
    """The title as written in [[...]]; empty for an id link."""
    title: String!
    noteId: ID
  }

  """A note that links to another one, with the words around the link."""
  type Backlink {
    id: ID!
    title: String!
    type: String!
    updatedAt: Date
    snippet: String
  }

  """A note's title, for the [[ picker."""
  type NoteTitle {
    id: ID!
    title: String!
    type: String!
    updatedAt: Date
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
    """
    Hybrid search only: keyword (the typed words), meaning (similar in
    meaning, may not contain the words), or both. Null on keyword-only search.
    """
    matchedBy: String
    """Hybrid search, meaning hits: the passage that matched."""
    why: String
    """
    Hybrid search: this row is the one clear answer (the first row, at most
    one per search). False on keyword-only search and whenever no note
    clearly wins.
    """
    bestMatch: Boolean!
  }

  """A note near another one in meaning (local embeddings, never a cloud model)."""
  type SimilarNote {
    id: ID!
    title: String!
    type: String!
    updatedAt: Date
    """Cosine similarity, 0..1."""
    score: Float!
    """The passage of this note that is closest."""
    snippet: String
  }

  """How much of the library is searchable by meaning. Owner-scoped."""
  type NoteIndexStatus {
    total: Int!
    indexed: Int!
    """Waiting to be (re-)embedded, including never-indexed notes."""
    stale: Int!
    failed: Int!
    """Nothing to embed (an untitled sketch)."""
    skipped: Int!
    chunks: Int!
    model: String!
    serviceAvailable: Boolean!
    lastError: String
    lastOkAt: Date
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

  """The notes an archiveNotes / restoreNotes call actually changed."""
  type ArchiveResult {
    ids: [ID!]!
    count: Int!
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
    """
    Search. hybrid = also match by meaning (local embeddings), fused with the
    keyword hits; omitted/false is keyword-only, as before.
    """
    searchNotes(q: String!, under: String, hybrid: Boolean): [SearchSnippet!]!
    """The caller's notes closest in meaning to this one. Empty until it is indexed."""
    relatedNotes(noteId: ID!, limit: Int): [SimilarNote!]!
    noteIndexStatus: NoteIndexStatus!
    """Notes that link to this one ([[its title]] or a /notes/<id> link), newest first."""
    backlinks(noteId: ID!): [Backlink!]!
    """Titles containing q (case-insensitive), prefix matches first. For the [[ picker."""
    noteTitles(q: String, limit: Int): [NoteTitle!]!
    suggestForNote(noteId: ID, title: String!, excerpt: String!, tags: [String!]!): NoteSuggestions!
    """The Archived view: archived notes, most recently archived first."""
    archivedNotes(limit: Int, offset: Int): [Note!]!
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
    """
    Propose how to fold new information into an existing Markdown note, as
    anchored edit operations. Writes NOTHING.
    """
    foldInPreview(noteId: ID!, input: String!): FoldInProposal!
    """
    Apply the accepted operations from a foldInPreview. All or nothing:
    every operation is re-validated against the note as it is now, and a note
    that changed since baseUpdatedAt in a way that breaks an anchor is a
    CONFLICT. Snapshots a version first; the result names it for Undo.
    """
    foldInApply(noteId: ID!, baseUpdatedAt: String!, operations: [FoldInOperationInput!]!): FoldInResult!
    """Read the handwriting in a sketch's exported page image. image is
    base64 with no data: prefix; mediaType is image/png or image/jpeg.
    source is 'sketch' (the default) or 'photo' — a photographed notebook
    page, read with rules for ruled lines and printed text.
    Changes nothing. Failures are errors, never an empty transcript."""
    transcribeSketch(image: String!, mediaType: String!, source: String): SketchTranscript!
    """Pin or unpin a note. Scoped to the owner, like every other note mutation."""
    setNotePinned(id: ID!, pinned: Boolean!): Note!
    """
    Archive 1-100 notes. Owner-scoped; ids that are invalid, someone else's or
    already archived are ignored, not errors. Not an edit: no version, no
    updatedAt change, pinned untouched.
    """
    archiveNotes(ids: [ID!]!): ArchiveResult!
    """Restore archived notes (same rules as archiveNotes). Clears archivedAt."""
    restoreNotes(ids: [ID!]!): ArchiveResult!
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
