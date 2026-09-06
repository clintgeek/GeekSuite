/**
 * gatewayLocalSession.test.js — basegeek validates its own sessions in-process.
 *
 * `server.js` mounts `/graphql` behind the shared `optionalUser()`. Its default
 * validator asks `BASEGEEK_URL/api/users/me` over HTTP, which is correct for
 * the six consumer backends and pathological here: inside basegeek that URL
 * resolves to basegeek. Every gateway request went out through nginx and back
 * in to ask itself who the caller was, spending an inbound request slot to
 * free one. Once `validateToken` grew an 8 s timeout (2026-09-05) the
 * saturated case stopped being slow and became a suite-wide logout —
 * `optionalUser` swallowed the timeout, the request ran anonymous, the
 * resolver threw UNAUTHENTICATED, and the shared Apollo error link called
 * `logout()` in every open tab. BURN_REVIEW_2 §3.
 *
 * `localSessionValidator` verifies the JWT against this process's own
 * `JWT_SECRET` and loads the user from Mongo. The load-bearing assertion here
 * is the *negative* one: `BASEGEEK_URL` points at a real loopback server that
 * records every request it receives, and it must record none.
 *
 * The Apollo middleware itself is not mounted — this pins the auth stage of
 * the `/graphql` chain, which is the stage that changed. Schema wiring is
 * covered by gatewaySchemaLoads.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import jwt from 'jsonwebtoken';

import { makeFakeRedisClient } from './fakeRedis.js';

const fakeRedisClient = makeFakeRedisClient();
jest.unstable_mockModule('redis', () => ({ createClient: () => fakeRedisClient }));

const { default: mongoose } = await import('mongoose');
const { User, userGeekConn } = await import('../models/user.js');
const { localSessionValidator } = await import('../middleware/auth.js');
const { optionalUser } = await import('@geeksuite/user/server');

let app;
let basegeekSelfCalls = [];
let selfServer;
let previousBasegeekUrl;
let seq = 0;
const uniq = () => `${Date.now()}_${seq++}`;

/** Sign an access token the way authService.generateToken does. */
const signToken = (user, overrides = {}) =>
  jwt.sign(
    { id: String(user._id), username: user.username, email: user.email, app: 'basegeek', ...overrides },
    process.env.JWT_SECRET,
    overrides.iat ? {} : { expiresIn: '1h' }
  );

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.USERGEEK_MONGODB_URI);

  // A stand-in for "basegeek over HTTP". Nothing should ever reach it.
  selfServer = http.createServer((req, res) => {
    basegeekSelfCalls.push(req.url);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ user: { id: 'should-never-be-used' } }));
  });
  await new Promise((resolve) => selfServer.listen(0, '127.0.0.1', resolve));
  previousBasegeekUrl = process.env.BASEGEEK_URL;
  process.env.BASEGEEK_URL = `http://127.0.0.1:${selfServer.address().port}`;

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  // The same mount server.js uses.
  app.use('/graphql', optionalUser({ validateSession: localSessionValidator }));
  app.post('/graphql', (req, res) => {
    res.json({ user: req.user || null, geek: req.geek || null });
  });
}, 60000);

