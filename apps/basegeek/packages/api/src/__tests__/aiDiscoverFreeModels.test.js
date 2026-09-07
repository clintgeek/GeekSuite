import { freeCandidates, renderReport, discover } from '../../scripts/discover-free-models.js';

describe('freeCandidates — what each provider counts as free', () => {
  test('groq/cerebras: every chat model, minus audio/guard/embedding ids', () => {
    const raw = { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'whisper-large-v3' }, { id: 'meta-llama/llama-guard-4-12b' }, { id: 'playai-tts' }, { id: 'openai/gpt-oss-20b' }] };
    expect(freeCandidates('groq', raw)).toEqual(['llama-3.3-70b-versatile', 'openai/gpt-oss-20b']);
  });
  test('openrouter: zero-priced text models only', () => {
    const raw = { data: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', pricing: { prompt: '0', completion: '0' } },
      { id: 'anthropic/claude-3.5-sonnet', pricing: { prompt: '0.000003', completion: '0.000015' } },
      { id: 'some/image-model:free', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['image'] } },
    ] };
    expect(freeCandidates('openrouter', raw)).toEqual(['meta-llama/llama-3.3-70b-instruct:free']);
  });
  test('together: -Free suffix or zero pricing, chat type only', () => {
    const raw = [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', type: 'chat', pricing: { input: 0, output: 0 } },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', type: 'chat', pricing: { input: 0.88, output: 0.88 } },
      { id: 'black-forest-labs/FLUX.1-schnell-Free', type: 'image' },
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

describe('discover', () => {
  test('a listing failure is reported per provider and never aborts the others', async () => {
    const results = await discover({
      providers: ['cerebras', 'groq'],
      listProvider: async (p) => { if (p === 'cerebras') { const e = new Error('401'); e.response = { status: 401 }; throw e; } return { data: [{ id: 'llama-3.3-70b-versatile' }] }; },
      probeProvider: async () => ({ content: 'OK', inputTokens: 1, outputTokens: 1 }),
      timeoutMs: 1000,
    });
    const cerebras = results.find((r) => r.provider === 'cerebras');
    expect(cerebras).toMatchObject({ kind: 'listing', error: 'http_401' });
    const probe = results.find((r) => r.kind === 'probe');
    expect(probe).toMatchObject({ provider: 'groq', modelId: 'llama-3.3-70b-versatile', status: 'alive' });
    const text = renderReport(results);
    expect(text).toMatch(/cerebras: listing failed \(http_401\)/);
    expect(text).toMatch(/1 alive, 0 dead, 0 unknown/);
  });
});
