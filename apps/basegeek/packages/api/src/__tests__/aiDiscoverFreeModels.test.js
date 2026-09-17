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
import { writeListed, writeAlive } from '../services/aiCatalogDiscovery.js';

const {
  freeCandidates,
  listedRows,
  openRouterCatalog,
  renderReport,
  discover,
  runProbe,
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

/**
 * Input modality — a different question than the output-modality filter above.
 * `acceptsImageInput` feeds `aiNeedResolver.js`'s `vision` filter, and getting
 * this wrong is not a ranking mistake, it is an API error on every call: see
 * `models/AIFreeTier.js` for why `null` is read as "no" for this field alone.
 */
describe('openRouterCatalog — input modality, for vision routing', () => {
  const RAW = { data: [
    { id: 'sighted/one', pricing: { prompt: '0', completion: '0' },
      architecture: { input_modalities: ['text', 'image'] }, supported_parameters: [] },
    { id: 'blind/one', pricing: { prompt: '0', completion: '0' },
      architecture: { input_modalities: ['text'] }, supported_parameters: [] },
    { id: 'unstated/one', pricing: { prompt: '0', completion: '0' }, supported_parameters: [] },
  ] };

  it('reads true when the listing declares image among the input modalities', () => {
    const { free } = openRouterCatalog(RAW);
    expect(free.find(r => r.modelId === 'sighted/one').acceptsImageInput).toBe(true);
  });

  it('reads false when the listing states input modalities and image is not one', () => {
    const { free } = openRouterCatalog(RAW);
    expect(free.find(r => r.modelId === 'blind/one').acceptsImageInput).toBe(false);
  });

  it('reads null — not false — when the listing says nothing about input modality at all', () => {
    // A model this file cannot rule OUT is not the same as one it can rule IN.
    const { free } = openRouterCatalog(RAW);
    expect(free.find(r => r.modelId === 'unstated/one').acceptsImageInput).toBeNull();
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

  test('a human-denied row is still listed but never probed', async () => {
    const probed = [];
    const results = await discover({
      providers: ['groq'],
      listProvider: async () => ({ data: [{ id: 'kept' }, { id: 'refused' }] }),
      probeProvider: async (_p, _prompt, config) => { probed.push(config.model); return { content: 'hello' }; },
      timeoutMs: 500,
      denied: new Set(['groq/refused']),
    });
    // Denied costs no quota: no probe call went out for the row.
    expect(probed).toEqual(['kept']);
    // But the AIModel row still records that the vendor lists it — the deny
    // governs selection, not the truth of the catalog.
    expect(results.some((r) => r.kind === 'listed' && r.modelId === 'refused')).toBe(true);
    expect(results.some((r) => r.kind === 'probe' && r.modelId === 'refused')).toBe(false);
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

/**
 * The vision/OCR-head pattern in `aiCatalogOverrides.js` predates being able to
 * observe input modality: it was a human's guess at families a probe could not
 * tell apart from a real assistant, and it caught real vision-capable chat
 * models (Qwen's `-VL-` family, anything OpenRouter names with "vision") right
 * alongside the OCR/vision-only heads it was written for. `discover()` now
 * excepts an OpenRouter row from THAT ONE pattern when the listing itself
 * proves the row takes an image and still answers in text — every other deny
 * pattern keeps applying unchanged, image input or not.
 */
describe('discover excepts an observed vision-capable chat model from the vision pattern only', () => {
  const openRouterModel = (id, { input = ['text'], output = ['text'] } = {}) => ({
    id,
    pricing: { prompt: '0', completion: '0' },
    architecture: { input_modalities: input, output_modalities: output },
  });

  it('lets a vision-capable chat model through, even though its id matches VISION_HEAD_PATTERN', async () => {
    const listProvider = async () => ({ data: [
      openRouterModel('meta-llama/llama-3.2-11b-vision-instruct:free', { input: ['text', 'image'] }),
    ] });
    const probed = [];
    await discover({
      providers: ['openrouter'],
      listProvider,
      probeProvider: async (_p, _prompt, config) => { probed.push(config.model); return { content: '{"task":"t","day":"Friday"}' }; },
      timeoutMs: 500,
    });
    expect(probed).toContain('meta-llama/llama-3.2-11b-vision-instruct:free');
  });

  it('still denies a vision-pattern id whose listing does not declare image input', async () => {
    const listProvider = async () => ({ data: [
      openRouterModel('some/vision-model:free'), // input stays text-only
    ] });
    const probed = [];
    await discover({
      providers: ['openrouter'], listProvider,
      probeProvider: async (_p, _prompt, config) => { probed.push(config.model); return { content: 'hello' }; },
      timeoutMs: 500,
    });
    // `openrouter/free` (the auto-router) is always a candidate regardless of
    // the listing; the id under test must not join it.
    expect(probed).not.toContain('some/vision-model:free');
  });

  it('still denies ocr/translate/music rows on their own pattern, image input or not', async () => {
    const listProvider = async () => ({ data: [
      openRouterModel('some/ocr-model:free', { input: ['text', 'image'] }),
      openRouterModel('some/translate-model:free', { input: ['text', 'image'] }),
      openRouterModel('some/lyria-music:free', { input: ['text', 'image'] }),
    ] });
    const probed = [];
    await discover({
      providers: ['openrouter'], listProvider,
      probeProvider: async (_p, _prompt, config) => { probed.push(config.model); return { content: 'hello' }; },
      timeoutMs: 500,
    });
    expect(probed).not.toContain('some/ocr-model:free');
    expect(probed).not.toContain('some/translate-model:free');
    expect(probed).not.toContain('some/lyria-music:free');
  });

  it('still denies an id matching BOTH the vision pattern and another deny pattern', async () => {
    // "qwen-vl-ocr" is exactly the case the exception must not swallow: vision
    // input is real, but `ocr` denies it independently of the vision pattern.
    const listProvider = async () => ({ data: [
      openRouterModel('qwen-vl-ocr:free', { input: ['text', 'image'] }),
    ] });
    const probed = [];
    await discover({
      providers: ['openrouter'], listProvider,
      probeProvider: async (_p, _prompt, config) => { probed.push(config.model); return { content: 'hello' }; },
      timeoutMs: 500,
    });
    expect(probed).not.toContain('qwen-vl-ocr:free');
  });

  it('does not extend the exception to a provider whose listing states no modality at all', async () => {
    // groq's `/models` carries no `architecture`, so this id is denied exactly
    // as it always was — the exception is observable-OpenRouter-only.
    const listProvider = async () => ({ data: [{ id: 'llava-vision-7b' }] });
    const probed = [];
    await discover({
      providers: ['groq'], listProvider,
      probeProvider: async (_p, _prompt, config) => { probed.push(config.model); return { content: 'hello' }; },
      timeoutMs: 500,
    });
    expect(probed).toEqual([]);
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

  it('a live verdict does not revive a row a human denied', async () => {
    const deps = fakeCollections();
    // `find` is the one extra method the denied-set read needs on the stub.
    deps.freeTier.find = () => ({ lean: async () => [{ provider: 'openrouter', modelId: 'free/y' }] });
    await syncResults(RESULTS, deps, { now: Date.UTC(2026, 8, 7) });
    // No freeTier write touched the denied row — `writeAlive` returned
    // `wrote: 'denied'` and skipped it…
    expect(deps.writes.some((w) => w.label === 'freeTier' && w.filter?.modelId === 'free/y')).toBe(false);
    // …while the AIModel row still records what the probe saw. Denied governs
    // selection, not the truth of the listing.
    expect(deps.writes.some((w) => w.label === 'model' && w.filter?.modelId === 'free/y')).toBe(true);
  });
});

describe('runProbe revive honors the override in the filter', () => {
  it('a denied row can never match the revive write', async () => {
    const filters = [];
    await runProbe({
      rows: [{ provider: 'groq', modelId: 'm' }],
      callProvider: async () => ({ content: '{"task":"t","day":"Friday"}' }),
      updateOne: async (filter) => { filters.push(filter); },
      options: { revive: true, timeout: 100 },
    });
    // The deny lives in the filter, not in a check: a caller that never heard
    // of `override` still cannot resurrect one.
    expect(filters[0]).toMatchObject({ provider: 'groq', modelId: 'm', override: { $ne: 'deny' } });
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


// ───────────────────────────────────────────────────────────────────────────
describe('catalog writes name a path in one update operator only', () => {
  // Mongo rejects `{ $set: { name }, $setOnInsert: { name } }` with
  // "Updating the path 'name' would create a conflict at 'name'". The first
  // live discovery run (2026-09-07) failed every AIModel write that way and
  // deactivated 29 rows it could not re-list.
  const capture = () => {
    const writes = [];
    return { writes, updateOne: async (filter, update) => { writes.push({ filter, update }); return { modifiedCount: 1 }; } };
  };
  const pathsOf = (update) => Object.entries(update).flatMap(([op, body]) => Object.keys(body).map(k => `${op}.${k}`));

  it('writeListed with a name sets it and has no $setOnInsert', async () => {
    const model = capture();
    await writeListed({ provider: 'groq', modelId: 'm1', name: 'Model One' }, { model });
    const [{ update }] = model.writes;
    expect(update.$set.name).toBe('Model One');
    expect(update.$setOnInsert).toBeUndefined();
  });

  it('writeListed without a name seeds it on insert only', async () => {
    const model = capture();
    await writeListed({ provider: 'groq', modelId: 'm1' }, { model });
    const [{ update }] = model.writes;
    expect(update.$set.name).toBeUndefined();
    expect(update.$setOnInsert).toEqual({ name: 'm1' });
  });

  it('writeAlive never names `name` twice either way', async () => {
    for (const name of ['Model One', null]) {
      const model = capture(); const freeTier = capture();
      await writeAlive({ provider: 'groq', modelId: 'm1', fitness: 'structured', name }, { model, freeTier });
      const [{ update }] = model.writes;
      const paths = pathsOf(update);
      expect(paths.filter(p => p.endsWith('.name')).length).toBe(1);
    }
  });
});

describe('writeAlive carries acceptsImageInput onto the AIFreeTier row', () => {
  const capture = () => {
    const writes = [];
    return { writes, updateOne: async (filter, update) => { writes.push({ filter, update }); return { modifiedCount: 1 }; } };
  };

  it('writes true when the listing declared this row image-capable', async () => {
    const model = capture(); const freeTier = capture();
    await writeAlive(
      { provider: 'openrouter', modelId: 'sighted/one', fitness: 'structured', acceptsImageInput: true },
      { model, freeTier }
    );
    expect(freeTier.writes[0].update.$set.acceptsImageInput).toBe(true);
  });

  it('writes null when nothing was known, rather than defaulting to false', async () => {
    // The distinction matters downstream: `aiNeedResolver.js` treats both
    // `null` and `false` as "exclude from vision", but this write must not
    // paper over "the listing never said" as if it were "the listing said no".
    const model = capture(); const freeTier = capture();
    await writeAlive({ provider: 'groq', modelId: 'text-only', fitness: 'structured' }, { model, freeTier });
    expect(freeTier.writes[0].update.$set.acceptsImageInput).toBeNull();
  });

  it('does not write to AIFreeTier at all for a denied row', async () => {
    const model = capture(); const freeTier = capture();
    await writeAlive(
      { provider: 'openrouter', modelId: 'sighted/one', fitness: 'structured', acceptsImageInput: true, denied: true },
      { model, freeTier }
    );
    expect(freeTier.writes).toEqual([]);
  });
});


// ───────────────────────────────────────────────────────────────────────────
describe('writeListed records modality for every listed row, probed or not', () => {
  // The bug this closes: `acceptsImageInput` was only ever written by
  // `writeAlive`, reached only for a row BOTH probed this run AND alive.
  // Live, 2026-09-17: 83 AIFreeTier rows, 14 from OpenRouter, and the field
  // set on 5 of them, while OpenRouter's own listing described input
  // modality for all 14 — a measurement gap wearing a capability's clothes.
  // Modality is vendor-STATED (the listing), not measured (the probe), so it
  // belongs in `writeListed`, which runs for every row the listing named.
  const capture = () => {
    const writes = [];
    return { writes, updateOne: async (filter, update) => { writes.push({ filter, update }); return { modifiedCount: 1 }; } };
  };

  it('writes true onto an EXISTING free-tier row that was not probed this run', async () => {
    const model = capture(); const freeTier = capture();
    await writeListed(
      { provider: 'openrouter', modelId: 'sighted/one', name: 'Sighted One', acceptsImageInput: true },
      { model, freeTier }
    );
    const write = freeTier.writes.find((w) => w.filter.modelId === 'sighted/one');
    expect(write.update.$set).toEqual({ acceptsImageInput: true });
    // No upsert: a row with no AIFreeTier document yet is `writeAlive`'s job,
    // once it actually proves alive — never conjured from a listing alone.
    expect(write.filter).toEqual({ provider: 'openrouter', modelId: 'sighted/one' });
  });

  it('writes null explicitly when the listing said nothing about modality', async () => {
    // Same rule `writeAlive` already follows one line up: a row whose
    // listing stopped saying "image" must lose that claim on the next write
    // that reads the listing, not keep a stale `true` forever.
    const model = capture(); const freeTier = capture();
    await writeListed(
      { provider: 'openrouter', modelId: 'unstated/one', acceptsImageInput: null },
      { model, freeTier }
    );
    const write = freeTier.writes.find((w) => w.filter.modelId === 'unstated/one');
    expect(write.update.$set.acceptsImageInput).toBeNull();
  });

  it('leaves the field untouched for a provider whose listing never carries it', async () => {
    // `listedRows` never sets `acceptsImageInput` for groq/cerebras/etc — the
    // key is `undefined`, not `null`, and that distinction is the whole
    // point: nothing here claims to know, so nothing here should write.
    const model = capture(); const freeTier = capture();
    await writeListed({ provider: 'groq', modelId: 'text-only/one' }, { model, freeTier });
    expect(freeTier.writes).toEqual([]);
  });

  it('does not upsert a free-tier document that does not exist yet', async () => {
    const model = capture(); const freeTier = capture();
    await writeListed(
      { provider: 'openrouter', modelId: 'brand-new/one', acceptsImageInput: true },
      { model, freeTier }
    );
    const write = freeTier.writes.find((w) => w.filter.modelId === 'brand-new/one');
    expect(write.update).not.toHaveProperty('opts');
    // No `upsert: true` anywhere in the call — `updateOne` here is invoked
    // with exactly two arguments, matching `isFree: false`'s demotion above.
    expect(freeTier.writes.length).toBe(1);
  });
});

describe('syncResults carries modality onto a row that was listed but not probed', () => {
  it('an alive-elsewhere provider run still updates a sibling row\'s acceptsImageInput', async () => {
    // The real-world shape: OpenRouter lists 14 rows every run; this run's
    // sample of probes touches a handful. A row the probe skipped (denied,
    // rate-limited, or simply not selected for this pass) must still pick up
    // whatever the listing said about it — probing is for fitness, not for
    // modality.
    const deps = fakeCollections();
    const results = [
      { kind: 'listed', provider: 'openrouter', modelId: 'unprobed/vision', name: 'Unprobed Vision', isFree: true, acceptsImageInput: true },
      { kind: 'listed', provider: 'openrouter', modelId: 'probed/other', name: 'Probed Other', isFree: true, acceptsImageInput: false },
      { kind: 'listing', provider: 'openrouter', count: 2, candidates: 2 },
      { kind: 'probe', provider: 'openrouter', modelId: 'probed/other', status: 'alive', fitness: 'structured', code: 'ok' },
    ];
    await syncResults(results, deps, { now: Date.UTC(2026, 8, 17) });

    // `unprobed/vision` never appears in a `probe` row above — `writeAlive`
    // never runs for it this cycle — and it still ends up with the listing's
    // answer on its AIFreeTier document.
    const unprobedWrite = deps.writes.find(
      (w) => w.label === 'freeTier' && w.filter.modelId === 'unprobed/vision' && 'acceptsImageInput' in (w.update.$set || {})
    );
    expect(unprobedWrite.update.$set.acceptsImageInput).toBe(true);
  });
});

describe('paid-fallback tagging skips variable-price routers', () => {
  const sp = ['structured_outputs', 'response_format', 'tools'];
  const raw = { data: [
    { id: 'openrouter/auto', pricing: { prompt: '-1', completion: '-1' }, supported_parameters: sp },
    { id: 'openrouter/auto-beta', pricing: { prompt: '-1', completion: '-1' }, supported_parameters: sp },
    { id: 'mistralai/mistral-nemo', pricing: { prompt: '0.000000019', completion: '0.00000003' }, supported_parameters: sp },
    { id: 'cheap/no-json', pricing: { prompt: '0.00000001', completion: '0.00000001' }, supported_parameters: ['tools'] },
    { id: 'meta/free-one:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: sp },
  ] };

  it('never tags openrouter/auto* and never writes a negative price', () => {
    const { free, paid } = openRouterCatalog(raw);
    const byId = Object.fromEntries(paid.map(r => [r.modelId, r]));
    expect(byId['openrouter/auto'].role).toBeUndefined();
    expect(byId['openrouter/auto-beta'].role).toBeUndefined();
    expect(byId['openrouter/auto'].inputPrice).toBeNull();
    expect(byId['mistralai/mistral-nemo'].role).toBe('paid-fallback');
    expect(byId['cheap/no-json'].role).toBeUndefined();
    expect(free.map(r => r.modelId)).toEqual(['meta/free-one:free']);
    expect(paid.every(r => r.inputPrice == null || r.inputPrice >= 0)).toBe(true);
  });

  it('writeListed clears a stale role when the row is no longer tagged', async () => {
    const writes = [];
    const model = { updateOne: async (f, u) => { writes.push(u); return { modifiedCount: 1 }; } };
    await writeListed({ provider: 'openrouter', modelId: 'openrouter/auto', name: 'Auto' }, { model });
    expect(writes[0].$unset).toEqual({ role: '' });
    expect(writes[0].$set.role).toBeUndefined();
  });
});
