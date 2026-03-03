import { gql } from 'graphql-tag';

// Shared base schemas that can be extended by any subgraph.
// Note: Each subgraph must declare its own `extend schema @link(...)` for Federation 2.
export const baseTypeDefs = gql`
  type PaginationInfo @shareable {
    totalItems: Int!
    totalPages: Int!
    currentPage: Int!
    limit: Int!
  }

  type ErrorResponse @shareable {
    code: String!
    message: String!
    details: String
  }
`;
