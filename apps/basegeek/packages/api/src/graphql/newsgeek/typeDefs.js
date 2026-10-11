import { gql } from 'graphql-tag';

// NewsGeek — local-first news briefing. Contract: DOCS/NEWSGEEK_PLAN.md "Gateway API, N0".
// Reads need a signed-in suite user. Reader-added sources (plan "Reader-added sources"):
// any signed-in user may create a source (off for everyone else); its adder may edit,
// check, and set it active/retired; admins may do anything, plus "On for everyone".
// newsSetPrefs / newsSetSourceOn write only the caller's own prefs row.
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
    # Reader-added sources
    defaultOn: Boolean!  # on for every reader unless they switch it off (missing = true)
    onForMe: Boolean!    # the caller sees its articles (not retired + the visibility rule)
    addedByMe: Boolean!
    canEdit: Boolean!    # admin, or the caller added it
    addedByName: String  # admins only; null for everyone else
    # Source sheet: the caller subscribes (kept through "Free to read").
    subscribedByMe: Boolean!
  }

  # A publisher Google News keeps surfacing that no source reads directly.
  type NewsSuggestion {
    domain: String!
    count: Int!
    lastSeenAt: Date!
    places: [NewsPlace!]!
    sampleTitles: [String!]!
    paywalled: Boolean!
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
    # The real publisher's host (lower-case, no www.); null when unknown.
    publisherDomain: String
    # The source is an aggregator (Google News): the publisher isn't the source.
    viaAggregator: Boolean!
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
    readerLinks: [NewsReaderLink!]!
    # Source sheet (Chef, 2026-10-10). Sources and publisher domains the reader
    # subscribes to (kept through "Free to read"); publisher domains they hid
    # (aggregator items only).
    subscribedSourceIds: [ID!]!
    subscribedDomains: [String!]!
    mutedDomains: [String!]!
  }

  # "Open with…": a reader's own link template. {url} (required) and {title}
  # are replaced by the client; the gateway only stores it.
  type NewsReaderLink {
    label: String!
    template: String!
  }

  type NewsViewer {
    isAdmin: Boolean!
  }

  input NewsReaderLinkInput {
    label: String!
    template: String!
  }

  input NewsPrefsInput {
    freeToReadOnly: Boolean
    # When provided, replaces the whole list (max 5); omitted = unchanged.
    readerLinks: [NewsReaderLinkInput!]
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
    defaultOn: Boolean   # admins only (ADMIN_REQUIRED otherwise); create defaults to true for admins
  }

  extend type Query {
    newsViewer: NewsViewer!
    newsPrefs: NewsPrefs!
    newsPlaces: [NewsPlace!]!
    newsSources(status: String): [NewsSource!]!
    newsSource(id: ID!): NewsSource
    # Chronological, newest first. N0's reading view. The briefing replaces it in N2.
    newsArticles(section: String, placeId: ID, sourceId: ID, before: Date, limit: Int): NewsArticlePage!
    # Aggregator articles, last 30 days, grouped by publisher domain, minus domains a
    # non-aggregator source already reads; top 30 by count.
    newsSuggestedSources: [NewsSuggestion!]!
  }

  extend type Mutation {
    # Any signed-in user. Non-admin: defaultOn false, status active, never an aggregator;
    # 20 per rolling 24h and 200 in total (RATE_LIMITED). A feed URL another source
    # already has → DUPLICATE_FEED with extensions.sourceId.
    newsCreateSource(input: NewsSourceInput!): NewsSource!
    # The adder of that source, or an admin.
    newsUpdateSource(id: ID!, input: NewsSourceInput!): NewsSource!
    # The adder may set only active / retired; admins any status.
    newsSetSourceStatus(id: ID!, status: String!): NewsSource!
    newsCheckSourceNow(id: ID!): NewsSource!
    # Any signed-in user; the caller's own switch.
    newsSetSourceOn(id: ID!, on: Boolean!): NewsSource!
    # Any signed-in user; the caller's own "I subscribe" for a source.
    newsSetSourceSubscribed(id: ID!, on: Boolean!): NewsSource!
    # Any signed-in user; the caller's own prefs for a publisher domain seen
    # through an aggregator. Omitted flag = unchanged. domain must be a bare host.
    newsSetPublisherPref(domain: String!, subscribed: Boolean, muted: Boolean): NewsPrefs!
    # Admin: "On for everyone".
    newsSetSourceDefaultOn(id: ID!, on: Boolean!): NewsSource!
    # Any signed-in user; writes only the caller's own row (userId from the session).
    newsSetPrefs(input: NewsPrefsInput!): NewsPrefs!
  }
`;
