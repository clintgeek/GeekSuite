import { gql } from '@apollo/client';

export const CREATE_API_KEY = gql`
  mutation CreateAPIKey($name: String!, $appName: String!, $description: String, $permissions: [String], $rateLimit: JSON, $expiresAt: Date) {
    createAPIKey(name: $name, appName: $appName, description: $description, permissions: $permissions, rateLimit: $rateLimit, expiresAt: $expiresAt)
  }
`;

export const UPDATE_API_KEY = gql`
  mutation UpdateAPIKey($id: ID!, $name: String, $description: String, $permissions: [String], $rateLimit: JSON, $expiresAt: Date, $isActive: Boolean) {
    updateAPIKey(id: $id, name: $name, description: $description, permissions: $permissions, rateLimit: $rateLimit, expiresAt: $expiresAt, isActive: $isActive) {
      id
      name
      appName
      isActive
    }
  }
`;

export const DELETE_API_KEY = gql`
  mutation DeleteAPIKey($id: ID!) {
    deleteAPIKey(id: $id) {
      success
      message
    }
  }
`;

export const REGENERATE_API_KEY = gql`
  mutation RegenerateAPIKey($id: ID!) {
    regenerateAPIKey(id: $id)
  }
`;

export const SAVE_AI_CONFIG = gql`
  mutation SaveAIConfig($config: JSON!) {
    saveAIConfig(config: $config)
  }
`;

export const TEST_AI_PROVIDER = gql`
  mutation TestAIProvider($provider: String!) {
    testAIProvider(provider: $provider)
  }
`;

export const RESET_AI_STATS = gql`
  mutation ResetAIStats {
    resetAIStats
  }
`;

export const SEED_DIRECTOR_PRICING = gql`
  mutation SeedDirectorPricing {
    seedDirectorPricing
  }
`;

export const SEED_DIRECTOR_FREE_TIER = gql`
  mutation SeedDirectorFreeTier {
    seedDirectorFreeTier
  }
`;

export const SYNC_PROVIDER_MODELS = gql`
  mutation SyncProviderModels($provider: String!) {
    syncProviderModels(provider: $provider)
  }
`;

export const UPDATE_MODEL_PRICING = gql`
  mutation UpdateModelPricing($provider: String!, $modelId: String!, $inputPrice: Float!, $outputPrice: Float!) {
    updateModelPricing(provider: $provider, modelId: $modelId, inputPrice: $inputPrice, outputPrice: $outputPrice)
  }
`;

export const UPDATE_MODEL_FREE_TIER = gql`
  mutation UpdateModelFreeTier($provider: String!, $modelId: String!, $isFree: Boolean!, $freeLimits: JSON, $notes: String) {
    updateModelFreeTier(provider: $provider, modelId: $modelId, isFree: $isFree, freeLimits: $freeLimits, notes: $notes)
  }
`;
