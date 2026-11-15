import { gql } from '@apollo/client';
import { SKETCH_TRANSCRIPT_FIELDS } from './mutations';

/**
 * The note list (5.1/5.2, review 2026-11). Light rows: `preview` is the
 * server's plain-text excerpt, and `content` is deliberately NOT selected — a
 * list of 200 notes used to carry every multi-MB sketch body on every visit
 * (the gateway does not even read `content` when it is not selected). A
 * sketch or mind-map row's thumbnail fetches its own note's body lazily, once
 * it scrolls into view (components/notes/NotePreview.jsx).
 *
 * `sort` is the server's: updatedAt_desc (default) | updatedAt_asc |
 * createdAt_desc | createdAt_asc | title_asc | title_desc (case-insensitive).
 * Needs the gateway from 2026-11-15 — an older one rejects `preview`.
 */
export const NOTE_LIST_FIELDS = `
            id
            title
            preview
            type
            tags
            pinned
            pinnedAt
            createdAt
            updatedAt
`;

/** Home's few rows (and the store behind it). */
export const GET_NOTES = gql`
    query GetNotes($tag: String, $prefix: String, $under: String, $type: String, $limit: Int, $sort: String) {
        notes(tag: $tag, prefix: $prefix, under: $under, type: $type, limit: $limit, sort: $sort) {
            ${NOTE_LIST_FIELDS}
        }
    }
`;

/**
 * The Notes page, a page at a time (5.2): keyset paging on the server, so
 * notes past the newest 200 are reachable and A–Z is A–Z of every note.
 * `after` is the previous page's `nextCursor`.
 */
export const GET_NOTES_PAGE = gql`
    query GetNotesPage($tag: String, $prefix: String, $under: String, $type: String, $sort: String, $first: Int, $after: String) {
        notesPage(tag: $tag, prefix: $prefix, under: $under, type: $type, sort: $sort, first: $first, after: $after) {
            notes {
                ${NOTE_LIST_FIELDS}
            }
            nextCursor
            hasMore
        }
    }
`;

/**
 * Recently deleted (C4, decision D1): soft-deleted notes, newest first. The
 * server purges anything deleted more than 30 days ago.
 */
export const DELETED_NOTES = gql`
    query DeletedNotes($limit: Int) {
        deletedNotes(limit: $limit) {
            ${NOTE_LIST_FIELDS}
            deletedAt
        }
    }
`;

/**
 * One note's body, for a list row's thumbnail. Same root field and arguments
 * as GET_NOTE_BY_ID, so it shares that cache entry: a note opened before
 * draws its thumbnail with no request at all.
 */
export const NOTE_THUMB_CONTENT = gql`
    query NoteThumbContent($id: ID!) {
        note(id: $id) {
            id
            content
            updatedAt
        }
    }
`;

export const GET_NOTE_BY_ID = gql`
    query GetNoteById($id: ID!) {
        note(id: $id) {
            id
            title
            content
            type
            tags
            isLocked
            isEncrypted
            pinned
            pinnedAt
            createdAt
            updatedAt
        }
    }
`;

export const GET_TAGS = gql`
    query GetNoteTags {
        noteTags
    }
`;

/**
 * How much a tag subtree covers — the tag's notes (itself or any tag beneath
 * it) and its distinct sub-tags. The delete dialog asks before it asks you.
 */
export const NOTE_TAG_USAGE = gql`
    query NoteTagUsage($tag: String!) {
        noteTagUsage(tag: $tag) {
            notes
            subTags
            # Archived notes in the subtree: renameTag / deleteTag reach them
            # too (COMPOSE_MANY_AND_ARCHIVE_SPEC.md A4, A8). notes is active only.
            archived
        }
    }
`;

/**
 * Search. `hybrid: true` asks the gateway to also match by meaning (local
 * embeddings, DOCS/CONTEXT.md §11) and fuse the two lists; `matchedBy` says
 * how each row matched and `why` is the passage a meaning hit matched on.
 * `bestMatch` marks the one clear answer, when there is one (always the first
 * row). Needs the gateway from 2026-09-30 — an older one rejects `hybrid` —
 * and `bestMatch` the one from 2026-10-01.
 */
export const SEARCH_NOTES = gql`
    query SearchNotes($q: String!, $hybrid: Boolean) {
        searchNotes(q: $q, hybrid: $hybrid) {
            _id
            title
            type
            tags
            isLocked
            isEncrypted
            createdAt
            updatedAt
            score
            snippet
            message
            matchedBy
            why
            bestMatch
        }
    }
`;

/**
 * The notes nearest this one in meaning (local embeddings only). Empty until
 * the note has been indexed — ~30 s after an edit settles.
 */
export const RELATED_NOTES = gql`
    query RelatedNotes($noteId: ID!, $limit: Int) {
        relatedNotes(noteId: $noteId, limit: $limit) {
            id
            title
            type
            updatedAt
            score
            snippet
        }
    }
`;

// "You already have a note about this" — DOCS/AI_IDEAS.md #3. A read that
// writes nothing: the tag chips go through `updateNote` like any other tag
// edit, and the link chips through the ordinary body edit.
export const SUGGEST_FOR_NOTE = gql`
    query SuggestForNote($noteId: ID, $title: String!, $excerpt: String!, $tags: [String!]!) {
        suggestForNote(noteId: $noteId, title: $title, excerpt: $excerpt, tags: $tags) {
            tags {
                tag
                score
            }
            related {
                id
                title
                score
                why
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
 * A note's history, newest first.
 *
 * `content` is deliberately absent — the server omits it from the list, and
 * pulling twenty bodies of a 12k note to render a list of timestamps is a
 * payload nobody asked for. `GET_NOTE_VERSION` fetches one when it is wanted.
 */
export const GET_NOTE_VERSIONS = gql`
    query GetNoteVersions($noteId: ID!) {
        noteVersions(noteId: $noteId) {
            id
            noteId
            title
            type
            reason
            createdAt
        }
    }
`;

export const GET_NOTE_VERSION = gql`
    query GetNoteVersion($id: ID!) {
        noteVersion(id: $id) {
            id
            noteId
            title
            content
            type
            reason
            createdAt
        }
    }
`;

/**
 * A note's outgoing [[links]], resolved by the gateway (DOCS/CONTEXT.md §12).
 * Its own small query rather than a field on GET_NOTE_BY_ID, so rendered
 * markdown can turn `[[Title]]` into a link without every other reader of
 * the note (and every mock of it) carrying the field. Needs the gateway from
 * 2026-09-30.
 */
export const NOTE_LINKS = gql`
    query NoteLinks($id: ID!) {
        note(id: $id) {
            id
            links {
                key
                title
                noteId
            }
        }
    }
`;

/** Notes that link to this one, with the words around the link. */
export const BACKLINKS = gql`
    query Backlinks($noteId: ID!) {
        backlinks(noteId: $noteId) {
            id
            title
            type
            updatedAt
            snippet
        }
    }
`;

/** Titles for the [[ picker: containing q, prefix matches first. No bodies. */
export const NOTE_TITLES = gql`
    query NoteTitles($q: String, $limit: Int) {
        noteTitles(q: $q, limit: $limit) {
            id
            title
            type
            updatedAt
        }
    }
`;

/** A sketch's automatic transcript state (DOCS/AUTO_TRANSCRIBE_SPEC.md). */
export const SKETCH_TRANSCRIPT = gql`
    query SketchTranscript($noteId: ID!) {
        sketchTranscript(noteId: $noteId) {
            ${SKETCH_TRANSCRIPT_FIELDS}
        }
    }
`;
