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
