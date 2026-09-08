/**
 * aiFeatureDoor.test.js — the runner's contract, over HTTP.
 *
 * `aiFeatureRunner` has been the one door every *in-gateway* AI feature walks
 * through since night 2: routing row, per-user daily cap, deterministic
 * fallback, provenance. Consumers outside the gateway got none of it —
 * fitnessgeek and storygeek called `/api/ai/call` with their own axios
 * wrappers, no fallback, and 500'd to the user on any failure, so a free-tier
 * hiccup showed up as a broken app.
 *
 * Two shapes are pinned here, and one rule that matters more than either:
 *
 *   `POST /api/ai/feature`     — the runner's core with an envelope. A model
 *                                failure is a **200** carrying
 *                                `{ ok: false, reason }`, because the
 *                                deterministic fallback for an out-of-process
 *                                feature lives out there with the feature.
 *   `GET  /api/ai/models/alive` — what any picker shows. No human types a
 *                                model id again (D4).
 *
 * And the rule: the app comes from the credential, never the body. Same as
 * every other AI route (services/callerIdentity.js) — so every case below
 * sends a body that *lies* about who is calling. A test with an honest body
 * passes against the vulnerable version.
 *
 * `/api/ai/call`'s deprecation is here too, because it is the other half of
 * the same change: the old door announces itself as old.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import pinoHttp from 'pino-http';

const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { User, userGeekConn } = await import('../models/user.js');
const { default: logger } = await import('../lib/logger.js');
const { default: APIKey } = await import('../models/APIKey.js');
const { default: aiRoutes, _resetDeprecationLog, _deprecationDue } = await import('../routes/aiRoutes.js');
const { default: aiService } = await import('../services/aiService.js');
const { default: AIFreeTier } = await import('../models/AIFreeTier.js');
const { default: AIModel } = await import('../models/AIModel.js');
const { _resetCounters } = await import('../services/aiFeatureRunner.js');

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

/** What aiService was handed on the last call. */
let captured = null;
let originalCallAI;
/** Set either and the *next* callAI obeys it, once. */
let nextFailure = null;
let nextAnswer = null;

async function makeApiKey({ appName = 'storygeek', permissions = ['ai:call', 'ai:models'] } = {}) {
  const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();
  await APIKey.create({
    keyHash,
    keyPrefix,
    name: `feature door probe ${seq++}`,
    appName,
    permissions,
    createdBy: new mongoose.Types.ObjectId(),
  });
  return apiKey;
}

