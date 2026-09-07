/**
 * aiRoutesGates.test.js — the aiGeek routes that spend money are gated, all of them.
 *
 * `92e7bc9` moved caller identity off the request body and onto the credential
 * for five call sites. `/api/ai/parse-json` was the sixth, and it was missed:
 * no `requirePermission(req, res, 'ai:call')`, no `resolveCaller`, and
 * `req.body.config` handed to `aiService.callAI` whole — which reads `appName`,
 * `userId` and `useAppConfig` off it (services/aiService.js:1407-1419). Any
 * authenticated credential, including a key minted with only `ai:models`,
 * could route through another app's AIAppConfig row and bill that app and any
 * userId it cared to name.
 *
 * A hole like that is easy to close and easier to reopen — the route reads
 * plausibly either way — so every case below sends a body that *lies*: a
 * caller authenticated as one app claiming to be another, spending another
 * user's quota. A test with an honest body passes against the vulnerable code.
 *
 * The `/call` cases at the bottom are the reference the parse-json cases are
 * measured against: the two routes are the same front door and must answer the
 * same way. Identity resolution itself is covered in callerIdentity.test.js.
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
const { default: aiRoutes } = await import('../routes/aiRoutes.js');
const { default: aiService } = await import('../services/aiService.js');
const { default: aiDirectorService } = await import('../services/aiDirectorService.js');
const { default: aiUsageService } = await import('../services/aiUsageService.js');

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

/** The config aiService was handed on the last call. */
let captured = null;
let originalCallAI;

/**
 * Set either of these and the *next* callAI obeys it, once. The Q46 cases need
 * a provider failure and a non-JSON answer without reaching a provider, and a
 * second stub layered over the first is how two tests start disagreeing about
 * what callAI does.
 */
let nextFailure = null;
let nextAnswer = null;

