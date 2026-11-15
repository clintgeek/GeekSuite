/**
 * goingOverInfra.test.js — pinning tests for the infrastructure / robustness
 * half of the 2026-09-05 going-over.
 *
 * The theme is failure paths that nothing exercised: a Redis that is down, a
 * Postgres that will not connect, a route shadowed by the one above it, an
 * unescaped regex. Every case here asserts what happens when the dependency
 * is broken, because that is the branch the bugs lived in.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import pinoHttp from 'pino-http';

/**
 * A redis double that behaves the way node-redis does when the server is
 * unreachable: it EMITS 'error' as well as rejecting `connect()`. That is the
 * whole bug — an 'error' event with no listener is thrown by Node, so an
 * unreachable Redis took the process down instead of producing a 500.
 */
class HostileRedisClient extends EventEmitter {
  constructor() {
    super();
    this.isOpen = false;
    this.quitCalls = 0;
  }
  async connect() {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:6380');
    this.emit('error', err); // unhandled => uncaught exception => process down
    throw err;
  }
  async info() { throw new Error('not connected'); }
  async quit() { this.quitCalls += 1; this.isOpen = false; }
}

let hostileClients = [];
jest.unstable_mockModule('redis', () => ({
  createClient: () => {
    const client = new HostileRedisClient();
    hostileClients.push(client);
    return client;
  },
}));

/** A pg Client that fails to connect AND rejects on `end()`. */
class HostilePgClient {
  async connect() { throw new Error('connect ECONNREFUSED 127.0.0.1:5432'); }
  async query() { throw new Error('not connected'); }
  async end() { throw new Error('Client was never connected'); }
}
jest.unstable_mockModule('pg', () => ({
  default: { Client: HostilePgClient },
  Client: HostilePgClient,
}));

const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { User, userGeekConn } = await import('../models/user.js');
const { default: logger } = await import('../lib/logger.js');
const { default: redisRoutes } = await import('../routes/redis.js');
const { default: postgresRoutes } = await import('../routes/postgres.js');

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
  app.use('/api/redis', redisRoutes);
  app.use('/api/postgres', postgresRoutes);
  return app;
}

let app;
let adminToken;
let userToken;
let userId;

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.USERGEEK_MONGODB_URI);

  const admin = await User.create({
    username: `going_over_infra_admin_${Date.now()}`,
    passwordHash: 'placeholder',
    role: 'admin',
  });
  adminToken = jwt.sign({ id: admin._id.toString(), app: 'basegeek' }, process.env.JWT_SECRET);

  const plain = await User.create({
    username: `going_over_infra_user_${Date.now()}`,
    passwordHash: 'placeholder',
  });
  userId = plain._id.toString();
  userToken = jwt.sign({ id: userId, app: 'basegeek' }, process.env.JWT_SECRET);

  app = buildApp();
}, 60000);

afterAll(async () => {
  await User.deleteMany({ username: /^going_over_infra_/ }).catch(() => {});
  await mongoose.connection.collection('notes').deleteMany({}).catch(() => {});
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ───────────────────────────────────────────────────────────────────────────
describe('a dependency that is down produces a 500, not a dead process', () => {
  it('GET /api/redis/status survives an unreachable Redis', async () => {
    hostileClients = [];
    const res = await request(app)
      .get('/api/redis/status')
      .set('Authorization', `Bearer ${adminToken}`);

    // Before the fix the 'error' event this client emits had no listener, so
    // Node threw it as an uncaught exception rather than letting the catch run.
    expect(res.status).toBe(500);
    expect(res.body.status).toBe('error');
    expect(hostileClients).toHaveLength(1);
    expect(hostileClients[0].listenerCount('error')).toBe(1);
  });

  it('GET /api/redis/status does not leave the socket open', async () => {
    hostileClients = [];
    await request(app).get('/api/redis/status').set('Authorization', `Bearer ${adminToken}`);
    // `quit()` used to sit inside the catch and be awaited bare; it is in a
    // `finally` now, guarded on isOpen so a never-connected client is not quit.
    expect(hostileClients[0].isOpen).toBe(false);
  });

  it('GET /api/postgres/status survives an end() that rejects', async () => {
    // `if (client) await client.end()` inside the catch: a client that never
    // connected can reject on end(), which escaped as an unhandled rejection
    // and left the request with no response at all.
    const res = await request(app)
      .get('/api/postgres/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(500);
    expect(res.body.status).toBe('error');
  });

  it('both routes still refuse a non-admin before they touch the dependency', async () => {
    for (const path of ['/api/redis/status', '/api/postgres/status']) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The legacy REST `/api/notes` route (routes/noteGeek.js) and its tests were
// deleted 2026-11-15: it wrote to datageek.notes, which nothing reads, and
// stored lockHash in plain text. NoteGeek's `notes` query compares a prefix
// with startsWith over the owner's stored tags, never as a regex.
