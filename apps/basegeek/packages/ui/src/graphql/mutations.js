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


export const REMOVE_AI_PROVIDER_KEY = gql`
  mutation RemoveAIProviderKey($provider: String!) {
    removeAIProviderKey(provider: $provider)
  }
`;

export const RESET_AI_STATS = gql`
  mutation ResetAIStats {
    resetAIStats
  }
`;

// SEED_DIRECTOR_PRICING / SEED_DIRECTOR_FREE_TIER were here until 2026-09-07.
// Both mutations are gone from the schema: the catalog is observed by the
// catalog job now, so there is no hand-typed default to restore.
//
// Six more went the same way in Phase 3 (2026-09-07,
// apps/basegeek/DOCS/AIGEEK_STATUS_PAGE.md §3), when the console became a
// status page and the controls behind them were deleted:
//
//   UPDATE_MODEL_PRICING · UPDATE_MODEL_FREE_TIER · RESET_ALL_FREE_TIERS ·
//   BULK_UPDATE_FREE_TIERS — the four server mutations went with them; the
//   catalog job observes prices, free-tier flags and quotas now.
//   TEST_AI_PROVIDER — the provider row's live chip is the test.
//   SYNC_PROVIDER_MODELS — the job syncs on a schedule; `syncProviderModels`
//   and `testAIProvider` stay in the schema because REST twins still serve
//   them (`POST /api/ai/test`, `POST /api/ai/models/:provider/refresh`).






export const SAVE_AI_APP_CONFIG = gql`
  mutation SaveAIAppConfig($appName: String!, $config: JSON!) {
    saveAIAppConfig(appName: $appName, config: $config)
  }
`;

export const DELETE_AI_APP_CONFIG = gql`
  mutation DeleteAIAppConfig($appName: String!) {
    deleteAIAppConfig(appName: $appName)
  }
`;
