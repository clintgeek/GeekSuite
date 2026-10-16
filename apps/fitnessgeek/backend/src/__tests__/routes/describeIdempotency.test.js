// POST /api/logs/describe — contract C2 (Idempotency-Key) and the Phase 3.17
// day hint. A describe that timed out on the phone has usually still written
// on the server; the retry used to log the meal twice (REVIEW_2026-10 P2).
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

const describeRequest = (app, key, user) => {
  const req = request(app).post('/api/logs/describe').send({ text: 'fries', date: '2026-10-15', hour: 12 });
  if (key) req.set('Idempotency-Key', key);
  if (user) req.set('x-test-user', user);
  return req;
};

let n = 0;
const freshKey = () => `5f0c9a3e-1111-4222-8333-${String(++n).padStart(12, '0')}`;

beforeEach(() => {
  writes = 0;
  logDescription.mockReset();
  logDescription.mockImplementation(answer());
});

describe('Idempotency-Key (C2)', () => {
  test('a retry with the same key gets the first answer and writes nothing', async () => {
    const app = buildApp();
    const key = freshKey();

    const first = await describeRequest(app, key);
    const retry = await describeRequest(app, key);

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(logDescription).toHaveBeenCalledTimes(1);
  });

  test('a duplicate that lands while the first is still running shares it', async () => {
    const pending = [];
    logDescription.mockImplementation(() => new Promise((resolve) => {
      pending.push(() => answer()().then(resolve));
    }));
    const release = () => pending.forEach((go) => go());
    const app = buildApp();
    const key = freshKey();

    const one = describeRequest(app, key).then((r) => r);
    const two = describeRequest(app, key).then((r) => r);
    // Both are in the server before the first one finishes.
    await new Promise((r) => setTimeout(r, 50));
    release();
    const [a, b] = await Promise.all([one, two]);

    expect(a.body).toEqual(b.body);
    expect(logDescription).toHaveBeenCalledTimes(1);
  });

  test('the same key from a different person is a different request', async () => {
    const app = buildApp();
    const key = freshKey();
    await describeRequest(app, key, 'heather');
    await describeRequest(app, key, 'chef');
    expect(logDescription).toHaveBeenCalledTimes(2);
  });

  test('without the header nothing changes: two presses, two logs', async () => {
    const app = buildApp();
    await describeRequest(app, null);
    await describeRequest(app, null);
    expect(logDescription).toHaveBeenCalledTimes(2);
  });

  test('a failure is not remembered — "Try again" has to work', async () => {
    logDescription.mockImplementationOnce(async () => { throw new Error('mongo blip'); });
    const app = buildApp();
    const key = freshKey();

    const failed = await describeRequest(app, key);
    const retry = await describeRequest(app, key);

    expect(failed.status).toBe(500);
    expect(retry.status).toBe(200);
    expect(logDescription).toHaveBeenCalledTimes(2);
  });
});

describe('day words (Phase 3.17)', () => {
  test('the response says which day was heard', async () => {
    logDescription.mockImplementation(answer('yesterday'));
    const res = await describeRequest(buildApp(), null);
    expect(res.body.data.dayHint).toBe('yesterday');
    expect(res.body.data.dayWords).toEqual(['last night']);
  });

  test('and says null when none was', async () => {
    const res = await describeRequest(buildApp(), null);
    expect(res.body.data.dayHint).toBeNull();
  });
});
