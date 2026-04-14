import { gql } from '@apollo/client';

export const GET_API_KEYS = gql`
  query GetAPIKeys {
    apiKeys {
      id
      name
      appName
      description
      keyPrefix
      permissions
      rateLimit
      usage
      isActive
      expiresAt
      createdAt
      updatedAt
      isExpired
    }
  }
`;

export const GET_API_KEYS_APPS_LIST = gql`
  query GetAPIKeysAppsList {
    apiKeysAppsList {
      appName
      keyCount
      totalRequests
      lastUsed
    }
  }
`;

export const GET_AI_CONFIG = gql`
  query GetAIConfig {
    aiConfig
  }
`;

export const GET_AI_STATS = gql`
  query GetAIStats {
    aiStats
  }
`;

export const GET_AI_DIRECTOR_MODELS = gql`
  query GetAIDirectorModels {
    aiDirectorModels
  }
`;

export const GET_AI_USAGE = gql`
  query GetAIUsage($provider: String!) {
    aiUsage(provider: $provider)
  }
`;

export const GET_AI_APP_CONFIGS = gql`
  query GetAIAppConfigs {
    aiAppConfigs
  }
`;
