/**
 * registrationGate.test.js — public sign-up is closed unless
 * REGISTRATION_MODE=open (DOCS/REGISTRATION_GATE_PLAN.md).
 *
 * setEnv.js opens registration for every other suite; this one flips the
 * env per test, because the route reads it on each request.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';

import { makeFakeRedisClient } from './fakeRedis.js';

const fakeRedisClient = makeFakeRedisClient();
jest.unstable_mockModule('redis', () => ({ createClient: () => fakeRedisClient }));

const { default: mongoose } = await import('mongoose');
const { User, userGeekConn } = await import('../models/user.js');
const { buildTestApp } = await import('./testHelpers.js');
const { registrationMode } = await import('../routes/auth.js');
const { initRefreshTokenStore, closeRefreshTokenStore } = await import('../services/refreshTokenStore.js');

let app;
let seq = 0;
const body = () => {
  const n = `regate_${Date.now()}_${seq++}`;
  return { username: n, email: `${n}@example.com`, password: 'correct-horse-battery-9' };
};
const ORIGINAL = process.env.REGISTRATION_MODE;

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.USERGEEK_MONGODB_URI);
  await initRefreshTokenStore();
  app = buildTestApp();
}, 60000);

afterEach(() => { process.env.REGISTRATION_MODE = ORIGINAL; });

afterAll(async () => {
  await closeRefreshTokenStore();
  await User.deleteMany({ username: /^regate_/ }).catch(() => {});
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('registrationMode', () => {
  it('is closed unless the env says exactly "open" (any case, trimmed)', () => {
    expect(registrationMode({})).toBe('closed');
    expect(registrationMode({ REGISTRATION_MODE: '' })).toBe('closed');
    expect(registrationMode({ REGISTRATION_MODE: 'closed' })).toBe('closed');
    expect(registrationMode({ REGISTRATION_MODE: 'invite' })).toBe('closed');
    expect(registrationMode({ REGISTRATION_MODE: 'yes' })).toBe('closed');
    expect(registrationMode({ REGISTRATION_MODE: 'open' })).toBe('open');
    expect(registrationMode({ REGISTRATION_MODE: ' OPEN ' })).toBe('open');
  });
});

describe('POST /api/auth/register', () => {
  it('refuses with 403 REGISTRATION_CLOSED when the mode is unset, and creates nothing', async () => {
    delete process.env.REGISTRATION_MODE;
    const b = body();
    const res = await request(app).post('/api/auth/register').send(b);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('REGISTRATION_CLOSED');
    expect(res.body.token).toBeUndefined();
    expect(await User.countDocuments({ username: b.username })).toBe(0);
  });

  it('refuses when explicitly closed, even with a garbage body (the gate runs first)', async () => {
    process.env.REGISTRATION_MODE = 'closed';
    const res = await request(app).post('/api/auth/register').send({ nope: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('REGISTRATION_CLOSED');
  });

  it('still registers when REGISTRATION_MODE=open', async () => {
    process.env.REGISTRATION_MODE = 'open';
    const b = body();
    const res = await request(app).post('/api/auth/register').send(b);
    expect(res.status).toBe(201);
    expect(await User.countDocuments({ username: b.username })).toBe(1);
  });

  it('closing does not affect login for an existing account', async () => {
    process.env.REGISTRATION_MODE = 'open';
    const b = body();
    await request(app).post('/api/auth/register').send(b).expect(201);
    process.env.REGISTRATION_MODE = 'closed';
    const res = await request(app).post('/api/auth/login').send({ identifier: b.username, password: b.password, app: 'basegeek' });
    expect(res.status).toBe(200);
  });
});
