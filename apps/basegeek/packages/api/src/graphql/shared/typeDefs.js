import { gql } from 'graphql-tag';

// Shared types used across multiple apps — defined once here
export const sharedTypeDefs = gql`
  scalar Date
  scalar JSON

  type DeleteResponse {
    success: Boolean!
    message: String
  }

  type SaveOrderResponse {
    success: Boolean!
    updatedAt: String
  }

  type TagCount {
    tag: String!
    count: Int!
  }
`;
