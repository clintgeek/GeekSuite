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
    # Front page (2026-10-11): the caller's priority for this source:
    # favorite | normal | less (ranking.js PRIORITY_WEIGHT).
    priorityForMe: String!
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
    # Front page (2026-10-11), per reader: the story's own section for the
    # caller (local | state | national | world | tech; ranking.js sectionOf),
    # and why it is where it is, as chips ("Arkadelphia", "★ Favorite",
    # "Arkansas", "Official"). If it can't be a chip it isn't in the score.
    section: String!
    why: [String!]!
  }

  # Today (the front page): sections in order, each capped by the reader's
  # quota (a cap, never a target). Empty sections are omitted.
  type NewsFrontPage {
    generatedAt: Date!
    sections: [NewsFrontSection!]!
  }

  type NewsFrontSection {
    key: String!         # local | state | national | world | tech
    title: String!
    items: [NewsArticle!]!
    # Stories in this section's window that didn't make the page.
    moreCount: Int!
  }

  # Per-section caps for Today. Defaults: local 8, state 5, national 5, world 3, tech 4.
  type NewsSectionQuotas {
    local: Int!
    state: Int!
    national: Int!
    world: Int!
    tech: Int!
  }

  input NewsSectionQuotasInput {
    local: Int
    state: Int
    national: Int
    world: Int
    tech: Int
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
    # Front page (2026-10-11). The reader's ring, closest first: stories
    # tagged with these places (or places inside them) are Local.
    homePlaces: [NewsPlace!]!
    favoriteSourceIds: [ID!]!
    lessSourceIds: [ID!]!
    # Resolved: the reader's overrides over the defaults.
    sectionQuotas: NewsSectionQuotas!
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
    # Today's per-section caps (0–20). Provided sections replace the stored
    # override; omitted ones are unchanged.
    sectionQuotas: NewsSectionQuotasInput
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
    # Chronological, newest first: Everything, or one section page. "section"
    # filters by the story's per-reader section (NewsArticle.section), not the
    # source's labels (2026-10-11).
    newsArticles(section: String, placeId: ID, sourceId: ID, before: Date, limit: Int): NewsArticlePage!
    # Today: the ranked front page for the caller (ranking.js).
    newsFrontPage: NewsFrontPage!
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
    # The caller's ring, closest first (max 12, distinct, known places). Replaces the list.
    newsSetHomePlaces(placeIds: [ID!]!): NewsPrefs!
    # The caller's priority for a source: favorite | normal | less.
    newsSetSourcePriority(id: ID!, priority: String!): NewsSource!
  }
`;
