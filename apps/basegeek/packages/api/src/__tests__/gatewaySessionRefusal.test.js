/**
 * gatewaySessionRefusal.test.js — SUITE_REVIEW_2026-11 S1 / plan 2.1.
 *
 * `/graphql` used to answer a request whose token was PRESENTED and refused
 * (expired, garbage, wrong secret) as if it carried no token: anonymous,
 * HTTP 200, every owner-scoped list `[]`. Nothing told the client to refresh.
 *
 * The contract this pins, end to end through a real Apollo Server and the real
 * `/api/auth` routes (refresh included):
 *
 *   - no token                        → anonymous, public fields still answer;
 *   - valid token (cookie or Bearer)  → the user;
 *   - expired / garbage / forged      → HTTP 401, `errors[0].extensions.code`
 *                                       UNAUTHENTICATED, and NO `data` key —
 *                                       that is what makes Apollo Client's
 *                                       HttpLink raise a networkError with
 *                                       statusCode 401, the trigger the shared
 *                                       error link refreshes on;
 *   - `Bearer null` / `Bearer undefined` → no token, anonymous;
 *   - a refresh cookie alone          → still "no token" (anonymous);
 *   - POST /api/auth/refresh carrying an EXPIRED access cookie still rotates,
 *     and the new token is accepted by /graphql.
 *
 * Plus the resolver-level half: `requireUser` from graphql/shared/auth.js
 * answers an anonymous caller UNAUTHENTICATED (HTTP 200) through Apollo too.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { makeFakeRedisClient } from './fakeRedis.js';

const fakeRedisClient = makeFakeRedisClient();
jest.unstable_mockModule('redis', () => ({ createClient: () => fakeRedisClient }));

const { default: mongoose } = await import('mongoose');
const { User, userGeekConn } = await import('../models/user.js');
const { buildTestApp, createTestUser } = await import('./testHelpers.js');
const { initRefreshTokenStore, closeRefreshTokenStore } = await import('../services/refreshTokenStore.js');
const { gatewaySession } = await import('../middleware/auth.js');
const { requireUser } = await import('../graphql/shared/auth.js');
const { ApolloServer } = await import('@apollo/server');
const { expressMiddleware } = await import('@as-integrations/express4');

let app;
let apollo;
let seq = 0;
const uniq = () => `${Date.now()}_${seq++}`;

const typeDefs = `#graphql
  type Query {
    ping: String!
    whoami: String
    mine: [String!]!
  }
`;
const resolvers = {
  Query: {
    ping: () => 'pong',
    whoami: (_, __, ctx) => ctx.user?.id || null,
    mine: (_, __, ctx) => [requireUser(ctx)],
  },
};

const expiredToken = (user) => jwt.sign(
  { id: String(user._id), username: user.username, app: 'basegeek', exp: Math.floor(Date.now() / 1000) - 60 },
  process.env.JWT_SECRET,
);
const validToken = (user) => jwt.sign(
  { id: String(user._id), username: user.username, app: 'basegeek' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' },
);

const gql = (query = '{ ping whoami }') => request(app).post('/graphql').send({ query });

/** Cookie values out of a supertest response, by name. */
function cookiesOf(res) {
  const out = {};
  for (const c of res.headers['set-cookie'] || []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    out[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return out;
}

function expectRefused(res) {
  expect(res.status).toBe(401);
  expect(res.body.errors).toHaveLength(1);
  expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  expect(res.body.errors[0].message).toMatch(/^Unauthorized/);
  // No `data` key: with one, Apollo Client would deliver this as graphQLErrors
  // on a "successful" result instead of a 401 networkError.
  expect(res.body).not.toHaveProperty('data');
}

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.USERGEEK_MONGODB_URI);
  await initRefreshTokenStore();

  apollo = new ApolloServer({ typeDefs, resolvers });
  await apollo.start();

  app = buildTestApp(); // json + cookie-parser + pino + /api/auth
  app.use('/graphql', gatewaySession());
  app.use('/graphql', expressMiddleware(apollo, {
    context: async ({ req }) => ({ user: req.user || null }),
  }));
}, 60000);

