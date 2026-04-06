import { gql } from '@apollo/client';

export const CREATE_NOTE = gql`
    mutation CreateNote($title: String, $content: String!, $type: String, $tags: [String!]) {
        createNote(title: $title, content: $content, type: $type, tags: $tags) {
            id
            title
        }
    }
`;
