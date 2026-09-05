/**
 * openaiCompat.test.js — is aiGeek's `/openai/v1` actually OpenAI-compatible?
 *
 * The claim under test is the one README_OPENAI_PROXY.md makes: "The SDK should
 * work without code changes beyond the base URL and API key." That is a
 * contract, so this file tests it as one — against the *current* published
 * contract, not against memory.
 *
 * ## What the contract citations refer to
 *
 * `platform.openai.com/docs/api-reference` is behind a 403 for automated
 * fetches, so the citations below name schemas in OpenAI's own machine-readable
 * spec, which is the same document the docs site renders and the Stainless SDKs
 * are generated from:
 *
 *   https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml
 *   openapi 3.1.0 — info.version 2.3.0 — retrieved 2026-09-05
 *
 * Schema names cited in the comments (`CreateChatCompletionRequest`,
 * `CreateChatCompletionResponse`, `CreateChatCompletionStreamResponse`,
 * `ChatCompletionStreamOptions`, `Error`, `ListModelsResponse`) are components
 * of that document.
 *
 * The Anthropic Messages API section is cited against
 *   https://platform.claude.com/docs/en/api/messages  (retrieved 2026-09-05;
 *   docs.anthropic.com/en/api/messages 301-redirects there)
 *
 * ## How this file is wired
 *
 * The `openai` npm SDK is not installed anywhere in this repo and this suite is
 * not allowed to add it, so requests are issued with supertest using the exact
 * body and header shapes the SDK puts on the wire.
 *
 * Three levels of harness, because the gaps live at three different depths:
 *
 *   1. **Route level** — express app with the same middleware order as
 *      server.js, `aiService.callAI` stubbed. Tests the envelope the proxy
 *      builds.
 *   2. **Service level** — real `aiService.callAI`, `callProvider` stubbed.
 *      Tests what actually survives the trip from the HTTP body to a provider.
 *   3. **Provider level** — a real local HTTP server standing in for Groq /
 *      Anthropic, so the provider request body can be inspected verbatim. No
 *      test in this file touches the network.
 *
 * ## Reading the failures
 *
 * When this file was written, 22 cases were marked `it.failing(...)`: FINDINGS,
 * not flakes, each naming a finding id from DOCS/OPENAI_COMPAT_AUDIT.md. Jest
 * passes a `failing` test when its body throws and *fails the run* when the
 * body starts passing — so the day someone closed a gap, the suite told them to
 * promote the test to `it`. Green before the fix, green after, red only in
 * between.
 *
 * **All 22 were closed on 2026-09-05.** Every case here is a plain `it` now.
 * The finding ids stay in the titles and the comments stay above them, reading
 * CLOSED with a note on what changed — this file is the durable record of what
 * was wrong and the tripwire against it coming back. A future audit should add
 * its findings the same way.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import crypto from 'node:crypto';
import pinoHttp from 'pino-http';

const { default: mongoose } = await import('mongoose');
const { default: logger } = await import('../lib/logger.js');
const { default: APIKey } = await import('../models/APIKey.js');
const { default: aiService } = await import('../services/aiService.js');
const { default: aiUsageService } = await import('../services/aiUsageService.js');
const { default: aiModelCapabilitiesService } = await import('../services/aiModelCapabilitiesService.js');
const { default: openaiProxyRoutes } = await import('../routes/openaiProxy.js');

// ─────────────────────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The middleware stack around `/openai/v1` in server.js, reproduced so the
 * transport-level assertions (X-Request-Id, JSON body parsing, content types)
 * test production's arrangement rather than a convenient one. See
 * src/server.js:150-172.
 */
function buildApp() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(cookieParser());
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    autoLogging: false,
  });
  app.use((req, res, next) => {
    httpLogger(req, res);
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use('/openai/v1', openaiProxyRoutes);
  return app;
}

let app;
let seq = 0;

/** A real, active baseGeek key with `ai:call` — what the SDK sends as its key. */
async function makeApiKey(overrides = {}) {
  const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();
  await APIKey.create({
    keyHash,
    keyPrefix,
    name: `openai compat probe ${seq++}`,
    appName: 'testgeek',
    permissions: ['ai:call'],
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });
  return apiKey;
}

let KEY;

/** POST /v1/chat/completions the way the OpenAI SDK does. */
function chat(body, { key = KEY, headers = {} } = {}) {
  const req = request(app)
    .post('/openai/v1/chat/completions')
    .set('Authorization', `Bearer ${key}`)
    .set('Content-Type', 'application/json')
    // The SDK sends these two on every request.
    .set('User-Agent', 'OpenAI/JS 4.104.0')
    .set('X-Stainless-Lang', 'js');
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send(body);
}

/** Replace aiService.callAI for one test; restored by afterEach. */
const patched = [];
function patch(obj, key, value) {
  patched.push([obj, key, obj[key]]);
  obj[key] = value;
  return value;
}

/**
 * Stub callAI. `impl` receives (prompt, config) and returns the assistant text;
 * `providerInfo` is merged onto aiService.lastProviderInfo, which is how the
 * proxy learns about tool calls and finish reasons (openaiProxy.js:273, 354).
 */
function stubCallAI(impl = () => 'hello world', providerInfo = {}) {
  const calls = [];
  patch(aiService, 'callAI', async (prompt, config) => {
    calls.push({ prompt, config });
    aiService.lastProviderInfo = {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      cached: false,
      toolCalls: null,
      finishReason: 'stop',
      ...providerInfo,
    };
    return typeof impl === 'function' ? await impl(prompt, config) : impl;
  });
  return calls;
}

/** Parse an SSE body into { frames: [obj], done: bool, comments: [str] }. */
function parseSSE(text) {
  const frames = [];
  const comments = [];
  let done = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    if (line.startsWith(':')) { comments.push(line); continue; } // heartbeat — tolerated
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') { done = true; continue; }
    frames.push(JSON.parse(payload));
  }
  return { frames, done, comments };
}

/**
 * A local HTTP server standing in for a provider, so the exact upstream request
 * body can be asserted on. Returns { url, captured, close }.
 */
async function captureServer(respond) {
  const captured = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { /* leave null */ }
      captured.push({ url: req.url, headers: req.headers, body: parsed });
      const out = respond(parsed, req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    captured,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  app = buildApp();
  KEY = await makeApiKey();
}, 60000);

afterEach(async () => {
  while (patched.length) {
    const [obj, key, original] = patched.pop();
    obj[key] = original;
  }
  aiService.clearCache?.();
});

