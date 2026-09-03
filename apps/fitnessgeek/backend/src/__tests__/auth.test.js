// Auth-isolation test suite for fitnessgeek's backend.
//
// Auth surface: `authenticateToken` (src/middleware/auth.js) is
// `attachUser()` from @geeksuite/user/server. It does NOT verify JWTs
// locally — there is no JWT_SECRET check in this app's request path. It
// extracts a token (the `geek_token` HttpOnly cookie, or a `Bearer` auth
// header) and validates it remotely against BaseGeek's GET /api/users/me
// (see packages/user/src/server/tokenUtils.js). A malformed, expired, or
// wrong-signature token is therefore indistinguishable at this layer from
// any other token BaseGeek rejects — they all fail the same remote check
// and come back as a local 401. These tests mock that remote call (axios)
// rather than fabricating real JWTs, since fitnessgeek has nothing local to
// verify a JWT signature against.
//
// This suite exercises the REAL app (src/app.js — the server.js/app.js
// split added alongside this suite so the app can be imported by supertest
// without connecting to Mongo/Redis or binding a port) and the REAL
// authenticateToken middleware, unlike the other three test files which
// double out auth with an `x-test-user` header for controller-focused
// coverage. Only axios (the basegeek round-trip) and the Mongoose models
// touched here are mocked — no live Mongo, no Redis, no real network.

const request = require('supertest');

jest.mock('axios');
const axios = require('axios');

jest.mock('../models/BloodPressure', () => {
  const BloodPressure = jest.fn();
  BloodPressure.find = jest.fn();
  BloodPressure.findOne = jest.fn();
  BloodPressure.findOneAndDelete = jest.fn();
  BloodPressure.countDocuments = jest.fn();
  return BloodPressure;
});

const BloodPressure = require('../models/BloodPressure');
const app = require('../app');

const USER_A = { _id: 'user-a', id: 'user-a', userId: 'user-a', username: 'alice', email: 'alice@example.com' };
const USER_B = { _id: 'user-b', id: 'user-b', userId: 'user-b', username: 'bob', email: 'bob@example.com' };

// Maps an opaque bearer token to the SSO identity BaseGeek would return for
// a valid token. Any token not in this map is treated as one BaseGeek
// rejects (covers malformed / expired / wrong-secret alike).
const TOKEN_USER = {
  'valid-token-a': USER_A,
  'valid-token-b': USER_B,
};

function mockBasegeekFor(token) {
  const user = TOKEN_USER[token];
  if (user) {
    axios.get.mockResolvedValueOnce({ data: { user } });
    return;
  }
  const err = new Error('Request failed with status code 401');
  err.response = { status: 401, data: { message: 'Invalid or expired token' } };
  axios.get.mockRejectedValueOnce(err);
}

function cookieHeader(token) {
  return `geek_token=${token}`;
}

beforeEach(() => {
  axios.get.mockReset();
});

describe('authenticateToken — token presence and validity (GET /api/me)', () => {
  test('no cookie and no Authorization header -> 401, basegeek never called', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('malformed token -> 401', async () => {
    mockBasegeekFor('not-a-real-jwt');
    const res = await request(app).get('/api/me').set('Cookie', cookieHeader('not-a-real-jwt'));
    expect(res.status).toBe(401);
  });

  test('expired token -> 401', async () => {
    mockBasegeekFor('expired-token');
    const res = await request(app).get('/api/me').set('Cookie', cookieHeader('expired-token'));
    expect(res.status).toBe(401);
  });

  test('token signed with the wrong secret -> 401', async () => {
    mockBasegeekFor('wrong-secret-token');
    const res = await request(app).get('/api/me').set('Cookie', cookieHeader('wrong-secret-token'));
    expect(res.status).toBe(401);
  });

  test('basegeek unreachable (network error) surfaces as 502, not a false-positive 401/200', async () => {
    axios.get.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const res = await request(app).get('/api/me').set('Cookie', cookieHeader('valid-token-a'));
    expect(res.status).toBe(502);
  });

  test('valid cookie token -> 200 with the caller identity', async () => {
    mockBasegeekFor('valid-token-a');
    const res = await request(app).get('/api/me').set('Cookie', cookieHeader('valid-token-a'));

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('user-a');
    expect(res.body.user.username).toBe('alice');
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/me'),
      expect.objectContaining({ headers: { Authorization: 'Bearer valid-token-a' } })
    );
  });

  test('a Bearer Authorization header also authenticates (cookie is not the only path)', async () => {
    mockBasegeekFor('valid-token-b');
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer valid-token-b');

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('user-b');
  });
});

