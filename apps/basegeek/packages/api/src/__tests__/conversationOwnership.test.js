/**
 * conversationOwnership.test.js — a stored conversation belongs to the
 * credential that made it, not to a field in the body. (Q62, 2026-09-06.)
 *
 * The bug this locks shut was hiding in a disagreement between two halves of
 * one router. `POST /api/ai/conversation/message` filed the conversation under
 * `resolveCaller().userId`, which for an API-key caller prefers a `userId` the
 * *body* named; the four read/state routes scoped by `req.user.id`, which is
 * the credential. So a key caller that named a user wrote conversations it
 * could never read back — and the obvious "fix", making the reads agree with
 * the write, would have handed every `ai:call` key the ability to read any
 * user's stored messages by naming them.
 *
 * Every case below therefore sends a body that *lies*: the caller names
 * someone else and the assertion is on where the row actually landed. A test
 * with an honest body passes against the vulnerable code, which is precisely
 * how this survived as long as it did.
 *
 * The two other things asserted here:
 *   - the `ai:usage` gate on the two /usage routes (Q49), which is only safe
 *     because `ai:usage` joined the default mint set in the same change;
 *   - that `/api/connections` is gone (Q69).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pinoHttp from 'pino-http';

const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { User, userGeekConn } = await import('../models/user.js');
const { default: logger } = await import('../lib/logger.js');
const { default: APIKey } = await import('../models/APIKey.js');
const { default: Conversation } = await import('../models/Conversation.js');
const { default: aiRoutes } = await import('../routes/aiRoutes.js');
const { default: aiService } = await import('../services/aiService.js');
const { default: aiUsageService } = await import('../services/aiUsageService.js');
const { default: conversationService } = await import('../services/conversationService.js');

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
let originalUsageStatus;
let originalProviderSummary;

/** The userId `getProviderUsageSummary` was last asked about. */
let usageAskedFor = null;

