import { gql } from '@apollo/client';

export const GET_NOTES = gql`
    query GetNotes($tag: String, $prefix: String, $type: String, $limit: Int) {
        notes(tag: $tag, prefix: $prefix, type: $type, limit: $limit) {
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

export const SEARCH_NOTES = gql`
    query SearchNotes($q: String!) {
        searchNotes(q: $q) {
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