afterAll(async () => {
  if (previousBasegeekUrl === undefined) delete process.env.BASEGEEK_URL;
  else process.env.BASEGEEK_URL = previousBasegeekUrl;
  selfServer?.closeAllConnections?.();
  await new Promise((resolve) => selfServer.close(resolve));
  await User.deleteMany({ username: /^gateway_local_/ }).catch(() => {});
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('/graphql validates the session without leaving the process', () => {
  it('authenticates a valid cookie, and makes no outbound HTTP call', async () => {
    const username = `gateway_local_ok_${uniq()}`;
    const user = await User.create({ username, email: `${username}@example.com`, passwordHash: 'hunter22' });
    basegeekSelfCalls = [];

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', `geek_token=${signToken(user)}`)
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    // Same shape the HTTP path produced: resolvers read `context.user.id` and
    // must not be able to tell which validator ran.
    expect(res.body.user.id).toBe(String(user._id));
    expect(res.body.user.userId).toBe(String(user._id));
    expect(res.body.user._id).toBe(String(user._id));
    expect(res.body.user.username).toBe(username);
    expect(res.body.geek.user.id).toBe(String(user._id));

    expect(basegeekSelfCalls).toEqual([]);
  });

  it('authenticates a Bearer header too, still without an outbound call', async () => {
    const username = `gateway_local_bearer_${uniq()}`;
    const user = await User.create({ username, passwordHash: 'hunter22' });
    basegeekSelfCalls = [];

    const res = await request(app)
      .post('/graphql')
      .set('Authorization', `Bearer ${signToken(user)}`)
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(String(user._id));
    expect(basegeekSelfCalls).toEqual([]);
  });

  it('prefers the cookie when both are present — basegeek\'s own order', async () => {
    // The shared reader is header-first; basegeek's authenticateToken is
    // cookie-first. localSessionValidator re-reads the request so the gateway
    // resolves the same session every other basegeek route would.
    const cookieUser = await User.create({ username: `gateway_local_cookie_${uniq()}`, passwordHash: 'a' });
    const headerUser = await User.create({ username: `gateway_local_header_${uniq()}`, passwordHash: 'b' });
    basegeekSelfCalls = [];

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', `geek_token=${signToken(cookieUser)}`)
      .set('Authorization', `Bearer ${signToken(headerUser)}`)
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(String(cookieUser._id));
    expect(basegeekSelfCalls).toEqual([]);
  });

  it('runs anonymously on a bad cookie, and still makes no outbound call', async () => {
    basegeekSelfCalls = [];

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', 'geek_token=not-a-jwt')
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(res.body.geek).toBeNull();
    expect(basegeekSelfCalls).toEqual([]);
  });

  it('runs anonymously on a token signed with the wrong secret', async () => {
    const user = await User.create({ username: `gateway_local_forged_${uniq()}`, passwordHash: 'c' });
    const forged = jwt.sign({ id: String(user._id) }, 'not-the-basegeek-secret-at-all!!', { expiresIn: '1h' });
    basegeekSelfCalls = [];

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', `geek_token=${forged}`)
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(basegeekSelfCalls).toEqual([]);
  });

  it('runs anonymously with no token at all', async () => {
    basegeekSelfCalls = [];
    const res = await request(app).post('/graphql').send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(basegeekSelfCalls).toEqual([]);
  });

  it('refuses a token minted before the user\'s last password change', async () => {
    // The R93 rule — a password change ends every session, not just the one
    // that made it — has to hold on the gateway too, or a stolen token keeps
    // reading and writing through /graphql for its full lifetime.
    const user = await User.create({ username: `gateway_local_pw_${uniq()}`, passwordHash: 'old' });
    const issuedAt = Math.floor(Date.now() / 1000) - 60;
    const token = signToken(user, { iat: issuedAt });

    await User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: new Date(Date.now()) } });
    basegeekSelfCalls = [];

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', `geek_token=${token}`)
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(basegeekSelfCalls).toEqual([]);
  });

  it('keeps a token minted after the password change', async () => {
    const user = await User.create({ username: `gateway_local_pw_ok_${uniq()}`, passwordHash: 'old' });
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordChangedAt: new Date(Date.now() - 60_000) } }
    );

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', `geek_token=${signToken(user)}`)
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(String(user._id));
  });

  it('runs anonymously when the token names a user that no longer exists', async () => {
    const ghost = new mongoose.Types.ObjectId();
    const token = jwt.sign({ id: String(ghost), app: 'basegeek' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    basegeekSelfCalls = [];

    const res = await request(app)
      .post('/graphql')
      .set('Cookie', `geek_token=${token}`)
      .send({ query: '{ __typename }' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(basegeekSelfCalls).toEqual([]);
  });

  it('answers 503 with Retry-After — never anonymously — when the user store is down', async () => {
    // The distinction the whole fix rests on. An anonymous request here would
    // reach a resolver, throw UNAUTHENTICATED, and log every tab out over what
    // is a transient database blip.
    const user = await User.create({ username: `gateway_local_down_${uniq()}`, passwordHash: 'd' });
    const token = signToken(user);

    const failing = express();
    failing.use(cookieParser());
    failing.use('/graphql', optionalUser({
      validateSession: (t, ctx) => localSessionValidator(t, ctx),
    }));
    failing.post('/graphql', (req, res) => res.json({ user: req.user || null }));

    const findById = User.findById;
    User.findById = () => Promise.reject(new Error('connection refused'));
    try {
      const res = await request(failing)
        .post('/graphql')
        .set('Cookie', `geek_token=${token}`)
        .send({ query: '{ __typename }' });

      expect(res.status).toBe(503);
      expect(res.headers['retry-after']).toBe('5');
      expect(res.body.code).toBe('AUTH_UNAVAILABLE');
    } finally {
      User.findById = findById;
    }
  });
});
