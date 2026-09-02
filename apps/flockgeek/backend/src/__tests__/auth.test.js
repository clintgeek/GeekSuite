// Auth-isolation test suite for apps/flockgeek/backend.
//
// The four existing suites under src/__tests__/routes/ stub the whole
// authMiddleware module out (see fakeModel.js's buildAuthMiddlewareMock) so
// they can focus purely on controller-level ownerId scoping against a fake
// model. This file exercises the REAL middleware chain instead:
//
//   geek_token cookie -> requireAuth / requireOwner
//     -> @geeksuite/user's attachUser()
//       -> GET {BASEGEEK_URL}/api/users/me
//     -> ownerId derivation -> controller -> Mongoose filter
//
// "basegeek" is stood up as a real loopback HTTP server for the duration of
// this file rather than mocked at the module level. Two reasons:
//
//   1. attachUser() (via tokenUtils.validateToken) reads process.env.BASEGEEK_URL
//      at *request* time, not at import time, so pointing it at 127.0.0.1
//      and scripting exactly what "basegeek" says per test is trivial and
//      needs no extra dependency.
//   2. @geeksuite/user/server is CommonJS (require()'d internally, all the
//      way down to axios). Under this project's native-ESM Jest config
//      (transform: {}), jest.unstable_mockModule only intercepts imports
//      resolved through Jest's ESM loader — it does not reach a require()
//      call made from inside an already-CJS-loaded module graph. Verified
//      empirically: mocking 'axios' via unstable_mockModule, and separately
//      jest.spyOn-ing the shared axios singleton, both silently failed to
//      intercept the call made inside tokenUtils.js's require('axios').
//      Bird.js/EggProduction.js are plain ESM, which is why the ownerId
//      mocks below (and the ones in routes/*.test.js) work fine.
//
// This also means the cross-user data-isolation tests below are a stronger
// guarantee than the ones in routes/birds.test.js and
// routes/eggProduction.test.js: those stub requireOwner via an
// `x-test-owner` test header, so they only prove the *controller* filters
// by ownerId. These prove the same thing with the real cookie ->
// basegeek -> ownerId pipeline wired in, i.e. that nothing between the
// cookie and the controller lets a caller supply or spoof another owner's id.

import { jest } from '@jest/globals';
import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { createFakeModel } from './utils/fakeModel.js';

const OWNER_A = 'owner-aaaa';
const OWNER_B = 'owner-bbbb';
const TOKEN_A = 'token-for-owner-a';
const TOKEN_B = 'token-for-owner-b';

const BIRD_MODEL_PATH = new URL('../models/Bird.js', import.meta.url).pathname;
const EGG_MODEL_PATH = new URL('../models/EggProduction.js', import.meta.url).pathname;

// Identities must stay stable across the file (mocked module factories are
// captured once at import time) — see the comment in routes/birds.test.js.
// Reset contents via `_reset()`, never reassign these.
const fakeBird = createFakeModel([]);
const fakeEgg = createFakeModel([]);
jest.unstable_mockModule(BIRD_MODEL_PATH, () => ({ default: fakeBird }));
jest.unstable_mockModule(EGG_MODEL_PATH, () => ({ default: fakeEgg }));

let requireAuth;
let birdsRoutes;
let eggProductionRoutes;

// Map of bearer token -> SSO user "basegeek" returns for GET
// /api/users/me. Reassigned per-test in beforeEach; the server closes over
// this variable (not a snapshot of it), so no restart is needed between tests.
let basegeekUsers = {};
let basegeekRequestCount = 0;
let basegeekServer;
let basegeekUrl;

