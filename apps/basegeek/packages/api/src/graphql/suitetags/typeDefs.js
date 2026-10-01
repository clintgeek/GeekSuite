import { gql } from 'graphql-tag';

// Tags across the suite (2026-10-01, DOCS/TAG_STANDARD.md). NoteGeek, BuJoGeek
// and ThingGeek share one tag spelling (@geeksuite/tags), so a tag means the
// same thing in each; these two queries read all three at once.
export const typeDefs = gql`
  """How many of the caller's items carry a tag in one app."""
  type SuiteTagAppCount {
    """notegeek | bujogeek | thinggeek"""
    app: String!
    count: Int!
  }

  """One tag, in the suite standard, with where it is used."""
  type SuiteTag {
    tag: String!
    """Items carrying exactly this tag, across the apps (not its sub-tags)."""
    total: Int!
    apps: [SuiteTagAppCount!]!
  }

  """
  An item carrying a tag, from any of the three apps. A private BuJoGeek task
  is "Private task" with no snippet; a ThingGeek thing is its name only —
  never an identifier (serial, plate, receipt).
  """
  type SuiteTaggedItem {
    app: String!
    id: ID!
    title: String!
    snippet: String
    """The item's page in its own app (absolute URL)."""
    url: String!
    tags: [String!]!
    updatedAt: Date
  }

  extend type Query {
    """
    The caller's tags across NoteGeek, BuJoGeek and (for household members)
    ThingGeek, with per-app counts. Sorted by total, then name.
    """
    suiteTags: [SuiteTag!]!
    """
    Items carrying the tag — or, with under: true, the tag or anything
    beneath it — across the three apps. apps narrows to some of them.
    At most 50 per app, newest first.
    """
    taggedAcross(tag: String!, under: Boolean, apps: [String!]): [SuiteTaggedItem!]!
  }
`;
