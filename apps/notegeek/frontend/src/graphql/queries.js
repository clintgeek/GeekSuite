import { gql } from '@apollo/client';

export const GET_NOTES = gql`
    query GetNotes($tag: String, $prefix: String) {
        notes(tag: $tag, prefix: $prefix) {
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
