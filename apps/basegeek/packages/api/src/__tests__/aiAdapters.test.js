/**
 * aiAdapters.test.js — the adapter registry: nine providers, five shapes, one
 * result contract.
 *
 * Phase 2 of DOCS/AIGEEK_ELEVATION_PLAN.md replaced ten `call<Provider>`
 * methods on `aiService` (~600 lines, five of them the same OpenAI-compatible
 * request with a different base URL) with `services/ai/adapters/*` and a
 * descriptor per row in `config/aiProviders.js`. This file is where the *wire
 * shapes* are pinned, so the move can be checked for what it claimed to be: a
 * relocation, not a rewrite.
 *
 * The cases carry the incident ids forward, because the incidents are what the
 * quirks are for:
 *
 *   F-02  a tool loop survives the Gemini translation (id → name)
 *   F-04  only an adapter that really forwards `tools` is allowed to claim it
 *   F-09  five sampling knobs, in each provider's own spelling, or dropped
 *         deliberately by the descriptor — never silently
 *   F-23  a provider's error body never reaches a caller; the status does
 *   R130 / 2026-09-07  Cloudflare's chat mode, bare schema and missing `stop`
 *
 * No Mongo and no network: the adapters import `axios` and a logger and
 * nothing else, so this file patches `axios.post` and stays a unit test. What
 * it deliberately does *not* re-test is anything reached through
 * `aiService.callProvider` — that dispatch is pinned in
 * `aiServiceCohereDispatch.test.js`, `aiCloudflareAdapter.test.js`,
 * `aiQuotaAndSpend.test.js` and `openaiCompat.test.js`, all of which now run
 * through this registry.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import axios from 'axios';

const { AI_PROVIDERS, ADAPTER_DESCRIPTORS, buildProviderConnections } =
  await import('../config/aiProviders.js');
const { ADAPTERS, ADAPTER_SHAPES, callAdapter } =
  await import('../services/ai/adapters/index.js');
const { AdapterError, trimProviderText, ADAPTER_ERROR_TEXT_LIMIT } =
  await import('../services/ai/AdapterError.js');
const { geminiContentsFrom } = await import('../services/ai/adapters/gemini.js');
const { default: logger } = await import('../lib/logger.js');

/* ── harness ──────────────────────────────────────────────────────────────── */

const CONNECTIONS = buildProviderConnections();
const originalPost = axios.post;
const originalWarn = logger.warn;
const originalError = logger.error;

afterEach(() => {
  axios.post = originalPost;
  logger.warn = originalWarn;
  logger.error = originalError;
});

/** Capture every log line the adapters write, by level. */
function captureLogs() {
  const lines = { warn: [], error: [] };
  logger.warn = (...args) => { lines.warn.push(args); };
  logger.error = (...args) => { lines.error.push(args); };
  return lines;
}

/** A provider row with a credential and a base URL nothing can reach. */
function row(providerId, overrides = {}) {
  return {
    ...CONNECTIONS[providerId],
    apiKey: 'test-key-not-a-real-credential',
    baseURL: 'https://provider.invalid/v1',
    ...overrides,
  };
}

/** Capture what the adapter puts on the wire; answer with `data`. */
function capture(data, headers = { 'x-ratelimit-remaining-requests': '5' }) {
  const calls = [];
  axios.post = async (url, body, opts) => {
    calls.push({ url, body, opts });
    return { data, headers };
  };
  return calls;
}

/** Fail the way axios fails when a provider answers with an error status. */
function failWith(status, data) {
  axios.post = async () => {
    const error = new Error(`Request failed with status code ${status}`);
    error.response = { status, data };
    throw error;
  };
}

const OPENAI_OK = {
  choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 3, completion_tokens: 4 },
};

const WEATHER_TOOL = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get current weather for a city',
    parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] },
  },
};

/* ── the registry ─────────────────────────────────────────────────────────── */

