/**
 * goingOverAiGeek.test.js — pinning tests for the aiGeek half of the
 * 2026-09-05 going-over.
 *
 * Two of these pin bugs that only a *route-level* test could have caught (a
 * ReferenceError in a branch no suite executed, an error body assembled from a
 * provider string), and the rest are pure. They share one Express app so the
 * route-level cases exercise the real middleware chain, the way
 * aiRoutesGates.test.js does.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import pinoHttp from 'pino-http';

const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { User, userGeekConn } = await import('../models/user.js');
const { default: logger } = await import('../lib/logger.js');
const { default: aiRoutes } = await import('../routes/aiRoutes.js');
const { default: aiService } = await import('../services/aiService.js');
const { default: Conversation } = await import('../models/Conversation.js');
const { classifyFailure, upstreamStatusOf } = await import('../services/aiFailureEnvelope.js');
const { serverToday } = await import('../graphql/glance/askService.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    autoLogging: false,
  });
  app.use((req, res, next) => { httpLogger(req, res); next(); });
  app.use('/api/ai', aiRoutes);
  return app;
}

let app;
let seq = 0;
let originalCallAISmart;
/** Set to a string and the next callAISmart reports it as a failure, once. */
let nextSmartFailure = null;

async function userToken() {
  const user = await User.create({
    username: `going_over_ai_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
  });
  return jwt.sign({ id: user._id.toString(), app: 'basegeek' }, process.env.JWT_SECRET);
}

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
  app = buildApp();

  // Never reach a provider.
  originalCallAISmart = aiService.callAISmart;
  aiService.callAISmart = async () => {
    if (nextSmartFailure) {
      const error = nextSmartFailure;
      nextSmartFailure = null;
      return { success: false, error };
    }
    return {
      success: true,
      content: 'the assistant answer',
      routing: { provider: 'groq', model: 'llama-3.1-8b-instant' },
    };
  };
}, 60000);

afterAll(async () => {
  aiService.callAISmart = originalCallAISmart;
  await Conversation.deleteMany({}).catch(() => {});
  await User.deleteMany({ username: /^going_over_ai_/ }).catch(() => {});
});

// ───────────────────────────────────────────────────────────────────────────
describe('POST /api/ai/conversation/message — the non-streaming branch works at all', () => {
  /**
   * `promptTokens` / `completionTokens` were declared with `const` INSIDE the
   * `if (stream)` block while the `else` branch read them for its `usage`
   * object. So every non-streaming call ran the provider call, saved the
   * assistant turn, and only then threw `ReferenceError: promptTokens is not
   * defined` — the caller was billed, the conversation was mutated, the answer
   * was thrown away, and the outer catch answered 500.
   */
  it('answers 200 with the completion and a real usage block', async () => {
    const token = await userToken();
    const res = await request(app)
      .post('/api/ai/conversation/message')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conversationId: `going-over-nonstream-${Date.now()}`,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.choices[0].message.content).toContain('the assistant answer');
    // The three numbers that used to be a ReferenceError.
    expect(typeof res.body.usage.prompt_tokens).toBe('number');
    expect(typeof res.body.usage.completion_tokens).toBe('number');
    expect(res.body.usage.total_tokens)
      .toBe(res.body.usage.prompt_tokens + res.body.usage.completion_tokens);
    expect(res.body.usage.completion_tokens).toBeGreaterThan(0);
  });

  it('never returns the provider\'s own words on a failure', async () => {
    // This is the string aiService builds. Relayed verbatim it hands an
    // ai:call key holder the vendor's name, org/project ids and quota detail —
    // exactly what Q46 removed from /call, /parse-json and the proxy.
    nextSmartFailure =
      'All providers in llama family failed: Groq API error (429): {"error":{"message":"Rate limit reached for org_01abc project proj_02def","type":"tokens"}}';

    const token = await userToken();
    const res = await request(app)
      .post('/api/ai/conversation/message')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conversationId: `going-over-fail-${Date.now()}`,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/org_01abc|proj_02def|Groq|Rate limit reached/);
    expect(res.body.error.code).toBe('rate_limit_exceeded');
    expect(res.status).toBe(429);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('POST /api/ai/call-smart — a provider failure is not a 200', () => {
  /**
   * `callAISmart` reports a provider failure as a RESOLVED `{success:false,
   * error}` rather than a throw, and `res.json(result)` relayed it verbatim at
   * HTTP 200 — telling the caller the request had succeeded while handing them
   * the vendor's raw error body.
   */
  it('maps the upstream status and drops the upstream words', async () => {
    nextSmartFailure =
      'All providers in llama family failed: Together AI API error (404): {"error":"model not-a-model does not exist"}';

    const token = await userToken();
    const res = await request(app)
      .post('/api/ai/call-smart')
      .set('Authorization', `Bearer ${token}`)
      .send({ messages: [{ role: 'user', content: 'hi' }] });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('model_not_found');
    expect(JSON.stringify(res.body)).not.toMatch(/not-a-model|Together|does not exist/);
  });

  it('still returns 200 for a successful call', async () => {
    const token = await userToken();
    const res = await request(app)
      .post('/api/ai/call-smart')
      .set('Authorization', `Bearer ${token}`)
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('every provider adapter says "API error (<status>)"', () => {
  /**
   * `upstreamStatusOf` reads the status out of the literal prefix
   * `API error (<status>)`. Together said "Together AI error (" and Cloudflare
   * said "daily neuron limit exceeded (402)", so both were classified
   * `internal` — a flat 500 — whatever the provider actually answered.
   */
  it('reads a status out of every adapter\'s prefix', () => {
    expect(upstreamStatusOf(new Error('Groq API error (429): {}'))).toBe(429);
    expect(upstreamStatusOf(new Error('Together AI API error (404): {}'))).toBe(404);
    expect(upstreamStatusOf(new Error('Cloudflare API error (402): daily neuron limit exceeded {}'))).toBe(402);
    expect(upstreamStatusOf(new Error('Anthropic API error (401): {}'))).toBe(401);
  });

  it('classifies Together and Groq identically for the same status', () => {
    for (const status of [400, 404, 429]) {
      expect(classifyFailure(new Error(`Together AI API error (${status}): {}`)))
        .toBe(classifyFailure(new Error(`Groq API error (${status}): {}`)));
    }
  });

  it('classifies a Together bad-model pin as model_not_found, not internal', () => {
    // The documented answer in AIGEEK_USAGE.md, and a 500 before the fix.
    expect(classifyFailure(new Error('Together AI API error (404): {}'))).toBe('model_not_found');
    expect(classifyFailure(new Error('Cloudflare API error (402): daily neuron limit exceeded {}')))
      .toBe('invalid_request');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('a conversationId is unique per user, not globally', () => {
  /**
   * The schema declared single-field `unique: true` on `conversationId` AND a
   * compound `{conversationId, userId}` unique. The stricter one won, so a
   * caller-chosen id that is not globally unique ("main", a per-app constant)
   * worked for the first user and E11000'd for everyone after — even though
   * `findOrCreate`'s `findOne` is correctly scoped by userId.
   */
  it('two users can hold the same conversationId', async () => {
    const id = `shared-id-${Date.now()}`;
    const alice = String(new mongoose.Types.ObjectId());
    const bob = String(new mongoose.Types.ObjectId());

    const a = await Conversation.findOrCreate(id, alice, 'storygeek');
    const b = await Conversation.findOrCreate(id, bob, 'storygeek');

    expect(a.userId).toBe(alice);
    expect(b.userId).toBe(bob);
    expect(String(a._id)).not.toBe(String(b._id));
    expect(await Conversation.countDocuments({ conversationId: id })).toBe(2);
  });

  it('the same user reuses their own row rather than creating a second', async () => {
    const id = `reused-id-${Date.now()}`;
    const alice = String(new mongoose.Types.ObjectId());
    const first = await Conversation.findOrCreate(id, alice, 'storygeek');
    const second = await Conversation.findOrCreate(id, alice, 'storygeek');
    expect(String(first._id)).toBe(String(second._id));
  });

  it('keeps the compound uniqueness that makes that safe', () => {
    const indexes = Conversation.schema.indexes();
    const compound = indexes.find(([fields]) =>
      fields.conversationId === 1 && fields.userId === 1
    );
    expect(compound).toBeDefined();
    expect(compound[1].unique).toBe(true);
    // ...and no longer the single-field one that fought it.
    expect(Conversation.schema.path('conversationId').options.unique).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('glanceDraft is told what day it is by the client, not the container', () => {
  /**
   * No image installs tzdata (BURN_REVIEW #13), so the server clock is UTC.
   * `serverToday()` handed the model "Today is <iso> (<weekday>)" from that
   * clock, alongside the prompt rule "if they name today's weekday they mean
   * next week's" — so from 19:00 Central the model was drafting against
   * tomorrow, and `glanceDraft` had no date argument with which to say so.
   */
  it('uses the client\'s calendar day and its real weekday', () => {
    expect(serverToday('2026-09-05')).toEqual({ iso: '2026-09-05', weekday: 'Saturday' });
    expect(serverToday('2026-09-04')).toEqual({ iso: '2026-09-04', weekday: 'Friday' });
  });

  it('falls back to the server clock when the client says nothing', () => {
    const at = new Date(2026, 8, 4, 19, 30);
    expect(serverToday(null, at).iso).toBe('2026-09-04');
  });

  it('ignores a malformed date rather than trusting it', () => {
    const at = new Date(2026, 8, 4, 19, 30);
    for (const bad of ['tomorrow', '2026-9-4', '', '2026-09-05T00:00:00Z', 42, {}]) {
      expect(serverToday(bad, at).iso).toBe('2026-09-04');
    }
  });

  it('never slips a weekday off a midnight boundary', () => {
    // Anchored at noon UTC precisely so no host timezone can move the day.
    expect(serverToday('2026-01-01').weekday).toBe('Thursday');
    expect(serverToday('2026-12-31').weekday).toBe('Thursday');
  });
});