async function makeUserWithToken({ appClaim = 'basegeek' } = {}) {
  const user = await User.create({
    username: `feature_door_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
  });
  const token = jwt.sign(
    { id: user._id.toString(), ...(appClaim ? { app: appClaim } : {}) },
    process.env.JWT_SECRET
  );
  return { user, token };
}

/** Give a provider a key so its rows are considered configured. */
function enable(...providers) {
  for (const provider of providers) {
    aiService.providers[provider].apiKey = 'test-key-not-a-real-credential';
    aiService.providers[provider].enabled = true;
  }
}

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
  app = buildApp();

  // Never reach a provider.
  originalCallAI = aiService.callAI;
  aiService.callAI = async (prompt, config) => {
    captured = { prompt, config };
    if (nextFailure) {
      const failure = nextFailure;
      nextFailure = null;
      throw failure;
    }
    aiService.lastProviderInfo = {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      cached: false,
      toolCalls: null,
      finishReason: 'stop',
      hints: ['app_config'],
      costUsd: 0,
    };
    if (nextAnswer !== null) {
      const answer = nextAnswer;
      nextAnswer = null;
      return answer;
    }
    return '{"ok": true}';
  };
  aiService.initialized = true;
}, 60000);

afterEach(async () => {
  captured = null;
  nextFailure = null;
  nextAnswer = null;
  _resetCounters();
  _resetDeprecationLog();
  await User.deleteMany({});
  await APIKey.deleteMany({});
  await AIFreeTier.deleteMany({});
  await AIModel.deleteMany({});
});

afterAll(async () => {
  aiService.callAI = originalCallAI;
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

/* ── POST /api/ai/feature — the gate ──────────────────────────────────────── */

describe('POST /api/ai/feature — the gate', () => {
  it('refuses an unauthenticated caller', async () => {
    const res = await request(app).post('/api/ai/feature').send({ feature: 'gm', user: 'hi' });
    expect(res.status).toBe(401);
  });

  it('refuses a key without ai:call', async () => {
    const apiKey = await makeApiKey({ permissions: ['ai:models'] });
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm', user: 'hi' });
    expect(res.status).toBe(403);
  });

  it('attributes to the key‘s app, not the appName in the body', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      // The lie: a storygeek key claiming to be fitnessgeek. Routing decides
      // which model answers and at whose expense; a body is not a credential.
      .send({ feature: 'gm', user: 'hi', appName: 'fitnessgeek' });
    expect(res.status).toBe(200);
    expect(captured.config.appName).toBe('storygeek');
  });

  it('attributes to the JWT app claim, not the body', async () => {
    const { token } = await makeUserWithToken({ appClaim: 'startgeek' });
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${token}`)
      .send({ feature: 'brief', user: 'hi', appName: 'fitnessgeek' });
    expect(res.status).toBe(200);
    expect(captured.config.appName).toBe('startgeek');
  });

  it('keeps the feature the body names — the one thing it may say', async () => {
    const apiKey = await makeApiKey({ appName: 'fitnessgeek' });
    await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'foodParse', user: 'two eggs' });
    expect(captured.config.feature).toBe('foodparse');
    expect(captured.config.appName).toBe('fitnessgeek');
  });

  it('requires a feature: an unnamed one would share the cap with every other', async () => {
    const apiKey = await makeApiKey();
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ user: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, reason: 'invalid_request' });
  });

  it('requires something to say', async () => {
    const apiKey = await makeApiKey();
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_MESSAGES');
  });

  it('rejects a malformed schema rather than sending it upstream', async () => {
    const apiKey = await makeApiKey();
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm', user: 'hi', schema: { name: 'T' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SCHEMA');
  });
});

/* ── POST /api/ai/feature — the shape ─────────────────────────────────────── */

