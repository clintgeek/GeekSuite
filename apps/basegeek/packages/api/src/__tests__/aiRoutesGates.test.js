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

async function makeUserWithToken({ appClaim = 'basegeek' } = {}) {
  const user = await User.create({
    username: `ai_gate_user_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
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
    permissions,
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
    return '{"ok": true}';
  };
  aiService.initialized = true;
}, 60000);

afterEach(async () => {
  captured = null;
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
