// POST /api/logs/describe: input that can never be logged is a 400 that says
// why, not a 500 "Try again" that no retry can fix.
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mod = (p) => new URL(p, import.meta.url).pathname;

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user') || 'heather';
    req.user = { id: userId, _id: userId, userId };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));
jest.unstable_mockModule(mod('../../models/FoodLog.js'), () => ({ __esModule: true, default: {} }));
jest.unstable_mockModule(mod('../../models/DailySummary.js'), () => ({ __esModule: true, default: {} }));
jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => ({ __esModule: true, default: {} }));

let writes = 0;
const logDescription = jest.fn();
jest.unstable_mockModule(mod('../../services/describeAndLogService.js'), () => ({
  __esModule: true,
  default: { logDescription }
}));

const { default: logRoutes } = await import('../../routes/logRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/logs', logRoutes);
  return app;
}

const answer = (dayHint = null) => async () => {
  writes += 1;
  return {
    logged: [{ logId: `log-${writes}`, name: 'Fries', calories: 365 }],
    skipped: [],
    logIds: [`log-${writes}`],
    questions: [],
    parsed: { dayHint, dayWords: dayHint ? ['last night'] : [] }
  };
};

const post = (body) => request(buildApp()).post('/api/logs/describe').send(body);

beforeEach(() => {
  logDescription.mockReset();
  logDescription.mockImplementation(answer());
});

describe('POST /api/logs/describe rejects what it cannot log, as a 400 in words', () => {
  test('a date nobody can read', async () => {
    for (const date of ['yesterday-ish', '2026-13-45', { day: 1 }]) {
      const res = await post({ text: 'two eggs', date, hour: 8 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(logDescription).not.toHaveBeenCalled();
  });

  test('text that is not text', async () => {
    for (const text of [{ a: 1 }, ['eggs'], 42]) {
      const res = await post({ text, date: '2026-10-15', hour: 8 });
      expect(res.status).toBe(400);
    }
    expect(logDescription).not.toHaveBeenCalled();
  });

  test('a paste far longer than any meal', async () => {
    const res = await post({ text: 'eggs and '.repeat(400), date: '2026-10-15', hour: 8 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/too long/);
    expect(logDescription).not.toHaveBeenCalled();
  });

  test('an ordinary description still goes through, on the day sent', async () => {
    const res = await post({ text: 'two eggs and toast', date: '2026-10-15', hour: 8 });
    expect(res.status).toBe(200);
    expect(logDescription.mock.calls[0][1].date.toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });
});
