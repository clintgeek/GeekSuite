// `PUT /api/user/profile` — the body shape, and `PATCH /api/user/settings`.
//
// The bug this pins: the route destructured `{ username, email, age, height,
// gender }` off `req.body` directly, but the only caller
// (`frontend/src/services/userService.js`) sends
// `{ profile: { firstName, lastName, age, height, gender } }` — the shape
// basegeek itself takes. Every field therefore read `undefined`, the route
// found nothing to update, and both callers (the Profile page's Save, and
// AIGoalPlanner's "save your profile" step) came back
// 400 NO_VALID_FIELDS every single time. `firstName`/`lastName` were dropped
// on the floor even in the flat shape.
//
// Hermetic: axios (the basegeek round-trip), UserSettings and the auth
// middleware are jest-mocked.

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';
const mod = (p) => new URL(p, import.meta.url).pathname;

const axios = jest.fn();
axios.get = jest.fn();
axios.post = jest.fn();
axios.put = jest.fn();
axios.default = axios;
jest.unstable_mockModule('axios', () => axios);
jest.mock('axios', () => axios);

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    req.user = { id: userId, _id: userId, userId };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => {
  const UserSettings = jest.fn();
  UserSettings.findOne = jest.fn();
  UserSettings.getOrCreate = jest.fn();
  return { __esModule: true, default: UserSettings };
});

const { default: userRoutes } = await import('../../routes/userRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/user', userRoutes);
  return app;
}

const basegeekAnswers = (profile = {}) =>
  axios.put.mockResolvedValue({
    data: { user: { username: 'alice', email: 'alice@example.com', profile } },
  });

beforeEach(() => {
  axios.put.mockReset();
});

describe('PUT /api/user/profile — the nested shape the frontend actually sends', () => {
  test('{ profile: {...} } is accepted and relayed', async () => {
    basegeekAnswers({ firstName: 'Alice', lastName: 'Ng', age: 41, height: 66, gender: 'female' });

    const res = await request(buildApp())
      .put('/api/user/profile')
      .set('x-test-user', OWNER)
      .send({ profile: { firstName: 'Alice', lastName: 'Ng', age: 41, height: 66, gender: 'female' } });

    expect(res.status).toBe(200);
    const [, payload] = axios.put.mock.calls[0];
    expect(payload.profile).toEqual({
      firstName: 'Alice',
      lastName: 'Ng',
      age: 41,
      height: 66,
      gender: 'female',
    });
  });

  test('the flat shape still works', async () => {
    basegeekAnswers({ age: 41 });

    const res = await request(buildApp())
      .put('/api/user/profile')
      .set('x-test-user', OWNER)
      .send({ age: 41 });

    expect(res.status).toBe(200);
    expect(axios.put.mock.calls[0][1].profile).toEqual({ age: 41 });
  });

  test('firstName / lastName reach basegeek instead of being dropped', async () => {
    basegeekAnswers({ firstName: 'Alice', lastName: 'Ng' });

    await request(buildApp())
      .put('/api/user/profile')
      .set('x-test-user', OWNER)
      .send({ profile: { firstName: 'Alice', lastName: 'Ng' } });

    expect(axios.put.mock.calls[0][1].profile).toEqual({ firstName: 'Alice', lastName: 'Ng' });
  });

  test('username and email are relayed at the top level, not inside profile', async () => {
    basegeekAnswers({});

    await request(buildApp())
      .put('/api/user/profile')
      .set('x-test-user', OWNER)
      .send({ username: 'newname', email: 'new@example.com' });

    const payload = axios.put.mock.calls[0][1];
    expect(payload).toMatchObject({ username: 'newname', email: 'new@example.com' });
    expect(payload).not.toHaveProperty('profile');
  });

  test('a genuinely empty body is still 400 NO_VALID_FIELDS', async () => {
    const res = await request(buildApp())
      .put('/api/user/profile')
      .set('x-test-user', OWNER)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_VALID_FIELDS');
    expect(axios.put).not.toHaveBeenCalled();
  });

  test('an empty nested profile is also 400, and calls nothing upstream', async () => {
    const res = await request(buildApp())
      .put('/api/user/profile')
      .set('x-test-user', OWNER)
      .send({ profile: {} });

    expect(res.status).toBe(400);
    expect(axios.put).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/user/settings — healthBaselines', () => {
  test('a null healthBaselines is ignored rather than throwing a 500', async () => {
    const { default: UserSettings } = await import('../../models/UserSettings.js');
    const doc = { influxEnabled: false, healthBaselines: { weeklyHRV: 40 }, save: jest.fn() };
    UserSettings.findOne.mockResolvedValue(doc);

    const res = await request(buildApp())
      .patch('/api/user/settings')
      .set('x-test-user', OWNER)
      .send({ influxEnabled: true, healthBaselines: null });

    expect(res.status).toBe(200);
    expect(doc.influxEnabled).toBe(true);
    expect(doc.healthBaselines).toEqual({ weeklyHRV: 40 });
  });

  test('a non-object healthBaselines is a 400', async () => {
    const { default: UserSettings } = await import('../../models/UserSettings.js');
    UserSettings.findOne.mockResolvedValue({ save: jest.fn() });

    const res = await request(buildApp())
      .patch('/api/user/settings')
      .set('x-test-user', OWNER)
      .send({ healthBaselines: 'nope' });

    expect(res.status).toBe(400);
  });
});
