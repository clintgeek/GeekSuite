/**
 * aiDiscoverFreeModels.test.js — the catalog's reading of the outside world.
 *
 * Migrated 2026-09-07 from `scripts/discover-free-models.js` to
 * `src/services/aiCatalogDiscovery.js`, where the logic now lives so the
 * scheduled job and the CLI can share it.
 *
 * The cases about `NOT_GENERAL` / `isGeneralAssistant` are gone with the regex
 * itself. What decided "is this a general assistant" was a 30-term pattern over
 * *model ids*; what decides it now is a probe of behaviour plus a six-line
 * override file, and the probe's classification is pinned in
 * `aiFreeTierProbe.test.js`. What is pinned here is everything upstream of the
 * probe: what each provider's listing counts as free, what OpenRouter's richer
 * listing yields, what the quota headers say, and that one provider's failure
 * never takes the run down.
 */

import { describe, it, test, expect } from '@jest/globals';

const {
  freeCandidates,
  listedRows,
  openRouterCatalog,
  renderReport,
  discover,
  syncResults,
  summarizeByProvider,
  pruneUnknownProviders,
  deactivateUnlisted,
  parseRateLimitHeaders,
  parseResetToMs,
  PAID_FALLBACK_COUNT,
  ROUTER_MODEL_IDS,
} = await import('../services/aiCatalogDiscovery.js');
const { isDenied, deny } = await import('../config/aiCatalogOverrides.js');

describe('freeCandidates — what each provider counts as free', () => {
  test('groq/cerebras: every chat model, minus audio/guard/embedding ids', () => {
    const raw = { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'whisper-large-v3' }, { id: 'meta-llama/llama-guard-4-12b' }, { id: 'playai-tts' }, { id: 'openai/gpt-oss-20b' }] };
    expect(freeCandidates('groq', raw)).toEqual(['llama-3.3-70b-versatile', 'openai/gpt-oss-20b']);
  });
  test('openrouter: zero-priced text models, plus the auto-router, always', () => {
    const raw = { data: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', pricing: { prompt: '0', completion: '0' } },
      { id: 'openai/gpt-4o', pricing: { prompt: '0.000003', completion: '0.000015' } },
      { id: 'some/image-model:free', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['image'] } },
    ] };
    // `openrouter/free` is not in the listing and is a row anyway: it is the
    // auto-router, free by definition and alive whenever any free model is.
    expect(freeCandidates('openrouter', raw)).toEqual([
      'meta-llama/llama-3.3-70b-instruct:free',
      'openrouter/free',
    ]);
  });
  test('openrouter: the auto-router survives even an empty listing', () => {
    expect(freeCandidates('openrouter', { data: [] })).toEqual([ROUTER_MODEL_IDS.openrouter]);
  });
  test('together: -Free suffix only, chat type only', () => {
    const raw = [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', type: 'chat', pricing: { input: 0, output: 0 } },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', type: 'chat', pricing: { input: 0.88, output: 0.88 } },
      { id: 'black-forest-labs/FLUX.1-schnell-Free', type: 'image' },
      // Zero-priced because it is billed per *hour* as a dedicated endpoint.
      // 73 of these on 2026-09-07, and every one 400s on a serverless call.
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Reference', type: 'chat', pricing: { input: 0, output: 0 } },
    ];
    expect(freeCandidates('together', raw)).toEqual(['meta-llama/Llama-3.3-70B-Instruct-Turbo-Free']);
  });
  test('gemini: flash/gemma generateContent models, ids without the models/ prefix', () => {
    const raw = { models: [
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ] };
    expect(freeCandidates('gemini', raw)).toEqual(['gemini-2.5-flash']);
  });
  test('cloudflare: text-generation model names', () => {
    const raw = { result: [{ name: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', task: { name: 'Text Generation' } }, { name: '@cf/baai/bge-base-en-v1.5', task: { name: 'Text Embeddings' } }] };
    expect(freeCandidates('cloudflare', raw)).toEqual(['@cf/meta/llama-3.3-70b-instruct-fp8-fast']);
  });
  test('unknown provider → nothing', () => {
    expect(freeCandidates('nope', { data: [{ id: 'x' }] })).toEqual([]);
  });
});

describe('listedRows — the catalog rows behind AIModel', () => {
  it('reads ids and display names per provider listing shape', () => {
    expect(listedRows('together', [{ id: 'a/b-Free', display_name: 'B Free' }]))
      .toEqual([{ modelId: 'a/b-Free', name: 'B Free' }]);
    expect(listedRows('gemini', { models: [{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }] }))
      .toEqual([{ modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }]);
    expect(listedRows('ollama', { models: [{ name: 'gpt-oss:20b' }] }))
      .toEqual([{ modelId: 'gpt-oss:20b', name: 'gpt-oss:20b' }]);
  });

  it('keeps non-candidates too — a paid or non-chat model is still a real model', () => {
    // freeCandidates drops whisper; the catalog still knows it exists.
    const raw = { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'whisper-large-v3' }] };
    expect(listedRows('groq', raw).map(r => r.modelId)).toEqual(['llama-3.3-70b-versatile', 'whisper-large-v3']);
    expect(freeCandidates('groq', raw)).toEqual(['llama-3.3-70b-versatile']);
  });

  it('de-duplicates a listing that repeats an id', () => {
    expect(listedRows('groq', { data: [{ id: 'x' }, { id: 'x' }] })).toHaveLength(1);
  });
});

