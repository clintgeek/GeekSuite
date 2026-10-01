import { gql } from '@apollo/client';

export const CREATE_NOTE = gql`
    mutation CreateNote($title: String, $content: String!, $type: String, $tags: [String!]) {
        createNote(title: $title, content: $content, type: $type, tags: $tags) {
            id
            title
            content
            type
            tags
            createdAt
            updatedAt
        }
    }
`;

export const UPDATE_NOTE = gql`
    mutation UpdateNote(
        $id: ID!
        $title: String
        $content: String
        $type: String
        $tags: [String!]
        # Labels the history entry this update creates. The gateway's update
        # schema is strict, so an undeclared variable fails the WHOLE mutation
        # — which is how blood pressure nearly lost its logging entirely.
        $changeReason: String
    ) {
        updateNote(
            id: $id
            title: $title
            content: $content
            type: $type
            tags: $tags
            changeReason: $changeReason
        ) {
            id
            title
            content
            type
            tags
            createdAt
            updatedAt
        }
    }
`;

export const DELETE_NOTE = gql`
    mutation DeleteNote($id: ID!) {
        deleteNote(id: $id)
    }
`;

export const RENAME_TAG = gql`
    mutation RenameTag($oldTag: String!, $newTag: String!) {
        renameTag(oldTag: $oldTag, newTag: $newTag)
    }
`;

export const DELETE_TAG = gql`
    mutation DeleteTag($tag: String!) {
        deleteTag(tag: $tag)
    }
`;

/**
 * Put a note back to an earlier version.
 *
 * The server snapshots the current state first, so this is itself undoable —
 * restoring to the wrong version is not the thing that finally loses the work.
 */
export const RESTORE_NOTE_VERSION = gql`
    mutation RestoreNoteVersion($versionId: ID!) {
        restoreNoteVersion(versionId: $versionId) {
            id
            title
            content
            type
            tags
            updatedAt
        }
    }
`;

/**
 * Build a document from a pile of scraps.
 *
 * Returns the document and writes NOTHING. Saving it as a new note, or
 * replacing the source, is a separate deliberate act — a compose is lossy by
 * design and must never be what overwrites the only copy of the raw material.
 *
 * `stats.chunksFailed` is the field that matters: a batch that failed means
 * material missing from a document that still looks complete, and the user
 * has to be told before they decide what to do with it.
 */
export const COMPOSE_NOTE = gql`
    mutation ComposeNote($content: String!) {
        composeNote(content: $content) {
            markdown
            stats {
                inputChars
                fragments
                chunks
                chunksFailed
                strategy
                truncated
                degenerate
            }
            provenance {
                source
                reason
                model
                provider
                cached
                callsToday
                cap
            }
        }
    }
`;

/**
 * Read the handwriting in a sketch's exported page (DOCS/HANDWRITING.md §2).
 * `image` is bare base64 (no data: prefix). `source` is optional: `photo` for
 * a photographed notebook page (§3), else a sketch. Changes nothing; a failure is a
 * GraphQL error with `extensions.details`, never an empty `text`.
 */
export const TRANSCRIBE_SKETCH = gql`
    mutation TranscribeSketch($image: String!, $mediaType: String!, $source: String) {
        transcribeSketch(image: $image, mediaType: $mediaType, source: $source) {
            text
            provenance {
                source
                reason
                model
                provider
                cached
                callsToday
                cap
            }
        }
    }
`;

/**
 * Fold-in (DOCS/CONTEXT.md §13): propose how new information fits into an
 * existing Markdown note, as anchored operations the gateway has already
 * checked against the note. Writes NOTHING. Needs the 2026-10-01 gateway.
 */
export const FOLD_IN_PREVIEW = gql`
    mutation FoldInPreview($noteId: ID!, $input: String!) {
        foldInPreview(noteId: $noteId, input: $input) {
            operations {
                id
                type
                why
                heading
                markdown
                anchor
                items
                tableHeaderRow
                cells
                find
                replace
                reason
                afterHeading
                level
                location
                start
                end
                text
            }
            summary
            unplaced
            baseUpdatedAt
            stats {
                inputChars
                noteChars
                strategy
                sectionsTotal
                sectionsSent
                sentChars
                proposed
                valid
                failed
                truncated
                dropped {
                    index
                    type
                    reason
                    detail
                }
            }
            provenance {
                source
                reason
                model
                provider
                cached
                callsToday
                cap
            }
        }
    }
`;

/**
 * Apply the accepted operations. The gateway re-validates every one against
 * the note as it is now, snapshots a version first, and returns its id —
 * `restoreNoteVersion(versionId)` is the Undo.
 */
export const FOLD_IN_APPLY = gql`
    mutation FoldInApply($noteId: ID!, $baseUpdatedAt: String!, $operations: [FoldInOperationInput!]!) {
        foldInApply(noteId: $noteId, baseUpdatedAt: $baseUpdatedAt, operations: $operations) {
            note {
                id
                title
                content
                type
                tags
                createdAt
                updatedAt
            }
            versionId
            applied
        }
    }
`;
