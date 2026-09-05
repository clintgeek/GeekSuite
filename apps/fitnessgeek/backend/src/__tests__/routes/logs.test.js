// Ownership / data-isolation tests for the food-log routes (src/routes/logRoutes.js).
//
// Same hermetic approach as weight.test.js: the FoodLog / FoodItem /
// DailySummary / UserSettings Mongoose models, the auth middleware, and the
// Redis cache service are jest-mocked. No live Mongo, no Redis, no basegeek.
//
// Two isolation boundaries are covered:
//   1. Per-user scoping on single-log reads/deletes — every query carries
//      user_id: <caller>, so a cross-user id returns null -> 404.
//   2. The household-sharing gate on GET /household/:memberId/:date, which
//      must 403 unless the two users share a household AND the member has
//      opted into food-log sharing.

import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';
const OTHER = 'user-other';

// jest resolves an `unstable_mockModule` specifier against the *setup* file
// rather than this one, so every relative mock target is made absolute first.
// (Same shape as flockgeek's and storygeek's ESM suites.)
const mod = (p) => new URL(p, import.meta.url).pathname;

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) {
      return res.status(401).json({ success: false, error: { message: 'Authentication required' } });
    }
    req.user = { id: userId, _id: userId, userId };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

jest.unstable_mockModule(mod('../../services/cacheService.js'), () => ({
  __esModule: true,
  default: {
    invalidateUser: jest.fn().mockResolvedValue(true),
    invalidateUserAI: jest.fn().mockResolvedValue(true),
    invalidateUserReports: jest.fn().mockResolvedValue(true),
  },
}));

jest.unstable_mockModule(mod('../../models/FoodLog.js'), () => {
  const FoodLog = jest.fn();
  FoodLog.findOne = jest.fn();
  FoodLog.find = jest.fn();
  FoodLog.findById = jest.fn();
  FoodLog.deleteOne = jest.fn();
  FoodLog.getLogsForDate = jest.fn();
  FoodLog.getLogsByMealType = jest.fn();
  FoodLog.getRecentLogs = jest.fn();
  return { __esModule: true, default: FoodLog };
});

jest.unstable_mockModule(mod('../../models/FoodItem.js'), () => {
  const FoodItem = jest.fn();
  FoodItem.findById = jest.fn();
  FoodItem.findOrCreate = jest.fn();
  return { __esModule: true, default: FoodItem };
});

jest.unstable_mockModule(mod('../../models/DailySummary.js'), () => ({
  __esModule: true,
  default: { updateFromLogs: jest.fn().mockResolvedValue(true) },
}));

jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => {
  const UserSettings = jest.fn();
  UserSettings.getOrCreate = jest.fn();
  UserSettings.findOne = jest.fn();
  UserSettings.find = jest.fn();
  return { __esModule: true, default: UserSettings };
});

// Dynamic imports: they must resolve AFTER the mock registrations above.
const { default: FoodLog } = await import('../../models/FoodLog.js');
const { default: UserSettings } = await import('../../models/UserSettings.js');
const { default: logRoutes } = await import('../../routes/logRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/logs', logRoutes);
  return app;
}

describe('auth required', () => {
  test('GET /api/logs/:id without a user is 401', async () => {
    const res = await request(buildApp()).get('/api/logs/log1');
    expect(res.status).toBe(401);
    expect(FoodLog.findOne).not.toHaveBeenCalled();
  });
});

describe('GET /api/logs/:id (single food log)', () => {
  test('owner reads their own log', async () => {
    FoodLog.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ _id: 'log1', user_id: OWNER }),
    });

    const res = await request(buildApp()).get('/api/logs/log1').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(FoodLog.findOne).toHaveBeenCalledWith({ _id: 'log1', user_id: OWNER });
    expect(res.body.data.user_id).toBe(OWNER);
  });

  test("another user cannot read someone else's log (scoped -> 404)", async () => {
    FoodLog.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });

    const res = await request(buildApp()).get('/api/logs/log1').set('x-test-user', OTHER);

    expect(res.status).toBe(404);
    expect(FoodLog.findOne).toHaveBeenCalledWith({ _id: 'log1', user_id: OTHER });
  });
});

describe('DELETE /api/logs/:id', () => {
  test('non-owner delete is scoped and 404s without deleting', async () => {
    FoodLog.findOne.mockResolvedValue(null);

    const res = await request(buildApp()).delete('/api/logs/log1').set('x-test-user', OTHER);

    expect(res.status).toBe(404);
    expect(FoodLog.findOne).toHaveBeenCalledWith({ _id: 'log1', user_id: OTHER });
    expect(FoodLog.deleteOne).not.toHaveBeenCalled();
  });

  test('owner can delete their own log', async () => {
    FoodLog.findOne.mockResolvedValue({ _id: 'log1', user_id: OWNER, log_date: new Date('2026-01-01') });
    FoodLog.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = await request(buildApp()).delete('/api/logs/log1').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(FoodLog.deleteOne).toHaveBeenCalledWith({ _id: 'log1' });
  });
});

describe('GET /api/logs/household/:memberId/:date (household sharing gate)', () => {
  test('caller not in a household is 403', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ household: {} });
    UserSettings.findOne.mockResolvedValue({ household: { household_id: 'H1', share_food_logs: true } });

    const res = await request(buildApp())
      .get(`/api/logs/household/${OTHER}/2026-01-01`)
      .set('x-test-user', OWNER);

    expect(res.status).toBe(403);
    expect(FoodLog.getLogsForDate).not.toHaveBeenCalled();
  });

  test('member in a DIFFERENT household is 403', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ household: { household_id: 'H1' } });
    UserSettings.findOne.mockResolvedValue({ household: { household_id: 'H2', share_food_logs: true } });

    const res = await request(buildApp())
      .get(`/api/logs/household/${OTHER}/2026-01-01`)
      .set('x-test-user', OWNER);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_SAME_HOUSEHOLD');
    expect(FoodLog.getLogsForDate).not.toHaveBeenCalled();
  });

  test('same household but member has sharing OFF is 403', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ household: { household_id: 'H1' } });
    UserSettings.findOne.mockResolvedValue({ household: { household_id: 'H1', share_food_logs: false } });

    const res = await request(buildApp())
      .get(`/api/logs/household/${OTHER}/2026-01-01`)
      .set('x-test-user', OWNER);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SHARING_DISABLED');
    expect(FoodLog.getLogsForDate).not.toHaveBeenCalled();
  });

  test('same household with sharing ON returns the member logs', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ household: { household_id: 'H1' } });
    UserSettings.findOne.mockResolvedValue({
      household: { household_id: 'H1', share_food_logs: true, display_name: 'Partner' },
    });
    FoodLog.getLogsForDate.mockResolvedValue([{ _id: 'log9', user_id: OTHER }]);

    const res = await request(buildApp())
      .get(`/api/logs/household/${OTHER}/2026-01-01`)
      .set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(FoodLog.getLogsForDate).toHaveBeenCalledWith(OTHER, '2026-01-01');
    expect(res.body.data.logs).toHaveLength(1);
  });
});

describe('POST /api/logs/copy (cross-user copy gate)', () => {
  test('cannot copy from a user outside your household', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ household: { household_id: 'H1' } });
    UserSettings.findOne.mockResolvedValue({ household: { household_id: 'H2' } });

    const res = await request(buildApp())
      .post('/api/logs/copy')
      .set('x-test-user', OWNER)
      .send({ from_date: '2026-01-01', to_date: '2026-01-02', from_user_id: OTHER });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_SAME_HOUSEHOLD');
    expect(FoodLog.find).not.toHaveBeenCalled();
  });
});
