// The /aigeek surface's fixtures. It is a basegeek route (App.jsx mounts it
// behind RequireAdmin), so it rides along with basegeek's context rather than
// pretending to be a ninth app.
export const PROVIDERS = [
  'anthropic', 'groq', 'gemini', 'together', 'cohere',
  'openrouter', 'cerebras', 'cloudflare', 'ollama', 'llmgateway',
];

export const AI_CONFIG = Object.fromEntries(PROVIDERS.map((p, i) => {
  const entry = i < 4
    ? { hasKey: true, keyHint: `…${(1000 + i * 137).toString(16)}`, enabled: i !== 3 }
    : { hasKey: false, keyHint: '', enabled: false };
  if (p === 'cloudflare') entry.accountId = '';
  return [p, entry];
}));

const providerUsage = {
  groq: { calls: 1359, freeCalls: 1359, paidCalls: 0, tokens: 4460355, cost: 0, appUsage: {
    codegeek: { calls: 803, freeCalls: 803, paidCalls: 0, tokens: 2640110, cost: 0, features: {
      review: { calls: 640, freeCalls: 640, paidCalls: 0, tokens: 2100000, cost: 0 },
      'commit-message': { calls: 163, freeCalls: 163, paidCalls: 0, tokens: 540110, cost: 0 },
    } },
    storygeek: { calls: 361, freeCalls: 361, paidCalls: 0, tokens: 1204221, cost: 0, features: {
      continuity: { calls: 289, freeCalls: 289, paidCalls: 0, tokens: 990221, cost: 0 },
      synopsis: { calls: 72, freeCalls: 72, paidCalls: 0, tokens: 214000, cost: 0 },
    } },
    fitnessgeek: { calls: 120, freeCalls: 120, paidCalls: 0, tokens: 366024, cost: 0 },
    unattributed: { calls: 75, freeCalls: 75, paidCalls: 0, tokens: 250000, cost: 0 },
  } },
  cerebras: { calls: 642, freeCalls: 640, paidCalls: 2, tokens: 2088401, cost: 0.0062, appUsage: {
    codegeek: { calls: 500, freeCalls: 498, paidCalls: 2, tokens: 1700000, cost: 0.0062 },
    bujogeek: { calls: 142, freeCalls: 142, paidCalls: 0, tokens: 388401, cost: 0 },
  } },
  anthropic: { calls: 98, freeCalls: 0, paidCalls: 98, tokens: 585844, cost: 1.7602, appUsage: {
    geekpr: { calls: 87, freeCalls: 0, paidCalls: 87, tokens: 512844, cost: 1.5385, features: {
      'pr-summary': { calls: 87, freeCalls: 0, paidCalls: 87, tokens: 512844, cost: 1.5385 },
    } },
    unattributed: { calls: 11, freeCalls: 0, paidCalls: 11, tokens: 73000, cost: 0.2217 },
  } },
  gemini: { calls: 219, freeCalls: 219, paidCalls: 0, tokens: 903112, cost: 0, appUsage: {
    storygeek: { calls: 219, freeCalls: 219, paidCalls: 0, tokens: 903112, cost: 0 },
  } },
};

export const AI_STATS = {
  totalCalls: 2318,
  totalTokens: 8037712,
  totalCost: 1.7664,
  providerUsage,
  appUsage: {},
};

const mkModels = (ids) => ids.map(([id, name, input, output, free]) => ({
  id, name,
  pricing: { input, output },
  freeTier: { isFree: free, limits: free ? { requestsPerMinute: 30, requestsPerDay: 14400, tokensPerMinute: 18000, tokensPerDay: 5184000 } : {}, notes: '' },
  capabilities: {},
}));

export const DIRECTOR = {
  summary: { totalProviders: 10, totalModels: 9, providersWithKeys: 4, enabledProviders: 3 },
  providers: {
    anthropic: { hasApiKey: true, isEnabled: true, totalModels: 3, models: mkModels([
      ['claude-sonnet-5', 'Claude Sonnet 5', 2, 10, false],
      ['claude-opus-4-8', 'Claude Opus 4.8', 5, 25, false],
      ['claude-haiku-4-5', 'Claude Haiku 4.5', 1, 5, false],
    ]) },
    groq: { hasApiKey: true, isEnabled: true, totalModels: 3, models: mkModels([
      ['llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile', 0.0007, 0.0007, true],
      ['llama-3.1-8b-instant', 'Llama 3.1 8B Instant', 0.00027, 0.00027, true],
      ['openai/gpt-oss-120b', 'GPT OSS 120B', 0.002, 0.002, true],
    ]) },
    gemini: { hasApiKey: true, isEnabled: true, totalModels: 2, models: mkModels([
      ['gemini-2.5-flash', 'Gemini 2.5 Flash', 0.3, 2.5, true],
      ['gemini-2.5-pro', 'Gemini 2.5 Pro', 1.25, 10, false],
    ]) },
    cerebras: { hasApiKey: false, isEnabled: false, totalModels: 1, models: mkModels([
      ['qwen-3-235b-a22b-instruct-2507', 'Qwen3 235B Instruct', 'Unknown', 'Unknown', true],
    ]) },
    together: { hasApiKey: false, isEnabled: false, totalModels: 0, models: [] },
  },
};

