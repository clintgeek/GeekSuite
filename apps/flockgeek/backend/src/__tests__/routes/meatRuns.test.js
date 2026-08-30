// Coverage for meatRunController.recordMortality's date handling: mortality
// notes should be stamped with the caller-supplied local calendar date
// (YYYY-MM-DD, same convention as egg production/hatch dates elsewhere in
// FlockGeek) when given, and only fall back to the server clock's UTC date
// when the caller didn't supply one — the server has no user timezone, so
// deriving "today" from its own clock is a last resort, not the default.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createFakeModel, buildAuthMiddlewareMock } from '../utils/fakeModel.js';

const OWNER = 'owner-1';

const AUTH_MIDDLEWARE_PATH = new URL('../../middleware/authMiddleware.js', import.meta.url).pathname;
const MEATRUN_MODEL_PATH = new URL('../../models/MeatRun.js', import.meta.url).pathname;

const authMock = buildAuthMiddlewareMock();
jest.unstable_mockModule(AUTH_MIDDLEWARE_PATH, () => authMock);

// Identity must stay stable — see the comment in birds.test.js.
const fakeMeatRun = createFakeModel([]);
jest.unstable_mockModule(MEATRUN_MODEL_PATH, () => ({ default: fakeMeatRun }));

let meatRunRoutes;

beforeAll(async () => {
  ({ default: meatRunRoutes } = await import('../../routes/meatRuns.js'));
});

function seedMeatRun(overrides = {}) {
  const doc = {
    _id: 'run-1',
    ownerId: OWNER,
    startCount: 20,
    status: 'active',
    ...overrides,
  };
  doc.save = jest.fn(async function save() {
    return this;
  });
  return doc;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/meat-runs', meatRunRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeMeatRun._reset([seedMeatRun()]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('POST /api/meat-runs/:id/record-mortality', () => {
  test('uses the caller-supplied calendar date, ignoring the server clock', async () => {
    jest.useFakeTimers();
    // Server clock is already "tomorrow" relative to the caller's date —
    // the fix means this must not leak into the stored note.
    jest.setSystemTime(new Date('2026-08-31T02:00:00.000Z'));

    const res = await request(buildApp())
      .post('/api/meat-runs/run-1/record-mortality')
      .set('x-test-owner', OWNER)
      .send({ count: 2, notes: 'found two dead', date: '2026-08-30' });

    expect(res.status).toBe(200);
    expect(res.body.data.meatRun.mortalityNotes).toBe('2026-08-30: found two dead');
    expect(res.body.data.meatRun.mortalityCount).toBe(2);
  });

  test('falls back to the server clock\'s UTC date when no date is supplied', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-30T10:00:00.000Z'));

    const res = await request(buildApp())
      .post('/api/meat-runs/run-1/record-mortality')
      .set('x-test-owner', OWNER)
      .send({ count: 1, notes: 'one dead, no date given' });

    expect(res.status).toBe(200);
    expect(res.body.data.meatRun.mortalityNotes).toBe('2026-08-30: one dead, no date given');
  });

  test('mortality count accumulates on top of prior mortality', async () => {
    fakeMeatRun._reset([seedMeatRun({ mortalityCount: 3 })]);

    const res = await request(buildApp())
      .post('/api/meat-runs/run-1/record-mortality')
      .set('x-test-owner', OWNER)
      .send({ count: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.meatRun.mortalityCount).toBe(5);
  });

  test('appends a new dated line to existing mortality notes rather than replacing them', async () => {
    fakeMeatRun._reset([seedMeatRun({ mortalityNotes: '2026-08-20: first loss' })]);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-30T10:00:00.000Z'));

    const res = await request(buildApp())
      .post('/api/meat-runs/run-1/record-mortality')
      .set('x-test-owner', OWNER)
      .send({ count: 1, notes: 'second loss' });

    expect(res.body.data.meatRun.mortalityNotes).toBe('2026-08-20: first loss\n2026-08-30: second loss');
  });

  test('rejects a missing/zero count with 400', async () => {
    const res = await request(buildApp())
      .post('/api/meat-runs/run-1/record-mortality')
      .set('x-test-owner', OWNER)
      .send({ count: 0 });

    expect(res.status).toBe(400);
  });

  test('another owner cannot record mortality against this meat run — 404', async () => {
    const res = await request(buildApp())
      .post('/api/meat-runs/run-1/record-mortality')
      .set('x-test-owner', 'owner-2')
      .send({ count: 1 });

    expect(res.status).toBe(404);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(buildApp())
      .post('/api/meat-runs/run-1/record-mortality')
      .send({ count: 1 });

    expect(res.status).toBe(401);
    expect(fakeMeatRun.findOne).not.toHaveBeenCalled();
  });
});
