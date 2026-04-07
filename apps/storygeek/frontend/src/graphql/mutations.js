import { gql } from '@apollo/client';

export const CREATE_STORY = gql`
  mutation CreateStory($title: String!, $genre: String!, $description: String) {
    createStory(title: $title, genre: $genre, description: $description) {
      id
      title
      genre
      description
      status
      createdAt
    }
  }
`;

export const UPDATE_STORY_STATUS = gql`
  mutation UpdateStoryStatus($id: ID!, $status: String!) {
    updateStoryStatus(id: $id, status: $status) {
      id
      status
      updatedAt
    }
  }
`;

export const DELETE_STORY = gql`
  mutation DeleteStory($id: ID!) {
    deleteStory(id: $id)
  }
`;
