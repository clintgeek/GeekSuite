// Ownership / data-isolation tests for the weight-log routes + controller.
//
// fitnessgeek's backend is CommonJS, so we replace the Mongoose Weight model,
// the auth middleware, and the Redis cache service with jest.mock() doubles.
// No live Mongo, no Redis, no basegeek network call.
//
// The IDOR boundary here is enforced by *query scoping*: every controller
// query includes the caller's own userId (e.g. Weight.findOne({ _id, userId })),
// so another user's document can never match — a cross-user lookup returns
// null and the controller answers 404. These tests pin that behavior.

const express = require('express');
const request = require('supertest');

const OWNER = 'user-owner';
const OTHER = 'user-other';

// Auth double: caller is identified by the `x-test-user` header, or is
// unauthenticated (401) if it is absent. Mirrors the real controller's
// req.user shape ({ id, _id, userId }).
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

// Cache service is Redis-backed; stub it so nothing opens a socket.
jest.mock('../../services/cacheService', () => ({
  invalidateUser: jest.fn().mockResolvedValue(true),
  invalidateUserAI: jest.fn().mockResolvedValue(true),
  invalidateUserReports: jest.fn().mockResolvedValue(true),
}));

// Mongoose Weight model replaced by a plain constructor with static mocks.
jest.mock('../../models/Weight', () => {
  const Weight = jest.fn();
  Weight.find = jest.fn();
  Weight.countDocuments = jest.fn();
  Weight.findOne = jest.fn();
  Weight.findOneAndDelete = jest.fn();
  return Weight;
});

const Weight = require('../../models/Weight');
const weightRoutes = require('../../routes/weightRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/weight', weightRoutes);
  return app;
}

// Weight.find(...).sort(...).limit(...).skip() resolves to the array.
function mockFindChain(result) {
  const skip = jest.fn().mockResolvedValue(result);
  const limit = jest.fn().mockReturnValue({ skip });
  const sort = jest.fn().mockReturnValue({ limit });
  Weight.find.mockReturnValue({ sort });
  return { sort, limit, skip };
}

describe('auth required', () => {
  test('GET /api/weight without a user is 401 and never touches the DB', async () => {
    const res = await request(buildApp()).get('/api/weight');
    expect(res.status).toBe(401);
    expect(Weight.find).not.toHaveBeenCalled();
  });

  test('DELETE /api/weight/:id without a user is 401', async () => {
    const res = await request(buildApp()).delete('/api/weight/w1');
    expect(res.status).toBe(401);
    expect(Weight.findOneAndDelete).not.toHaveBeenCalled();
  });
});

describe('GET /api/weight (getWeightLogs)', () => {
  test('list is scoped to the calling user', async () => {
    mockFindChain([{ _id: 'w1', userId: OWNER, weight_value: 180 }]);
    Weight.countDocuments.mockResolvedValue(1);

    const res = await request(buildApp()).get('/api/weight').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    // The query is filtered by the caller's own id — no way to read another user's list.
    expect(Weight.find).toHaveBeenCalledWith(expect.objectContaining({ userId: OWNER }));
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /api/weight/:id (getWeightLog)', () => {
  test('owner can read their own weight log', async () => {
    Weight.findOne.mockResolvedValue({ _id: 'w1', userId: OWNER, weight_value: 180 });

    const res = await request(buildApp()).get('/api/weight/w1').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(Weight.findOne).toHaveBeenCalledWith({ _id: 'w1', userId: OWNER });
    expect(res.body.data.userId).toBe(OWNER);
  });

  test("another user cannot read someone else's weight log (scoped query -> 404)", async () => {
    // The query includes OTHER's id, so OWNER's document never matches.
    Weight.findOne.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/weight/w1').set('x-test-user', OTHER);

    expect(res.status).toBe(404);
    expect(Weight.findOne).toHaveBeenCalledWith({ _id: 'w1', userId: OTHER });
    expect(res.body.data).toBeUndefined();
  });
});

describe('PUT /api/weight/:id (updateWeightLog)', () => {
  test("non-owner cannot update: 404 and no save", async () => {
    Weight.findOne.mockResolvedValue(null);

    const res = await request(buildApp())
      .put('/api/weight/w1')
      .set('x-test-user', OTHER)
      .send({ weight_value: 999 });

    expect(res.status).toBe(404);
    expect(Weight.findOne).toHaveBeenCalledWith({ _id: 'w1', userId: OTHER });
  });

  test('owner can update their own log', async () => {
    const doc = { _id: 'w1', userId: OWNER, weight_value: 180, save: jest.fn().mockResolvedValue(true) };
    Weight.findOne.mockResolvedValue(doc);
    // updateWeightLog reads settings for optional Garmin push; keep it disabled.
    const UserSettings = require('../../models/UserSettings');
    jest.spyOn(UserSettings, 'getOrCreate').mockResolvedValue({ garmin: { enabled: false } });

    const res = await request(buildApp())
      .put('/api/weight/w1')
      .set('x-test-user', OWNER)
      .send({ weight_value: 181.4 });

    expect(res.status).toBe(200);
    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(doc.weight_value).toBe(181.4);
  });
});

describe('DELETE /api/weight/:id (deleteWeightLog)', () => {
  test('non-owner delete is scoped and returns 404', async () => {
    Weight.findOneAndDelete.mockResolvedValue(null);

    const res = await request(buildApp()).delete('/api/weight/w1').set('x-test-user', OTHER);

    expect(res.status).toBe(404);
    expect(Weight.findOneAndDelete).toHaveBeenCalledWith({ _id: 'w1', userId: OTHER });
  });

  test('owner can delete their own log', async () => {
    Weight.findOneAndDelete.mockResolvedValue({ _id: 'w1', userId: OWNER });

    const res = await request(buildApp()).delete('/api/weight/w1').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(Weight.findOneAndDelete).toHaveBeenCalledWith({ _id: 'w1', userId: OWNER });
  });
});