describe('the registry', () => {
  it('gives every roster row a descriptor with a shape an adapter answers to', () => {
    for (const provider of AI_PROVIDERS) {
      const descriptor = ADAPTER_DESCRIPTORS[provider.id];
      expect(descriptor).toBeDefined();
      expect(ADAPTER_SHAPES).toContain(descriptor.shape);
      expect(typeof ADAPTERS[descriptor.shape].call).toBe('function');
      expect(descriptor.baseURL).toMatch(/^https:\/\//);
      expect(descriptor.name).toBeTruthy();
      expect(typeof descriptor.maxTokens).toBe('number');
      expect(typeof descriptor.temperature).toBe('number');
    }
  });

  it('serves five providers off one OpenAI-compatible function', () => {
    const openai = AI_PROVIDERS.filter(p => p.adapter.shape === 'openai').map(p => p.id);
    expect(openai.sort()).toEqual(['cerebras', 'groq', 'llmgateway', 'openrouter', 'together']);
    // The whole point: one implementation, five rows.
    expect(new Set(openai.map(id => ADAPTERS[ADAPTER_DESCRIPTORS[id].shape])).size).toBe(1);
  });

  it('normalizes the optional descriptor fields so no adapter writes `?? false`', () => {
    const plain = ADAPTER_DESCRIPTORS.llmgateway;
    expect(plain.dropSampling).toEqual([]);
    expect(plain.forwardsTools).toBe(false);
    expect(plain.nativeJsonSchema).toBe(false);
    expect(plain.nativeJsonMode).toBe(false);
    expect(plain.sendsUsageInclude).toBe(false);
    expect(plain.sendsStreamFalse).toBe(false);
  });

  it('keeps the adapter facts off the connection rows, and out of a row\'s reach', async () => {
    // A connection row is a credential and an address. It carries no dialect —
    // which is why an admin (or a stale patched object) cannot change one.
    for (const connection of Object.values(CONNECTIONS)) {
      expect(connection.shape).toBeUndefined();
      expect(connection.forwardsTools).toBeUndefined();
      expect(connection.extraHeaders).toBeUndefined();
    }

    const calls = capture(OPENAI_OK);
    await callAdapter('cerebras', row('cerebras', {
      // All lies, and all ignored: the descriptor is re-applied over the row.
      shape: 'gemini',
      forwardsTools: true,
      sendsUsageInclude: true,
      extraHeaders: { 'X-Injected': 'no' },
    }), { prompt: 'hi', tools: [WEATHER_TOOL] });

    expect(calls[0].url).toBe('https://provider.invalid/v1/chat/completions');
    expect(calls[0].body.tools).toBeUndefined();
    expect(calls[0].body.usage).toBeUndefined();
    expect(calls[0].opts.headers['X-Injected']).toBeUndefined();
  });

  it('an unknown provider is an AdapterError, not a TypeError', async () => {
    await expect(callAdapter('definitelyNotAProvider', {}, { prompt: 'hi' }))
      .rejects.toBeInstanceOf(AdapterError);
    await expect(callAdapter('definitelyNotAProvider', {}, { prompt: 'hi' }))
      .rejects.toThrow(/Unknown provider/);
  });
});

/* ── AdapterError (F-23) ──────────────────────────────────────────────────── */

describe('AdapterError', () => {
  const LEAKY_BODY = {
    error: {
      message: 'Your quota is exhausted. Organization org-8fa21 (project proj_x91) has 0 remaining. API key AIzaSy...tR4q is valid.',
      request_id: 'req_011CQ7upstream',
    },
  };

  it('carries the status as a field and the code the free-tier health speaks', async () => {
    failWith(404, LEAKY_BODY);
    const error = await callAdapter('groq', row('groq'), { prompt: 'hi' }).catch(e => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect(error.provider).toBe('groq');
    expect(error.status).toBe(404);
    expect(error.code).toBe('http_404');
  });

  it('never carries the provider\'s body, its ids or anything key-shaped', async () => {
    failWith(429, LEAKY_BODY);
    const error = await callAdapter('together', row('together'), { prompt: 'hi' }).catch(e => e);
    const serialized = `${error.message} ${JSON.stringify(error)}`;
    for (const secret of ['org-8fa21', 'proj_x91', 'AIzaSy', 'tR4q', 'req_011CQ7upstream', 'quota is exhausted']) {
      expect(serialized).not.toContain(secret);
    }
    expect(error.message.length).toBeLessThanOrEqual(ADAPTER_ERROR_TEXT_LIMIT);
    expect(error.status).toBe(429);
  });

  it('trims to 80 characters with an ellipsis, and collapses whitespace', () => {
    expect(trimProviderText('short')).toBe('short');
    expect(trimProviderText('a\n  b')).toBe('a b');
    expect(trimProviderText('x'.repeat(200)).length).toBe(ADAPTER_ERROR_TEXT_LIMIT);
    expect(trimProviderText('x'.repeat(200)).endsWith('…')).toBe(true);
  });

  it('classifies a timeout and a refused socket without a status', async () => {
    axios.post = async () => { throw new Error('timeout of 60000ms exceeded'); };
    const timedOut = await callAdapter('groq', row('groq'), { prompt: 'hi' }).catch(e => e);
    expect(timedOut.status).toBeNull();
    expect(timedOut.code).toBe('timeout');

    axios.post = async () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:443');
      error.code = 'ECONNREFUSED';
      throw error;
    };
    const refused = await callAdapter('groq', row('groq'), { prompt: 'hi' }).catch(e => e);
    expect(refused.code).toBe('network');
  });

  // Until 2026-09-07 every adapter's catch wrote *two* level-50 lines per
  // failure: `logger.error({ err: error }, '<Name> API error')` and then
  // `logger.error({ status, data: error.response.data }, '… details')`. The
  // second carried the provider's response body — model ids, organization and
  // project ids, entitlement detail — and the first carried the axios error,
  // whose `config` holds the request URL and headers. A discovery run probes
  // ~60 rows, so a nightly job filled the production log with dozens of them,
  // for outcomes (a dead free row, a 429) that are not errors at all. F-23
  // does not stop applying because the destination is a log file.
  it('logs one warn line per failure, with no err, no data and no headers', async () => {
    const lines = captureLogs();
    failWith(404, LEAKY_BODY);
    await callAdapter('groq', row('groq'), { prompt: 'hi', model: 'llama-3.3-70b-versatile' })
      .catch(() => {});

    // Once. Not twice, and not at error level: a provider having a bad minute
    // is this subsystem's weather, and the health rows already record it.
    expect(lines.error).toHaveLength(0);
    expect(lines.warn).toHaveLength(1);

    const [payload, message] = lines.warn[0];
    expect(payload).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      status: 404,
      code: 'http_404',
    });
    for (const forbidden of ['err', 'error', 'data', 'headers', 'body', 'response', 'config']) {
      expect(Object.prototype.hasOwnProperty.call(payload, forbidden)).toBe(false);
    }
    // And the message is the trimmed one — the vendor's body is nowhere in it.
    expect(message.length).toBeLessThanOrEqual(ADAPTER_ERROR_TEXT_LIMIT);
    const serialized = JSON.stringify(lines.warn);
    for (const secret of ['org-8fa21', 'proj_x91', 'AIzaSy', 'tR4q', 'quota is exhausted']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('logs the same one line for every shape, including the bespoke four', async () => {
    for (const provider of ['gemini', 'cohere', 'ollama', 'cloudflare', 'together']) {
      const lines = captureLogs();
      failWith(429, LEAKY_BODY);
      await callAdapter(provider, row(provider, { accountId: 'acct' }), { prompt: 'hi', model: 'm' })
        .catch(() => {});
      expect(lines.error).toHaveLength(0);
      expect(lines.warn).toHaveLength(1);
      expect(lines.warn[0][0]).toEqual({ provider, model: 'm', status: 429, code: 'http_429' });
    }
  });

  it('logs the cloudflare 402 and the missing account id the same way, once', async () => {
    const neurons = captureLogs();
    failWith(402, LEAKY_BODY);
    await callAdapter('cloudflare', row('cloudflare', { accountId: 'acct' }), { prompt: 'hi', model: 'm' })
      .catch(() => {});
    expect(neurons.warn).toHaveLength(1);
    expect(neurons.warn[0]).toEqual([
      { provider: 'cloudflare', model: 'm', status: 402, code: 'http_402' },
      'daily neuron limit exceeded',
    ]);

    const misconfigured = captureLogs();
    await callAdapter('cloudflare', row('cloudflare', { accountId: '' }), { prompt: 'hi', model: 'm' })
      .catch(() => {});
    expect(misconfigured.warn).toHaveLength(1);
    expect(misconfigured.warn[0][0].status).toBeNull();
  });

  it('is what `upstreamStatusOf` reads first — the regex is only the fallback', async () => {
    const { upstreamStatusOf, classifyFailure } = await import('../services/aiFailureEnvelope.js');
    // The structured path: a field, not a sentence.
    const structured = new AdapterError({ provider: 'groq', status: 404, code: 'http_404', message: 'Request failed with status code 404' });
    expect(upstreamStatusOf(structured)).toBe(404);
    expect(classifyFailure(structured)).toBe('model_not_found');
    // The legacy path, kept for anything still throwing strings.
    expect(upstreamStatusOf(new Error('Together AI API error (400): {}'))).toBe(400);
    // A code with no status still says what happened.
    expect(classifyFailure(new AdapterError({ provider: 'groq', code: 'timeout', message: 'timeout of 60000ms exceeded' })))
      .toBe('timeout');
  });
});

/* ── openaiCompatible ─────────────────────────────────────────────────────── */

describe('the OpenAI-compatible adapter', () => {
  it('sends OpenAI\'s own field names and reads usage back', async () => {
    const calls = capture(OPENAI_OK);
    const out = await callAdapter('groq', row('groq'), {
      prompt: 'ignored when messages are given',
      messages: [{ role: 'user', content: 'hi' }],
      model: 'llama-3.3-70b-versatile',
      maxTokens: 64,
      temperature: 0.2,
    });

    expect(calls[0].url).toBe('https://provider.invalid/v1/chat/completions');
    expect(calls[0].body).toEqual({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 64,
      temperature: 0.2,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(calls[0].opts.headers.Authorization).toBe('Bearer test-key-not-a-real-credential');
    expect(out).toMatchObject({ content: 'hi', inputTokens: 3, outputTokens: 4, finishReason: 'stop' });
    expect(out.headers).toEqual({ 'x-ratelimit-remaining-requests': '5' });
  });

  it('turns a bare prompt into one user turn', async () => {
    const calls = capture(OPENAI_OK);
    await callAdapter('cerebras', row('cerebras'), { prompt: 'hi there' });
    expect(calls[0].body.messages).toEqual([{ role: 'user', content: 'hi there' }]);
  });

  it('F-09: forwards the five sampling knobs, and omits the ones nobody set', async () => {
    const calls = capture(OPENAI_OK);
    await callAdapter('llmgateway', row('llmgateway'), {
      prompt: 'hi', topP: 0.5, stop: ['END', '\n\n'], seed: 42, presencePenalty: 0.2, frequencyPenalty: -0.3,
    });
    expect(calls[0].body).toMatchObject({
      top_p: 0.5, stop: ['END', '\n\n'], seed: 42, presence_penalty: 0.2, frequency_penalty: -0.3,
    });

    const bare = capture(OPENAI_OK);
    await callAdapter('llmgateway', row('llmgateway'), { prompt: 'hi' });
    for (const key of ['top_p', 'stop', 'seed', 'presence_penalty', 'frequency_penalty']) {
      expect(bare[0].body[key]).toBeUndefined();
    }
  });

  it('F-04: groq forwards tools and reads tool_calls back; the other four do not', async () => {
    const groqCalls = capture({
      choices: [{
        message: {
          content: '',
          tool_calls: [{ id: 'call_abc', type: 'function', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 5, completion_tokens: 6 },
    });
    const out = await callAdapter('groq', row('groq'), {
      prompt: 'weather?', tools: [WEATHER_TOOL], toolChoice: 'auto',
    });
    expect(groqCalls[0].body.tools).toEqual([WEATHER_TOOL]);
    expect(groqCalls[0].body.tool_choice).toBe('auto');
    expect(out.toolCalls).toEqual([{
      id: 'call_abc',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"location":"Paris"}' },
    }]);
    expect(out.finishReason).toBe('tool_calls');

    for (const provider of ['cerebras', 'together', 'openrouter', 'llmgateway']) {
      const calls = capture(OPENAI_OK);
      const answer = await callAdapter(provider, row(provider), {
        prompt: 'weather?', tools: [WEATHER_TOOL], toolChoice: 'auto',
      });
      // Not "dropped quietly": these rows never claim `forwardsTools`, so
      // supportsTools() keeps a tools request away from them entirely (F-04).
      expect(calls[0].body.tools).toBeUndefined();
      expect(answer.toolCalls).toBeNull();
    }
  });

  it('tool_choice "none" keeps the tools off the wire', async () => {
    const calls = capture(OPENAI_OK);
    await callAdapter('groq', row('groq'), { prompt: 'hi', tools: [WEATHER_TOOL], toolChoice: 'none' });
    expect(calls[0].body.tools).toBeUndefined();
  });

  it('a truncated answer reports finish_reason length, anything odd reports stop', async () => {
    const truncated = capture({ choices: [{ message: { content: 'hi' }, finish_reason: 'length' }] });
    expect((await callAdapter('groq', row('groq'), { prompt: 'hi' })).finishReason).toBe('length');
    expect(truncated).toHaveLength(1);

    capture({ choices: [{ message: { content: 'hi' }, finish_reason: 'content_filter' }] });
    expect((await callAdapter('groq', row('groq'), { prompt: 'hi' })).finishReason).toBe('stop');
  });

  it('a 200 with no choices is empty content, not a TypeError', async () => {
    capture({});
    const out = await callAdapter('together', row('together'), { prompt: 'hi' });
    // The probe calls a 200 with no text dead (`empty_content`) — which is the
    // truth about a row that answers this way, and used to be a TypeError for
    // four of the five OpenAI-shaped providers and content '' for groq.
    expect(out.content).toBe('');
    expect(out.inputTokens).toBe(0);
  });

  it('together sends the explicit stream:false, and nobody else does', async () => {
    const together = capture(OPENAI_OK);
    await callAdapter('together', row('together'), { prompt: 'hi' });
    expect(together[0].body.stream).toBe(false);

    const groq = capture(OPENAI_OK);
    await callAdapter('groq', row('groq'), { prompt: 'hi' });
    expect('stream' in groq[0].body).toBe(false);
  });

  it('openrouter asks for the cost, sends its ranking headers, and reports the dollars', async () => {
    const calls = capture({
      choices: [{ message: { content: 'hi' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, cost: 0.0000123 },
    });
    const out = await callAdapter('openrouter', row('openrouter'), { prompt: 'hi', model: 'openrouter/free' });
    expect(calls[0].body.usage).toEqual({ include: true });
    expect(calls[0].opts.headers['HTTP-Referer']).toBe('https://basegeek.clintgeek.com');
    expect(calls[0].opts.headers['X-Title']).toBe('BaseGeek aiGeek');
    expect(out.costUsd).toBe(0.0000123);
  });

  it('openrouter reports null rather than zero when it said nothing', async () => {
    capture({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } });
    const out = await callAdapter('openrouter', row('openrouter'), { prompt: 'hi' });
    // null means "ask the price table", 0 would mean "this was free".
    expect(out.costUsd).toBeNull();

    // And a provider that does not price its own call carries no such field.
    capture(OPENAI_OK);
    expect('costUsd' in await callAdapter('groq', row('groq'), { prompt: 'hi' })).toBe(false);
  });
});

/* ── gemini ───────────────────────────────────────────────────────────────── */

describe('the gemini adapter', () => {
  const GEMINI_OK = {
    candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
  };

  it('F-02: round-trips an assistant tool_calls turn and its tool result', () => {
    const contents = geminiContentsFrom([
      { role: 'user', content: "what's the weather in Paris?" },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"tempC":18}' },
    ]);

    const modelTurn = contents.find(m => m.role === 'model');
    expect(modelTurn.parts[0].functionCall).toEqual({ name: 'get_weather', args: { location: 'Paris' } });
    const responses = contents.flatMap(m => m.parts).filter(p => p.functionResponse);
    // Resolved from tool_call_id 'call_1' through the id→name map — Gemini
    // keys a function response by name and issues no ids of its own.
    expect(responses[0].functionResponse).toEqual({ name: 'get_weather', response: { tempC: 18 } });
  });

  it('F-02: wraps a non-object tool result rather than dropping it, and skips system turns', () => {
    const contents = geminiContentsFrom([
      { role: 'system', content: 'you are a helper' },
      { role: 'tool', tool_call_id: 'call_9', name: 'lookup', content: 'plain text' },
    ]);
    expect(contents).toHaveLength(1);
    expect(contents[0]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'lookup', response: { result: 'plain text' } } }],
    });
  });

  it('hoists the system turn, keeps the key in a header, and never in the URL', async () => {
    const calls = capture(GEMINI_OK);
    await callAdapter('gemini', row('gemini', { baseURL: 'https://gemini.invalid/v1beta' }), {
      prompt: 'hi',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hi' }],
    });
    expect(calls[0].url).toBe('https://gemini.invalid/v1beta/models/gemini-2.5-flash:generateContent');
    expect(calls[0].url).not.toMatch(/key=/);
    expect(calls[0].opts.headers['x-goog-api-key']).toBe('test-key-not-a-real-credential');
    expect(calls[0].body.systemInstruction).toEqual({ parts: [{ text: 'be brief' }] });
    expect(calls[0].body.contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }]);
  });

  it('F-09: sends topP and stopSequences, and drops the three knobs Gemini has no field for', async () => {
    const calls = capture(GEMINI_OK);
    await callAdapter('gemini', row('gemini'), {
      prompt: 'hi', maxTokens: 32, temperature: 0,
      topP: 0.4, stop: 'END', seed: 7, presencePenalty: 0.1, frequencyPenalty: 0.2,
    });
    expect(calls[0].body.generationConfig).toEqual({
      maxOutputTokens: 32,
      temperature: 0,
      topP: 0.4,
      stopSequences: ['END'],
    });
  });

  it('forwards both response_format shapes natively', async () => {
    const schema = capture(GEMINI_OK);
    await callAdapter('gemini', row('gemini'), {
      prompt: 'hi',
      responseFormat: { type: 'json_schema', json_schema: { name: 'P', schema: { type: 'object' } } },
    });
    expect(schema[0].body.generationConfig.responseMimeType).toBe('application/json');
    expect(schema[0].body.generationConfig.responseSchema).toEqual({ type: 'object' });

    const mode = capture(GEMINI_OK);
    await callAdapter('gemini', row('gemini'), { prompt: 'hi', responseFormat: { type: 'json_object' } });
    expect(mode[0].body.generationConfig.responseMimeType).toBe('application/json');
    expect(mode[0].body.generationConfig.responseSchema).toBeUndefined();
  });

  it('translates tools and every tool_choice form, and synthesizes call ids', async () => {
    const calls = capture({
      candidates: [{
        content: { parts: [{ functionCall: { name: 'get_weather', args: { location: 'Paris' } } }] },
        finishReason: 'STOP',
      }],
    });
    const out = await callAdapter('gemini', row('gemini'), {
      prompt: 'weather?', tools: [WEATHER_TOOL], toolChoice: { type: 'function', function: { name: 'get_weather' } },
    });
    expect(calls[0].body.tools).toEqual([{
      functionDeclarations: [{
        name: 'get_weather',
        description: 'Get current weather for a city',
        parameters: WEATHER_TOOL.function.parameters,
      }],
    }]);
    expect(calls[0].body.toolConfig.functionCallingConfig).toEqual({
      mode: 'ANY', allowedFunctionNames: ['get_weather'],
    });
    // Gemini issues no ids; a stable name+index one is synthesized on the way out.
    expect(out.toolCalls).toEqual([{
      id: 'call_get_weather_0',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"location":"Paris"}' },
    }]);
    expect(out.finishReason).toBe('tool_calls');
  });

  it('reports a MAX_TOKENS stop as finish_reason length', async () => {
    capture({ candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'MAX_TOKENS' }] });
    expect((await callAdapter('gemini', row('gemini'), { prompt: 'hi' })).finishReason).toBe('length');
  });
});

