/**
 * goingOverMisc.test.js — the remaining pins from the 2026-09-05 going-over:
 * an argument passed in the wrong slot, a connection with no error handler, an
 * unbounded query, a counter row that raced itself, and the body parser that
 * ran before the credential check.
 */

import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';

const { getAIGeekConnection } = await import('../config/database.js');
const { default: aiUsageService } = await import('../services/aiUsageService.js');
const { default: AIUsage } = await import('../models/AIUsage.js');
const { resolvers: basegeekResolvers } = await import('../graphql/basegeek/resolvers.js');
const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { resolvers: noteResolvers } = await import('../graphql/notegeek/resolvers.js');
const { default: aiService } = await import('../services/aiService.js');

const ALICE = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: userId } } : {});

beforeAll(async () => {
  await AIUsage.db.asPromise();
  await Note.db.asPromise();
}, 60000);

afterEach(async () => {
  await Promise.all([AIUsage.deleteMany({}), Note.deleteMany({})]);
});

afterAll(async () => {
  await Promise.all([AIUsage.db.close(), Note.db.close()]);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ───────────────────────────────────────────────────────────────────────────
describe('the aiGeek connection has an error handler', () => {
  /**
   * Q44. A mongoose Connection is an EventEmitter, and an 'error' event with
   * NO listener is thrown by Node rather than logged — so a post-boot aiGeek
   * outage (auth failure, socket reset, replica-set election) took the whole
   * API process down with an uncaught exception. Every other connection in
   * this package already carried the handler; this one did not.
   */
  it('listens for error, the way models/user.js and appConnections.js do', () => {
    const conn = getAIGeekConnection();
    expect(conn.listenerCount('error')).toBeGreaterThan(0);
  });

  it('an error event is absorbed rather than thrown', () => {
    const conn = getAIGeekConnection();
    // Without a listener this line is an uncaught exception.
    expect(() => conn.emit('error', new Error('simulated replica-set election'))).not.toThrow();
  });

  it('is a cached singleton, so the handler is attached exactly once', () => {
    expect(getAIGeekConnection()).toBe(getAIGeekConnection());
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('aiUsage asks for a user, not for the word "session"', () => {
  /**
   * `getProviderUsageSummary(provider, userId)` queries
   * `{provider, userId, date}`. The resolver passed the literal string
   * 'session' in the userId slot, so the field asked for a user by that name
   * and could only ever return zeros — the same class Q45 fixed on the REST
   * sibling, which now takes its user id from the credential too.
   */
  const today = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  it('returns the calling user\'s own usage', async () => {
    await AIUsage.create({
      provider: 'groq',
      modelId: 'llama-3.1-8b-instant',
      userId: ALICE,
      date: today(),
      currentDay: { requests: 7, tokens: 1234, audioSeconds: 0, date: today() },
    });

    const summary = await basegeekResolvers.Query.aiUsage(null, { provider: 'groq' }, ctx(ALICE));
    expect(summary.totalRequests).toBe(7);
    expect(summary.totalTokens).toBe(1234);
  });

  it('does not show one user another user\'s usage', async () => {
    await AIUsage.create({
      provider: 'groq',
      modelId: 'llama-3.1-8b-instant',
      userId: ALICE,
      date: today(),
      currentDay: { requests: 7, tokens: 1234, audioSeconds: 0, date: today() },
    });
    const bob = String(new mongoose.Types.ObjectId());
    const summary = await basegeekResolvers.Query.aiUsage(null, { provider: 'groq' }, ctx(bob));
    expect(summary.totalRequests).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the free-tier usage row cannot lose a race with itself', () => {
  /**
   * `findOne` -> `new AIUsage(...)` -> `save()` against a UNIQUE
   * `{provider, modelId, userId, date}` index: the first two concurrent calls
   * of a day both found nothing, both constructed a row, and the loser hit
   * E11000 — swallowed into `{success:false}`, which aiService awaited and
   * never inspected. A lost usage record is a free-tier ceiling sailed past.
   */
  it('two simultaneous first-calls of the day both succeed', async () => {
    const results = await Promise.all([
      aiUsageService.trackUsage('groq', 'llama-3.1-8b-instant', ALICE, { inputTokens: 10, outputTokens: 5, requests: 1 }),
      aiUsageService.trackUsage('groq', 'llama-3.1-8b-instant', ALICE, { inputTokens: 10, outputTokens: 5, requests: 1 }),
    ]);
    for (const r of results) expect(r.success).toBe(true);
    // Exactly one row, because the unique index is doing its job.
    expect(await AIUsage.countDocuments({ provider: 'groq', userId: ALICE })).toBe(1);
  });

  it('reports a failure rather than swallowing it', async () => {
    // The contract the caller now checks: a failed write says so.
    const bad = await aiUsageService.trackUsage(null, null, null, { requests: 1 });
    expect(bad.success).toBe(false);
    expect(bad.error).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('searchNotes is bounded', () => {
  /**
   * No `.limit()` at all, while projecting every matching row's full
   * `content` — a field whose ceiling is 5 000 000 characters for the
   * mindmap/handwritten snapshot types — in order to build a 200-character
   * snippet it then discards for exactly those types.
   */
  it('returns at most one page of hits however many match', async () => {
    await Note.insertMany(
      Array.from({ length: 130 }, (_, i) => ({
        userId: ALICE,
        title: `haystack ${i}`,
        content: 'needle needle needle',
        type: 'text',
        tags: [],
      }))
    );

    const hits = await noteResolvers.Query.searchNotes(null, { q: 'needle' }, ctx(ALICE));
    expect(hits.length).toBeLessThanOrEqual(100);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('still refuses an empty query and an anonymous caller', async () => {
    await expect(noteResolvers.Query.searchNotes(null, { q: '   ' }, ctx(ALICE))).rejects.toThrow(/empty/i);
    await expect(noteResolvers.Query.searchNotes(null, { q: 'x' }, {})).rejects.toThrow(/unauthorized/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('a provider an admin switched off is not advertised as available', () => {
  /**
   * `GET /api/ai/providers` filtered on key length alone while
   * `GET /api/ai/capabilities` filtered the same map on `.enabled` — so a
   * disabled provider still appeared in StoryGeek's settings picker, and
   * picking it failed at call time.
   */
  it('drops enabled: false, keeps everything else', () => {
    const saved = aiService.providers;
    try {
      aiService.providers = {
        alpha: { apiKey: 'k'.repeat(40), enabled: true },
        beta: { apiKey: 'k'.repeat(40), enabled: false },
        gamma: { apiKey: 'k'.repeat(40) },        // undefined === not disabled
        delta: { apiKey: 'short' },               // no usable key
        epsilon: {},                              // no key at all
      };
      expect(aiService.getAvailableProviders().sort()).toEqual(['alpha', 'gamma']);
    } finally {
      aiService.providers = saved;
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the AI surfaces are body-capped before anything checks a credential', () => {
  /**
   * `express.json({limit:'50mb'})` was mounted app-wide, and both AI routers
   * apply their key gate INSIDE the router — so an entirely unauthenticated
   * POST to /openai/v1/chat/completions had its full 50 MB body buffered and
   * JSON-parsed into heap before anything looked at `Authorization`.
   */
  it('mounts a tighter parser in front of /openai/v1 and /api/ai, before the global one', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

    const aiParser = src.indexOf("app.use('/openai/v1', aiBodyParser)");
    const apiParser = src.indexOf("app.use('/api/ai', aiBodyParser)");
    const globalParser = src.indexOf("app.use(express.json({ limit: '50mb' }))");

    expect(aiParser).toBeGreaterThan(-1);
    expect(apiParser).toBeGreaterThan(-1);
    // Order is the whole mechanism: express.json is a no-op once req.body is
    // set, so the tight one only wins if it is mounted first.
    expect(aiParser).toBeLessThan(globalParser);
    expect(apiParser).toBeLessThan(globalParser);
  });

  it('the 500 handler does not depend on middleware mounted after the guards', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    // cors() rejects a disallowed Origin with `callback(new Error(...))`, and
    // it is mounted BEFORE pino-http attaches req.log — so a bare
    // `req.log.error(...)` in the error handler threw inside the error handler.
    expect(src).toContain('(req.log || logger).error({ err }, \'500 handler\')');
  });
});
