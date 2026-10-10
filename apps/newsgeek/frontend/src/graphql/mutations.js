/** Admin-only writes (the gateway enforces requireAdminUser; the UI only hides them). */
import { gql } from '@apollo/client';
import { SOURCE_FIELDS } from './queries';

export const CREATE_NEWS_SOURCE = gql`
  mutation NewsCreateSource($input: NewsSourceInput!) {
    newsCreateSource(input: $input) {
      ...NewsSourceFields
    }
  }
  ${SOURCE_FIELDS}
`;

export const UPDATE_NEWS_SOURCE = gql`
  mutation NewsUpdateSource($id: ID!, $input: NewsSourceInput!) {
    newsUpdateSource(id: $id, input: $input) {
      ...NewsSourceFields
    }
  }
  ${SOURCE_FIELDS}
`;

export const SET_NEWS_SOURCE_STATUS = gql`
  mutation NewsSetSourceStatus($id: ID!, $status: String!) {
    newsSetSourceStatus(id: $id, status: $status) {
      ...NewsSourceFields
    }
  }
  ${SOURCE_FIELDS}
`;

export const CHECK_NEWS_SOURCE_NOW = gql`
  mutation NewsCheckSourceNow($id: ID!) {
    newsCheckSourceNow(id: $id) {
      ...NewsSourceFields
    }
  }
  ${SOURCE_FIELDS}
`;
