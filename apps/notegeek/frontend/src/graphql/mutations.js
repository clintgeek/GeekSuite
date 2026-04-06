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

export const CREATE_FOLDER = gql`
    mutation CreateFolder($name: String!, $parentId: ID, $icon: String, $color: String) {
        createFolder(name: $name, parentId: $parentId, icon: $icon, color: $color) {
            id
            name
            parentId
            icon
            color
            createdAt
            updatedAt
        }
    }
`;

export const UPDATE_FOLDER = gql`
    mutation UpdateFolder($id: ID!, $name: String, $parentId: ID, $icon: String, $color: String) {
        updateFolder(id: $id, name: $name, parentId: $parentId, icon: $icon, color: $color) {
            id
            name
            parentId
            icon
            color
            createdAt
            updatedAt
        }
    }
`;

export const DELETE_FOLDER = gql`
    mutation DeleteFolder($id: ID!, $deleteNotes: Boolean) {
        deleteFolder(id: $id, deleteNotes: $deleteNotes)
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
