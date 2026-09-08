import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type FreeTierLimits {
    requestsPerMinute: Int
    requestsPerDay: Int
    tokensPerMinute: Int
    tokensPerDay: Int
    audioSecondsPerHour: Int
    audioSecondsPerDay: Int
  }

  # FreeTierUpdate / FreeTierUpdateInput / FreeTierLimitsInput were here until
  # Phase 3 (2026-09-07). They existed only for bulkUpdateFreeTiers, the
  # Catalog tab's Save-all, which is gone with the tab
  # (apps/basegeek/DOCS/AIGEEK_STATUS_PAGE.md §3). FreeTierLimits above stays:
  # the model steward's reads still return it.

  # ── Model steward ────────────────────────────────────────────────────────
  # aiGeek answering two questions for the apps that route through it:
  # "what free models exist right now, and what are they good at?" and
  # "which one fits this task?". Both are read-only and authenticated but NOT
  # admin — StartGeek Ask has to be able to ask, and neither returns a
  # credential or anything derived from one.

  type AIModelPerformance {
    speed: String
    quality: String
    reasoning: String
  }

  type AIModelPricing {
    input: Float
    output: Float
  }

  """
  One model, flattened. Every capability flag is non-null so a client can
  trust supportsJSONOutput == false rather than having to tell false from
  "we never asked". Nullable fields are the ones the catalog genuinely may
  not know: context window, pricing, freshness stamps.
  """
  type AIFreeModel {
    provider: String!
    modelId: String!
    name: String!
    contextWindow: Int
    maxTokens: Int
    supportsFunctionCalling: Boolean!
    supportsToolCalling: Boolean!
    supportsJSONOutput: Boolean!
    supportsJSONMode: Boolean!
    supportsJSONSchema: Boolean!
    supportsVision: Boolean!
    supportsAudio: Boolean!
    isFree: Boolean!
    performance: AIModelPerformance!
    freeLimits: FreeTierLimits!
    pricing: AIModelPricing!
    notes: String
    # lastSeen: when the catalog last confirmed this id exists upstream.
    # updatedAt: when what we believe about it last changed.
    lastSeen: Date
    updatedAt: Date
  }

  """
  A ranked candidate. reasoning is the human sentence; score is 0-100
  capability fit, a tiebreaker inside the priority ordering rather than the
  ordering itself.
  """
  type AIRecommendedModel {
    provider: String!
    modelId: String!
    name: String!
    reasoning: String!
    score: Float
    isFree: Boolean!
    contextWindow: Int
    maxTokens: Int
    supportsFunctionCalling: Boolean!
    supportsToolCalling: Boolean!
    supportsJSONOutput: Boolean!
    supportsJSONMode: Boolean!
    supportsJSONSchema: Boolean!
    supportsVision: Boolean!
    supportsAudio: Boolean!
    performance: AIModelPerformance!
    freeLimits: FreeTierLimits!
    pricing: AIModelPricing!
    notes: String
  }

  """What the task description was read as — shown back so a human can correct it."""
  type AITaskRequirements {
    needsVision: Boolean!
    needsAudio: Boolean!
    needsFunctionCalling: Boolean!
    needsReasoning: Boolean!
    needsCodeGeneration: Boolean!
    needsJSONOutput: Boolean!
    maxTokens: Int
  }

  type AIRecommendation {
    task: String!
    priority: String!
    freeOnly: Boolean!
    requirements: AITaskRequirements!
    recommendations: [AIRecommendedModel!]!
  }

  type APIKey {
    id: ID!
    name: String!
    appName: String!
    description: String
    keyPrefix: String
    permissions: [String]
    rateLimit: JSON
    usage: JSON
    isActive: Boolean
    expiresAt: Date
    createdAt: Date
    updatedAt: Date
    isExpired: Boolean
  }

  type APIKeyAppUsage {
    appName: String!
    keyCount: Int
    totalRequests: Int
    lastUsed: Date
  }

  extend type Query {
    # API Keys
    apiKeys: [APIKey]
    apiKeysAppsList: [APIKeyAppUsage]
    apiKey(id: ID!): APIKey

    # AI Geek
    aiConfig: JSON
    aiStats: JSON
    aiDirectorModels: JSON
    aiUsage(provider: String!): JSON

    # Model steward — authenticated, not admin. Apps ask these to fill their
    # own routing config; the AIGeek App Routing dialog asks the same two.
    aiFreeModels: [AIFreeModel!]!
    aiRecommendModel(task: String!, priority: String, freeOnly: Boolean, limit: Int): AIRecommendation!

    # App Routing
    aiAppConfigs: JSON
    aiAppConfig(appName: String!): JSON
  }

  extend type Mutation {
    # API Keys
    createAPIKey(name: String!, appName: String!, description: String, permissions: [String], rateLimit: JSON, expiresAt: Date): JSON
    updateAPIKey(id: ID!, name: String, description: String, permissions: [String], rateLimit: JSON, expiresAt: Date, isActive: Boolean): APIKey
    deleteAPIKey(id: ID!): DeleteResponse
    regenerateAPIKey(id: ID!): JSON

    # AI Geek
    saveAIConfig(config: JSON!): JSON
    testAIProvider(provider: String!): Boolean
    resetAIStats: Boolean
    # seedDirectorPricing / seedDirectorFreeTier retired 2026-09-07: the catalog
    # is observed by the catalog job now, not seeded from a hand-typed table.
    # See apps/basegeek/DOCS/AIGEEK_CATALOG_JOB.md.

    # Model Management
    #
    # updateModelPricing, updateModelFreeTier, resetAllFreeTiers and
    # bulkUpdateFreeTiers were here until Phase 3 (2026-09-07). Every one of
    # them wrote a claim about a vendor that the catalog job now *observes* —
    # the listing gives prices, the nightly probe gives the free-tier flag and
    # its fitness, and the x-ratelimit-* headers on real calls give the quotas
    # — and the admin controls behind all four were deleted with the Catalog
    # tab (apps/basegeek/DOCS/AIGEEK_STATUS_PAGE.md §3). The console was the
    # only caller of all four.
    #
    # The per-row escape hatch they stood in for becomes AIFreeTier.override
    # ('deny' | 'allow' | null) and its own mutation; until that lands, the
    # status page's override drawer renders disabled rather than pretending.
    #
    # syncProviderModels survives with no GraphQL caller: its REST twins
    # (POST /api/ai/models/:provider/refresh, /api/ai/director/force-refresh)
    # are the documented manual refresh, and dropping one spelling of a live
    # capability is a separate decision from deleting a dead control.
    syncProviderModels(provider: String!): JSON
    deleteModelPricing(provider: String!, modelId: String!): Boolean
    deleteModelFreeTier(provider: String!, modelId: String!): Boolean

    # App Routing
    saveAIAppConfig(appName: String!, config: JSON!): JSON
    deleteAIAppConfig(appName: String!): Boolean
  }
`;
