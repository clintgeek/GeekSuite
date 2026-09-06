/**
 * apiKeyMintAuthority.test.js — who may mint a `bg_` key, and for which app.
 * (Q62, 2026-09-06.)
 *
 * `POST /api/api-keys` took `appName` from the body and wrote it onto the key
 * with no check at all. That one field is the entire aiGeek trust model:
 * `services/callerIdentity.js` deliberately routes and bills a call by the
 * *key's* app rather than by anything the request body says, precisely so a
 * caller cannot choose whose AIAppConfig row answers it and whose free-tier
 * allowance pays. The mint route handed out the field that decides it, to any
 * logged-in user, for the asking. Register an account, mint
 * `appName: 'storygeek'`, and you are storygeek as far as routing and billing
 * are concerned.
 *
 * The rule now: admin, or an app in VALID_APPS that the caller already holds a
 * key for. Which makes an app's first key an admin act — asserted below,
 * because it is the part someone will later mistake for a bug.
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
const { default: apiKeyRoutes, DEFAULT_PERMISSIONS } = await import('../routes/apiKeys.js');

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
  app.use('/api/api-keys', apiKeyRoutes);
  return app;
}

let app;
let seq = 0;

async function makeUserWithToken({ role = undefined } = {}) {
  const user = await User.create({
    username: `mint_user_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
    ...(role ? { role } : {}),
  });
  const token = jwt.sign({ id: user._id.toString(), app: 'basegeek' }, process.env.JWT_SECRET);
  return { user, token, id: user._id.toString() };
}

/** An existing active key, owned by `ownerId`, for `appName`. */
async function seedKey(ownerId, appName) {
  const { keyPrefix, keyHash } = APIKey.generateAPIKey();
  return APIKey.create({
    keyHash,
    keyPrefix,
    name: `seeded ${appName} key ${seq++}`,
    appName,
    createdBy: ownerId,
  });
}

const mintBody = (appName) => ({ name: `a key for ${appName}`, appName });

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  app = buildApp();
}, 60000);

afterEach(async () => {
  await User.deleteMany({});
  await APIKey.deleteMany({});
});

afterAll(async () => {
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ───────────────────────────────── POST / ────────────────────────────────────

describe('POST /api/api-keys — the mint gate', () => {
  it('refuses an ordinary user minting for an app they do not hold', async () => {
    const { token } = await makeUserWithToken();

    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send(mintBody('storygeek'));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_required');
    // And crucially: no key document was created on the way to the refusal.
    expect(await APIKey.countDocuments({ appName: 'storygeek' })).toBe(0);
  });

  it('refuses even when the caller holds a key for some *other* app', async () => {
    // The interesting near-miss: holding one credential does not make you
    // every app.
    const { token, id } = await makeUserWithToken();
    await seedKey(id, 'notegeek');

    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send(mintBody('storygeek'));

    expect(res.status).toBe(403);
    expect(await APIKey.countDocuments({ appName: 'storygeek' })).toBe(0);
  });

  it('lets the holder of an app\'s key mint another for the same app', async () => {
    const { token, id } = await makeUserWithToken();
    await seedKey(id, 'storygeek');

    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send(mintBody('storygeek'));

    expect(res.status).toBe(201);
    expect(res.body.data.keyInfo.appName).toBe('storygeek');
    expect(await APIKey.countDocuments({ appName: 'storygeek' })).toBe(2);
  });

  it('does not count a deactivated key as holding the app', async () => {
    const { token, id } = await makeUserWithToken();
    const revoked = await seedKey(id, 'storygeek');
    revoked.isActive = false;
    await revoked.save();

    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send(mintBody('storygeek'));

    expect(res.status).toBe(403);
  });

  it('refuses an app that is not in VALID_APPS, even to its own key holder', async () => {
    const { token, id } = await makeUserWithToken();
    await seedKey(id, 'notanapp');

    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send(mintBody('notanapp'));

    expect(res.status).toBe(403);
  });

  it('lets an admin mint for any app, including one the registry does not know', async () => {
    const { token } = await makeUserWithToken({ role: 'admin' });

    const known = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send(mintBody('storygeek'));
    const novel = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send(mintBody('brandnewgeek'));

    expect(known.status).toBe(201);
    // An app's first key is an admin act, and a new app has no registry entry
    // yet — the gate must not make bootstrapping impossible.
    expect(novel.status).toBe(201);
  });

  it('still answers 400 for a malformed request before it answers 403', async () => {
    // Shape checks first: a non-admin with a broken body should learn the body
    // is broken. The alternative teaches everyone that every 403 might be a
    // typo.
    const { token } = await makeUserWithToken();

    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'no app named' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_REQUIRED_FIELDS');
  });

  it('mints with the default permission set, which includes ai:usage', async () => {
    // Q49's other half: the /usage gate is only safe because new keys get the
    // permission. The route default and the model default must agree.
    const { token } = await makeUserWithToken({ role: 'admin' });

    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send(mintBody('storygeek'));

    expect(res.status).toBe(201);
    expect(DEFAULT_PERMISSIONS).toContain('ai:usage');
    expect(res.body.data.keyInfo.permissions).toEqual(DEFAULT_PERMISSIONS);

    const stored = await APIKey.findOne({ keyId: res.body.data.keyInfo.id }).lean();
    expect(stored.permissions).toEqual(DEFAULT_PERMISSIONS);
  });
});

// ───────────────────────── POST /:keyId/regenerate ───────────────────────────

describe('POST /api/api-keys/:keyId/regenerate — the same gate', () => {
  it('lets the holder rotate a key for an app in VALID_APPS', async () => {
    const { token, id } = await makeUserWithToken();
    const key = await seedKey(id, 'storygeek');
    const before = key.keyPrefix;

    const res = await request(app)
      .post(`/api/api-keys/${key.keyId}/regenerate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.keyInfo.keyPrefix).not.toBe(before);
  });

  it('leaves a key for an unregistered app to an admin', async () => {
    const { token, id } = await makeUserWithToken();
    const key = await seedKey(id, 'notanapp');

    const res = await request(app)
      .post(`/api/api-keys/${key.keyId}/regenerate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    // The key material is untouched — a refused rotation must not half-rotate.
    const stored = await APIKey.findOne({ keyId: key.keyId }).lean();
    expect(stored.keyPrefix).toBe(key.keyPrefix);
    expect(stored.keyHash).toBe(key.keyHash);
  });

  it('still 404s on someone else\'s key rather than leaking that it exists', async () => {
    const owner = await makeUserWithToken();
    const { token } = await makeUserWithToken({ role: 'admin' });
    const key = await seedKey(owner.id, 'storygeek');

    const res = await request(app)
      .post(`/api/api-keys/${key.keyId}/regenerate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
