/**
 * Who may write (plan "Reader-added sources"; the gateway enforces it, the UI
 * only hides what it would refuse):
 * - newsCreateSource: any signed-in reader (on for them, off for others);
 * - newsUpdateSource / newsSetSourceStatus / newsCheckSourceNow: the adder or an admin;
 * - newsSetSourceDefaultOn: admins ("On for everyone");
 * - newsSetSourceOn / newsSetPrefs / newsSetSourceSubscribed / newsSetPublisherPref:
 *   any reader, their own prefs.
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
      readerLinks {
        label
        template
      }
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

/** A reader's own on/off for one source. Selects only what the switch moves. */
export const SET_NEWS_SOURCE_ON = gql`
  mutation NewsSetSourceOn($id: ID!, $on: Boolean!) {
    newsSetSourceOn(id: $id, on: $on) {
      id
      onForMe
      defaultOn
    }
  }
`;

/** Admin: "On for everyone". */
export const SET_NEWS_SOURCE_DEFAULT_ON = gql`
  mutation NewsSetSourceDefaultOn($id: ID!, $on: Boolean!) {
    newsSetSourceDefaultOn(id: $id, on: $on) {
      id
      onForMe
      defaultOn
    }
  }
`;

/** Source sheet: the reader's own "I subscribe" for a source (kept through Free to read). */
export const SET_NEWS_SOURCE_SUBSCRIBED = gql`
  mutation NewsSetSourceSubscribed($id: ID!, $on: Boolean!) {
    newsSetSourceSubscribed(id: $id, on: $on) {
      id
      subscribedByMe
    }
  }
`;

/**
 * Source sheet, aggregator items: "I subscribe" / "Hide this publisher" by the
 * publisher's domain. Send only the flag that changes; an omitted one is kept.
 */
export const SET_NEWS_PUBLISHER_PREF = gql`
  mutation NewsSetPublisherPref($domain: String!, $subscribed: Boolean, $muted: Boolean) {
    newsSetPublisherPref(domain: $domain, subscribed: $subscribed, muted: $muted) {
      subscribedSourceIds
      subscribedDomains
      mutedDomains
    }
  }
`;
