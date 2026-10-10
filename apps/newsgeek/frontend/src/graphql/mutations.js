/**
 * Source writes are admin-only (the gateway enforces requireAdminUser; the UI
 * only hides them). NEWS_SET_PREFS is the exception: any reader, their own row.
 */
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

export const SET_NEWS_PREFS = gql`
  mutation NewsSetPrefs($input: NewsPrefsInput!) {
    newsSetPrefs(input: $input) {
      freeToReadOnly
    }
  }
`;

export const CHECK_NEWS_SOURCE_NOW = gql`
  mutation NewsCheckSourceNow($id: ID!) {
    newsCheckSourceNow(id: $id) {
      ...NewsSourceFields
    }
  }
  ${SOURCE_FIELDS}
`;