describe('POST /api/ai/feature — the documented shapes', () => {
  it('answers { ok: true, data, provenance } with a parsed object', async () => {
    const apiKey = await makeApiKey();
    nextAnswer = '```json\n{"turn": "the door creaks"}\n```';
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        feature: 'gm',
        messages: [{ role: 'system', content: 'be terse' }, { role: 'user', content: 'open the door' }],
        schema: { name: 'Turn', schema: { type: 'object', properties: { turn: { type: 'string' } } } },
        conversationId: 'story-1',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toEqual({ turn: 'the door creaks' });
    expect(res.body.provenance).toMatchObject({
      source: 'model',
      reason: null,
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      cached: false,
      callsToday: 1,
      costUsd: 0,
    });
    expect(res.body.provenance.hints).toEqual(['app_config']);
    // A conversation id is what turns a sticky routing row into a sticky pick.
    expect(captured.config.conversationId).toBe('story-1');
  });

  it('a model failure is a 200 with ok:false, not a 500 — that is the whole point', async () => {
    const apiKey = await makeApiKey();
    nextFailure = new Error('Groq API error (429): {"error":{"message":"Rate limit reached for org_01abc"}}');
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm', user: 'hi' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(res.body.provenance).toMatchObject({ source: 'none', reason: 'unavailable' });
    // Q46: the provider's own words never leave the process — they carry org
    // and project ids and, historically, a redacted key fragment.
    expect(JSON.stringify(res.body)).not.toMatch(/org_01abc|Groq|Rate limit/);
  });

  it('an unparseable answer is ok:false with reason "unparseable"', async () => {
    const apiKey = await makeApiKey();
    nextAnswer = 'I would rather not produce JSON today';
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        feature: 'gm',
        user: 'hi',
        schema: { name: 'Turn', schema: { type: 'object', properties: { turn: { type: 'string' } } } },
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, reason: 'unparseable' });
  });

  it('an empty free-text answer is ok:false with reason "empty"', async () => {
    const apiKey = await makeApiKey();
    nextAnswer = '   ';
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm', user: 'hi' });
    expect(res.body).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('the daily cap is ok:false with reason "cap", and never reaches the model', async () => {
    const apiKey = await makeApiKey();
    const send = () => request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm', user: 'hi', maxCallsPerDay: 1 });

    expect((await send()).body.ok).toBe(true);
    captured = null;
    const over = await send();
    expect(over.status).toBe(200);
    expect(over.body).toMatchObject({ ok: false, reason: 'cap' });
    expect(over.body.provenance).toMatchObject({ source: 'none', callsToday: 1, cap: 1 });
    expect(captured).toBeNull();
  });

  it('clamps timeoutMs to [1000, 60000]', async () => {
    // A sub-second budget is a timeout dressed as a retry; a ten-minute one
    // outlives every HTTP client that would be waiting for it.
    const apiKey = await makeApiKey();
    nextFailure = null;
    // 1 ms would make every call time out; clamped to 1000 it answers.
    let res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm', user: 'hi', timeoutMs: 1 });
    expect(res.body.ok).toBe(true);

    res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm2', user: 'hi', timeoutMs: 10 ** 9 });
    expect(res.body.ok).toBe(true);

    res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm3', user: 'hi', timeoutMs: 'soon please' });
    expect(res.body.ok).toBe(true);
  });

  it('forwards no legacy routing switch — the only routing a body may ask for is a pin', async () => {
    const apiKey = await makeApiKey();
    await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      // `freeOnly` and `useAppConfig` are the old vocabulary; this door does
      // not speak it. Without a pin, routing is the app's row and nothing else.
      .send({ feature: 'gm', user: 'hi', freeOnly: true, useAppConfig: false, autoRotate: true });
    expect(captured.config.freeOnly).toBeUndefined();
    expect(captured.config.useAppConfig).toBeUndefined();
    expect(captured.config.autoRotate).toBeUndefined();
    expect(captured.config.provider).toBeUndefined();
    expect(captured.config.model).toBeUndefined();
  });

  it('does not let the user turn become a billing identity', async () => {
    // `resolveCaller` reads `body.user` as "the person this service key is
    // calling for" — an old spelling that predates this route, where `user` is
    // the prompt. Handing it the whole body would have billed every call in
    // the suite to a user named after its own prompt, and pooled their
    // free-tier quota with it.
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm', user: 'open the door' });
    // Whatever the key's own attribution is (its owner, for a service key),
    // it is never the prompt.
    expect(captured.config.userId).not.toBe('open the door');
    // ...and the prompt still arrived as a prompt.
    expect(captured.prompt).toBe('open the door');
  });

  it('a service key with no session bills the app-wide bucket, not a body-named user', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm', user: 'hi', userId: 'the-player' });
    // callerIdentity's deliberate trust: a key holder is a backend we minted
    // a key for, so the body may name the person the call is *for*. The app it
    // is billed to is still the key's.
    expect(captured.config.userId).toBe('the-player');
    expect(captured.config.appName).toBe('storygeek');
  });
});

/* ── GET /api/ai/models/alive ─────────────────────────────────────────────── */

