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
    mutation UpdateNote($id: ID!, $title: String, $content: String, $type: String, $tags: [String!]) {
        updateNote(id: $id, title: $title, content: $content, type: $type, tags: $tags) {
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
