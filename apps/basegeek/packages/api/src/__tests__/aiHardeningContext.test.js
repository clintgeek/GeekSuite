/**
 * aiHardeningContext.test.js — what a request is, measured whole, and where
 * its context may be sent.
 *
 * Two findings of 2026-11-06, both about the conversation rather than the
 * last turn of it:
 *
 *   #10 `callAI` estimated tokens from `processedPrompt` — for the feature
 *       runner and `/openai/v1`, only the LAST user turn. A huge system prompt
 *       plus history counted as a one-liner, so the context gate waved it at
 *       a model that could not hold it, and the paid governor priced a long
 *       call as a short one.
 *   #7  `preprocessContext` summarized an over-long conversation with
 *       cerebras → together → groq, whichever had a key — so a request routed
 *       to one vendor had its whole history sent to another first.
 *
 * Real `callAI`; the provider layer is faked at `callProvider`, and for #7 a
 * local HTTP server stands in for the vendor that must NOT be contacted (the
 * old summarizer called its adapter directly, below `callProvider`).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import http from 'node:http';

const { default: mongoose } = await import('mongoose');
const { default: aiService } = await import('../services/aiService.js');
const { default: aiUsageService } = await import('../services/aiUsageService.js');
const { default: AIFreeTier } = await import('../models/AIFreeTier.js');
const { default: AIAppConfig } = await import('../models/AIAppConfig.js');
const { default: AIModel } = await import('../models/AIModel.js');
const { default: AIPricing } = await import('../models/AIPricing.js');
const { default: AISpend } = await import('../models/AISpend.js');
const { paidCaps } = await import('../services/aiRoute.js');

const patched = [];
function patch(obj, key, value) {
  patched.push([obj, key, obj[key], Object.prototype.hasOwnProperty.call(obj, key)]);
  obj[key] = value;
  return value;
}
function enable(...providers) {
  for (const provider of providers) {
    patch(aiService.providers[provider], 'apiKey', 'test-key-not-a-real-credential');
    patch(aiService.providers[provider], 'enabled', true);
  }
}

/** ~12,000 tokens of system prompt and history, then a two-word question. */
function longConversation() {
  const filler = 'the quick brown fox jumps over the lazy dog '.repeat(1200);
  return [
    { role: 'system', content: filler },
    { role: 'user', content: filler },
    { role: 'assistant', content: 'noted' },
    { role: 'user', content: 'and now?' },
  ];
}

let calls;
function fakeProviders() {
  calls = [];
  patch(aiService, 'callProvider', async (provider, _prompt, config = {}) => {
    calls.push(`${provider}/${config.model}`);
    return { content: 'answer', inputTokens: 1, outputTokens: 1, finishReason: 'stop', headers: {} };
  });
}

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
  // The singleton loads its provider connections from Mongo on import and
  // REPLACES `aiService.providers` when it finishes; a key patched before that
  // lands is silently lost. Wait for it.
  for (let i = 0; i < 200 && !aiService.initialized; i += 1) await new Promise((r) => setTimeout(r, 25));
});

beforeEach(async () => {
  patch(aiService, 'initialized', true);
  aiService.freeTierHealth.clear();
  aiService.clearCache();
  aiService.pricingCache.clear();
  for (const bucket of Object.values(aiService.rateLimits)) delete bucket.rateLimitedUntil;
  patch(aiUsageService, 'trackUsage', async () => ({ success: true }));
  await Promise.all([
    AIFreeTier.deleteMany({}), AIAppConfig.deleteMany({}), AIModel.deleteMany({}),
    AIPricing.deleteMany({}), AISpend.deleteMany({}), AISpend.db.collection('aispendbudgets').deleteMany({}),
  ]);
});

afterEach(() => {
  while (patched.length) {
    const [obj, key, original, had] = patched.pop();
    if (had) obj[key] = original;
    else delete obj[key];
  }
  paidCaps(process.env, { reset: true });
  aiService.clearCache();
});

afterAll(async () => {
  await Promise.all([AIFreeTier.deleteMany({}), AIAppConfig.deleteMany({}), AIModel.deleteMany({}), AIPricing.deleteMany({})]);
});

describe('#10 the estimate counts the whole conversation', () => {
  it('the context gate skips a model too small for the system prompt + history', async () => {
    enable('groq');
    patch(aiService, 'summarizationEnabled', false);
    patch(aiService.providers.groq, 'maxContextTokens', 4000);
    await AIFreeTier.create({ provider: 'groq', modelId: 'small-ctx', isFree: true });
    fakeProviders();

    await expect(aiService.callAI('and now?', { provider: 'groq', model: 'small-ctx', messages: longConversation() }))
      .rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('the paid governor prices the history, not just the last turn', async () => {
    enable('openrouter');
    patch(aiService, 'summarizationEnabled', false);
    paidCaps({ AI_PAID_PER_DAY_USD: '0.05', AI_PAID_PER_CALL_USD: '0.01' }, { reset: true });
    await AIAppConfig.create({ appName: 'testgeek', tier: 'auto', allowPaid: true });
    await AIModel.create({ provider: 'openrouter', modelId: 'vendor/input-heavy', name: 'X', isActive: true });
    // $1 per 1M input tokens: ~12k tokens of history is ~$0.012, over the
    // $0.01 per-call cap; the two-word last turn alone is ~$0.000003.
    await AIPricing.create({ provider: 'openrouter', modelId: 'vendor/input-heavy', inputPrice: 1, outputPrice: 0.0001 });
    fakeProviders();

    await expect(aiService.callAI('and now?', {
      appName: 'testgeek', provider: 'openrouter', model: 'vendor/input-heavy', maxTokens: 10, messages: longConversation(),
    })).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});

describe('#7 summarization stays on the attempt\'s own route', () => {
  let server;
  let hits;
  beforeEach(async () => {
    hits = [];
    server = http.createServer((req, res) => {
      hits.push(req.url);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'a summary written by the wrong vendor' } }], usage: {} }));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
  });
  afterEach(async () => {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  });

  it('a long conversation routed to groq is never sent to cerebras/together to be summarized', async () => {
    enable('groq', 'cerebras', 'together');
    const url = `http://127.0.0.1:${server.address().port}`;
    patch(aiService.providers.cerebras, 'baseURL', url);
    patch(aiService.providers.together, 'baseURL', url);
    patch(aiService, 'summarizationEnabled', true);
    patch(aiService.providers.groq, 'maxContextTokens', 16000);
    await AIFreeTier.create({ provider: 'groq', modelId: 'target', isFree: true });

    const providers = [];
    patch(aiService, 'callProvider', async (provider, _prompt, config = {}) => {
      providers.push(provider);
      return { content: 'short summary', inputTokens: 1, outputTokens: 1, finishReason: 'stop', headers: {} };
    });

    await expect(aiService.callAI('and now?', { provider: 'groq', model: 'target', messages: longConversation() }))
      .resolves.toBe('short summary');
    expect(hits).toEqual([]);
    expect(new Set(providers)).toEqual(new Set(['groq']));
  });

  it('a paid attempt is not summarized at all (a second, ungoverned model call)', async () => {
    const summarize = [];
    patch(aiService, 'summarizeMessages', async (...args) => { summarize.push(args); return args[0]; });
    patch(aiService, 'summarizationEnabled', true);
    patch(aiService.providers.openrouter, 'maxContextTokens', 16000);
    const out = await aiService.preprocessContext('', longConversation(), { provider: 'openrouter', model: 'x', paid: true });
    expect(summarize).toEqual([]);
    expect(out.messages).toHaveLength(4);
  });
});
