import { gql } from 'graphql-tag';

// NewsGeek — local-first news briefing. Contract: DOCS/NEWSGEEK_PLAN.md "Gateway API, N0".
// Reads need a signed-in suite user; every source mutation needs an admin (requireAdminUser).
// newsSetPrefs is the exception: any signed-in user, their own row only.
// The gateway never calls the NewsGeek backend: "check now" sets the feeds' nextPollAt.
export const typeDefs = gql`
  type NewsPlace {
    id: ID!
    slug: String!
    name: String!
    kind: String!
    parentId: ID
  }

  type NewsFeed {
    id: ID!
    url: String!
    format: String!
    pollEveryMin: Int!
    lastFetchAt: Date
    lastOkAt: Date
    lastItemAt: Date
    lastNewItemAt: Date
    consecutiveFailures: Int!
    lastError: String
    lastHttpStatus: Int
    stale: Boolean!
    health: String!      # ok | stale | failing | broken | never
  }

  type NewsSourceAccess {
    paywall: String!
    content: String!
  }

  type NewsSource {
    id: ID!
    slug: String!
    name: String!
    homepage: String
    kind: String!        # journalism | official | aggregator
    sections: [String!]!
    places: [NewsPlace!]!
    status: String!
    access: NewsSourceAccess!
    feeds: [NewsFeed!]!
    blockedDomains: [String!]!
    notes: String!
    articlesLast7d: Int!
    paywalled: Boolean!  # access.paywall is metered or hard
  }

  type NewsArticle {
    id: ID!
    title: String!
    url: String!
    excerpt: String!
    publisher: String!
    publishedAt: Date!
    expiresAt: Date
    sourceId: ID!
    sourceName: String!
    sourceKind: String!
    sections: [String!]!
    places: [NewsPlace!]!
  }

  type NewsArticlePage {
    items: [NewsArticle!]!
    nextBefore: Date
    # Paywalled articles the reader's "Free to read" switch left out of this
    # list (same filters, ignoring the cursor). 0 when the switch is off.
    hiddenPaywalled: Int!
  }

  # Per reader. A user with no stored prefs gets the defaults.
  type NewsPrefs {
    freeToReadOnly: Boolean!
  }

  type NewsViewer {
    isAdmin: Boolean!
  }

  input NewsPrefsInput {
    freeToReadOnly: Boolean
  }

  input NewsFeedInput {
    url: String!
    format: String
    pollEveryMin: Int
  }

  input NewsSourceInput {
    slug: String
    name: String
    homepage: String
    kind: String
    sections: [String!]
    placeIds: [ID!]
    feeds: [NewsFeedInput!]
    paywall: String
    content: String
    blockedDomains: [String!]
    notes: String
  }

  extend type Query {
    newsViewer: NewsViewer!
    newsPrefs: NewsPrefs!
    newsPlaces: [NewsPlace!]!
    newsSources(status: String): [NewsSource!]!
    newsSource(id: ID!): NewsSource
    # Chronological, newest first. N0's reading view. The briefing replaces it in N2.
    newsArticles(section: String, placeId: ID, sourceId: ID, before: Date, limit: Int): NewsArticlePage!
  }

  extend type Mutation {
    newsCreateSource(input: NewsSourceInput!): NewsSource!
    newsUpdateSource(id: ID!, input: NewsSourceInput!): NewsSource!
    newsSetSourceStatus(id: ID!, status: String!): NewsSource!
    newsCheckSourceNow(id: ID!): NewsSource!
    # Any signed-in user; writes only the caller's own row (userId from the session).
    newsSetPrefs(input: NewsPrefsInput!): NewsPrefs!
  }
`;