describe('openRouterCatalog — the one listing that carries price and capability', () => {
  const RAW = { data: [
    { id: 'free/one', pricing: { prompt: '0', completion: '0' }, context_length: 32768,
      top_provider: { max_completion_tokens: 4096 }, supported_parameters: ['response_format', 'tools'] },
    { id: 'paid/cheap-structured', pricing: { prompt: '0.00000002', completion: '0.00000004' },
      context_length: 128000, supported_parameters: ['structured_outputs', 'tools'] },
    { id: 'paid/cheapest-prose', pricing: { prompt: '0.00000001', completion: '0.00000001' },
      supported_parameters: [] },
    { id: 'paid/mid-structured', pricing: { prompt: '0.0000003', completion: '0.0000006' },
      supported_parameters: ['structured_outputs'] },
    { id: 'paid/dear-structured', pricing: { prompt: '0.000003', completion: '0.000015' },
      supported_parameters: ['structured_outputs'] },
    { id: 'paid/dearest-structured', pricing: { prompt: '0.00003', completion: '0.00006' },
      supported_parameters: ['structured_outputs'] },
    { id: 'paid/image', pricing: { prompt: '0.0001', completion: '0' },
      architecture: { output_modalities: ['image'] }, supported_parameters: [] },
  ] };

  it('splits free from paid on price alone', () => {
    const { free, paid } = openRouterCatalog(RAW);
    expect(free.map(r => r.modelId)).toEqual(['free/one']);
    expect(paid.map(r => r.modelId)).not.toContain('free/one');
  });

  it('drops anything that cannot output text', () => {
    const { paid } = openRouterCatalog(RAW);
    expect(paid.map(r => r.modelId)).not.toContain('paid/image');
  });

  it('reads capabilities straight off supported_parameters', () => {
    const { free, paid } = openRouterCatalog(RAW);
    expect(free[0].capabilities).toEqual({ jsonSchema: false, jsonMode: true, tools: true });
    const structured = paid.find(r => r.modelId === 'paid/cheap-structured');
    expect(structured.capabilities).toEqual({ jsonSchema: true, jsonMode: false, tools: true });
  });

  it('converts price per token to the per-1,000,000 unit AIPricing stores', () => {
    const { paid } = openRouterCatalog(RAW);
    const row = paid.find(r => r.modelId === 'paid/cheap-structured');
    expect(row.inputPrice).toBeCloseTo(0.02, 6);
    expect(row.outputPrice).toBeCloseTo(0.04, 6);
  });

  it('carries context length and output ceiling', () => {
    const { free } = openRouterCatalog(RAW);
    expect(free[0]).toMatchObject({ contextTokens: 32768, maxOutputTokens: 4096 });
  });

  it('tags exactly the three cheapest structured-capable paid rows as the fallback set', () => {
    const { paid } = openRouterCatalog(RAW);
    const tagged = paid.filter(r => r.role === 'paid-fallback').map(r => r.modelId);
    expect(tagged).toEqual(['paid/cheap-structured', 'paid/mid-structured', 'paid/dear-structured']);
    expect(tagged).toHaveLength(PAID_FALLBACK_COUNT);
    // The cheapest row of all is skipped: it cannot do structured output, and a
    // paid fallback that cannot answer a schema is not a fallback.
    expect(tagged).not.toContain('paid/cheapest-prose');
    expect(paid.filter(r => r.role).length).toBe(PAID_FALLBACK_COUNT);
  });
});

