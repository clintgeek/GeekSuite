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

  type FreeTierUpdate {
    provider: String!
    modelId: String!
    isFree: Boolean!
    freeLimits: FreeTierLimits
    notes: String
  }

  input FreeTierLimitsInput {
    requestsPerMinute: Int
    requestsPerDay: Int
    tokensPerMinute: Int
    tokensPerDay: Int
    audioSecondsPerHour: Int
    audioSecondsPerDay: Int
  }

  input FreeTierUpdateInput {
    provider: String!
    modelId: String!
    isFree: Boolean!
    freeLimits: FreeTierLimitsInput
    notes: String
  }

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
    seedDirectorPricing: Boolean
    seedDirectorFreeTier: Boolean

    # Model Management
    syncProviderModels(provider: String!): JSON
    updateModelPricing(provider: String!, modelId: String!, inputPrice: Float!, outputPrice: Float!): JSON
    deleteModelPricing(provider: String!, modelId: String!): Boolean
    updateModelFreeTier(provider: String!, modelId: String!, isFree: Boolean!, freeLimits: JSON, notes: String): JSON
    deleteModelFreeTier(provider: String!, modelId: String!): Boolean
    resetAllFreeTiers: Int!
    bulkUpdateFreeTiers(updates: [FreeTierUpdateInput!]!): [FreeTierUpdate!]!

    # App Routing
    saveAIAppConfig(appName: String!, config: JSON!): JSON
    deleteAIAppConfig(appName: String!): Boolean
  }
`;
