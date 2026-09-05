// Input-validation coverage for weightRoutes.js (POST /, PUT /:id), added as
// part of DOCS/TODO_ORDER.md #22 (route-by-route input validation).
//
// Hermetic, same pattern as weight.test.js: the Weight model, auth
// middleware, cache service and UserSettings.getOrCreate (called internally
// for the optional Garmin push) are all doubled — no live Mongo, no Redis.

const express = require('express');
const request = require('supertest');

const OWNER = 'user-owner';

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    req.user = { id: userId, _id: userId, userId };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

jest.mock('../../services/cacheService', () => ({
  invalidateUser: jest.fn().mockResolvedValue(true),
  invalidateUserAI: jest.fn().mockResolvedValue(true),
  invalidateUserReports: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../models/Weight', () => {
  const Weight = jest.fn().mockImplementation(function ctor(doc) {
    Object.assign(this, doc);
    this.save = jest.fn().mockResolvedValue(this);
  });
  Weight.find = jest.fn();
  Weight.countDocuments = jest.fn();
  Weight.findOne = jest.fn();
  Weight.findOneAndDelete = jest.fn();
  return Weight;
});

const Weight = require('../../models/Weight');
const UserSettings = require('../../models/UserSettings');
const weightRoutes = require('../../routes/weightRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/weight', weightRoutes);
  return app;
}

beforeEach(() => {
  // createWeightLog/updateWeightLog both read settings for an optional
  // Garmin push; keep it disabled and out of the way of every test here.
  jest.spyOn(UserSettings, 'getOrCreate').mockResolvedValue({ garmin: { enabled: false } });
  Weight.findOne.mockResolvedValue(null); // no same-day log already exists
});

describe('POST /api/weight validation', () => {
  test('accepted: a plausible weight_value + log_date creates a log', async () => {
    const res = await request(buildApp())
      .post('/api/weight')
      .set('x-test-user', OWNER)
      .send({ weight_value: 181.4, log_date: '2026-09-01', notes: 'morning' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.weight_value).toBe(181.4);
  });

  test('rejected: missing weight_value never reaches the controller', async () => {
    const res = await request(buildApp())
      .post('/api/weight')
      .set('x-test-user', OWNER)
      .send({ log_date: '2026-09-01' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'weight_value' })])
    );
    expect(Weight.findOne).not.toHaveBeenCalled();
  });

  test('rejected: weight_value out of the plausible range (model caps at 1000) is a 400, not a 500', async () => {
    const res = await request(buildApp())
      .post('/api/weight')
      .set('x-test-user', OWNER)
      .send({ weight_value: 5000, log_date: '2026-09-01' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('weight_value');
  });

  test('rejected: an unrecognized field is now a 400 (previously silently dropped)', async () => {
    const res = await request(buildApp())
      .post('/api/weight')
      .set('x-test-user', OWNER)
      .send({ weight_value: 180, unit: 'kg' });

    expect(res.status).toBe(400);
    // zod's `.strict()` reports unrecognized keys as one root-level issue
    // naming them, rather than a per-key path.
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('unit') })])
    );
  });
});

describe('PUT /api/weight/:id validation', () => {
  test('accepted: a partial update (weight_value only) is allowed', async () => {
    const doc = { _id: 'w1', userId: OWNER, weight_value: 180, save: jest.fn().mockResolvedValue(true) };
    Weight.findOne.mockResolvedValue(doc);

    const res = await request(buildApp())
      .put('/api/weight/w1')
      .set('x-test-user', OWNER)
      .send({ weight_value: 179.5 });

    expect(res.status).toBe(200);
    expect(doc.weight_value).toBe(179.5);
  });

  test('rejected: a non-numeric weight_value is a 400', async () => {
    const res = await request(buildApp())
      .put('/api/weight/w1')
      .set('x-test-user', OWNER)
      .send({ weight_value: 'heavy' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Weight.findOne).not.toHaveBeenCalled();
  });

  test('rejected: a log_date far in the future is a 400', async () => {
    const res = await request(buildApp())
      .put('/api/weight/w1')
      .set('x-test-user', OWNER)
      .send({ log_date: '2099-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('log_date');
  });
});

describe('400 shape', () => {
  test('matches { success:false, error: { message, code, details: [{ path, message }] } }', async () => {
    const res = await request(buildApp())
      .post('/api/weight')
      .set('x-test-user', OWNER)
      .send({});

    expect(res.body).toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
      },
    });
    expect(res.body.error.details[0]).toMatchObject({
      path: expect.any(String),
      message: expect.any(String),
    });
  });
});