/* ── cohere ───────────────────────────────────────────────────────────────── */

describe('the cohere adapter', () => {
  const COHERE_OK = { text: 'sunny', meta: { tokens: { input_tokens: 6, output_tokens: 5 } } };

  it('splits the conversation into preamble, chat_history and the current turn', async () => {
    const calls = capture(COHERE_OK);
    const out = await callAdapter('cohere', row('cohere', { baseURL: 'https://cohere.invalid/v1' }), {
      prompt: 'weather?',
      model: 'command-r-plus-08-2024',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
        { role: 'user', content: 'weather?' },
      ],
    });
    expect(calls[0].url).toBe('https://cohere.invalid/v1/chat');
    expect(calls[0].body.preamble).toBe('be brief');
    expect(calls[0].body.message).toBe('weather?');
    expect(calls[0].body.chat_history).toEqual([
      { role: 'USER', message: 'hello' },
      { role: 'CHATBOT', message: 'hi' },
    ]);
    expect(out).toMatchObject({ content: 'sunny', inputTokens: 6, outputTokens: 5 });
  });

  it('F-09: uses Cohere\'s own spelling — p, stop_sequences', async () => {
    const calls = capture(COHERE_OK);
    await callAdapter('cohere', row('cohere'), {
      prompt: 'hi', topP: 0.5, stop: ['\n\n', 'END'], seed: 42, presencePenalty: 0.2, frequencyPenalty: 0.3,
    });
    expect(calls[0].body).toMatchObject({
      p: 0.5, stop_sequences: ['\n\n', 'END'], seed: 42, presence_penalty: 0.2, frequency_penalty: 0.3,
    });
    expect(calls[0].body.top_p).toBeUndefined();
    expect(calls[0].body.stop).toBeUndefined();
  });

  it('F-04: forwards no tools, deliberately, and claims none', async () => {
    const calls = capture(COHERE_OK);
    await callAdapter('cohere', row('cohere'), { prompt: 'hi', tools: [WEATHER_TOOL], toolChoice: 'auto' });
    expect(calls[0].body.tools).toBeUndefined();
    expect(ADAPTER_DESCRIPTORS.cohere.forwardsTools).toBe(false);
  });
});