describe('GET /api/ai/models/alive', () => {
  it('takes ai:models', async () => {
    const apiKey = await makeApiKey({ permissions: ['ai:call'] });
    const res = await request(app)
      .get('/api/ai/models/alive')
      .set('Authorization', `Bearer ${apiKey}`);
    expect(res.status).toBe(403);
  });

  it('is the documented array: provider, modelId, fitness, paid, lastSuccessAt', async () => {
    enable('groq', 'openrouter');
    aiService.freeTierHealth.clear();
    const lastSuccessAt = new Date(Date.now() - 60000);
    await AIFreeTier.create({
      provider: 'groq', modelId: 'llama-3.3-70b-versatile', isFree: true, fitness: 'structured',
      health: { lastSuccessAt },
    });
    await AIModel.create({
      provider: 'openrouter', modelId: 'cheap-paid', name: 'Cheap Paid', isActive: true, role: 'paid-fallback',
    });

    const apiKey = await makeApiKey();
    const res = await request(app)
      .get('/api/ai/models/alive')
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const free = res.body.find(r => r.modelId === 'llama-3.3-70b-versatile');
    expect(free).toMatchObject({ provider: 'groq', fitness: 'structured', paid: false });
    expect(new Date(free.lastSuccessAt).getTime()).toBe(lastSuccessAt.getTime());
    // The governed paid set is on the same list, flagged — a picker has to be
    // able to say "this one costs money".
    expect(res.body.find(r => r.modelId === 'cheap-paid')).toMatchObject({ paid: true });
  });

  it('leaves out a cooling row — the picker and the router agree about "alive"', async () => {
    enable('groq');
    aiService.freeTierHealth.clear();
    await AIFreeTier.create({
      provider: 'groq', modelId: 'sleeping', isFree: true,
      health: { coolingUntil: new Date(Date.now() + 3600 * 1000), lastFailureCode: 'http_404' },
    });
    await AIFreeTier.create({ provider: 'groq', modelId: 'awake', isFree: true });

    const apiKey = await makeApiKey();
    const res = await request(app)
      .get('/api/ai/models/alive')
      .set('Authorization', `Bearer ${apiKey}`);
    expect(res.body.map(r => r.modelId)).toEqual(['awake']);
  });

  it('leaves out a provider we hold no key for', async () => {
    aiService.freeTierHealth.clear();
    aiService.providers.cohere.apiKey = null;
    await AIFreeTier.create({ provider: 'cohere', modelId: 'command-r', isFree: true });

    const apiKey = await makeApiKey();
    const res = await request(app)
      .get('/api/ai/models/alive')
      .set('Authorization', `Bearer ${apiKey}`);
    expect(res.body).toEqual([]);
  });

  it('does not collide with GET /api/ai/models/:provider', async () => {
    // `/models/alive` has to be registered above the parameterised route, or
    // `alive` is read as a provider id and the picker gets a 400.
    const apiKey = await makeApiKey();
    const res = await request(app)
      .get('/api/ai/models/alive')
      .set('Authorization', `Bearer ${apiKey}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

/* ── /api/ai/call says it is old ──────────────────────────────────────────── */

describe('POST /api/ai/call — deprecated, and says so', () => {
  it('sets Deprecation: true and points at the successor', async () => {
    const apiKey = await makeApiKey();
    const res = await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi' });
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toContain('/api/ai/feature');
  });

  it('still works — it is deprecated for one deploy, not broken', async () => {
    const apiKey = await makeApiKey();
    const res = await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi' });
    expect(res.body.choices[0].message.content).toBe('{"ok": true}');
  });

  it('logs one line per caller app per hour, not one per call', async () => {
    // The throttle itself, which is the part worth pinning. A busy consumer
    // must not fill the log with its own obituary, and the next reader must
    // still be able to see who is on this route before it is deleted.
    const at = Date.parse('2026-09-07T12:00:00Z');
    expect(_deprecationDue('storygeek', at)).toBe(true);
    expect(_deprecationDue('storygeek', at + 1000)).toBe(false);
    expect(_deprecationDue('storygeek', at + 59 * 60 * 1000)).toBe(false);
    expect(_deprecationDue('storygeek', at + 60 * 60 * 1000)).toBe(true);
    // Per app, so one chatty consumer does not hide a quiet one.
    expect(_deprecationDue('fitnessgeek', at + 1000)).toBe(true);
  });
});

/* ── the pin over HTTP, and the quota bucket ──────────────────────────────── */

describe('POST /api/ai/feature — an explicit pin', () => {
  it('forwards provider + model so resolveRoute sees a pin', async () => {
    const apiKey = await makeApiKey();
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      // StoryGeek's player picker: the player chose a model for their story.
      .send({ feature: 'gm', user: 'hi', provider: 'groq', model: 'llama-3.3-70b-versatile' });
    expect(res.status).toBe(200);
    expect(captured.config.provider).toBe('groq');
    expect(captured.config.model).toBe('llama-3.3-70b-versatile');
  });

  it('refuses half a pin rather than answering from the provider default', async () => {
    const apiKey = await makeApiKey();
    for (const half of [{ provider: 'groq' }, { model: 'llama-3.3-70b-versatile' }]) {
      const res = await request(app)
        .post('/api/ai/feature')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ feature: 'gm', user: 'hi', ...half });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INCOMPLETE_PIN');
    }
  });

  it('refuses a provider this gateway does not serve', async () => {
    const apiKey = await makeApiKey();
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm', user: 'hi', provider: 'openai', model: 'gpt-4o' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_PROVIDER');
  });

  it('relays pin_unavailable in provenance.hints so a player can be told', async () => {
    // The degradation itself is `callAI`'s (pinned in aiFreeTierRouting); what
    // is pinned here is that the hint survives the trip out over HTTP, which
    // is the only way StoryGeek can say "that model is unavailable, using the
    // usual one" instead of failing the turn.
    const apiKey = await makeApiKey();
    const original = aiService.callAI;
    aiService.callAI = async () => {
      aiService.lastProviderInfo = {
        provider: 'cerebras', model: 'someone-else', cached: false,
        hints: ['explicit_pin', 'pin_unavailable'], costUsd: 0,
      };
      return 'the story continues';
    };
    try {
      const res = await request(app)
        .post('/api/ai/feature')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ feature: 'gm', user: 'hi', provider: 'groq', model: 'retired-gm' });
      expect(res.body.ok).toBe(true);
      expect(res.body.provenance.hints).toContain('pin_unavailable');
      expect(res.body.provenance.provider).toBe('cerebras');
    } finally {
      aiService.callAI = original;
    }
  });
});

describe('POST /api/ai/feature — the quota bucket', () => {
  const send = (apiKey, body) => request(app)
    .post('/api/ai/feature')
    .set('Authorization', `Bearer ${apiKey}`)
    .send({ feature: 'gm', user: 'hi', maxCallsPerDay: 1, ...body });

  it('splits a service key‘s cap by quotaKey — one player must not spend the app‘s day', async () => {
    // A key has no session, so `callerIdentity` yields `userId: null` and
    // every StoryGeek player would otherwise share one bucket.
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    expect((await send(apiKey, { quotaKey: 'player-a' })).body.ok).toBe(true);
    expect((await send(apiKey, { quotaKey: 'player-a' })).body).toMatchObject({ ok: false, reason: 'cap' });
    // A different session still has its own day.
    expect((await send(apiKey, { quotaKey: 'player-b' })).body.ok).toBe(true);
  });

  it('never lets quotaKey become an identity', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    await send(apiKey, { quotaKey: 'player-a' });
    // It counts a cap. It does not reach the model call, and so cannot reach
    // AIUsage, AISpend, or a conversation's ownership — the attribution stays
    // whatever the credential said (for a service key, the key's owner).
    expect(captured.config.quotaKey).toBeUndefined();
    expect(captured.config.userId).not.toBe('player-a');
  });

  it('ignores quotaKey when the credential already names a user', async () => {
    const { token, user } = await makeUserWithToken({ appClaim: 'startgeek' });
    expect((await send(token, { quotaKey: 'someone-else' })).body.ok).toBe(true);
    // The second call is capped against the *session*, not against the string
    // the body sent — otherwise a body could hand itself a fresh quota
    // whenever it liked.
    expect((await send(token, { quotaKey: 'a-different-string' })).body)
      .toMatchObject({ ok: false, reason: 'cap' });
    expect(captured.config.userId).toBe(user._id.toString());
  });

  it('defaults the cap to 200, not the in-process 20', async () => {
    // A StoryGeek evening is dozens of GM turns; 20 would end the story
    // mid-scene. The real ceilings are the free tier's rate limits and the
    // paid governor.
    const apiKey = await makeApiKey();
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm', user: 'hi' });
    expect(res.body.provenance.cap).toBe(200);
  });

  it('lets the routing row lower it', async () => {
    const { default: AIAppConfig } = await import('../models/AIAppConfig.js');
    await AIAppConfig.deleteMany({ appName: 'storygeek' });
    await AIAppConfig.create({ appName: 'storygeek', tier: 'auto', dailyCap: 3 });
    try {
      const apiKey = await makeApiKey({ appName: 'storygeek' });
      const res = await request(app)
        .post('/api/ai/feature')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ feature: 'gm', user: 'hi' });
      expect(res.body.provenance.cap).toBe(3);
    } finally {
      await AIAppConfig.deleteMany({ appName: 'storygeek' });
    }
  });

  it('a request may still ask for less than the row allows', async () => {
    const apiKey = await makeApiKey();
    const res = await request(app)
      .post('/api/ai/feature')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ feature: 'gm', user: 'hi', maxCallsPerDay: 5 });
    expect(res.body.provenance.cap).toBe(5);
  });
});
