// Regression coverage for the timezone fix in groupController.createGroup:
// when `startDate` is omitted, it must default to *today's UTC midnight*
// (a calendar date), not a bare `new Date()` instant — a bare instant would
// shift to the next UTC day for anyone west of UTC in the evening (the same
// class of bug as logging an egg after 6pm Central).

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createFakeModel, buildAuthMiddlewareMock } from '../utils/fakeModel.js';

const OWNER = 'owner-1';

const AUTH_MIDDLEWARE_PATH = new URL('../../middleware/authMiddleware.js', import.meta.url).pathname;
const GROUP_MODEL_PATH = new URL('../../models/Group.js', import.meta.url).pathname;

const authMock = buildAuthMiddlewareMock();
jest.unstable_mockModule(AUTH_MIDDLEWARE_PATH, () => authMock);

// Identity must stay stable — see the comment in birds.test.js.
const fakeGroup = createFakeModel([]);
jest.unstable_mockModule(GROUP_MODEL_PATH, () => ({ default: fakeGroup }));

let groupRoutes;

beforeAll(async () => {
  ({ default: groupRoutes } = await import('../../routes/groups.js'));
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/groups', groupRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeGroup._reset([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('POST /api/groups (createGroup) — startDate defaulting', () => {
  test('defaults startDate to UTC midnight of today, not the current instant', async () => {
    // 23:47 UTC — late enough in the day that a bare `new Date()` would
    // carry a non-midnight time-of-day, and late enough in the evening in
    // US timezones that a naive local-midnight computation would already
    // be the next calendar day.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-31T23:47:12.345Z'));

    const res = await request(buildApp())
      .post('/api/groups')
      .set('x-test-owner', OWNER)
      .send({ name: 'Brood A' });

    expect(res.status).toBe(201);
    const startDate = new Date(res.body.data.group.startDate);
    expect(startDate.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  test('an explicitly provided startDate is passed through untouched', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-31T23:47:12.345Z'));

    const res = await request(buildApp())
      .post('/api/groups')
      .set('x-test-owner', OWNER)
      .send({ name: 'Brood B', startDate: '2026-01-15T00:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(new Date(res.body.data.group.startDate).toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  test('name is required', async () => {
    const res = await request(buildApp())
      .post('/api/groups')
      .set('x-test-owner', OWNER)
      .send({});

    expect(res.status).toBe(400);
  });
});

// BURN_REVIEW #18: updateGroup used to spread req.body straight into the
// update document, so a body `ownerId` could reassign the record even
// though the filter is owner-scoped (`_id` + `ownerId`).
describe('PUT /api/groups/:id (updateGroup) — ownerId reassignment', () => {
  test('a body ownerId cannot reassign the group — it stays with its owner', async () => {
    fakeGroup._reset([{ _id: 'group-1', ownerId: OWNER, name: 'Brood A' }]);

    const res = await request(buildApp())
      .put('/api/groups/group-1')
      .set('x-test-owner', OWNER)
      .send({ name: 'Brood A Renamed', ownerId: 'owner-2' });

    expect(res.status).toBe(200);
    expect(res.body.data.group.ownerId).toBe(OWNER);
    const stored = fakeGroup._docs().find((g) => g._id === 'group-1');
    expect(stored.ownerId).toBe(OWNER);
  });
});
