import { gql } from 'graphql-tag';

// Shared base schemas that can be extended by any subgraph
export const baseTypeDefs = gql`
  type PaginationInfo {
    totalItems: Int!
    totalPages: Int!
    currentPage: Int!
    limit: Int!
  }

  type ErrorResponse {
    code: String!
    message: String!
    details: String
  }
`;
