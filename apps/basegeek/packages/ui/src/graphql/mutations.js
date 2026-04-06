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
