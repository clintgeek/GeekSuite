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

export const TIDY_MARKDOWN = gql`
    mutation TidyMarkdown($content: String!) {
        tidyMarkdown(content: $content) {
            formatted
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
