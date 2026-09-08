// The /aigeek surface's fixtures. It is a basegeek route (App.jsx mounts it
// behind RequireAdmin), so it rides along with basegeek's context rather than
// pretending to be a ninth app.
//
// Phase 3 (2026-09-07) turned the page into a status page
// (apps/basegeek/DOCS/AIGEEK_STATUS_PAGE.md), so the fixtures gained
// `AI_STATUS` (the one round trip behind panel 1 and the spend line),
// `ALIVE_MODELS` (the Pinned picker's whole vocabulary) and `AI_FEATURE`
// (Try it, now on the feature door). `anthropic` left the roster in Phase 0.
export const PROVIDERS = [
  'groq', 'gemini', 'together', 'cohere',
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
  summary: { totalProviders: 9, totalModels: 6, providersWithKeys: 3, enabledProviders: 3 },
  providers: {
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
    // A legacy `free` row, deliberately: every row in production is one of
    // these until it is next saved, and the card has to read it as Automatic.
    { appName: 'codegeek', displayName: 'CodeGeek', tier: 'free', provider: null, model: null, sticky: null, allowPaid: false, dailyCap: null, fallbackOrder: [], maxTokens: 8000, temperature: 0.7, notes: 'High-volume coding assist', enabled: true, autoDiscovered: false, lastSeen: '1757030400000' },
    { appName: 'geekpr', displayName: 'GeekPR', tier: 'specific', provider: 'groq', model: 'llama-3.3-70b-versatile', sticky: null, allowPaid: false, dailyCap: 400, fallbackOrder: [], maxTokens: 4000, temperature: 0.2, notes: 'Same reviewer persona across retries', enabled: true, autoDiscovered: false, lastSeen: '1757030400000' },
    // The one row with both switches on — the widest the card ever renders.
    { appName: 'storygeek', displayName: 'StoryGeek', tier: 'auto', provider: null, model: null, sticky: 'per-conversation', allowPaid: true, dailyCap: 600, fallbackOrder: [], maxTokens: null, temperature: null, notes: 'GM turns; keeps one voice per story', enabled: true, autoDiscovered: true, lastSeen: '1757030400000' },
    { appName: 'startgeek', displayName: 'StartGeek', tier: 'specific', provider: 'groq', model: 'llama-3.1-8b-instant', sticky: null, allowPaid: false, dailyCap: 200, fallbackOrder: [], maxTokens: 1200, temperature: 0.1, notes: 'Turns a query into a JSON search plan', enabled: true, autoDiscovered: false, lastSeen: '1757030400000' },
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

/**
 * What `aiRecommendModel` answers with, for the Suggest block inside the
 * Pinned picker. `FREE_MODELS` (the steward's old browse list, from
 * `aiFreeModels`) was here until Phase 3; the picker reads
 * `GET /api/ai/models/alive` instead — see `ALIVE_MODELS`.
 */
export const RECOMMENDATIONS = [
  {
    provider: 'groq', modelId: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile',
    reasoning: 'Structured output, 131k context, and the fastest free row this week.',
    score: 92, isFree: true, contextWindow: 131072,
    supportsFunctionCalling: true, supportsJSONOutput: true, supportsVision: false,
    performance: { speed: 'fast', quality: 'high', reasoning: 'good' },
  },
  {
    provider: 'gemini', modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash',
    reasoning: 'Vision and a million-token window, on a tighter daily quota.',
    score: 78, isFree: true, contextWindow: 1048576,
    supportsFunctionCalling: true, supportsJSONOutput: true, supportsVision: true,
    performance: { speed: 'fast', quality: 'high', reasoning: 'good' },
  },
];

export const MINTED_KEY = 'bg_4c1f9b7de2a6083514cc90ab7fe2d1653a8890b1cf24d70e5b6a17c3f0d84e29';

/**
 * GET /api/ai/models/alive — the Pinned picker's whole vocabulary.
 *
 * A bare array, not the `{success, data}` envelope, which is the route's own
 * deliberate choice: this is what a picker renders.
 */
export const ALIVE_MODELS = [
  { provider: 'groq', modelId: 'llama-3.3-70b-versatile', fitness: 'structured', paid: false, lastSuccessAt: '2026-09-07T18:40:00.000Z' },
  { provider: 'groq', modelId: 'llama-3.1-8b-instant', fitness: 'structured', paid: false, lastSuccessAt: '2026-09-07T18:12:00.000Z' },
  { provider: 'gemini', modelId: 'gemini-2.5-flash', fitness: 'basic', paid: false, lastSuccessAt: '2026-09-07T17:02:00.000Z' },
  { provider: 'openrouter', modelId: 'openrouter/auto', fitness: 'structured', paid: true, lastSuccessAt: '2026-09-06T22:15:00.000Z' },
];

/**
 * GET /api/ai/status — §1 of AIGEEK_STATUS_PAGE.md.
 *
 * Deliberately *not* the empty-attention case. A screenshot of "Nothing needs
 * you" proves the empty state renders and nothing else; the harness's job is
 * the dense layout, so this carries one item of every kind that has an action
 * plus the two that do not, which is the widest panel 1 ever gets.
 */
export const AI_STATUS = {
  generatedAt: '2026-09-07T19:00:00.000Z',
  catalog: {
    lastDiscovery: { at: '2026-09-04T03:00:00.000Z', ok: false, alive: 14, dead: 6, unknown: 2, error: null },
    lastProbe: { at: '2026-09-07T03:00:00.000Z', ok: true, alive: 14, dead: 6 },
    aliveFree: 14,
    structuredFree: 9,
    byProvider: {
      groq: { alive: 6, cooling: 1, structured: 4 },
      gemini: { alive: 4, cooling: 0, structured: 2 },
      cerebras: { alive: 0, cooling: 5, structured: 0 },
      openrouter: { alive: 4, cooling: 0, structured: 3 },
      together: { alive: 0, cooling: 0, structured: 0 },
      cohere: { alive: 0, cooling: 0, structured: 0 },
      cloudflare: { alive: 0, cooling: 0, structured: 0 },
      ollama: { alive: 0, cooling: 0, structured: 0 },
      llmgateway: { alive: 0, cooling: 0, structured: 0 },
    },
    running: false,
  },
  attention: [
    { kind: 'provider_listing_failed', severity: 'warn', provider: 'cerebras', text: 'Cerebras: listing failed (401) — check the key' },
    { kind: 'discovery_stale', severity: 'warn', text: 'Catalog last refreshed 3 days ago', since: '2026-09-04T03:00:00.000Z' },
    { kind: 'paid_budget_hit', severity: 'warn', text: 'Paid budget was hit on 2 day(s) this month' },
    { kind: 'unrouted_app', severity: 'info', app: 'notegeek', text: 'notegeek is calling with no routing row (running as auto)' },
    { kind: 'key_expiring', severity: 'info', app: 'codegeek', text: "codegeek key 'codegeek laptop' expires 2026-11-30" },
    { kind: 'repinned', severity: 'info', app: 'storygeek', text: 'storygeek: 3 conversation(s) moved off a dead model this week' },
  ],
  spend: {
    monthUsd: 1.7664,
    todayUsd: 0.0231,
    capPerDayUsd: 0.25,
    capPerCallUsd: 0.02,
    paidCallsMonth: 98,
    byApp: [
      { app: 'geekpr', feature: 'pr-summary', usd: 1.5385, calls: 87 },
      { app: 'codegeek', feature: 'review', usd: 0.2279, calls: 11 },
    ],
  },
  apps: [
    { app: 'codegeek', tier: 'free', sticky: null, allowPaid: false, dailyCap: null, seenInTraffic: true, hasRow: true, keys: 2, lastCallAt: '2026-09-07T18:55:00.000Z' },
    { app: 'geekpr', tier: 'specific', sticky: null, allowPaid: false, dailyCap: 400, seenInTraffic: true, hasRow: true, keys: 1, lastCallAt: '2026-09-07T02:03:00.000Z' },
    { app: 'notegeek', tier: null, sticky: null, allowPaid: false, dailyCap: null, seenInTraffic: true, hasRow: false, keys: 0, lastCallAt: '2026-09-06T00:00:00.000Z' },
    { app: 'startgeek', tier: 'specific', sticky: null, allowPaid: false, dailyCap: 200, seenInTraffic: true, hasRow: true, keys: 0, lastCallAt: '2026-09-07T18:00:00.000Z' },
    { app: 'storygeek', tier: 'auto', sticky: 'per-conversation', allowPaid: true, dailyCap: 600, seenInTraffic: true, hasRow: true, keys: 0, lastCallAt: '2026-09-07T18:40:00.000Z' },
  ],
};

/**
 * POST /api/ai/feature — what "Try it" now posts to (`/api/ai/call` was
 * deleted in this phase, D2). The door fails soft, so the interesting shape
 * is the provenance envelope rather than a chat completion.
 */
export const AI_FEATURE = {
  ok: true,
  data: 'Apple, banana, cherry.\n\nThose are three fruits, ranked by nothing in particular.',
  provenance: {
    source: 'free',
    reason: 'ranked',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    cached: false,
    callsToday: 3,
    cap: 200,
    costUsd: 0,
    hints: [],
  },
};

export const AI_OPS = {
  GetAIConfig: { aiConfig: AI_CONFIG },
  GetAIStats: { aiStats: AI_STATS },
  GetAIDirectorModels: { aiDirectorModels: DIRECTOR },
  GetAIAppConfigs: { aiAppConfigs: APP_CONFIGS },
  GetAPIKeys: { apiKeys: API_KEYS },
  CreateAPIKey: { createAPIKey: { apiKey: MINTED_KEY, keyInfo: {} } },
  // The app card writes routing straight through, so the Pinned toggle in the
  // routing scene fires this. Stubbed so the run logs no unstubbed op.
  SaveAIAppConfig: { saveAIAppConfig: { success: true } },
  // `GetAIFreeModels` was here until Phase 3: the steward's browse list is
  // gone and `RecommendAIModel` is what is left of it, reached from the
  // Suggest button inside the Pinned picker.
  RecommendAIModel: { aiRecommendModel: { recommendations: RECOMMENDATIONS } },
};