async function makeUserWithToken({ appClaim = 'basegeek', role = undefined } = {}) {
  const user = await User.create({
    username: `conv_owner_user_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
    ...(role ? { role } : {}),
  });
  const token = jwt.sign(
    { id: user._id.toString(), ...(appClaim ? { app: appClaim } : {}) },
    process.env.JWT_SECRET
  );
  return { user, token, id: user._id.toString() };
}

/**
 * A real, active API key. The raw value is generated per test and never leaves
 * the process — fixtures may mint keys, transcripts may not carry them. The
 * keyId comes back because it is half of the identity under test:
 * `apikey_<keyId>` is the owner id the credential implies.
 */
async function makeApiKey({ appName = 'storygeek', permissions = ['ai:call'] } = {}) {
  const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();
  const doc = await APIKey.create({
    keyHash,
    keyPrefix,
    name: `conversation owner probe ${seq++}`,
    appName,
    // `permissions: 'schema-default'` omits the field so the key is minted
    // with whatever models/APIKey.js grants — the point of the Q49 cases, and
    // something restating the list here would quietly defeat.
    ...(permissions === 'schema-default' ? {} : { permissions }),
    createdBy: new mongoose.Types.ObjectId(),
  });
  return { apiKey, keyId: doc.keyId };
}

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  await Conversation.db.asPromise();
  app = buildApp();

  // Never reach a provider.
  originalCallAISmart = aiService.callAISmart;
  aiService.callAISmart = async () => ({
    success: true,
    content: 'an answer',
    routing: { provider: 'test-provider' },
  });
  aiService.initialized = true;

  // Summarization must never fire in these tests; the bodies are two words.
  conversationService.initialized = true;

  originalUsageStatus = aiUsageService.getUsageStatus;
  originalProviderSummary = aiUsageService.getProviderUsageSummary;
  aiUsageService.getUsageStatus = async () => ({ success: true, usage: {} });
  aiUsageService.getProviderUsageSummary = async (_provider, userId) => {
    usageAskedFor = userId;
    return { success: true, summary: {} };
  };
}, 60000);

afterEach(async () => {
  usageAskedFor = null;
  await User.deleteMany({});
  await APIKey.deleteMany({});
  await Conversation.deleteMany({});
});

afterAll(async () => {
  aiService.callAISmart = originalCallAISmart;
  aiUsageService.getUsageStatus = originalUsageStatus;
  aiUsageService.getProviderUsageSummary = originalProviderSummary;
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const message = (conversationId, extra = {}) => ({
  conversationId,
  messages: [{ role: 'user', content: 'hi' }],
  ...extra,
});

// ───────────────────── the three callers, and where rows land ────────────────

describe('POST /api/ai/conversation/message — ownership comes from the credential', () => {
  it('files an API-key caller\'s conversation under apikey_<keyId>, not the userId it named', async () => {
    const { apiKey, keyId } = await makeApiKey({ appName: 'storygeek' });
    const conversationId = `conv-key-${seq++}`;

    const res = await request(app)
      .post('/api/ai/conversation/message')
      .set('Authorization', `Bearer ${apiKey}`)
      .send(message(conversationId, { userId: 'somebody-elses-user-id' }));

    expect(res.status).toBe(200);

    const rows = await Conversation.find({ conversationId }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(`apikey_${keyId}`);
    // The lie in the body left no trace anywhere.
    expect(await Conversation.countDocuments({ userId: 'somebody-elses-user-id' })).toBe(0);
  });

  it('files a JWT caller\'s conversation under its own user id, not the one it named', async () => {
    const victim = await makeUserWithToken();
    const { token, id } = await makeUserWithToken();
    const conversationId = `conv-jwt-${seq++}`;

    const res = await request(app)
      .post('/api/ai/conversation/message')
      .set('Authorization', `Bearer ${token}`)
      .send(message(conversationId, { userId: victim.id }));

    expect(res.status).toBe(200);

    const rows = await Conversation.find({ conversationId }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(id);
    expect(await Conversation.countDocuments({ userId: victim.id })).toBe(0);
  });

  it('lets an admin JWT — and only an admin — name the owner', async () => {
    const ward = await makeUserWithToken();
    const { token } = await makeUserWithToken({ role: 'admin' });
    const conversationId = `conv-admin-${seq++}`;

    const res = await request(app)
      .post('/api/ai/conversation/message')
      .set('Authorization', `Bearer ${token}`)
      .send(message(conversationId, { userId: ward.id }));

    expect(res.status).toBe(200);

    const rows = await Conversation.find({ conversationId }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(ward.id);
  });

  it('ignores a body userId that names a user who does not exist, for a non-admin', async () => {
    const { token, id } = await makeUserWithToken();
    const conversationId = `conv-ghost-${seq++}`;

    // A junk id used to be handed straight to User.findById by the role
    // lookup. It must be a CastError that costs nothing, not a 500.
    const res = await request(app)
      .post('/api/ai/conversation/message')
      .set('Authorization', `Bearer ${token}`)
      .send(message(conversationId, { userId: 'not-an-object-id' }));

    expect(res.status).toBe(200);
    const rows = await Conversation.find({ conversationId }).lean();
    expect(rows[0].userId).toBe(id);
  });
});

describe('the read routes scope by the same id the write route used', () => {
  it('reads back the conversation an API-key caller wrote', async () => {
    const { apiKey } = await makeApiKey({ appName: 'storygeek', permissions: ['ai:call', 'ai:stats'] });
    const conversationId = `conv-roundtrip-${seq++}`;

    await request(app)
      .post('/api/ai/conversation/message')
      .set('Authorization', `Bearer ${apiKey}`)
      .send(message(conversationId, { userId: 'somebody-elses-user-id' }));

    // Before Q62 this was a 404: the write filed under the body's userId and
    // the read looked under the credential's.
    const res = await request(app)
      .get(`/api/ai/conversation/${conversationId}`)
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res.status).toBe(200);
    expect(res.body.data.conversationId).toBe(conversationId);
  });

  it('does not let a JWT caller read a key caller\'s conversation', async () => {
    const { apiKey } = await makeApiKey({ appName: 'storygeek' });
    const { token } = await makeUserWithToken();
    const conversationId = `conv-crossread-${seq++}`;

    await request(app)
      .post('/api/ai/conversation/message')
      .set('Authorization', `Bearer ${apiKey}`)
      .send(message(conversationId));

    const res = await request(app)
      .get(`/api/ai/conversation/${conversationId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('lists only the caller\'s own conversations', async () => {
    const { apiKey, keyId } = await makeApiKey({
      appName: 'storygeek',
      permissions: ['ai:call', 'ai:stats'],
    });
    const { token } = await makeUserWithToken();

    await request(app)
      .post('/api/ai/conversation/message')
      .set('Authorization', `Bearer ${apiKey}`)
      .send(message(`conv-mine-${seq++}`));
    await request(app)
      .post('/api/ai/conversation/message')
      .set('Authorization', `Bearer ${token}`)
      .send(message(`conv-theirs-${seq++}`));

    const res = await request(app)
      .get('/api/ai/conversations')
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    const owned = await Conversation.find({ userId: `apikey_${keyId}` }).lean();
    expect(owned).toHaveLength(1);
  });
});

describe('usage attribution is a separate question from ownership', () => {
  it('still bills the user a service key named, while owning the row itself', async () => {
    // callerIdentity's deliberate trust: a service key has no session, so the
    // body naming the person keeps free-tier quota per-person. That is an
    // accounting decision and it survives Q62 untouched — what changed is
    // where the *row* lands.
    const { apiKey, keyId } = await makeApiKey({ appName: 'storygeek' });
    const conversationId = `conv-billing-${seq++}`;

    let billedTo = null;
    const previous = aiService.callAISmart;
    aiService.callAISmart = async (_messages, options) => {
      billedTo = options?.userId ?? null;
      return { success: true, content: 'an answer', routing: { provider: 'test-provider' } };
    };

    try {
      const res = await request(app)
        .post('/api/ai/conversation/message')
        .set('Authorization', `Bearer ${apiKey}`)
        .send(message(conversationId, { userId: 'the-player' }));
      expect(res.status).toBe(200);
    } finally {
      aiService.callAISmart = previous;
    }

    expect(billedTo).toBe('the-player');
    const rows = await Conversation.find({ conversationId }).lean();
    expect(rows[0].userId).toBe(`apikey_${keyId}`);
  });
});

// ───────────────────────────── Q49: the ai:usage gate ────────────────────────

describe('GET /api/ai/usage/* — gated on ai:usage', () => {
  it('refuses a key minted without ai:usage', async () => {
    const { apiKey } = await makeApiKey({ appName: 'notegeek', permissions: ['ai:call'] });

    const summary = await request(app)
      .get('/api/ai/usage/groq')
      .set('Authorization', `Bearer ${apiKey}`);
    const status = await request(app)
      .get('/api/ai/usage/groq/llama-3.1-8b')
      .set('Authorization', `Bearer ${apiKey}`);

    expect(summary.status).toBe(403);
    expect(summary.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(status.status).toBe(403);
    expect(status.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(usageAskedFor).toBeNull();
  });

  it('admits a key minted with the schema defaults — ai:usage is in them', async () => {
    // The half that makes the gate safe. If the default set ever loses
    // ai:usage this fails, which is the alarm we want.
    const { apiKey, keyId } = await makeApiKey({ appName: 'notegeek', permissions: 'schema-default' });

    const res = await request(app)
      .get('/api/ai/usage/groq')
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res.status).toBe(200);
    // And Q45 still holds: the id asked about is the credential's.
    expect(usageAskedFor).toBe(`apikey_${keyId}`);
  });

  it('admits a JWT caller, which holds every permission by construction', async () => {
    const { token, id } = await makeUserWithToken();

    const res = await request(app)
      .get('/api/ai/usage/groq')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(usageAskedFor).toBe(id);
  });
});

// ─────────────────────────── Q69: the dead route is gone ─────────────────────

describe('Q69 — /api/connections is deleted, its service is not', () => {
  it('no longer ships the router', () => {
    const routerPath = new URL('../routes/oauthConnections.js', import.meta.url);
    expect(fs.existsSync(routerPath)).toBe(false);
  });

  it('is not mounted, and nothing imports the router', () => {
    const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    expect(server).not.toMatch(/from '\.\/routes\/oauthConnections\.js'/);
    expect(server).not.toMatch(/app\.use\('\/api\/connections'/);
  });

  it('keeps the service and model the ambient screen still depends on', async () => {
    // Deleting these too would have stopped oauthRefreshJobService from
    // refreshing tokens ambientService reads on every /api/ambient request.
    const service = await import('../services/oauthConnectionService.js');
    const { default: OAuthConnection } = await import('../models/OAuthConnection.js');
    expect(typeof service.getFreshAccessToken).toBe('function');
    expect(OAuthConnection).toBeDefined();
  });
});
