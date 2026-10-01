import { gql } from '@apollo/client';

export const GET_NOTES = gql`
    query GetNotes($tag: String, $prefix: String, $under: String, $type: String, $limit: Int) {
        notes(tag: $tag, prefix: $prefix, under: $under, type: $type, limit: $limit) {
            id
            title
            content
            type
            tags
            pinned
            pinnedAt
            createdAt
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
        }
    }
`;

/**
 * Search. `hybrid: true` asks the gateway to also match by meaning (local
 * embeddings, DOCS/CONTEXT.md §11) and fuse the two lists; `matchedBy` says
 * how each row matched and `why` is the passage a meaning hit matched on.
 * Needs the gateway from 2026-09-30 — an older one rejects `hybrid`.
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