describe('protected data route without a cookie (GET /api/blood-pressure)', () => {
  test('is 401 and never reaches basegeek or the model', async () => {
    const res = await request(app).get('/api/blood-pressure');

    expect(res.status).toBe(401);
    expect(axios.get).not.toHaveBeenCalled();
    expect(BloodPressure.find).not.toHaveBeenCalled();
  });
});

describe('cross-user data isolation on /api/blood-pressure (real auth + real controller)', () => {
  test("list only returns the caller's own rows", async () => {
    mockBasegeekFor('valid-token-a');
    const skip = jest.fn().mockResolvedValue([{ _id: 'bp-a1', userId: 'user-a', systolic: 118, diastolic: 76 }]);
    const limit = jest.fn().mockReturnValue({ skip });
    const sort = jest.fn().mockReturnValue({ limit });
    BloodPressure.find.mockReturnValue({ sort });
    BloodPressure.countDocuments.mockResolvedValue(1);

    const res = await request(app).get('/api/blood-pressure').set('Cookie', cookieHeader('valid-token-a'));

    expect(res.status).toBe(200);
    // The list query is scoped to the authenticated caller — there is no
    // parameter that lets a caller ask for another user's rows here.
    expect(BloodPressure.find).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a' }));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].userId).toBe('user-a');
  });

  test("A cannot read B's blood-pressure log by id (scoped query -> 404)", async () => {
    mockBasegeekFor('valid-token-a');
    // The query includes A's own id, so B's document (owned by 'user-b')
    // never matches — this is what the 404 (rather than a 200 with B's
    // data) is asserting.
    BloodPressure.findOne.mockResolvedValue(null);

    const res = await request(app).get('/api/blood-pressure/bp-b1').set('Cookie', cookieHeader('valid-token-a'));

    expect(res.status).toBe(404);
    expect(BloodPressure.findOne).toHaveBeenCalledWith({ _id: 'bp-b1', userId: 'user-a' });
  });

  test("A cannot update B's blood-pressure log by id (scoped query -> 404, no save)", async () => {
    mockBasegeekFor('valid-token-a');
    BloodPressure.findOne.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/blood-pressure/bp-b1')
      .set('Cookie', cookieHeader('valid-token-a'))
      .send({ systolic: 120, diastolic: 80 });

    expect(res.status).toBe(404);
    expect(BloodPressure.findOne).toHaveBeenCalledWith({ _id: 'bp-b1', userId: 'user-a' });
  });

  test("A cannot delete B's blood-pressure log by id (scoped query -> 404, no delete)", async () => {
    mockBasegeekFor('valid-token-a');
    BloodPressure.findOneAndDelete.mockResolvedValue(null);

    const res = await request(app).delete('/api/blood-pressure/bp-b1').set('Cookie', cookieHeader('valid-token-a'));

    expect(res.status).toBe(404);
    expect(BloodPressure.findOneAndDelete).toHaveBeenCalledWith({ _id: 'bp-b1', userId: 'user-a' });
  });

  test("B can read their own log at that same id (scoping is per-caller, not a global lock)", async () => {
    mockBasegeekFor('valid-token-b');
    BloodPressure.findOne.mockResolvedValue({ _id: 'bp-b1', userId: 'user-b', systolic: 120, diastolic: 80 });

    const res = await request(app).get('/api/blood-pressure/bp-b1').set('Cookie', cookieHeader('valid-token-b'));

    expect(res.status).toBe(200);
    expect(BloodPressure.findOne).toHaveBeenCalledWith({ _id: 'bp-b1', userId: 'user-b' });
    expect(res.body.data.userId).toBe('user-b');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSRF origin guard (TODO_ORDER #12)
//
// src/app.js mounts @geeksuite/user's csrfGuard() with the same
// `allowedOrigins` list the cors() config uses, ahead of cors() itself (see
// the comment there for why). These cases pin down the production contract:
// a cookie-authenticated mutation from fitnessgeek's own origin still works,
// the same mutation from a third-party page gets a deliberate 403, and the
// Origin-less clients the suite depends on (curl, container healthchecks,
// server-to-server, supertest) are not caught in the blast radius.
//
// The DELETE probe reuses the blood-pressure route the isolation tests above
// already exercise: with the model mocked to find nothing it answers 404, so
// 404 means "the guard let this through" and 403 means "the guard stopped
// it". The /graphql probe matters more — it is the reverse proxy into
// basegeek's unified API, so a GraphQL mutation over POST is the single most
// valuable thing on this backend for a hostile page to reach.
//
// Unit coverage for every branch of the guard itself (Referer fallback,
// opaque origins, CSRF_GUARD=off/report, empty allow-list) lives in
// packages/user/src/server/__tests__/csrfGuard.test.js.
// ─────────────────────────────────────────────────────────────────────────────

describe('CSRF origin guard', () => {
  const OWN_ORIGIN = 'https://fitnessgeek.clintgeek.com';
  const EVIL_ORIGIN = 'https://evil.example';
  const COOKIE = cookieHeader('valid-token-a');

  test('a cookie-authenticated DELETE from an allow-listed origin reaches the route', async () => {
    mockBasegeekFor('valid-token-a');
    BloodPressure.findOneAndDelete.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/blood-pressure/bp-a1')
      .set('Cookie', COOKIE)
      .set('Origin', OWN_ORIGIN);

    expect(res.status).toBe(404);
  });

  test('the same DELETE from a foreign origin is rejected with 403 before the route runs', async () => {
    const res = await request(app)
      .delete('/api/blood-pressure/bp-a1')
      .set('Cookie', COOKIE)
      .set('Origin', EVIL_ORIGIN);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'csrf_origin_rejected' });
    expect(BloodPressure.findOneAndDelete).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled(); // never even asked basegeek who this is
  });

  test('a foreign Referer with no Origin is rejected too', async () => {
    const res = await request(app)
      .delete('/api/blood-pressure/bp-a1')
      .set('Cookie', COOKIE)
      .set('Referer', `${EVIL_ORIGIN}/attack.html`);

    expect(res.status).toBe(403);
  });

  test('a cookie-authenticated mutation with no Origin and no Referer passes', async () => {
    mockBasegeekFor('valid-token-a');
    BloodPressure.findOneAndDelete.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/blood-pressure/bp-a1')
      .set('Cookie', COOKIE);

    expect(res.status).toBe(404);
  });

  test('a GraphQL mutation from a foreign origin is rejected before it is proxied to basegeek', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Cookie', COOKIE)
      .set('Origin', EVIL_ORIGIN)
      .send({ query: 'mutation { deleteEverything }' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'csrf_origin_rejected' });
    expect(axios).not.toHaveBeenCalled();
  });

  test('a GraphQL mutation from the app\'s own origin is proxied through', async () => {
    axios.mockResolvedValueOnce({ status: 200, headers: {}, data: { data: { ok: true } } });

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', COOKIE)
      .set('Origin', OWN_ORIGIN)
      .send({ query: 'mutation { addWeightLog(weight: 180) { id } }' });

    expect(res.status).toBe(200);
    expect(axios).toHaveBeenCalledTimes(1);
  });

  test('a GET from a foreign origin is not blocked by the guard — mutations only', async () => {
    const res = await request(app)
      .get('/api/blood-pressure/bp-a1')
      .set('Cookie', COOKIE)
      .set('Origin', EVIL_ORIGIN);

    expect(res.status).not.toBe(403);
  });

  test('an unauthenticated mutation is not the guard\'s business', async () => {
    const res = await request(app)
      .delete('/api/blood-pressure/bp-a1')
      .set('Origin', EVIL_ORIGIN);

    expect(res.status).not.toBe(403);
  });
});