afterAll(async () => {
  await apollo?.stop();
  await closeRefreshTokenStore();
  await User.deleteMany({ username: /^gw_refusal_/ }).catch(() => {});
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

beforeEach(() => fakeRedisClient.flush());

describe('/graphql: a presented-but-refused token answers 401, no token stays anonymous', () => {
  it('no token → anonymous; public fields still answer', async () => {
    const res = await gql();
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ping: 'pong', whoami: null });
  });

  it('valid cookie → the user', async () => {
    const user = await User.create({ username: `gw_refusal_ok_${uniq()}`, passwordHash: 'x' });
    const res = await gql().set('Cookie', `geek_token=${validToken(user)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.whoami).toBe(String(user._id));
  });

  it('valid Bearer → the user', async () => {
    const user = await User.create({ username: `gw_refusal_bearer_${uniq()}`, passwordHash: 'x' });
    const res = await gql().set('Authorization', `Bearer ${validToken(user)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.whoami).toBe(String(user._id));
  });

  it('expired cookie → 401 UNAUTHENTICATED, not an anonymous 200', async () => {
    const user = await User.create({ username: `gw_refusal_exp_${uniq()}`, passwordHash: 'x' });
    expectRefused(await gql().set('Cookie', `geek_token=${expiredToken(user)}`));
  });

  it('expired Bearer (the localStorage copy, cookie already dropped) → 401', async () => {
    const user = await User.create({ username: `gw_refusal_expb_${uniq()}`, passwordHash: 'x' });
    expectRefused(await gql().set('Authorization', `Bearer ${expiredToken(user)}`));
  });

  it('garbage token → 401, cookie or header', async () => {
    expectRefused(await gql().set('Cookie', 'geek_token=not-a-jwt'));
    expectRefused(await gql().set('Authorization', 'Bearer not-a-jwt'));
  });

  it('forged token (wrong secret) → 401', async () => {
    const forged = jwt.sign({ id: String(new mongoose.Types.ObjectId()) }, 'some-other-secret-entirely', { expiresIn: '1h' });
    expectRefused(await gql().set('Cookie', `geek_token=${forged}`));
  });

  it('a public operation is refused too when the token is bad — the client refreshes, then it answers', async () => {
    // Deliberate: the 401 is decided before any resolver runs.
    expectRefused(await gql('{ ping }').set('Cookie', 'geek_token=not-a-jwt'));
  });

  it('"Bearer null" / "Bearer undefined" are no token at all → anonymous', async () => {
    for (const junk of ['Bearer null', 'Bearer undefined', 'Bearer ']) {
      const res = await gql().set('Authorization', junk);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ ping: 'pong', whoami: null });
    }
  });

  it('a refresh cookie alone is not a presented access token → anonymous', async () => {
    const res = await gql().set('Cookie', 'geek_refresh_token=whatever');
    expect(res.status).toBe(200);
    expect(res.body.data.whoami).toBeNull();
  });

  it('requireUser answers an anonymous caller UNAUTHENTICATED through Apollo — on a 200, read once', async () => {
    // Not a 401: a 401 that carries `data` is delivered twice by Apollo
    // Client's HttpLink (next + error). See graphql/shared/auth.js.
    const res = await gql('{ ping mine }');
    expect(res.status).toBe(200);
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect(res.body.errors[0].message).toMatch(/^Unauthorized/);
  });
});

describe('refresh is never blocked by an expired access token', () => {
  it('POST /api/auth/refresh with an expired geek_token cookie rotates, and /graphql accepts the new token', async () => {
    const username = `gw_refusal_refresh_${uniq()}`;
    const user = await createTestUser({ username, email: `${username}@example.com`, password: 'password123' });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: username, password: 'password123', app: 'basegeek' });
    expect(login.status).toBe(200);
    const { geek_refresh_token: refreshCookie } = cookiesOf(login);
    expect(refreshCookie).toBeTruthy();

    const stale = expiredToken(user);
    // The tab's state after an hour away: access token expired, refresh live.
    expectRefused(await gql().set('Cookie', `geek_token=${stale}; geek_refresh_token=${refreshCookie}`));

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `geek_token=${stale}; geek_refresh_token=${refreshCookie}`)
      .send({});
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.token).toBeTruthy();

    const fresh = cookiesOf(refreshed).geek_token;
    expect(fresh).toBeTruthy();
    const replay = await gql().set('Cookie', `geek_token=${fresh}; geek_refresh_token=${cookiesOf(refreshed).geek_refresh_token}`);
    expect(replay.status).toBe(200);
    expect(replay.body.data.whoami).toBe(String(user._id));
  });
});

describe('REST authenticateToken: expired or invalid is 401, not 403 (S6)', () => {
  it('an expired token on a REST route answers 401', async () => {
    const user = await User.create({ username: `gw_refusal_rest_${uniq()}`, passwordHash: 'x' });
    const res = await request(app).get('/api/auth/profile').set('Cookie', `geek_token=${expiredToken(user)}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired token');
  });

  it('a garbage Bearer answers 401', async () => {
    const res = await request(app).get('/api/auth/profile').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });
});