beforeAll(async () => {
  ({ requireAuth } = await import('../middleware/authMiddleware.js'));
  ({ default: birdsRoutes } = await import('../routes/birds.js'));
  ({ default: eggProductionRoutes } = await import('../routes/eggProduction.js'));

  basegeekServer = http.createServer((req, res) => {
    basegeekRequestCount += 1;
    if (req.url !== '/api/users/me') {
      res.writeHead(404);
      return res.end();
    }
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const user = token && basegeekUsers[token];
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'Invalid or expired token' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ user }));
  });
  await new Promise((resolve) => basegeekServer.listen(0, '127.0.0.1', resolve));
  basegeekUrl = `http://127.0.0.1:${basegeekServer.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => basegeekServer.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
  fakeBird._reset([]);
  fakeEgg._reset([]);

  process.env.BASEGEEK_URL = basegeekUrl;
  basegeekRequestCount = 0;
  basegeekUsers = {
    [TOKEN_A]: { _id: OWNER_A, username: 'alice', email: 'alice@example.com' },
    [TOKEN_B]: { _id: OWNER_B, username: 'bob', email: 'bob@example.com' },
  };
});

function buildWhoamiApp() {
  const app = express();
  // A minimal stand-in for a requireAuth-protected route (flockgeek's own
  // GET /api/me and GET /api/auth/me use requireAuth + @geeksuite/user's
  // meHandler(); this isolates the requireAuth contract itself).
  app.get('/whoami', requireAuth, (req, res) => {
    res.json({ user: { id: req.user.id, username: req.user.username, email: req.user.email } });
  });
  return app;
}

function buildDataApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/birds', birdsRoutes);
  app.use('/api/egg-production', eggProductionRoutes);
  return app;
}

function seedBird(overrides = {}) {
  return {
    _id: 'bird-a',
    ownerId: OWNER_A,
    tagId: 'T-A',
    name: "Alice's hen",
    sex: 'hen',
    status: 'active',
    ...overrides,
  };
}

function seedEgg(overrides = {}) {
  return {
    _id: 'egg-a',
    ownerId: OWNER_A,
    date: new Date('2026-08-01T00:00:00.000Z'),
    eggsCount: 3,
    ...overrides,
  };
}

describe('requireAuth — cookie / basegeek contract', () => {
  test('no cookie and no bearer token -> 401, basegeek is never contacted', async () => {
    const res = await request(buildWhoamiApp()).get('/whoami');

    expect(res.status).toBe(401);
    expect(basegeekRequestCount).toBe(0);
  });

  test('basegeek rejects the token (expired/invalid) -> 401', async () => {
    const res = await request(buildWhoamiApp())
      .get('/whoami')
      .set('Cookie', 'geek_token=not-a-real-token');

    expect(res.status).toBe(401);
    expect(basegeekRequestCount).toBe(1);
  });

  // Finding: the code's actual contract for "basegeek unreachable" is 502
  // ("Authentication service unavailable"), not 401 or 503 — see
  // packages/user/src/server/attachUser.js: only a caught error with
  // response.status 401/403 is normalized to 401; every other failure
  // (including a network-level ECONNREFUSED, which has no `.response` at
  // all) falls through to `res.status(502)`. Asserting the real behavior.
  test('basegeek unreachable -> 502, not 401', async () => {
    process.env.BASEGEEK_URL = 'http://127.0.0.1:1'; // nothing listens here
    const res = await request(buildWhoamiApp())
      .get('/whoami')
      .set('Cookie', `geek_token=${TOKEN_A}`);

    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/unavailable/i);
  });

  test('valid cookie + basegeek 200 -> 200 with the caller\'s identity', async () => {
    const res = await request(buildWhoamiApp())
      .get('/whoami')
      .set('Cookie', `geek_token=${TOKEN_A}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: OWNER_A,
      username: 'alice',
      email: 'alice@example.com',
    });
    expect(basegeekRequestCount).toBe(1);
  });
});

describe('protected data routes require real auth', () => {
  test('GET /api/birds without a cookie -> 401, controller/model never reached', async () => {
    const res = await request(buildDataApp()).get('/api/birds');

    expect(res.status).toBe(401);
    expect(fakeBird.find).not.toHaveBeenCalled();
    expect(basegeekRequestCount).toBe(0);
  });

  test('GET /api/egg-production without a cookie -> 401, controller/model never reached', async () => {
    const res = await request(buildDataApp()).get('/api/egg-production');

    expect(res.status).toBe(401);
    expect(fakeEgg.find).not.toHaveBeenCalled();
  });
});