export const APP_CONFIGS = {
  configs: [
    { appName: 'codegeek', displayName: 'CodeGeek', tier: 'free', provider: null, model: null, fallbackOrder: [], maxTokens: 8000, temperature: 0.7, notes: 'High-volume coding assist', enabled: true, autoDiscovered: false, lastSeen: '1757030400000' },
    { appName: 'geekpr', displayName: 'GeekPR', tier: 'specific', provider: 'anthropic', model: 'claude-sonnet-5', fallbackOrder: [], maxTokens: 4000, temperature: 0.2, notes: 'Same reviewer persona across retries', enabled: true, autoDiscovered: false, lastSeen: '1757030400000' },
    { appName: 'storygeek', displayName: 'StoryGeek', tier: 'rotation', provider: null, model: null, fallbackOrder: [], maxTokens: null, temperature: null, notes: '', enabled: true, autoDiscovered: true, lastSeen: '1757030400000' },
    { appName: 'startgeek', displayName: 'StartGeek', tier: 'specific', provider: 'groq', model: 'llama-3.1-8b-instant', fallbackOrder: [], maxTokens: 1200, temperature: 0.1, notes: 'Turns a query into a JSON search plan', enabled: true, autoDiscovered: false, lastSeen: '1757030400000' },
  ],
  discoveredApps: ['flockgeek', 'notegeek'],
};

export const API_KEYS = [
  {
    id: 'k1', name: 'codegeek production', appName: 'codegeek',
    description: 'CI reviewer + commit messages', keyPrefix: 'bg_9f2c41aa',
    permissions: ['ai:call', 'ai:models', 'ai:providers'],
    rateLimit: { requestsPerMinute: 60, requestsPerHour: 1000, requestsPerDay: 10000 },
    usage: { totalRequests: 8032, lastUsed: '2026-09-04T19:12:00.000Z', requestsToday: 402 },
    isActive: true, expiresAt: null, createdAt: '1751328000000', updatedAt: '1757030400000', isExpired: false,
  },
  {
    id: 'k2', name: 'codegeek laptop', appName: 'codegeek',
    description: '', keyPrefix: 'bg_11d70b32',
    permissions: ['ai:call'],
    rateLimit: { requestsPerMinute: 10, requestsPerHour: 120, requestsPerDay: 800 },
    usage: { totalRequests: 91, lastUsed: '2026-08-30T08:41:00.000Z', requestsToday: 0 },
    isActive: true, expiresAt: '1764547200000', createdAt: '1754006400000', updatedAt: '1757030400000', isExpired: false,
  },
  {
    id: 'k3', name: 'geekpr bot', appName: 'geekpr',
    description: 'Opens the review comment', keyPrefix: 'bg_5a0e8c17',
    permissions: ['ai:call', 'ai:models', 'ai:stats'],
    rateLimit: { requestsPerMinute: 30, requestsPerHour: 400, requestsPerDay: 4000 },
    usage: { totalRequests: 512, lastUsed: '2026-09-05T02:03:00.000Z', requestsToday: 44 },
    isActive: true, expiresAt: null, createdAt: '1748736000000', updatedAt: '1757030400000', isExpired: false,
  },
];

export const FREE_MODELS = [
  {
    provider: 'groq', modelId: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile',
    contextWindow: 131072, supportsFunctionCalling: true, supportsJSONOutput: true, supportsVision: false,
    isFree: true, performance: { speed: 'fast', quality: 'high', reasoning: 'good' },
    freeLimits: { requestsPerMinute: 30, requestsPerDay: 14400, tokensPerMinute: 18000, tokensPerDay: 5184000 },
    pricing: { input: 0, output: 0 }, notes: '', lastSeen: '1757030400000', updatedAt: '1757030400000',
  },
  {
    provider: 'groq', modelId: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant',
    contextWindow: 131072, supportsFunctionCalling: true, supportsJSONOutput: true, supportsVision: false,
    isFree: true, performance: { speed: 'very fast', quality: 'medium', reasoning: 'basic' },
    freeLimits: { requestsPerMinute: 30, requestsPerDay: 14400, tokensPerMinute: 18000, tokensPerDay: 5184000 },
    pricing: { input: 0, output: 0 }, notes: '', lastSeen: '1757030400000', updatedAt: '1757030400000',
  },
  {
    provider: 'gemini', modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash',
    contextWindow: 1048576, supportsFunctionCalling: true, supportsJSONOutput: true, supportsVision: true,
    isFree: true, performance: { speed: 'fast', quality: 'high', reasoning: 'good' },
    freeLimits: { requestsPerMinute: 10, requestsPerDay: 250, tokensPerMinute: 250000, tokensPerDay: 1000000 },
    pricing: { input: 0, output: 0 }, notes: '', lastSeen: '1757030400000', updatedAt: '1757030400000',
  },
];

export const MINTED_KEY = 'bg_4c1f9b7de2a6083514cc90ab7fe2d1653a8890b1cf24d70e5b6a17c3f0d84e29';

// What POST /api/ai/call answers with, including the additive `provider` and
// the locally-counted `usage` the playground reports.
export const AI_CALL = {
  id: 'chatcmpl-1757040000000',
  object: 'chat.completion',
  created: 1757040000,
  model: 'llama-3.3-70b-versatile',
  provider: 'groq',
  choices: [{
    index: 0,
    message: {
      role: 'assistant',
      content: 'Apple, banana, cherry.\n\nThose are three fruits, ranked by nothing in particular.',
    },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 14, completion_tokens: 21, total_tokens: 35, estimated: true },
};

export const AI_OPS = {
  GetAIConfig: { aiConfig: AI_CONFIG },
  GetAIStats: { aiStats: AI_STATS },
  GetAIDirectorModels: { aiDirectorModels: DIRECTOR },
  GetAIAppConfigs: { aiAppConfigs: APP_CONFIGS },
  GetAIFreeModels: { aiFreeModels: FREE_MODELS },
  GetAPIKeys: { apiKeys: API_KEYS },
  CreateAPIKey: { createAPIKey: { apiKey: MINTED_KEY, keyInfo: {} } },
};
