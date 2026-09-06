import { gql } from 'graphql-tag';

// Shared types used across multiple apps — defined once here
export const sharedTypeDefs = gql`
  """Where an AI-assisted result came from. A source of "fallback" means no model was consulted (services/aiFeatureRunner.js)."""
  type AIProvenance {
    source: String!
    reason: String
    model: String
    provider: String
    cached: Boolean!
    callsToday: Int!
    cap: Int
  }

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