async function makeUserWithToken({ appClaim = 'basegeek', role = undefined } = {}) {
  const user = await User.create({
    username: `ai_gate_user_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
    ...(role ? { role } : {}),
  });
  const token = jwt.sign(
    { id: user._id.toString(), ...(appClaim ? { app: appClaim } : {}) },
    process.env.JWT_SECRET
  );
  return { user, token };
}

/**
 * A real, active API key. The raw value is generated per test and never leaves
 * the process — fixtures may mint keys, transcripts may not carry them.
 */
async function makeApiKey({ appName = 'storygeek', permissions = ['ai:call'] } = {}) {
  const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();
  await APIKey.create({
    keyHash,
    keyPrefix,
    name: `ai gate probe ${seq++}`,
    appName,
    // `permissions: 'schema-default'` omits the field entirely, so the key is
    // minted with whatever models/APIKey.js:45 grants — which is the whole
    // point of the two cases that use it, and would be quietly defeated by
    // restating the list here.
    ...(permissions === 'schema-default' ? {} : { permissions }),
    createdBy: new mongoose.Types.ObjectId(),
  });
  return apiKey;
}

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  app = buildApp();

  // Never reach a provider. Valid JSON because /parse-json parses what comes
  // back and a parse failure would mask the assertion under test.
  originalCallAI = aiService.callAI;
  aiService.callAI = async (prompt, config) => {
    captured = { prompt, config };
    if (nextFailure) {
      const failure = nextFailure;
      nextFailure = null;
      throw failure;
    }
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
  await User.deleteMany({});
  await APIKey.deleteMany({});
});

afterAll(async () => {
  aiService.callAI = originalCallAI;
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ────────────────────────── the P0: /api/ai/parse-json ───────────────────────

describe('POST /api/ai/parse-json — the gate', () => {
  it('refuses an unauthenticated caller', async () => {
    const res = await request(app)
      .post('/api/ai/parse-json')
      .send({ prompt: 'hi' });

    expect(res.status).toBe(401);
    expect(captured).toBeNull();
  });

  it('refuses a key that has no ai:call permission', async () => {
    // The exact scenario: a key minted to read the model catalog, used to spend.
    const apiKey = await makeApiKey({ appName: 'notegeek', permissions: ['ai:models'] });

    const res = await request(app)
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', config: { appName: 'storygeek', useAppConfig: true } });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    // Nothing was spent on the way to the refusal.
    expect(captured).toBeNull();
  });

  it('is gated by the same permission as /api/ai/call', async () => {
    const apiKey = await makeApiKey({ appName: 'notegeek', permissions: ['ai:models'] });
    const body = { prompt: 'hi', config: { appName: 'storygeek' } };

    const parse = await request(app).post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${apiKey}`).send(body);
    const call = await request(app).post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`).send(body);

    expect(parse.status).toBe(call.status);
    expect(parse.body.error.code).toBe(call.body.error.code);
  });

  it('attributes to the key\'s app, not the appName in the body', async () => {
    const apiKey = await makeApiKey({ appName: 'notegeek' });

    const res = await request(app)
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({
        prompt: 'hi',
        config: { appName: 'storygeek', useAppConfig: true, provider: 'groq' },
      });

    expect(res.status).toBe(200);
    expect(captured.config.appName).toBe('notegeek');
  });

  it('attributes to the JWT app claim, not the appName in the body', async () => {
    const { user, token } = await makeUserWithToken({ appClaim: 'bujogeek' });

    const res = await request(app)
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'hi', config: { appName: 'fitnessgeek', provider: 'groq' } });

    expect(res.status).toBe(200);
    expect(captured.config.appName).toBe('bujogeek');
    // And the session's own user — not the one the body nominated below.
    expect(captured.config.userId).toBe(user._id.toString());
  });

  it('will not let a session spend another user\'s quota', async () => {
    const { user, token } = await makeUserWithToken({ appClaim: 'bujogeek' });

    await request(app)
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'hi', config: { userId: 'somebody-else', provider: 'groq' } });

    expect(captured.config.userId).toBe(user._id.toString());
    expect(captured.config.userId).not.toBe('somebody-else');
  });

  it('lets a service key name the user it is calling for, exactly as /call does', async () => {
    // Deliberate and unchanged: a service key has no session, so without this
    // every call from a backend shares one free-tier quota bucket.
    const apiKey = await makeApiKey({ appName: 'storygeek' });

    await request(app)
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', userId: 'player-42', config: { provider: 'groq' } });

    expect(captured.config.userId).toBe('player-42');
  });

  it('keeps the feature the body names, on the app the credential names', async () => {
    const apiKey = await makeApiKey({ appName: 'fitnessgeek' });

    await request(app)
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', feature: 'mealPlan', config: { provider: 'groq' } });

    expect(captured.config.appName).toBe('fitnessgeek');
    expect(captured.config.feature).toBe('mealplan');
  });

  it('treats config.useAppConfig as a switch, never as an identity', async () => {
    const apiKey = await makeApiKey({ appName: 'notegeek' });

    await request(app)
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', config: { useAppConfig: true, appName: 'storygeek' } });

    // App routing still happens — geekPR and codegeek depend on it — but the
    // row looked up is the caller's own.
    expect(captured.config.useAppConfig).toBe(true);
    expect(captured.config.appName).toBe('notegeek');
  });

  it('still answers a legitimate call, with parsed JSON', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });

    const res = await request(app)
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'give me json', config: { provider: 'groq' } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.response).toEqual({ ok: true });
  });

  it('still rejects a body with no prompt', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });

    const res = await request(app)
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ config: { provider: 'groq' } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_PROMPT');
    expect(captured).toBeNull();
  });
});

// ─────────────────── the reference the above is measured against ─────────────

describe('POST /api/ai/call — unchanged', () => {
  it('refuses a key without ai:call', async () => {
    const apiKey = await makeApiKey({ appName: 'notegeek', permissions: ['ai:models'] });

    const res = await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', config: { appName: 'storygeek' } });

    expect(res.status).toBe(403);
    expect(captured).toBeNull();
  });

  it('stamps the credential\'s app over the body\'s', async () => {
    const apiKey = await makeApiKey({ appName: 'notegeek' });

    await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', config: { appName: 'storygeek', provider: 'groq' } });

    expect(captured.config.appName).toBe('notegeek');
  });
});

// ─────────────────────── Q45: the routes that had no gate ────────────────────
//
// `267c4e3` closed /parse-json and swept the rest of aiRoutes.js, which turned
// up thirteen routes behind `authenticateJWTOrAPIKey()` and nothing else. Under
// SSO "authenticated" is any logged-in user of any of the eight apps, and for a
// key it is any key at all, whatever it was minted for. Ten of the thirteen
// mutate suite-wide AI state; two are read-only director calls a backend is
// documented to make; one hands out any user's spending on request.
//
// A gate that refuses everyone would pass a 403-only test, so every case below
// is asserted from both sides: the credential that should be turned away is,
// and the credential that should get through does.

const ADMIN_ROUTES = [
  ['post', '/api/ai/provider', { provider: 'groq' }],
  ['post', '/api/ai/models/groq/refresh', {}],
  ['post', '/api/ai/reset-stats', {}],
  ['post', '/api/ai/cache/clear', {}],
  ['post', '/api/ai/summarization', { enabled: true, threshold: 5000 }],
  // `/director/seed-pricing` and `/director/seed-free-tier` were the sixth and
  // seventh rows until 2026-09-07, when both routes were deleted with the
  // hand-typed price and quota tables behind them (Phase 1,
  // DOCS/AIGEEK_ELEVATION_PLAN.md). `/director/force-refresh` is the admin
  // catalog mutator that remains, and it keeps the gate.
  ['post', '/api/ai/director/force-refresh', {}],
];

describe('the admin-shaped AI routes take the admin gate', () => {
  const spies = [];

  beforeAll(() => {
    // Nothing here reaches a provider or writes a shared collection; the point
    // of these cases is which credential gets past the gate, not what the
    // handler then does.
    const stub = (obj, method, value) => {
      spies.push([obj, method, obj[method]]);
      obj[method] = typeof value === 'function' ? value : () => value;
    };
    stub(aiService, 'setProvider', true);
    stub(aiService, 'refreshModels', async () => []);
    stub(aiService, 'resetSessionStats', undefined);
    stub(aiService, 'clearCache', undefined);
    stub(aiService, 'setSummarizationEnabled', undefined);
    stub(aiService, 'setSummarizationThreshold', undefined);
    stub(aiService, 'getModels', async () => [{ modelId: 'llama-3.3-70b' }]);
    stub(aiDirectorService, 'getCostAnalysis', async () => ({ success: true, data: { estimate: 0.01 } }));
    stub(aiDirectorService, 'recommendProvider', async () => ({
      success: true, data: { recommendations: [{ provider: 'groq', model: { id: 'llama-3.3-70b' } }] }
    }));
    stub(aiUsageService, 'getProviderUsageSummary', async (provider, userId) => ({
      success: true, summary: { provider, userId, calls: 0 }
    }));
    // The provider entry /provider echoes back, /models/:provider/refresh
    // requires configured before it will do anything, and force-refresh
    // inspects. A placeholder string, never a real credential.
    spies.push([aiService.providers, 'groq', aiService.providers.groq]);
    aiService.providers.groq = {
      ...(aiService.providers.groq || {}),
      name: 'Groq',
      apiKey: 'test-placeholder-not-a-credential',
      enabled: true,
    };
  });

  afterAll(() => {
    for (const [obj, method, original] of spies) obj[method] = original;
  });

  it.each(ADMIN_ROUTES)('%s %s refuses a plain logged-in user', async (method, path, body) => {
    const { token } = await makeUserWithToken();

    const res = await request(app)[method](path)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_required');
    expect(res.body.code).toBe('ADMIN_REQUIRED');
  });

  it.each(ADMIN_ROUTES)('%s %s refuses an API key, whatever it was minted with', async (method, path, body) => {
    // Every permission in the enum, and it still does not make a key a person.
    const apiKey = await makeApiKey({
      appName: 'storygeek',
      permissions: ['ai:call', 'ai:models', 'ai:providers', 'ai:stats', 'ai:director', 'ai:usage'],
    });

    const res = await request(app)[method](path)
      .set('Authorization', `Bearer ${apiKey}`)
      .send(body);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_required');
    expect(res.body.code).toBe('ADMIN_REQUIRED');
  });

  it.each(ADMIN_ROUTES)('%s %s lets an admin through', async (method, path, body) => {
    const { token } = await makeUserWithToken({ role: 'admin' });

    const res = await request(app)[method](path)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('refuses an unauthenticated caller before it ever reaches the role lookup', async () => {
    const res = await request(app).post('/api/ai/cache/clear').send({});
    expect(res.status).toBe(401);
  });

  it('a promotion lands without a re-login — the same token, a changed role', async () => {
    const { user, token } = await makeUserWithToken();

    const before = await request(app).post('/api/ai/reset-stats')
      .set('Authorization', `Bearer ${token}`).send({});
    expect(before.status).toBe(403);

    await User.updateOne({ _id: user._id }, { role: 'admin' });

    const after = await request(app).post('/api/ai/reset-stats')
      .set('Authorization', `Bearer ${token}`).send({});
    expect(after.status).toBe(200);
  });

  // ── the two read-only director POSTs: ai:director, not admin ───────────────
  //
  // They mutate nothing, and StoryGeek's epub pipeline calls /director/recommend
  // from a backend with a service key (apps/storygeek/backend/src/services/
  // aiService.js:395). requireAdminUser refuses every API key on sight, so an
  // admin gate here would be a silent outage for that pipeline, not a fix.

  const DIRECTOR_ROUTES = [
    ['/api/ai/director/analyze-cost', { prompt: 'price this' }],
    ['/api/ai/director/recommend', { task: 'summarize a note' }],
  ];

  it.each(DIRECTOR_ROUTES)('POST %s refuses a key without ai:director', async (path, body) => {
    const apiKey = await makeApiKey({ appName: 'notegeek', permissions: ['ai:call', 'ai:models'] });

    const res = await request(app).post(path)
      .set('Authorization', `Bearer ${apiKey}`)
      .send(body);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it.each(DIRECTOR_ROUTES)('POST %s answers a key that has ai:director', async (path, body) => {
    const apiKey = await makeApiKey({ appName: 'storygeek', permissions: ['ai:director'] });

    const res = await request(app).post(path)
      .set('Authorization', `Bearer ${apiKey}`)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it.each(DIRECTOR_ROUTES)('POST %s answers the console, which is a session', async (path, body) => {
    const { token } = await makeUserWithToken();

    const res = await request(app).post(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    // A JWT holds every permission — the App Routing dialog is a plain
    // logged-in user and must not need an admin to open it.
    expect(res.status).toBe(200);
  });

  it('POST /director/recommend still validates before it checks anything else it can', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek', permissions: ['ai:director'] });

    const res = await request(app).post('/api/ai/director/recommend')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_TASK');
  });

  // ── the two catalog reads ─────────────────────────────────────────────────

  it('GET /providers takes ai:providers, the enum entry named for it', async () => {
    const denied = await makeApiKey({ appName: 'notegeek', permissions: ['ai:call'] });
    const allowed = await makeApiKey({ appName: 'notegeek', permissions: ['ai:providers'] });

    const no = await request(app).get('/api/ai/providers').set('Authorization', `Bearer ${denied}`);
    expect(no.status).toBe(403);
    expect(no.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

    const yes = await request(app).get('/api/ai/providers').set('Authorization', `Bearer ${allowed}`);
    expect(yes.status).toBe(200);
    expect(yes.body.success).toBe(true);
  });

  it('GET /providers is in reach of a key minted with the defaults', async () => {
    // models/APIKey.js:45 — the set every mint path grants. If this ever fails,
    // the gate above stopped being free and every deployed key is at risk.
    const apiKey = await makeApiKey({ appName: 'notegeek', permissions: 'schema-default' });

    const res = await request(app).get('/api/ai/providers').set('Authorization', `Bearer ${apiKey}`);
    expect(res.status).toBe(200);
  });

  it('GET /models/:provider takes ai:models, also a default', async () => {
    const denied = await makeApiKey({ appName: 'notegeek', permissions: ['ai:call'] });
    const allowed = await makeApiKey({ appName: 'notegeek', permissions: 'schema-default' });

    const no = await request(app).get('/api/ai/models/groq').set('Authorization', `Bearer ${denied}`);
    expect(no.status).toBe(403);
    expect(no.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

    const yes = await request(app).get('/api/ai/models/groq').set('Authorization', `Bearer ${allowed}`);
    expect(yes.status).toBe(200);
    expect(yes.body.data.provider).toBe('groq');
  });

  // ── GET /usage/:provider — identity from the credential ───────────────────

  it('GET /usage/:provider ignores ?userId= and answers for the caller', async () => {
    const { user, token } = await makeUserWithToken();

    const res = await request(app)
      .get('/api/ai/usage/groq?userId=somebody-else')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(user._id.toString());
    expect(res.body.data.userId).not.toBe('somebody-else');
  });

  it('two sessions asking about the same user get their own answer, not each other\'s', async () => {
    const a = await makeUserWithToken();
    const b = await makeUserWithToken();

    const res = await request(app)
      .get(`/api/ai/usage/groq?userId=${a.user._id.toString()}`)
      .set('Authorization', `Bearer ${b.token}`);

    expect(res.body.data.userId).toBe(b.user._id.toString());
    expect(res.body.data.userId).not.toBe(a.user._id.toString());
  });

  it('answers the same identity as its sibling /usage/:provider/:modelId', async () => {
    const { user, token } = await makeUserWithToken();
    const summarySpy = aiUsageService.getUsageStatus;
    aiUsageService.getUsageStatus = async (provider, modelId, userId) => ({
      success: true, usage: { provider, modelId, userId }
    });
    try {
      const summary = await request(app).get('/api/ai/usage/groq?userId=nope')
        .set('Authorization', `Bearer ${token}`);
      const model = await request(app).get('/api/ai/usage/groq/llama-3.3-70b?userId=nope')
        .set('Authorization', `Bearer ${token}`);

      expect(summary.body.data.userId).toBe(model.body.data.userId);
      expect(summary.body.data.userId).toBe(user._id.toString());
    } finally {
      aiUsageService.getUsageStatus = summarySpy;
    }
  });
});

// ──────────────── Q46: the REST envelope says aiGeek's own words ─────────────
//
// F-23 stopped the OpenAI-compat proxy relaying provider error bodies, and
// filed the other two front doors: `/api/ai/call` put `error.message` into its
// body and into its streaming error frame, `/api/ai/parse-json` put it into
// `error.details`. Those strings are built as
// `` `Gemini API error (401): ${JSON.stringify(error.response.data)}` `` in
// aiService, so what a caller actually received was the vendor's name, its
// service and reason codes, its request id and, on a bad-credential case, a
// fragment of baseGeek's key. (The fixture below was Anthropic's error body
// until 2026-09-07, when that provider was retired; every adapter builds the
// same string, so the case is unchanged in substance.) Both now render the
// shared allowlist in
// services/aiFailureEnvelope.js — the same one the proxy renders — into
// baseGeek's `{ success: false, error: {...} }` shape.
//
// Each case asserts the absence of a realistically leaky body, not just the
// presence of the right message: a handler that appended the provider's
// explanation to a correct fixed message would pass the weaker test.

/** What aiService actually throws, with everything a vendor puts in one. */
const LEAKY_UPSTREAM = (status = 401) => new Error(
  `Gemini API error (${status}): ` + JSON.stringify({
    error: {
      code: status,
      message: 'API key not valid: AIzaSyLeakyKeyFragment...WxYz',
      status: 'INVALID_ARGUMENT',
      details: [{
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason: 'API_KEY_INVALID',
        domain: 'generativelanguage.googleapis.com',
        metadata: { project: 'proj_01HQZX9K2M' },
      }],
    },
    request_id: 'req_011CQxLeakyUpstream',
  })
);

const LEAKED_STRINGS = [
  'Gemini', 'gemini', 'AIzaSy', 'API_KEY_INVALID', 'proj_01HQZX9K2M',
  'generativelanguage', 'req_011CQxLeakyUpstream', 'INVALID_ARGUMENT',
  'API key not valid',
];

function expectNothingLeaked(text) {
  for (const fragment of LEAKED_STRINGS) {
    expect(text).not.toContain(fragment);
  }
}

describe('POST /api/ai/call — an upstream failure in aiGeek\'s own words', () => {
  it('answers the allowlisted envelope, with nothing of the provider\'s in it', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    nextFailure = LEAKY_UPSTREAM(401);

    const res = await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', config: { provider: 'gemini' } });

    // A bad provider credential is baseGeek's problem, so it is a 5xx.
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('upstream_error');
    expect(res.body.error.type).toBe('server_error');
    expect(res.body.error.message).toMatch(/^The upstream model provider failed to complete this request\./);
    expectNothingLeaked(JSON.stringify(res.body));
    expectNothingLeaked(res.text);
  });

  it('carries the request id that finds the log line holding the real answer', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    nextFailure = LEAKY_UPSTREAM(500);

    const res = await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .set('X-Request-Id', 'gate-probe-call-1')
      .send({ prompt: 'hi', config: { provider: 'gemini' } });

    expect(res.body.error.message).toContain('(request id: gate-probe-call-1)');
    expect(res.headers['x-request-id']).toBe('gate-probe-call-1');
  });

  it('keeps the status the failure deserves — a provider rate limit is a 429 with Retry-After', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    nextFailure = LEAKY_UPSTREAM(429);

    const res = await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', config: { provider: 'gemini' } });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate_limit_exceeded');
    expect(res.headers['retry-after']).toBeDefined();
    expectNothingLeaked(res.text);
  });

  it('an exhausted rotation is a 503 that does not name what it tried', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    nextFailure = new Error('All AI providers failed: cerebras, groq, gemini');

    const res = await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('upstream_unavailable');
    expect(res.text).not.toContain('groq');
    expect(res.text).not.toContain('gemini');
  });

  it('the streaming error frame says the same thing the body would', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    nextFailure = LEAKY_UPSTREAM(401);

    const res = await request(app)
      .post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', stream: true, config: { provider: 'gemini' } });

    // Headers were already out, so the failure arrives as a frame, not a status.
    const frame = res.text.split('\n').find(line => line.startsWith('data: ') && line.includes('error'));
    expect(frame).toBeDefined();
    const payload = JSON.parse(frame.slice('data: '.length));
    expect(payload.error.code).toBe('upstream_error');
    expect(payload.error.type).toBe('server_error');
    expect(payload.error.message).toMatch(/^The upstream model provider failed to complete this request\./);
    expectNothingLeaked(res.text);
  });
});

describe('POST /api/ai/parse-json — the same envelope, on the same words', () => {
  it('no longer relays the provider body as error.details', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    nextFailure = LEAKY_UPSTREAM(401);

    const res = await request(app)
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'hi', config: { provider: 'gemini' } });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('upstream_error');
    expect(res.body.error.details).toBeUndefined();
    expectNothingLeaked(res.text);
  });

  it('answers /call identically for the identical failure', async () => {
    const apiKey = await makeApiKey({ appName: 'storygeek' });

    nextFailure = LEAKY_UPSTREAM(429);
    const parse = await request(app).post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${apiKey}`).send({ prompt: 'hi' });

    nextFailure = LEAKY_UPSTREAM(429);
    const call = await request(app).post('/api/ai/call')
      .set('Authorization', `Bearer ${apiKey}`).send({ prompt: 'hi' });

    expect(parse.status).toBe(call.status);
    expect(parse.body.error.code).toBe(call.body.error.code);
    expect(parse.body.error.type).toBe(call.body.error.type);
  });

  it('says so when the model answered with something that was not JSON', async () => {
    // Distinct from an upstream failure, and it gives away nothing: the words
    // are aiService.parseJSONResponse's own. The answer itself goes to the log.
    const apiKey = await makeApiKey({ appName: 'storygeek' });
    nextAnswer = 'Certainly! Here is your answer, in prose, as you did not ask.';

    const res = await request(app)
      .post('/api/ai/parse-json')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ prompt: 'give me json' });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('invalid_json_response');
    expect(res.body.error.message).toMatch(/^The model did not return valid JSON\./);
    expect(res.text).not.toContain('as you did not ask');
  });
});