afterAll(async () => {
  await APIKey.deleteMany({});
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Non-streaming response object
//    spec: components.schemas.CreateChatCompletionResponse
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /v1/chat/completions — the chat.completion object', () => {
  // spec: CreateChatCompletionResponse.required = [choices, created, id, model,
  // object]; object enum ["chat.completion"]; choices[].required =
  // [finish_reason, index, message, logprobs].
  it('returns id/object/created/model and a well-formed choices[0]', async () => {
    stubCallAI(() => 'The capital of France is Paris.');
    const res = await chat({
      model: 'basegeek-rotation',
      messages: [{ role: 'user', content: 'capital of France?' }],
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.startsWith('chatcmpl-')).toBe(true);
    expect(res.body.object).toBe('chat.completion');
    expect(typeof res.body.created).toBe('number');
    // Unix seconds, not milliseconds — SDKs and dashboards render this.
    expect(res.body.created).toBeLessThan(1e11);
    expect(typeof res.body.model).toBe('string');

    expect(Array.isArray(res.body.choices)).toBe(true);
    expect(res.body.choices).toHaveLength(1);
    const choice = res.body.choices[0];
    expect(choice.index).toBe(0);
    expect(choice.message.role).toBe('assistant');
    expect(choice.message.content).toBe('The capital of France is Paris.');
    expect(['stop', 'length', 'tool_calls', 'content_filter', 'function_call'])
      .toContain(choice.finish_reason);
  });

  // spec: CompletionUsage — prompt_tokens, completion_tokens, total_tokens all
  // required integers.
  it('returns a usage block whose totals add up', async () => {
    stubCallAI(() => 'a fairly long answer that will cost a few tokens to encode');
    const res = await chat({
      model: 'basegeek-rotation',
      messages: [{ role: 'user', content: 'say something' }],
    });

    const { usage } = res.body;
    expect(Number.isInteger(usage.prompt_tokens)).toBe(true);
    expect(Number.isInteger(usage.completion_tokens)).toBe(true);
    expect(usage.total_tokens).toBe(usage.prompt_tokens + usage.completion_tokens);
    expect(usage.prompt_tokens).toBeGreaterThan(0);
    expect(usage.completion_tokens).toBeGreaterThan(0);
  });

  it('answers with Content-Type: application/json', async () => {
    stubCallAI();
    const res = await chat({ model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.headers['content-type']).toMatch(/^application\/json/);
  });

  // FINDING F-11 — CLOSED. spec:
  // CreateChatCompletionResponse.choices[].required includes `logprobs`.
  // Nullable, but required to be present; the proxy omitted the key entirely.
  it('F-11: choices[] carries the spec-required logprobs key (may be null)', async () => {
    stubCallAI();
    const res = await chat({ model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.body.choices[0]).toHaveProperty('logprobs');
  });

  // FINDING F-01 — CLOSED. Nothing in the OpenAI contract permits a proxy to
  // rewrite the assistant's text. The proxy used to run every completion
  // through utils/responseFormatter.formatResponse(), whose
  // convertFunctionCallToXML() rewrites any `word(args)` whose word is in its
  // CodeGeek TOOL_TAGS list into XML and prepends invented prose. The call is
  // gone from openaiProxy.js; CodeGeek keeps the transform on its own route.
  it('F-01: assistant content is returned verbatim, not rewritten by responseFormatter', async () => {
    const answer = 'Use grep("needle") to find it, then list_dir("/src") to browse.';
    stubCallAI(() => answer);
    const res = await chat({
      model: 'basegeek-rotation',
      messages: [{ role: 'user', content: 'how do I search?' }],
    });
    expect(res.body.choices[0].message.content).toBe(answer);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Streaming
//    spec: components.schemas.CreateChatCompletionStreamResponse
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /v1/chat/completions — streaming', () => {
  // spec: CreateChatCompletionStreamResponse.object enum
  // ["chat.completion.chunk"]; the documented example ends the stream with a
  // `data: [DONE]` sentinel.
  it('streams text/event-stream chunks terminated by data: [DONE]', async () => {
    stubCallAI(() => 'x'.repeat(180));
    const res = await chat({
      model: 'basegeek-rotation',
      stream: true,
      messages: [{ role: 'user', content: 'stream me' }],
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);

    const { frames, done } = parseSSE(res.text);
    expect(done).toBe(true);
    expect(frames.length).toBeGreaterThan(1);
    for (const f of frames) {
      expect(f.object).toBe('chat.completion.chunk');
      expect(typeof f.id).toBe('string');
      expect(typeof f.created).toBe('number');
      expect(typeof f.model).toBe('string');
      expect(Array.isArray(f.choices)).toBe(true);
    }
    // Every chunk of one completion shares one id (spec: "Each chunk has the
    // same ID") and one created stamp.
    expect(new Set(frames.map((f) => f.id)).size).toBe(1);
    expect(new Set(frames.map((f) => f.created)).size).toBe(1);

    const text = frames.map((f) => f.choices[0]?.delta?.content ?? '').join('');
    expect(text).toBe('x'.repeat(180));
  });

  // spec: CreateChatCompletionStreamResponse example — the terminal chunk is
  // `{"delta":{},"finish_reason":"stop"}`; content chunks carry
  // `"finish_reason":null`.
  it('sets finish_reason on exactly one terminal chunk and null on the rest', async () => {
    stubCallAI(() => 'short answer');
    const res = await chat({
      model: 'basegeek-rotation',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    });
    const { frames } = parseSSE(res.text);
    const withReason = frames.filter((f) => f.choices[0]?.finish_reason != null);
    expect(withReason).toHaveLength(1);
    expect(withReason[0]).toBe(frames[frames.length - 1]);
    expect(withReason[0].choices[0].finish_reason).toBe('stop');
    expect(withReason[0].choices[0].delta).toEqual({});
  });

  // FINDING F-05 — CLOSED. spec: the first streamed chunk in the documented
  // example is `{"delta":{"role":"assistant","content":""}, ...}`. Clients that
  // build the message from deltas (LangChain's stream handler, Vercel AI SDK,
  // the Python SDK's ChatCompletionStreamState) key off that role. Every
  // stream now opens with it, tool-call and structured streams included.
  it('F-05: the first streamed chunk carries delta.role = "assistant"', async () => {
    stubCallAI(() => 'hello there');
    const res = await chat({
      model: 'basegeek-rotation',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    });
    const { frames } = parseSSE(res.text);
    expect(frames[0].choices[0].delta.role).toBe('assistant');
  });

  // FINDING F-06 — CLOSED. spec: ChatCompletionStreamOptions.include_usage —
  // "an additional chunk will be streamed before the `data: [DONE]` message.
  // The `usage` field on this chunk shows the token usage statistics for the
  // entire request, and the `choices` field will always be an empty array."
  it('F-06: stream_options {include_usage:true} emits a usage-only final chunk', async () => {
    stubCallAI(() => 'hello there');
    const res = await chat({
      model: 'basegeek-rotation',
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: 'user', content: 'hi' }],
    });
    const { frames } = parseSSE(res.text);
    const last = frames[frames.length - 1];
    expect(last.choices).toEqual([]);
    expect(Number.isInteger(last.usage.prompt_tokens)).toBe(true);
    expect(Number.isInteger(last.usage.completion_tokens)).toBe(true);
    expect(last.usage.total_tokens).toBe(last.usage.prompt_tokens + last.usage.completion_tokens);
  });

  // FINDING F-07 — CLOSED. A failure that happens before a single byte of body
  // is written is an ordinary HTTP error in the OpenAI contract — the SDK
  // raises APIError with a status. The proxy used to commit a 200 and the
  // event-stream content type *before* awaiting the provider, so every
  // upstream failure arrived as a 200 carrying an error frame the SDK cannot
  // classify. The completion is awaited first now; headers follow it.
  it('F-07: an upstream failure before the first chunk is an HTTP error status', async () => {
    patch(aiService, 'callAI', async () => { throw new Error('All AI providers failed'); });
    const res = await chat({
      model: 'basegeek-rotation',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it('tolerates SSE comment/heartbeat lines in the parser (none emitted today)', async () => {
    stubCallAI(() => 'ok');
    const res = await chat({
      model: 'basegeek-rotation',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    });
    const { frames, comments } = parseSSE(`: keep-alive\n\n${res.text}`);
    expect(comments).toEqual([': keep-alive']);
    expect(frames.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. The messages array end to end
//    spec: CreateChatCompletionRequest.messages — "A list of messages
//    comprising the conversation so far", items ChatCompletionRequestMessage
//    (system | developer | user | assistant | tool, each with an optional
//    `name`).
// ─────────────────────────────────────────────────────────────────────────────

describe('the messages array survives the trip', () => {
  const CONVERSATION = [
    { role: 'system', content: 'You are terse.' },
    { role: 'user', content: 'Who won in 1998?', name: 'chef' },
    { role: 'assistant', content: 'France.' },
    { role: 'user', content: 'And the host?' },
  ];

  it('the route hands aiService the whole array, not a flattened prompt', async () => {
    const calls = stubCallAI();
    await chat({ model: 'basegeek-rotation', messages: CONVERSATION });
    expect(calls).toHaveLength(1);
    expect(calls[0].config.messages).toEqual(CONVERSATION);
  });

  it('callAI dispatches the array to the provider unflattened, preserving name', async () => {
    const seen = [];
    patch(aiService, 'callProvider', async (provider, prompt, config) => {
      seen.push({ provider, prompt, config });
      return { content: 'Paris.', inputTokens: 5, outputTokens: 2 };
    });
    patch(aiService, 'updateStats', async () => {});
    patch(aiUsageService, 'trackUsage', async () => {});
    patch(aiService, 'providers', {
      ...aiService.providers,
      groq: { ...aiService.providers.groq, apiKey: 'test', enabled: true, model: 'llama-3.3-70b-versatile' },
    });
    aiService.initialized = true;

    await aiService.callAI('And the host?', {
      provider: 'groq',
      messages: CONVERSATION,
      cacheNamespace: `t${Date.now()}`,
    });

    expect(seen).toHaveLength(1);
    const dispatched = seen[0].config.messages;
    expect(dispatched.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(dispatched[1].name).toBe('chef');
    expect(dispatched[3].content).toBe('And the host?');
  });

  // FINDING F-03 — CLOSED. openaiProxy derives the routing prompt from the LAST
  // user message only, and aiService.getCacheKey hashed that prompt — never the
  // earlier turns. Two different conversations whose last user turn matched
  // therefore shared a cache entry, and the second caller was served the first
  // caller's answer. Multi-turn chat is exactly the case where the last turn
  // ("And the host?", "continue", "why?") repeats. The key is now built from
  // aiService.conversationCacheSubject — the whole normalized array.
  it('F-03: two conversations sharing a last user turn get different answers', async () => {
    let n = 0;
    patch(aiService, 'callProvider', async () => ({
      content: `answer ${++n}`, inputTokens: 5, outputTokens: 2,
    }));
    patch(aiService, 'updateStats', async () => {});
    patch(aiUsageService, 'trackUsage', async () => {});
    patch(aiService, 'providers', {
      ...aiService.providers,
      groq: { ...aiService.providers.groq, apiKey: 'test', enabled: true, model: 'llama-3.3-70b-versatile' },
    });
    aiService.initialized = true;
    aiService.clearCache();

    const ns = `shared-${Date.now()}`;
    const a = await aiService.callAI('continue', {
      provider: 'groq', cacheNamespace: ns,
      messages: [{ role: 'user', content: 'A story about cats' }, { role: 'user', content: 'continue' }],
    });
    const b = await aiService.callAI('continue', {
      provider: 'groq', cacheNamespace: ns,
      messages: [{ role: 'user', content: 'A story about tax law' }, { role: 'user', content: 'continue' }],
    });

    expect(b).not.toBe(a);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. tools / tool_choice
//    spec: CreateChatCompletionRequest.tools + tool_choice;
//    ChatCompletionMessageToolCall {id, type:"function", function:{name,
//    arguments}} where arguments is "The arguments to call the function with,
//    as generated by the model in JSON format" (a string).
// ─────────────────────────────────────────────────────────────────────────────

const WEATHER_TOOL = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get current weather for a city',
    parameters: {
      type: 'object',
      properties: { location: { type: 'string' } },
      required: ['location'],
    },
  },
};

describe('tools and tool_choice', () => {
  it('rejects a non-array tools value with the OpenAI error envelope', async () => {
    stubCallAI();
    const res = await chat({
      model: 'basegeek-rotation',
      messages: [{ role: 'user', content: 'hi' }],
      tools: 'get_weather',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('invalid_request_error');
  });

  it.each(['auto', 'none', 'required', { type: 'function', function: { name: 'get_weather' } }])(
    'passes tools and tool_choice %j through to the service',
    async (toolChoice) => {
      const calls = stubCallAI();
      const res = await chat({
        model: 'basegeek-rotation',
        messages: [{ role: 'user', content: "what's the weather in Paris?" }],
        tools: [WEATHER_TOOL],
        tool_choice: toolChoice,
      });
      expect(res.status).toBe(200);
      expect(calls[0].config.tools).toEqual([WEATHER_TOOL]);
      expect(calls[0].config.toolChoice).toEqual(toolChoice);
    },
  );

  // spec: ChatCompletionResponseMessage.tool_calls[] + finish_reason enum value
  // "tool_calls" — "if the model called a tool".
  it('returns OpenAI-shaped tool_calls with arguments as a JSON string', async () => {
    stubCallAI(() => '', {
      toolCalls: [{
        id: 'toolu_abc123',
        type: 'function',
        function: { name: 'get_weather', arguments: JSON.stringify({ location: 'Paris' }) },
      }],
      finishReason: 'tool_calls',
    });

    const res = await chat({
      model: 'anthropic/claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: "what's the weather in Paris?" }],
      tools: [WEATHER_TOOL],
      tool_choice: 'auto',
    });

    const choice = res.body.choices[0];
    expect(choice.finish_reason).toBe('tool_calls');
    const [call] = choice.message.tool_calls;
    expect(typeof call.id).toBe('string');
    expect(call.type).toBe('function');
    expect(call.function.name).toBe('get_weather');
    expect(typeof call.function.arguments).toBe('string');
    expect(JSON.parse(call.function.arguments)).toEqual({ location: 'Paris' });
    // spec: content is nullable and null when the model only called tools.
    expect(choice.message.content).toBeNull();
  });

  it('collapses to one tool_call when tool_choice pinned a function', async () => {
    stubCallAI(() => '', {
      toolCalls: [
        { id: 'a', type: 'function', function: { name: 'other', arguments: '{}' } },
        { id: 'b', type: 'function', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } },
      ],
      finishReason: 'tool_calls',
    });
    const res = await chat({
      model: 'anthropic/claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'weather?' }],
      tools: [WEATHER_TOOL],
      tool_choice: { type: 'function', function: { name: 'get_weather' } },
    });
    expect(res.body.choices[0].message.tool_calls).toHaveLength(1);
    expect(res.body.choices[0].message.tool_calls[0].function.name).toBe('get_weather');
  });

  // spec: ChatCompletionRequestToolMessage {role:"tool", content, tool_call_id}
  // — the second half of the tool loop every agent framework runs.
  it('accepts a follow-up turn with role:"tool" and tool_call_id', async () => {
    const calls = stubCallAI(() => 'It is 18C in Paris.');
    const res = await chat({
      model: 'anthropic/claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: "what's the weather in Paris?" },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } }],
        },
        { role: 'tool', tool_call_id: 'call_1', content: '{"tempC":18}' },
      ],
      tools: [WEATHER_TOOL],
    });
    expect(res.status).toBe(200);
    const sent = calls[0].config.messages;
    expect(sent[2].role).toBe('tool');
    expect(sent[2].tool_call_id).toBe('call_1');
  });

  // FINDING F-08 — CLOSED. spec: streaming tool calls arrive as
  // `delta.tool_calls[{index, id, type, function:{name, arguments}}]`. `index`
  // is what lets a client reassemble fragments into the right call; the OpenAI
  // SDK's stream accumulator keys on it. The proxy forwarded the non-streaming
  // tool_calls array verbatim, with no `index`; it is stamped on now.
  it('F-08: streamed delta.tool_calls entries carry an index', async () => {
    stubCallAI(() => '', {
      toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } }],
      finishReason: 'tool_calls',
    });
    const res = await chat({
      model: 'anthropic/claude-3-5-sonnet-20241022',
      stream: true,
      messages: [{ role: 'user', content: 'weather?' }],
      tools: [WEATHER_TOOL],
    });
    const { frames } = parseSSE(res.text);
    const withCalls = frames.find((f) => f.choices[0]?.delta?.tool_calls);
    expect(withCalls.choices[0].delta.tool_calls[0].index).toBe(0);
  });

  it('rotation skips a tool-incapable provider instead of failing the request', async () => {
    // cerebras is not in TOOL_CALLING_CORRECTIONS and its call method takes no
    // tools; anthropic is natively capable.
    expect(aiModelCapabilitiesService.supportsTools('cerebras', 'llama3.1-8b')).toBe(false);
    expect(aiModelCapabilitiesService.supportsTools('anthropic', 'claude-3-5-sonnet-20241022')).toBe(true);

    const tried = [];
    patch(aiService, 'callProvider', async (provider) => {
      tried.push(provider);
      return { content: '', toolCalls: [{ id: 'x', type: 'function', function: { name: 'get_weather', arguments: '{}' } }], finishReason: 'tool_calls', inputTokens: 1, outputTokens: 1 };
    });
    patch(aiService, 'updateStats', async () => {});
    patch(aiUsageService, 'trackUsage', async () => {});
    patch(aiService, 'providers', {
      ...aiService.providers,
      cerebras: { ...aiService.providers.cerebras, apiKey: 'test', enabled: true, model: 'llama3.1-8b' },
      anthropic: { ...aiService.providers.anthropic, apiKey: 'test', enabled: true, model: 'claude-3-5-sonnet-20241022' },
    });
    patch(aiService, 'fallbackOrder', ['cerebras', 'anthropic']);
    aiService.initialized = true;

    const out = await aiService.callAI('weather?', {
      provider: 'cerebras',
      tools: [WEATHER_TOOL],
      messages: [{ role: 'user', content: 'weather?' }],
    });

    expect(tried).not.toContain('cerebras'); // skipped on capability, not tried and failed
    expect(tried).toContain('anthropic');
    expect(out).toBe('');
  });

  it('callClaude translates OpenAI tools and every tool_choice form to Anthropic', async () => {
    const srv = await captureServer(() => ({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 2 },
    }));
    patch(aiService, 'providers', {
      ...aiService.providers,
      anthropic: { ...aiService.providers.anthropic, apiKey: 'test', baseURL: srv.url, model: 'claude-3-5-sonnet-20241022' },
    });
    try {
      const base = { messages: [{ role: 'user', content: 'weather?' }], tools: [WEATHER_TOOL] };
      await aiService.callProvider('anthropic', 'weather?', { ...base, toolChoice: 'auto' });
      await aiService.callProvider('anthropic', 'weather?', { ...base, toolChoice: 'required' });
      await aiService.callProvider('anthropic', 'weather?', { ...base, toolChoice: { type: 'function', function: { name: 'get_weather' } } });
      await aiService.callProvider('anthropic', 'weather?', { ...base, toolChoice: 'none' });

      const [auto, required, pinned, none] = srv.captured.map((c) => c.body);
      // Anthropic tool shape: {name, description, input_schema}
      expect(auto.tools[0]).toEqual({
        name: 'get_weather',
        description: 'Get current weather for a city',
        input_schema: WEATHER_TOOL.function.parameters,
      });
      expect(auto.tool_choice).toEqual({ type: 'auto' });
      expect(required.tool_choice).toEqual({ type: 'any' });
      expect(pinned.tool_choice).toEqual({ type: 'tool', name: 'get_weather' });
      expect(none.tools).toBeUndefined();
      expect(none.tool_choice).toBeUndefined();
    } finally {
      await srv.close();
    }
  });

  // FINDING F-02 — CLOSED. The second half of the tool loop. callClaude mapped
  // every non-system turn to `{role: m.role === 'assistant' ? 'assistant' :
  // 'user', content: m.content ?? ''}` — so the assistant turn's `tool_calls`
  // were dropped, and the `role:"tool"` result became a `user` turn with no
  // `tool_use_id`. Anthropic then saw a tool_use it had never been given a
  // result for (and an empty assistant turn), so the turn after any tool call
  // was broken. aiService.anthropicMessagesFrom now translates both halves.
  it('F-02: callClaude round-trips an assistant tool_calls turn and its tool result', async () => {
    const srv = await captureServer(() => ({
      content: [{ type: 'text', text: 'It is 18C.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 2 },
    }));
    patch(aiService, 'providers', {
      ...aiService.providers,
      anthropic: { ...aiService.providers.anthropic, apiKey: 'test', baseURL: srv.url, model: 'claude-3-5-sonnet-20241022' },
    });
    try {
      await aiService.callProvider('anthropic', 'weather?', {
        tools: [WEATHER_TOOL],
        messages: [
          { role: 'user', content: "what's the weather in Paris?" },
          {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } }],
          },
          { role: 'tool', tool_call_id: 'call_1', content: '{"tempC":18}' },
        ],
      });

      const body = srv.captured[0].body;
      const assistantTurn = body.messages.find((m) => m.role === 'assistant');
      const blocks = Array.isArray(assistantTurn?.content) ? assistantTurn.content : [];
      expect(blocks.some((b) => b.type === 'tool_use' && b.id === 'call_1')).toBe(true);

      const resultBlocks = body.messages
        .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
        .filter((b) => b.type === 'tool_result');
      expect(resultBlocks[0].tool_use_id).toBe('call_1');
    } finally {
      await srv.close();
    }
  });

  // FINDING F-04 — CLOSED. The capability matrix marks a dozen Groq models
  // tool-capable (TOOL_CALLING_CORRECTIONS), so the rotation happily routed a
  // `tools` request to Groq — but callGroq destructured only {maxTokens,
  // temperature, model, messages} and never put `tools` on the wire. The
  // caller got prose and finish_reason "stop" where the contract promised
  // tool_calls. callGroq now forwards both (Groq's API is OpenAI-shaped, so
  // verbatim), and supportsToolCalling is gated on TOOL_FORWARDING_PROVIDERS
  // so the matrix can no longer advertise what no adapter implements.
  it('F-04: callGroq forwards tools that the capability matrix says it supports', async () => {
    expect(aiModelCapabilitiesService.supportsTools('groq', 'llama-3.3-70b-versatile')).toBe(true);

    const srv = await captureServer(() => ({
      choices: [{ message: { content: 'It is sunny in Paris.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 4 },
    }));
    patch(aiService, 'providers', {
      ...aiService.providers,
      groq: { ...aiService.providers.groq, apiKey: 'test', baseURL: srv.url, model: 'llama-3.3-70b-versatile' },
    });
    try {
      await aiService.callProvider('groq', 'weather?', {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'weather?' }],
        tools: [WEATHER_TOOL],
        toolChoice: 'auto',
      });
      expect(srv.captured[0].body.tools).toEqual([WEATHER_TOOL]);
    } finally {
      await srv.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. response_format
//    spec: CreateChatCompletionRequest.response_format —
//    {type:"text"|"json_object"|"json_schema"}, json_schema {name, schema,
//    strict, description}.
// ─────────────────────────────────────────────────────────────────────────────

const PERSON_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'Person',
    strict: true,
    schema: {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
      required: ['name', 'age'],
      additionalProperties: false,
    },
  },
};

describe('response_format', () => {
  it.each([{ type: 'json_object' }, PERSON_SCHEMA])(
    'passes response_format %j to the service',
    async (responseFormat) => {
      const calls = stubCallAI(() => '{"name":"Alice","age":30}');
      const res = await chat({
        model: 'basegeek-rotation',
        messages: [{ role: 'user', content: 'Alice is 30.' }],
        response_format: responseFormat,
      });
      expect(res.status).toBe(200);
      expect(calls[0].config.responseFormat).toEqual(responseFormat);
      expect(() => JSON.parse(res.body.choices[0].message.content)).not.toThrow();
    },
  );

  it('reaches a natively capable provider unchanged (gemini/anthropic)', async () => {
    expect(aiModelCapabilitiesService.supportsJSONSchema('gemini', 'gemini-1.5-flash-latest')).toBe(true);
    const seen = [];
    patch(aiService, 'callProvider', async (provider, prompt, config) => {
      seen.push(config);
      return { content: '{"name":"Alice","age":30}', inputTokens: 3, outputTokens: 8 };
    });
    patch(aiService, 'updateStats', async () => {});
    patch(aiUsageService, 'trackUsage', async () => {});
    patch(aiService, 'providers', {
      ...aiService.providers,
      gemini: { ...aiService.providers.gemini, apiKey: 'test', enabled: true, model: 'gemini-1.5-flash-latest' },
    });
    aiService.initialized = true;

    await aiService.callAI('Alice is 30.', {
      provider: 'gemini',
      responseFormat: PERSON_SCHEMA,
      messages: [{ role: 'user', content: 'Alice is 30.' }],
    });
    expect(seen[0].responseFormat).toEqual(PERSON_SCHEMA);
  });

  it('falls back to prompt injection on an incapable provider and strips the param', async () => {
    expect(aiModelCapabilitiesService.supportsJSONSchema('groq', 'llama-3.3-70b-versatile')).toBe(false);
    const seen = [];
    patch(aiService, 'callProvider', async (provider, prompt, config) => {
      seen.push(config);
      return { content: '```json\n{"name":"Alice","age":30}\n```', inputTokens: 3, outputTokens: 8 };
    });
    patch(aiService, 'updateStats', async () => {});
    patch(aiUsageService, 'trackUsage', async () => {});
    patch(aiService, 'providers', {
      ...aiService.providers,
      groq: { ...aiService.providers.groq, apiKey: 'test', enabled: true, model: 'llama-3.3-70b-versatile' },
    });
    aiService.initialized = true;

    const out = await aiService.callAI('Alice is 30.', {
      provider: 'groq',
      responseFormat: PERSON_SCHEMA,
      messages: [{ role: 'user', content: 'Alice is 30.' }],
    });

    // The param is stripped so the incapable provider does not 400 on it...
    expect(seen[0].responseFormat).toBeNull();
    // ...and the schema arrives as an injected system turn instead.
    const system = seen[0].messages.find((m) => m.role === 'system');
    expect(system.content).toMatch(/JSON Schema/);
    expect(system.content).toContain('"age"');
    // The fenced answer is repaired into something a client can parse.
    expect(JSON.parse(out)).toEqual({ name: 'Alice', age: 30 });
  });

  // The AIGEEK_POLISH item-2 fix: cache keys are segregated by the
  // structured-output fingerprint (aiService.js:742-766).
  it('the cache key separates identical prompts with different response_format', () => {
    const plain = aiService.getCacheKey('p', 'groq', 'm', 0.7, 'ns', aiService.structuredOutputFingerprint(null, null, null));
    const obj = aiService.getCacheKey('p', 'groq', 'm', 0.7, 'ns', aiService.structuredOutputFingerprint({ type: 'json_object' }, null, null));
    const schema = aiService.getCacheKey('p', 'groq', 'm', 0.7, 'ns', aiService.structuredOutputFingerprint(PERSON_SCHEMA, null, null));
    expect(new Set([plain, obj, schema]).size).toBe(3);
  });

  it('structured and tool requests bypass the cache entirely', async () => {
    let n = 0;
    patch(aiService, 'callProvider', async () => ({ content: `{"n":${++n}}`, inputTokens: 1, outputTokens: 1 }));
    patch(aiService, 'updateStats', async () => {});
    patch(aiUsageService, 'trackUsage', async () => {});
    patch(aiService, 'providers', {
      ...aiService.providers,
      gemini: { ...aiService.providers.gemini, apiKey: 'test', enabled: true, model: 'gemini-1.5-flash-latest' },
    });
    aiService.initialized = true;

    const cfg = { provider: 'gemini', responseFormat: { type: 'json_object' }, messages: [{ role: 'user', content: 'same' }] };
    const first = await aiService.callAI('same', cfg);
    const second = await aiService.callAI('same', cfg);
    expect(second).not.toBe(first);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Sampling and control parameters
//    spec: CreateChatCompletionRequest (+ CreateModelResponseProperties) —
//    temperature, top_p, max_tokens (deprecated), max_completion_tokens, stop,
//    n, seed, user, logit_bias, logprobs, top_logprobs, presence_penalty,
//    frequency_penalty.
// ─────────────────────────────────────────────────────────────────────────────

/** Run one callAI through a stubbed provider and return the dispatched config. */
async function dispatchWith(routeBody) {
  const seen = [];
  patch(aiService, 'callProvider', async (provider, prompt, config) => {
    seen.push(config);
    return { content: 'ok', inputTokens: 1, outputTokens: 1 };
  });
  patch(aiService, 'updateStats', async () => {});
  patch(aiUsageService, 'trackUsage', async () => {});
  patch(aiService, 'providers', {
    ...aiService.providers,
    groq: { ...aiService.providers.groq, apiKey: 'test', enabled: true, model: 'llama-3.3-70b-versatile' },
  });
  aiService.initialized = true;
  aiService.clearCache();

  const res = await chat({ model: 'groq/llama-3.3-70b-versatile', ...routeBody });
  return { res, dispatched: seen[0] };
}

describe('sampling and control parameters', () => {
  it('temperature and max_tokens reach the provider', async () => {
    const { res, dispatched } = await dispatchWith({
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.11,
      max_tokens: 123,
    });
    expect(res.status).toBe(200);
    expect(dispatched.temperature).toBe(0.11);
    expect(dispatched.maxTokens).toBe(123);
  });

  // FINDING F-09 — CLOSED. The proxy read top_p into callConfig.topP, but
  // aiService.callAI never destructured topP and callProvider never forwarded
  // it. Same for stop, presence_penalty, frequency_penalty and seed — the
  // proxy accepted them, the service dropped them on the floor. All five now
  // travel callAI → callProvider → the adapter, in each provider's own
  // spelling (openAISamplingFields / stopSequencesFrom in aiService.js).
  it('F-09: top_p reaches the provider', async () => {
    const { dispatched } = await dispatchWith({
      messages: [{ role: 'user', content: 'hi' }],
      top_p: 0.42,
    });
    expect(dispatched.topP ?? dispatched.top_p).toBe(0.42);
  });

  it('F-09: stop (string form) reaches the provider', async () => {
    const { dispatched } = await dispatchWith({
      messages: [{ role: 'user', content: 'hi' }],
      stop: 'END',
    });
    expect(dispatched.stop).toBe('END');
  });

  it('F-09: stop (array form) reaches the provider', async () => {
    const { dispatched } = await dispatchWith({
      messages: [{ role: 'user', content: 'hi' }],
      stop: ['END', '\n\n'],
    });
    expect(dispatched.stop).toEqual(['END', '\n\n']);
  });

  it('F-09: seed reaches the provider', async () => {
    const { dispatched } = await dispatchWith({
      messages: [{ role: 'user', content: 'hi' }],
      seed: 7,
    });
    expect(dispatched.seed).toBe(7);
  });

  it('F-09: presence_penalty and frequency_penalty reach the provider', async () => {
    const { dispatched } = await dispatchWith({
      messages: [{ role: 'user', content: 'hi' }],
      presence_penalty: 0.5,
      frequency_penalty: -0.5,
    });
    expect(dispatched.presencePenalty).toBe(0.5);
    expect(dispatched.frequencyPenalty).toBe(-0.5);
  });

  // FINDING F-10 — CLOSED. spec: max_tokens is deprecated in favour of
  // max_completion_tokens, "An upper bound for the number of tokens that can be
  // generated for a completion". Current SDK versions and every reasoning-model
  // caller send max_completion_tokens; the proxy read only max_tokens, so the
  // cap was silently the provider default. Both spellings are now read, the
  // newer one winning when a caller sends both.
  it('F-10: max_completion_tokens is honoured as an alias for max_tokens', async () => {
    const { dispatched } = await dispatchWith({
      messages: [{ role: 'user', content: 'hi' }],
      max_completion_tokens: 321,
    });
    expect(dispatched.maxTokens).toBe(321);
  });

  it('rejects n > 1 with the OpenAI error envelope', async () => {
    stubCallAI();
    const res = await chat({
      model: 'basegeek-rotation',
      messages: [{ role: 'user', content: 'hi' }],
      n: 2,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('invalid_request_error');
    expect(res.body.error.message).toMatch(/n=1/);
  });

  it('accepts n = 1', async () => {
    stubCallAI();
    const res = await chat({ model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }], n: 1 });
    expect(res.status).toBe(200);
  });

  it('ignores logit_bias / logprobs / top_logprobs rather than 500ing', async () => {
    stubCallAI();
    const res = await chat({
      model: 'basegeek-rotation',
      messages: [{ role: 'user', content: 'hi' }],
      logit_bias: { 1734: -100 },
      logprobs: true,
      top_logprobs: 5,
      parallel_tool_calls: false,
      service_tier: 'auto',
      metadata: { run: 'audit' },
      store: false,
    });
    expect(res.status).toBe(200);
  });

  it('accepts the `user` end-user identifier', async () => {
    const calls = stubCallAI();
    const res = await chat({
      model: 'basegeek-rotation',
      messages: [{ role: 'user', content: 'hi' }],
      user: 'end-user-42',
    });
    expect(res.status).toBe(200);
    // NOTE (audit F-14): the proxy forwards it as `userId`, which aiService
    // uses as the *quota subject* (aiService.js:1553). In OpenAI's contract it
    // is an opaque abuse-monitoring tag, not an account.
    expect(calls[0].config.userId).toBe('end-user-42');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Errors
//    spec: components.schemas.Error — required [type, message, param, code];
//    ErrorResponse wraps it as {error: Error}.
// ─────────────────────────────────────────────────────────────────────────────

describe('error envelope', () => {
  it('400 for a missing messages array', async () => {
    const res = await chat({ model: 'basegeek-rotation' });
    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('invalid_request_error');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('401 without a key, in the OpenAI envelope', async () => {
    const res = await request(app)
      .post('/openai/v1/chat/completions')
      .send({ model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(401);
    expect(typeof res.body.error?.message).toBe('string');
    expect(typeof res.body.error?.type).toBe('string');
  });

  it('403 when the key lacks ai:call', async () => {
    const weak = await makeApiKey({ permissions: ['ai:stats'] });
    const res = await chat({ model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] }, { key: weak });
    expect(res.status).toBe(403);
    expect(res.body.error.type).toBe('permission_error');
  });

  it('500 with the envelope when every provider fails', async () => {
    patch(aiService, 'callAI', async () => { throw new Error('All AI providers failed'); });
    const res = await chat({ model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.error.type).toBe('server_error');
    expect(res.body.error.message).toMatch(/providers failed/);
  });

  // FINDING F-12 — CLOSED. spec: Error.required = [type, message, param, code].
  // The OpenAI Python SDK reads `err.param` when raising BadRequestError, and
  // `instructor` surfaces it in retry prompts. openAIError never emitted
  // `param`, and omitted `code` entirely when it was null rather than sending
  // null. Both are always present now, and the request validations name the
  // field they rejected.
  it('F-12: a 400 carries the spec-required param and code keys', async () => {
    const res = await chat({ model: 'basegeek-rotation' });
    expect(res.body.error).toHaveProperty('param');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error.param).toBe('messages');
  });

  // FINDING F-13 — CLOSED. OpenAI answers a bad key with
  // {type:"invalid_request_error", code:"invalid_api_key"}. The proxy emitted
  // type "authentication_error" and passed through baseGeek's own
  // "INVALID_API_KEY" code, so client code branching on either missed both.
  it('F-13: an invalid key reports code invalid_api_key', async () => {
    const res = await chat(
      { model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] },
      { key: `bg_${'0'.repeat(64)}` },
    );
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_api_key');
    expect(res.body.error.type).toBe('invalid_request_error');
  });

  // FINDING F-15 — CLOSED. spec/guide: a 429 carries `Retry-After` and code
  // "rate_limit_exceeded"; every OpenAI SDK's automatic retry reads the header,
  // and finding none hands the error straight to the caller. The key gate set
  // neither; the proxy's envelope translation now sets both, with the wait
  // derived from which of the three buckets (minute/hour/day) was hit.
  it('F-15: a 429 carries Retry-After and code rate_limit_exceeded', async () => {
    // A key whose daily budget is already spent — the schema floors every
    // limit at 1, so exhaust the counter rather than setting a zero limit.
    const throttled = await makeApiKey({
      rateLimit: { requestsPerDay: 1 },
      usage: { requestsToday: 1, lastResetDate: new Date() },
    });
    const res = await chat(
      { model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] },
      { key: throttled },
    );
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.body.error.code).toBe('rate_limit_exceeded');
  });

  // FINDING F-16 — CLOSED. A model id the proxy did not know was not rejected:
  // anything that was not one of the three aliases was treated as a pinned
  // model and handed to whichever provider happened to be current. LangChain,
  // Continue, Cursor and most curl users send `gpt-4o-mini` by default, and
  // got a generic 500. The decision was (a) in the audit: 404 model_not_found,
  // with the aliases named in the message.
  it('F-16: an unknown model id is a 404 model_not_found, not a provider error', async () => {
    patch(aiService, 'callAI', async () => { throw new Error('Groq API error (404): model not found'); });
    const res = await chat({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('model_not_found');
    // The message has to teach the caller what to send instead, or the 404 is
    // just a friendlier dead end than the 500 was.
    expect(res.body.error.message).toContain('basegeek-rotation');
    expect(res.body.error.message).toContain('<provider>/<model>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Models endpoints
//    spec: ListModelsResponse {object:"list", data:[Model]}; Model {id,
//    created, object:"model", owned_by}.
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /v1/models', () => {
  function stubModels() {
    patch(aiService, 'providers', {
      groq: { apiKey: 'test', enabled: true, model: 'llama-3.3-70b-versatile' },
      anthropic: { apiKey: 'test', enabled: true, model: 'claude-3-5-sonnet-20241022' },
    });
    patch(aiService, 'getModels', async (provider) => (
      provider === 'groq'
        ? [{ id: 'llama-3.3-70b-versatile' }]
        : [{ id: 'claude-3-5-sonnet-20241022' }]
    ));
  }

  it('returns {object:"list", data:[Model]} with the required Model fields', async () => {
    stubModels();
    const res = await request(app).get('/openai/v1/models').set('Authorization', `Bearer ${KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.object).toBe('list');
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const m of res.body.data) {
      expect(typeof m.id).toBe('string');
      expect(m.object).toBe('model');
      expect(typeof m.created).toBe('number');
      expect(typeof m.owned_by).toBe('string');
    }
    const ids = res.body.data.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['basegeek-rotation', 'basegeek-free', 'basegeek-app']));
    expect(ids).toContain('llama-3.3-70b-versatile');
  });

  it('requires a key', async () => {
    const res = await request(app).get('/openai/v1/models');
    expect(res.status).toBe(401);
  });

  it('GET /v1/models/{id} returns the Model object for a virtual alias', async () => {
    stubModels();
    const res = await request(app).get('/openai/v1/models/basegeek-rotation').set('Authorization', `Bearer ${KEY}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'basegeek-rotation', object: 'model', owned_by: 'basegeek' });
  });

  it('GET /v1/models/{id} returns the Model object for a real provider model', async () => {
    stubModels();
    const res = await request(app).get('/openai/v1/models/llama-3.3-70b-versatile').set('Authorization', `Bearer ${KEY}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'llama-3.3-70b-versatile', object: 'model', owned_by: 'groq' });
  });

  it('GET /v1/models/{unknown} is a 404 model_not_found', async () => {
    stubModels();
    const res = await request(app).get('/openai/v1/models/gpt-4o-mini').set('Authorization', `Bearer ${KEY}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('model_not_found');
    expect(res.body.error.type).toBe('invalid_request_error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Transport: headers, auth forms, preflight
// ─────────────────────────────────────────────────────────────────────────────

describe('transport', () => {
  it('accepts the key as Authorization: Bearer', async () => {
    stubCallAI();
    const res = await chat({ model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(200);
  });

  it('accepts the key as x-api-key', async () => {
    stubCallAI();
    const res = await request(app)
      .post('/openai/v1/chat/completions')
      .set('x-api-key', KEY)
      .send({ model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(200);
  });

  it('ignores OpenAI-Organization, OpenAI-Project and OpenAI-Beta', async () => {
    stubCallAI();
    const res = await chat(
      { model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] },
      { headers: { 'OpenAI-Organization': 'org-abc', 'OpenAI-Project': 'proj_1', 'OpenAI-Beta': 'assistants=v2' } },
    );
    expect(res.status).toBe(200);
  });

  it('returns an X-Request-Id on every response', async () => {
    stubCallAI();
    const res = await chat({ model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('echoes a caller-supplied X-Request-Id', async () => {
    stubCallAI();
    const res = await chat(
      { model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] },
      { headers: { 'x-request-id': 'req_audit_1' } },
    );
    expect(res.headers['x-request-id']).toBe('req_audit_1');
  });

  // FINDING F-17 — CLOSED. The API-key gate was mounted with `router.use`,
  // which runs on OPTIONS too. In production the global cors() in server.js
  // short-circuits a preflight *from an allowlisted origin* before the router
  // sees it — but any other origin (i.e. any browser client that is not one of
  // the eight suite apps) reached that 401, and the router had no exemption of
  // its own. It answers its own preflight now, ahead of the gate.
  it('F-17: a CORS preflight is answered before the API-key gate', async () => {
    const res = await request(app)
      .options('/openai/v1/chat/completions')
      .set('Origin', 'https://example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(res.status).toBeLessThan(400);
    expect(res.headers['access-control-allow-origin']).toBe('https://example.com');
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    // The browser only sends the headers it intends to use; echo those back.
    expect(res.headers['access-control-allow-headers']).toBe('authorization,content-type');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Routing aliases
//     Local extension, documented in README_OPENAI_PROXY.md and
//     DOCS/AIGEEK_USAGE.md.
// ─────────────────────────────────────────────────────────────────────────────

describe('routing aliases', () => {
  it('basegeek-rotation turns on rotation and echoes the alias back as `model`', async () => {
    const calls = stubCallAI();
    const res = await chat({ model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] });
    expect(calls[0].config.autoRotate).toBe(true);
    expect(calls[0].config.freeOnly).toBe(false);
    expect(res.body.model).toBe('basegeek-rotation');
  });

  it('basegeek-free sets freeOnly and echoes basegeek-free', async () => {
    const calls = stubCallAI();
    const res = await chat({ model: 'basegeek-free', messages: [{ role: 'user', content: 'hi' }] });
    expect(calls[0].config.freeOnly).toBe(true);
    expect(calls[0].config.autoRotate).toBe(false);
    expect(res.body.model).toBe('basegeek-free');
  });

  it('basegeek-app sets useAppConfig', async () => {
    const calls = stubCallAI();
    await chat({ model: 'basegeek-app', messages: [{ role: 'user', content: 'hi' }] });
    expect(calls[0].config.useAppConfig).toBe(true);
  });

  // FINDING F-18 — CLOSED. The proxy echoed basegeek-rotation for the
  // basegeek-app alias, so clients that log or key off the returned model saw
  // a request they never made. An alias echoes itself now.
  it('F-18: basegeek-app echoes the model the caller actually asked for', async () => {
    stubCallAI();
    const res = await chat({ model: 'basegeek-app', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.body.model).toBe('basegeek-app');
  });

  it('<provider>/<model> pins the provider and bypasses rotation', async () => {
    const seen = [];
    patch(aiService, 'callProvider', async (provider, prompt, config) => {
      seen.push({ provider, model: config.model });
      return { content: 'ok', inputTokens: 1, outputTokens: 1 };
    });
    patch(aiService, 'updateStats', async () => {});
    patch(aiUsageService, 'trackUsage', async () => {});
    patch(aiService, 'providers', {
      ...aiService.providers,
      anthropic: { ...aiService.providers.anthropic, apiKey: 'test', enabled: true, model: 'claude-3-5-sonnet-20241022' },
    });
    aiService.initialized = true;
    aiService.clearCache();

    const res = await chat({
      model: 'anthropic/claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.status).toBe(200);
    expect(seen[0]).toEqual({ provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' });
  });

  it('a model id that merely contains a slash is not split (meta-llama/...)', async () => {
    const seen = [];
    patch(aiService, 'callProvider', async (provider, prompt, config) => {
      seen.push({ provider, model: config.model });
      return { content: 'ok', inputTokens: 1, outputTokens: 1 };
    });
    patch(aiService, 'updateStats', async () => {});
    patch(aiUsageService, 'trackUsage', async () => {});
    patch(aiService, 'providers', {
      ...aiService.providers,
      together: { ...aiService.providers.together, apiKey: 'test', enabled: true, model: 'default' },
    });
    aiService.initialized = true;
    aiService.clearCache();

    await aiService.callAI('hi', {
      provider: 'together',
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(seen[0]).toEqual({
      provider: 'together',
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. The other widely used standard: Anthropic Messages
//     https://platform.claude.com/docs/en/api/messages (retrieved 2026-09-05)
//     POST /v1/messages, headers x-api-key + anthropic-version, body
//     {model, messages, max_tokens, system, ...}, response
//     {id, type:"message", role:"assistant", content:[block], stop_reason,
//     usage:{input_tokens, output_tokens}}.
// ─────────────────────────────────────────────────────────────────────────────

describe('Anthropic Messages API shape', () => {
  it('is not offered at /openai/v1/messages — no route claims it', async () => {
    const res = await request(app)
      .post('/openai/v1/messages')
      .set('x-api-key', KEY)
      .set('anthropic-version', '2023-06-01')
      .send({ model: 'claude-3-5-sonnet-20241022', max_tokens: 64, messages: [{ role: 'user', content: 'hi' }] });
    // Express falls through to its default 404 — there is no handler at all.
    expect(res.status).toBe(404);
  });

  // The pieces an adapter would need already exist, which is the audit's point:
  // callClaude already speaks Anthropic natively, so a /v1/messages surface is
  // a translation layer, not new provider work.
  it('the internal model already carries everything a Messages adapter needs', () => {
    expect(typeof aiService.callClaude).toBe('function');
    expect(typeof aiService.callAI).toBe('function');
    // toolCalls + finishReason are normalized onto lastProviderInfo, which is
    // what a stop_reason / content-block translation would read.
    expect(aiService).toHaveProperty('lastProviderInfo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. The legacy second endpoint
//     /api/ai/v1/chat/completions (routes/aiRoutes.js:1384) also advertises
//     OpenAI compatibility. It is a strictly worse implementation of the same
//     contract and is asserted here only so the audit's claim is testable.
// ─────────────────────────────────────────────────────────────────────────────

describe('the legacy /api/ai/v1 endpoint', () => {
  // FINDING F-19 — CLOSED. aiRoutes.js carried a second, much older
  // "OpenAI-compatible" endpoint: it collapsed the messages array into a single
  // "role: content" string, ignored stream/tools/response_format, and used
  // "provider:model" instead of "provider/model" for pinning. Two endpoints
  // claiming one contract is one endpoint too many, and the second one rotted
  // precisely because nothing tested it.
  //
  // The original assertion here was a source grep for the string
  // "/v1/chat/completions", which a 308 alias would still trip — so it is
  // replaced by the property that actually matters: the path still answers
  // (nobody's client 404s), but it holds no implementation of its own.
  // 308 preserves the method and body, so a POST redirected here still
  // completes; 301/302 would rewrite it to a GET.
  it('F-19: only one endpoint in this service implements OpenAI compatibility', async () => {
    const { default: aiRoutes } = await import('../routes/aiRoutes.js');
    const legacy = express();
    legacy.use(express.json());
    legacy.use('/api/ai', aiRoutes);

    const res = await request(legacy)
      .post('/api/ai/v1/chat/completions')
      .redirects(0)
      .send({ model: 'basegeek-rotation', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/openai/v1/chat/completions');

    // The redirect is not a wrapper around a surviving implementation: this
    // file registers no `/v1` handler of its own any more, only the redirect
    // loop. (It still *builds* chat.completion-shaped bodies on /api/ai/call
    // and /api/ai/conversation/message — those are baseGeek's own API
    // borrowing a familiar envelope, not a second claim on the contract.)
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../routes/aiRoutes.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/router\.(get|post|put|patch|delete)\(\s*['"`]\/v1/);
  });

  it('F-19: the legacy models list redirects too, rather than listing provider:model ids', async () => {
    const { default: aiRoutes } = await import('../routes/aiRoutes.js');
    const legacy = express();
    legacy.use(express.json());
    legacy.use('/api/ai', aiRoutes);

    const res = await request(legacy).get('/api/ai/v1/models').redirects(0);
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/openai/v1/models');
  });
});
