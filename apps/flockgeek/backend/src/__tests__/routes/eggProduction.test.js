// Ownership tests for apps/flockgeek/backend's egg-production routes.
//
// Same IDOR class as birds.test.js: every query is scoped by `ownerId` in
// the Mongoose filter (src/controllers/eggProductionController.js), so the
// fake model's real filter-matching is what actually exercises the
// ownership boundary rather than a canned per-test mock return value.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createFakeModel, buildAuthMiddlewareMock } from '../utils/fakeModel.js';

const OWNER = 'owner-1';
const OTHER = 'owner-2';

const AUTH_MIDDLEWARE_PATH = new URL('../../middleware/authMiddleware.js', import.meta.url).pathname;
const EGG_MODEL_PATH = new URL('../../models/EggProduction.js', import.meta.url).pathname;
const BIRD_MODEL_PATH = new URL('../../models/Bird.js', import.meta.url).pathname;

const authMock = buildAuthMiddlewareMock();
jest.unstable_mockModule(AUTH_MIDDLEWARE_PATH, () => authMock);

// Identities must stay stable across the file — see the comment in
// birds.test.js. Reset contents via `_reset()`, never reassign these.
const fakeEggProduction = createFakeModel([]);
const fakeBird = createFakeModel([]);
jest.unstable_mockModule(EGG_MODEL_PATH, () => ({ default: fakeEggProduction }));
jest.unstable_mockModule(BIRD_MODEL_PATH, () => ({ default: fakeBird }));

let eggProductionRoutes;

beforeAll(async () => {
  ({ default: eggProductionRoutes } = await import('../../routes/eggProduction.js'));
});

function seedRecord(overrides = {}) {
  return {
    _id: 'egg-1',
    ownerId: OWNER,
    date: new Date('2026-08-01T00:00:00.000Z'),
    eggsCount: 5,
    ...overrides,
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/egg-production', eggProductionRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeEggProduction._reset([seedRecord()]);
  fakeBird._reset([]);
});

describe('GET /api/egg-production/:id (getEggProduction)', () => {
  test('owner can read their own record', async () => {
    const res = await request(buildApp())
      .get('/api/egg-production/egg-1')
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.eggProduction.eggsCount).toBe(5);
  });

  test('another owner gets 404, not the record', async () => {
    const res = await request(buildApp())
      .get('/api/egg-production/egg-1')
      .set('x-test-owner', OTHER);

    expect(res.status).toBe(404);
  });

  test('unauthenticated request is rejected with 401 and never queries the model', async () => {
    const res = await request(buildApp()).get('/api/egg-production/egg-1');

    expect(res.status).toBe(401);
    expect(fakeEggProduction.findOne).not.toHaveBeenCalled();
  });
});

describe('PUT /api/egg-production/:id (updateEggProduction)', () => {
  test('owner can update their own record', async () => {
    const res = await request(buildApp())
      .put('/api/egg-production/egg-1')
      .set('x-test-owner', OWNER)
      .send({ eggsCount: 9 });

    expect(res.status).toBe(200);
    expect(res.body.data.eggProduction.eggsCount).toBe(9);
  });

  test('another owner cannot update the record — 404 and no mutation', async () => {
    const res = await request(buildApp())
      .put('/api/egg-production/egg-1')
      .set('x-test-owner', OTHER)
      .send({ eggsCount: 999 });

    expect(res.status).toBe(404);
    const stored = fakeEggProduction._docs().find((r) => r._id === 'egg-1');
    expect(stored.eggsCount).toBe(5);
  });
});

describe('DELETE /api/egg-production/:id (deleteEggProduction)', () => {
  test('owner can soft-delete their own record', async () => {
    const res = await request(buildApp())
      .delete('/api/egg-production/egg-1')
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    const stored = fakeEggProduction._docs().find((r) => r._id === 'egg-1');
    expect(stored.deletedAt).toBeInstanceOf(Date);
  });

  test('another owner cannot delete the record — 404 and it stays live', async () => {
    const res = await request(buildApp())
      .delete('/api/egg-production/egg-1')
      .set('x-test-owner', OTHER);

    expect(res.status).toBe(404);
    const stored = fakeEggProduction._docs().find((r) => r._id === 'egg-1');
    expect(stored.deletedAt).toBeUndefined();
  });

  test('unauthenticated request is rejected with 401 and nothing is deleted', async () => {
    const res = await request(buildApp()).delete('/api/egg-production/egg-1');

    expect(res.status).toBe(401);
    expect(fakeEggProduction.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('POST /api/egg-production (createEggProduction)', () => {
  test('creates a record scoped to the authenticated owner', async () => {
    const res = await request(buildApp())
      .post('/api/egg-production')
      .set('x-test-owner', OWNER)
      .send({ date: '2026-08-15', eggsCount: 3 });

    expect(res.status).toBe(201);
    expect(res.body.data.eggProduction.ownerId).toBe(OWNER);
  });

  test('missing eggsCount is rejected with 400', async () => {
    const res = await request(buildApp())
      .post('/api/egg-production')
      .set('x-test-owner', OWNER)
      .send({ date: '2026-08-15' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/egg-production (listEggProduction)', () => {
  test('only returns the caller\'s own records', async () => {
    fakeEggProduction._reset([
      seedRecord({ _id: 'egg-1', ownerId: OWNER }),
      seedRecord({ _id: 'egg-2', ownerId: OTHER }),
    ]);

    const res = await request(buildApp())
      .get('/api/egg-production')
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    const ids = res.body.data.eggProduction.map((r) => r._id);
    expect(ids).toEqual(['egg-1']);
  });
});