/* ── cloudflare ───────────────────────────────────────────────────────────── */

describe('the cloudflare adapter', () => {
  it('R130: talks chat, sends the bare schema, and drops `stop`', async () => {
    const calls = capture({ result: { response: { word: 'pong' }, usage: { prompt_tokens: 3, completion_tokens: 2 } } });
    const out = await callAdapter('cloudflare', row('cloudflare', {
      accountId: 'acct', baseURL: 'https://cf.invalid/accounts',
    }), {
      prompt: 'ping',
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      messages: [{ role: 'system', content: 'Reply with JSON.' }, { role: 'user', content: 'ping' }],
      maxTokens: 60,
      temperature: 0,
      stop: ['END'],
      topP: 0.9,
      responseFormat: { type: 'json_schema', json_schema: { name: 'S', schema: { type: 'object' } } },
    });
    expect(calls[0].url).toBe('https://cf.invalid/accounts/acct/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    expect(calls[0].body.prompt).toBeUndefined();
    expect(calls[0].body.response_format).toEqual({ type: 'json_schema', json_schema: { type: 'object' } });
    // Workers AI 400s on an unknown property, and `stop` is not in its schema.
    expect(calls[0].body.stop).toBeUndefined();
    expect(calls[0].body.top_p).toBe(0.9);
    // JSON mode hands back an object; callers get text.
    expect(out.content).toBe('{"word":"pong"}');
    expect(out.outputTokens).toBe(2);
  });

  it('a 402 is the neuron limit, said in our own words', async () => {
    failWith(402, { errors: [{ message: 'You have exceeded your daily neuron quota, account 8fa21' }] });
    const error = await callAdapter('cloudflare', row('cloudflare', { accountId: 'acct' }), { prompt: 'hi' })
      .catch(e => e);
    expect(error.status).toBe(402);
    expect(error.code).toBe('http_402');
    expect(error.message).toBe('daily neuron limit exceeded');
    expect(error.message).not.toContain('8fa21');
  });

  it('a missing account id fails before any request is made', async () => {
    let posted = false;
    axios.post = async () => { posted = true; return { data: {} }; };
    const error = await callAdapter('cloudflare', row('cloudflare', { accountId: '' }), { prompt: 'hi' })
      .catch(e => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect(error.status).toBeNull();
    expect(posted).toBe(false);
  });
});

/* ── ollama ───────────────────────────────────────────────────────────────── */

describe('the ollama adapter', () => {
  it('puts every knob under `options`, caps with num_predict, and counts evals', async () => {
    const calls = capture({ message: { content: 'hi' }, prompt_eval_count: 11, eval_count: 7 });
    const out = await callAdapter('ollama', row('ollama', { baseURL: 'https://ollama.invalid/api' }), {
      prompt: 'hi', model: 'qwen3-coder:480b-cloud', maxTokens: 128, temperature: 0.3,
      topP: 0.8, stop: 'END', seed: 1,
    });
    expect(calls[0].url).toBe('https://ollama.invalid/api/chat');
    expect(calls[0].body.stream).toBe(false);
    expect(calls[0].body.options).toEqual({
      temperature: 0.3, num_predict: 128, top_p: 0.8, stop: ['END'], seed: 1,
    });
    expect(out).toMatchObject({ content: 'hi', inputTokens: 11, outputTokens: 7 });
  });

  it('falls back to `response` when there is no message', async () => {
    capture({ response: 'legacy shape' });
    expect((await callAdapter('ollama', row('ollama'), { prompt: 'hi' })).content).toBe('legacy shape');
  });
});