describe('aiCatalogOverrides — short, and last', () => {
  it('denies the families that answer but are never general assistants', () => {
    expect(isDenied('qwen2.5-coder-32b')).toBe(true);
    expect(isDenied('@cf/meta/llama-guard-3-8b')).toBe(true);
    expect(isDenied('some/model-lora-v2')).toBe(true);
    expect(isDenied('qwen3-vl:235b')).toBe(true);
  });

  it('keeps the general models the old name regex quietly excluded', () => {
    // Every one of these was dropped by `NOT_GENERAL` for having a size, a
    // `:free` suffix or a family name in its id.
    for (const id of [
      'minimax/minimax-m2:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'groq/compound',
      'gemma-3-27b-it',
      'mistral-7b-instruct',
      'openai/gpt-oss-120b',
      'openrouter/free',
    ]) {
      expect(isDenied(id)).toBe(false);
    }
  });

  it('lets allow win over deny, and stays short enough to read', () => {
    expect(isDenied('special-coder', { deny: [/coder/i], allow: [/^special-/] })).toBe(false);
    expect(deny.length).toBeLessThanOrEqual(8);
  });
});

describe('discover', () => {
  test('a listing failure is reported per provider and never aborts the others', async () => {
    const results = await discover({
      providers: ['cerebras', 'groq'],
      listProvider: async (p) => { if (p === 'cerebras') { const e = new Error('401'); e.response = { status: 401 }; throw e; } return { data: [{ id: 'llama-3.3-70b-versatile' }] }; },
      probeProvider: async () => ({ content: '{"task":"Call the vet","day":"Friday","time":"3pm","tag":"flock"}' }),
      timeoutMs: 1000,
    });
    const cerebras = results.find((r) => r.provider === 'cerebras' && r.kind === 'listing');
    expect(cerebras).toMatchObject({ kind: 'listing', error: 'http_401' });
    const probe = results.find((r) => r.kind === 'probe');
    expect(probe).toMatchObject({ provider: 'groq', modelId: 'llama-3.3-70b-versatile', status: 'alive', fitness: 'structured' });
    const text = renderReport(results);
    expect(text).toMatch(/cerebras: listing failed \(http_401\)/);
    expect(text).toMatch(/1 alive \(1 structured\), 0 dead, 0 unknown/);
  });

  test('applies the deny overrides unless --all', async () => {
    const listProvider = async () => ({ data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'qwen-2.5-coder-32b' }] });
    const probeProvider = async () => ({ content: 'hello' });

    const normal = await discover({ providers: ['groq'], listProvider, probeProvider, timeoutMs: 500 });
    expect(normal.filter(r => r.kind === 'probe').map(r => r.modelId)).toEqual(['llama-3.3-70b-versatile']);

    const all = await discover({ providers: ['groq'], listProvider, probeProvider, timeoutMs: 500, all: true });
    expect(all.filter(r => r.kind === 'probe').map(r => r.modelId).sort())
      .toEqual(['llama-3.3-70b-versatile', 'qwen-2.5-coder-32b']);
  });

  test('summarizeByProvider is what the run document records', async () => {
    const results = await discover({
      providers: ['groq'],
      listProvider: async () => ({ data: [{ id: 'a' }, { id: 'b' }] }),
      probeProvider: async (_p, _prompt, config) =>
        config.model === 'a'
          ? { content: '{"task":"t","day":"Friday"}' }
          : { content: '' },
      timeoutMs: 500,
    });
    expect(summarizeByProvider(results).groq).toMatchObject({
      listed: 2, candidates: 2, alive: 1, dead: 1, structured: 1, error: null,
    });
  });
});

/* ── the write path, with no Mongo ────────────────────────────────────────── */

function fakeCollections() {
  const writes = [];
  const make = (label) => ({
    updateOne: async (filter, update, opts) => { writes.push({ label, op: 'updateOne', filter, update, opts }); return { modifiedCount: 1 }; },
    updateMany: async (filter, update) => { writes.push({ label, op: 'updateMany', filter, update }); return { modifiedCount: 2 }; },
    deleteMany: async (filter) => { writes.push({ label, op: 'deleteMany', filter }); return { deletedCount: 3 }; },
  });
  return { writes, freeTier: make('freeTier'), model: make('model'), pricing: make('pricing') };
}