describe('cross-user data isolation (birds + egg production) via real requireOwner', () => {
  beforeEach(() => {
    fakeBird._reset([
      seedBird({ _id: 'bird-a', ownerId: OWNER_A, tagId: 'A-1', name: "Alice's hen" }),
      seedBird({ _id: 'bird-b', ownerId: OWNER_B, tagId: 'B-1', name: "Bob's hen" }),
    ]);
    fakeEgg._reset([
      seedEgg({ _id: 'egg-a', ownerId: OWNER_A, birdId: 'bird-a' }),
      seedEgg({ _id: 'egg-b', ownerId: OWNER_B, birdId: 'bird-b' }),
    ]);
  });

  test('A listing birds sees only their own bird', async () => {
    const res = await request(buildDataApp())
      .get('/api/birds')
      .set('Cookie', `geek_token=${TOKEN_A}`);

    expect(res.status).toBe(200);
    expect(res.body.data.birds.map((b) => b._id)).toEqual(['bird-a']);
  });

  test('B listing birds sees only their own bird', async () => {
    const res = await request(buildDataApp())
      .get('/api/birds')
      .set('Cookie', `geek_token=${TOKEN_B}`);

    expect(res.status).toBe(200);
    expect(res.body.data.birds.map((b) => b._id)).toEqual(['bird-b']);
  });

  test('A reading B\'s bird by id -> 404, not 200 or 403', async () => {
    const res = await request(buildDataApp())
      .get('/api/birds/bird-b')
      .set('Cookie', `geek_token=${TOKEN_A}`);

    expect(res.status).toBe(404);
    expect(res.body.data).toBeUndefined();
  });

  test('A updating B\'s bird by id -> 404, and B\'s bird is untouched', async () => {
    const res = await request(buildDataApp())
      .put('/api/birds/bird-b')
      .set('Cookie', `geek_token=${TOKEN_A}`)
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(404);
    expect(fakeBird._docs().find((b) => b._id === 'bird-b').name).toBe("Bob's hen");
  });

  test('A deleting B\'s bird by id -> 404, and B\'s bird stays live', async () => {
    const res = await request(buildDataApp())
      .delete('/api/birds/bird-b')
      .set('Cookie', `geek_token=${TOKEN_A}`);

    expect(res.status).toBe(404);
    expect(fakeBird._docs().find((b) => b._id === 'bird-b').deletedAt).toBeUndefined();
  });

  test('A listing egg-production logs sees only their own', async () => {
    const res = await request(buildDataApp())
      .get('/api/egg-production')
      .set('Cookie', `geek_token=${TOKEN_A}`);

    expect(res.status).toBe(200);
    expect(res.body.data.eggProduction.map((e) => e._id)).toEqual(['egg-a']);
  });

  test('A reading B\'s egg-production log by id -> 404', async () => {
    const res = await request(buildDataApp())
      .get('/api/egg-production/egg-b')
      .set('Cookie', `geek_token=${TOKEN_A}`);

    expect(res.status).toBe(404);
  });

  test('A updating B\'s egg-production log by id -> 404, and it is untouched', async () => {
    const res = await request(buildDataApp())
      .put('/api/egg-production/egg-b')
      .set('Cookie', `geek_token=${TOKEN_A}`)
      .send({ eggsCount: 999 });

    expect(res.status).toBe(404);
    expect(fakeEgg._docs().find((e) => e._id === 'egg-b').eggsCount).not.toBe(999);
  });

  test('A deleting B\'s egg-production log by id -> 404, and it stays live', async () => {
    const res = await request(buildDataApp())
      .delete('/api/egg-production/egg-b')
      .set('Cookie', `geek_token=${TOKEN_A}`);

    expect(res.status).toBe(404);
    expect(fakeEgg._docs().find((e) => e._id === 'egg-b').deletedAt).toBeUndefined();
  });
});
