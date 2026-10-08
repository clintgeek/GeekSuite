import { gql } from '@apollo/client';

/**
 * Archive (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md §3). Needs the gateway from
 * 2026-10-08 — an older one rejects every document in this file.
 *
 * An archived note leaves every list, tag count and search, but `note(id)`
 * still returns it with its history. Archiving is not an edit: no version,
 * `updatedAt` untouched, `pinned` kept. Both mutations return only the ids
 * that actually changed (foreign or already-archived ids are ignored).
 */
export const ARCHIVE_NOTES = gql`
    mutation ArchiveNotes($ids: [ID!]!) {
        archiveNotes(ids: $ids) {
            ids
            count
        }
    }
`;

export const RESTORE_NOTES = gql`
    mutation RestoreNotes($ids: [ID!]!) {
        restoreNotes(ids: $ids) {
            ids
            count
        }
    }
`;

/** The Archived view: newest `archivedAt` first. */
export const ARCHIVED_NOTES = gql`
    query ArchivedNotes($limit: Int, $offset: Int) {
        archivedNotes(limit: $limit, offset: $offset) {
            id
            title
            content
            type
            tags
            isLocked
            isEncrypted
            pinned
            createdAt
            updatedAt
            archived
            archivedAt
        }
    }
`;

/**
 * Is this note archived? Its own small query (like NOTE_LINKS) rather than
 * two more fields on GET_NOTE_BY_ID, so every other reader of the note — and
 * every test mock of it — is untouched.
 */
export const NOTE_ARCHIVE_STATE = gql`
    query NoteArchiveState($id: ID!) {
        note(id: $id) {
            id
            archived
            archivedAt
        }
    }
`;

/**
 * Compose from several notes (spec §4). Writes NOTHING, like composeNote.
 * The shared part is ComposedNote's (graphql/mutations.js COMPOSE_NOTE);
 * `sources` says which notes went in (`used`) and which were left out and why
 * (`skipped`: locked, unsupported_type, empty, not_found).
 */
export const COMPOSE_NOTES = gql`
    mutation ComposeNotes($noteIds: [ID!]!) {
        composeNotes(noteIds: $noteIds) {
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
            sources {
                used
                skipped {
                    id
                    title
                    reason
                }
            }
        }
    }
`;