describe('syncResults writes what discover found', () => {
  const RESULTS = [
    { kind: 'listed', provider: 'openrouter', modelId: 'paid/x', name: 'Paid X', isFree: false, inputPrice: 0.5, outputPrice: 1.5, role: 'paid-fallback', capabilities: { jsonSchema: true, jsonMode: false, tools: true } },
    { kind: 'listed', provider: 'openrouter', modelId: 'free/y', name: 'Free Y', isFree: true, inputPrice: 0, outputPrice: 0 },
    { kind: 'listing', provider: 'openrouter', count: 2, candidates: 2 },
    { kind: 'probe', provider: 'openrouter', modelId: 'free/y', status: 'alive', fitness: 'structured', code: 'ok' },
    { kind: 'probe', provider: 'openrouter', modelId: 'openrouter/free', status: 'alive', fitness: 'basic', code: 'ok' },
    { kind: 'probe', provider: 'openrouter', modelId: 'gone/z', status: 'dead', fitness: null, code: 'http_404' },
    { kind: 'probe', provider: 'openrouter', modelId: 'busy/w', status: 'unknown', fitness: null, code: 'http_429' },
  ];

  it('counts each outcome and prices the paid rows per 1M', async () => {
    const deps = fakeCollections();
    const counts = await syncResults(RESULTS, deps, { now: Date.UTC(2026, 8, 7) });
    expect(counts).toMatchObject({ alive: 2, dead: 1, unknown: 1, listed: 2 });
    const priceWrite = deps.writes.find(w => w.label === 'pricing');
    expect(priceWrite.update.$set).toMatchObject({ inputPrice: 0.5, outputPrice: 1.5, priceUnit: 'per_1m_tokens' });
  });

  it('upserts an alive row as free with its fitness and a cleared health block', async () => {
    const deps = fakeCollections();
    await syncResults(RESULTS, deps, { now: Date.UTC(2026, 8, 7) });
    const alive = deps.writes.find(w => w.label === 'freeTier' && w.filter.modelId === 'free/y');
    expect(alive.opts).toEqual({ upsert: true });
    expect(alive.update.$set).toMatchObject({
      isFree: true, fitness: 'structured',
      'health.coolingUntil': null, 'health.consecutiveFailures': 0, 'health.lastFailureCode': null,
    });
  });

  it('cools a dead row 30 days and never deletes it', async () => {
    const now = Date.UTC(2026, 8, 7);
    const deps = fakeCollections();
    await syncResults(RESULTS, deps, { now });
    const dead = deps.writes.find(w => w.label === 'freeTier' && w.filter.modelId === 'gone/z');
    expect(dead.update.$set['health.lastFailureCode']).toBe('http_404');
    expect(dead.update.$set['health.coolingUntil'].getTime() - now).toBe(30 * 24 * 60 * 60 * 1000);
    expect(deps.writes.some(w => w.op === 'deleteMany' && w.label === 'freeTier')).toBe(false);
    // An unknown row is not written at all: a bad minute is not a verdict.
    expect(deps.writes.some(w => w.filter?.modelId === 'busy/w')).toBe(false);
  });

  it('never deactivates a model that just answered but was not in the listing', async () => {
    const deps = fakeCollections();
    await syncResults(RESULTS, deps, { now: Date.now() });
    const sweep = deps.writes.find(w => w.op === 'updateMany');
    // `openrouter/free` is the auto-router: a candidate, not a listed model.
    expect(sweep.filter.modelId.$nin).toContain('openrouter/free');
    expect(sweep.filter.modelId.$nin).toContain('free/y');
  });
});

describe('deactivateUnlisted and pruneUnknownProviders', () => {
  it('retires only the models a provider stopped listing', async () => {
    const deps = fakeCollections();
    const res = await deactivateUnlisted({ provider: 'groq', listedIds: ['a', 'b'] }, deps);
    const write = deps.writes[0];
    expect(write.op).toBe('updateMany');
    expect(write.filter).toMatchObject({ provider: 'groq', modelId: { $nin: ['a', 'b'] }, isActive: true });
    expect(write.update.$set.isActive).toBe(false);
    expect(res.deactivated).toBe(2);
  });

  it('prunes the catalog collections for providers off the roster — and never AIConfig', async () => {
    const deps = fakeCollections();
    const pruned = await pruneUnknownProviders({ providers: ['groq', 'gemini'] }, deps);
    expect(pruned).toEqual({ AIModel: 3, AIFreeTier: 3, AIPricing: 3 });
    for (const write of deps.writes) {
      expect(write.op).toBe('deleteMany');
      expect(write.filter).toEqual({ provider: { $nin: ['groq', 'gemini'] } });
      // The keys live in AIConfig. A job that can delete a credential on the
      // strength of a roster edit is a job that can lose Chef's keys.
      expect(write.label).not.toBe('config');
    }
    expect(deps.writes).toHaveLength(3);
  });
});

