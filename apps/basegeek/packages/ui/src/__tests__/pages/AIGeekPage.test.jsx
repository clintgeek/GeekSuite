import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import AIGeekPage from '../../pages/AIGeekPage';
import { renderWithProviders } from '../testUtils';
import { apolloClient } from '../../apolloClient';

vi.mock('../../apolloClient', () => ({
  apolloClient: { query: vi.fn(), mutate: vi.fn() },
}));

/** The operation name off a gql DocumentNode — mirrors how the gateway (and
 * bookgeek's `profileOperations.test.js`) inspect these documents. Lets the
 * mock route by *what is being asked*, not by which JS reference was passed
 * in — the same thing a real network layer would key on. */
const opName = (doc) => doc.definitions.find((d) => d.kind === 'OperationDefinition')?.name?.value;

const API_KEYS = [
  {
    id: 'k1', name: 'Prod key', appName: 'fitnessgeek', description: '', keyPrefix: 'bg_abcd',
    permissions: ['ai:call'], rateLimit: { requestsPerMinute: 60, requestsPerDay: 10000 },
    usage: { totalRequests: 12, lastUsed: null }, isActive: true, isExpired: false, expiresAt: null,
  },
];

const APP_CONFIGS = [
  { appName: 'fitnessgeek', displayName: 'fitnessgeek', tier: 'free', provider: null, model: null, enabled: true, notes: '', lastSeen: null, fallbackOrder: [] },
];

const FREE_MODELS = [
  {
    provider: 'groq', modelId: 'llama-3.3-70b', name: 'Llama 3.3 70B', contextWindow: 131072,
    supportsFunctionCalling: true, supportsJSONOutput: true, supportsVision: false, isFree: true,
    performance: { speed: 'fast', quality: 'good', reasoning: 'ok' },
    freeLimits: {}, pricing: {}, notes: '', lastSeen: null, updatedAt: null,
  },
];

/** Every fetch useAIGeek fires on mount, plus the on-demand steward queries,
 * routed by operation name so callers don't need to know import order. */
function mockGraphQL({ recommendations = [] } = {}) {
  apolloClient.query.mockImplementation(({ query }) => {
    switch (opName(query)) {
      case 'GetAIConfig':
        return Promise.resolve({ data: { aiConfig: {} } });
      case 'GetAIStats':
        return Promise.resolve({ data: { aiStats: { totalCalls: 0, totalTokens: 0, totalCost: 0, providerUsage: {}, appUsage: {} } } });
      case 'GetAIDirectorModels':
        return Promise.resolve({ data: { aiDirectorModels: null } });
      case 'GetAIAppConfigs':
        return Promise.resolve({ data: { aiAppConfigs: { configs: APP_CONFIGS, discoveredApps: [] } } });
      case 'GetAPIKeys':
        return Promise.resolve({ data: { apiKeys: API_KEYS } });
      case 'GetAIFreeModels':
        return Promise.resolve({ data: { aiFreeModels: FREE_MODELS } });
      case 'RecommendAIModel':
        return Promise.resolve({ data: { aiRecommendModel: { recommendations } } });
      default:
        return Promise.reject(new Error(`unmocked query: ${opName(query)}`));
    }
  });
  apolloClient.mutate.mockResolvedValue({ data: {} });
}

describe('AIGeekPage', () => {
  beforeEach(() => {
    apolloClient.query.mockReset();
    apolloClient.mutate.mockReset();
  });

  it('renders all four tabs, defaulting to Configuration', async () => {
    mockGraphQL();
    renderWithProviders(<AIGeekPage />);
    expect(screen.getByRole('tab', { name: /Configuration/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Usage & Cost/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Apps & keys/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Catalog/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('AI Provider Configuration')).toBeInTheDocument());
  });

  it('switching to Usage & Cost renders its panel', async () => {
    mockGraphQL();
    renderWithProviders(<AIGeekPage />);
    await waitFor(() => expect(screen.getByText('AI Provider Configuration')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Usage & Cost/ }));
    expect(await screen.findByText('Usage Statistics')).toBeInTheDocument();
  });

  it('switching to Catalog renders its panel', async () => {
    mockGraphQL();
    renderWithProviders(<AIGeekPage />);
    await waitFor(() => expect(screen.getByText('AI Provider Configuration')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Catalog/ }));
    expect(await screen.findByText('AI Catalog')).toBeInTheDocument();
  });

  it('switching to Apps & keys lists the key returned by the mocked GET_API_KEYS query, grouped under its app', async () => {
    mockGraphQL();
    renderWithProviders(<AIGeekPage />);
    await waitFor(() => expect(screen.getByText('AI Provider Configuration')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Apps & keys/ }));

    expect(await screen.findByText('fitnessgeek')).toBeInTheDocument();
    expect(await screen.findByText('Prod key')).toBeInTheDocument();
    expect(apolloClient.query).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({}) }));
  });

  it('the "Recommend a free model" flow: opening the steward, asking, and getting a recommendation from the mocked aiRecommendModel query', async () => {
    mockGraphQL({
      recommendations: [
        { provider: 'groq', modelId: 'llama-3.3-70b', name: 'Llama 3.3 70B', reasoning: 'Fast, free, and handles JSON.', score: 92, isFree: true, contextWindow: 131072, supportsFunctionCalling: true, supportsJSONOutput: true, supportsVision: false, performance: { speed: 'fast', quality: 'good', reasoning: 'ok' } },
      ],
    });
    renderWithProviders(<AIGeekPage />);
    await waitFor(() => expect(screen.getByText('AI Provider Configuration')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Apps & keys/ }));
    await screen.findByText('fitnessgeek');

    fireEvent.click(screen.getByRole('button', { name: 'Recommend a model' }));
    const taskBox = await screen.findByLabelText('What will this app ask the model to do?');

    fireEvent.change(taskBox, { target: { value: 'turn a search query into a JSON plan' } });
    fireEvent.click(screen.getByRole('button', { name: /^Recommend$/ }));

    await waitFor(() => expect(apolloClient.query).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({ task: 'turn a search query into a JSON plan' }),
    })));
    expect(await screen.findByText('Llama 3.3 70B')).toBeInTheDocument();
    expect(screen.getByText('Fast, free, and handles JSON.')).toBeInTheDocument();
  });
});