/* ── quota learning ───────────────────────────────────────────────────────── */

describe('parseResetToMs', () => {
  it('reads the four shapes the vendors send', () => {
    expect(parseResetToMs('2m59.56s')).toBe(179560);          // Groq's Go duration
    expect(parseResetToMs('7.66s')).toBe(7660);
    expect(parseResetToMs('60')).toBe(60000);                  // plain seconds
    expect(parseResetToMs('1757280000000', 1757279940000)).toBe(60000); // epoch ms
    expect(parseResetToMs('Mon, 07 Sep 2026 00:01:00 GMT', Date.parse('Mon, 07 Sep 2026 00:00:00 GMT'))).toBe(60000);
  });
  it('returns null for anything it does not understand', () => {
    expect(parseResetToMs(undefined)).toBeNull();
    expect(parseResetToMs('')).toBeNull();
    expect(parseResetToMs('soon')).toBeNull();
  });
});

describe('parseRateLimitHeaders', () => {
  it('reads Groq/Together suffixed headers and puts each in the right window', () => {
    const { limits, observed } = parseRateLimitHeaders({
      'x-ratelimit-limit-requests': '14400',
      'x-ratelimit-remaining-requests': '14370',
      'x-ratelimit-reset-requests': '2m59.56s',
      'x-ratelimit-limit-tokens': '18000',
      'x-ratelimit-remaining-tokens': '17997',
      'x-ratelimit-reset-tokens': '7.66s',
    }, 0);
    // Requests reset three minutes out → a daily bucket; tokens seconds out →
    // a per-minute one. This is the number three files used to disagree about.
    expect(limits).toEqual({ requestsPerDay: 14400, tokensPerMinute: 18000 });
    expect(observed.remainingRequests).toBe(14370);
    expect(observed.remainingTokens).toBe(17997);
    // resetAt tracks the *requests* window, because that is the one selection
    // gates on (`remainingRequests === 0 && resetAt > now`).
    expect(observed.resetAt.getTime()).toBe(179560);
  });

  it('honours an explicit window suffix over any inference', () => {
    const { limits } = parseRateLimitHeaders({
      'X-RateLimit-Limit-Requests-Day': '1000',
      'x-ratelimit-limit-requests-minute': '30',
      'x-ratelimit-limit-tokens-day': '1000000',
    }, 0);
    expect(limits).toEqual({ requestsPerDay: 1000, requestsPerMinute: 30, tokensPerDay: 1000000 });
  });

  it('reads OpenRouter\'s unqualified trio as a request allowance', () => {
    const now = 1757280000000;
    const { limits, observed } = parseRateLimitHeaders({
      'x-ratelimit-limit': '1000',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(now + 3600_000),
    }, now);
    expect(limits).toEqual({ requestsPerDay: 1000 });
    expect(observed.remainingRequests).toBe(0);
    expect(observed.resetAt.getTime()).toBe(now + 3600_000);
  });

  it('takes retry-after off a 429, in seconds', () => {
    expect(parseRateLimitHeaders({ 'Retry-After': '30' }, 0).retryAfterSeconds).toBe(30);
    expect(parseRateLimitHeaders({ 'retry-after': '1m30s' }, 0).retryAfterSeconds).toBe(90);
  });

  it('ignores everything it does not recognise, and never invents a number', () => {
    const parsed = parseRateLimitHeaders({
      'content-type': 'application/json',
      'x-request-id': 'abc',
      'x-ratelimit-limit-requests': 'unlimited',
      'x-ratelimit-remaining-tokens': '-1',
    }, 0);
    expect(parsed.limits).toEqual({});
    expect(parsed.observed).toEqual({});
    expect(parsed.retryAfterSeconds).toBeNull();
  });

  it('survives providers that send no rate-limit headers at all', () => {
    // Gemini, Cloudflare, Cohere and Ollama Cloud send none. That is a row
    // that never learns a quota, not a crash.
    for (const headers of [undefined, null, {}, 'nonsense']) {
      expect(parseRateLimitHeaders(headers, 0)).toEqual({ limits: {}, observed: {}, retryAfterSeconds: null });
    }
  });
});
