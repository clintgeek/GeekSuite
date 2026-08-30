// Ownership tests for apps/flockgeek/backend's bird routes/controller.
//
// Unlike storygeek (which checks ownership after fetching a document by id
// alone), flockgeek scopes every Bird query by `ownerId` directly in the
// Mongoose filter (see src/controllers/birdController.js). The IDOR class
// here is therefore "does the filter actually include the caller's
// ownerId?" — which is exactly what the fake model in fakeModel.js checks:
// if a controller forgot ownerId in a filter, the fake would incorrectly
// match another owner's document and these assertions would fail.
//
// Runs against the real Express router with the Bird model and auth
// middleware replaced by jest module mocks — no live Mongo, no network.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createFakeModel, buildAuthMiddlewareMock } from '../utils/fakeModel.js';

const OWNER = 'owner-1';
const OTHER = 'owner-2';

const AUTH_MIDDLEWARE_PATH = new URL('../../middleware/authMiddleware.js', import.meta.url).pathname;
const BIRD_MODEL_PATH = new URL('../../models/Bird.js', import.meta.url).pathname;

const authMock = buildAuthMiddlewareMock();
jest.unstable_mockModule(AUTH_MIDDLEWARE_PATH, () => authMock);

// `fakeBird`'s identity must stay stable across the file: the mock factory
// below is captured once (at import time, inside beforeAll), so reassigning
// this variable in beforeEach would silently detach the controller from the
// per-test fixtures. Reset its contents via `_reset()` instead.
const fakeBird = createFakeModel([]);
jest.unstable_mockModule(BIRD_MODEL_PATH, () => ({
  default: fakeBird,
}));

let birdRoutes;

beforeAll(async () => {
  ({ default: birdRoutes } = await import('../../routes/birds.js'));
});

function seedBird(overrides = {}) {
  return {
    _id: 'bird-1',
    ownerId: OWNER,
    tagId: 'T-001',
    name: 'Henrietta',
    sex: 'hen',
    status: 'active',
    ...overrides,
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/birds', birdRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeBird._reset([seedBird()]);
});

describe('GET /api/birds/:id (getBird)', () => {
  test('owner can read their own bird', async () => {
    const res = await request(buildApp())
      .get('/api/birds/bird-1')
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.bird.tagId).toBe('T-001');
  });

  test('another owner gets 404, not the bird', async () => {
    const res = await request(buildApp())
      .get('/api/birds/bird-1')
      .set('x-test-owner', OTHER);

    expect(res.status).toBe(404);
    expect(res.body.data).toBeUndefined();
  });

  test('unauthenticated request is rejected with 401 and never queries the model', async () => {
    const res = await request(buildApp()).get('/api/birds/bird-1');

    expect(res.status).toBe(401);
    expect(fakeBird.findOne).not.toHaveBeenCalled();
  });

  test('unknown bird id yields 404', async () => {
    const res = await request(buildApp())
      .get('/api/birds/does-not-exist')
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/birds/:id (updateBird)', () => {
  test('owner can update their own bird', async () => {
    const res = await request(buildApp())
      .put('/api/birds/bird-1')
      .set('x-test-owner', OWNER)
      .send({ name: 'Big Red' });

    expect(res.status).toBe(200);
    expect(res.body.data.bird.name).toBe('Big Red');
  });

  test('another owner cannot update the bird — 404 and no mutation', async () => {
    const res = await request(buildApp())
      .put('/api/birds/bird-1')
      .set('x-test-owner', OTHER)
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(404);
    const stored = fakeBird._docs().find((b) => b._id === 'bird-1');
    expect(stored.name).toBe('Henrietta');
  });
});

describe('DELETE /api/birds/:id (deleteBird)', () => {
  test('owner can soft-delete their own bird', async () => {
    const res = await request(buildApp())
      .delete('/api/birds/bird-1')
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    const stored = fakeBird._docs().find((b) => b._id === 'bird-1');
    expect(stored.deletedAt).toBeInstanceOf(Date);
  });

  test('another owner cannot delete the bird — 404 and it stays live', async () => {
    const res = await request(buildApp())
      .delete('/api/birds/bird-1')
      .set('x-test-owner', OTHER);

    expect(res.status).toBe(404);
    const stored = fakeBird._docs().find((b) => b._id === 'bird-1');
    expect(stored.deletedAt).toBeUndefined();
  });

  test('unauthenticated request is rejected with 401 and nothing is deleted', async () => {
    const res = await request(buildApp()).delete('/api/birds/bird-1');

    expect(res.status).toBe(401);
    expect(fakeBird.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('POST /api/birds (createBird)', () => {
  test('creates a bird scoped to the authenticated owner', async () => {
    const res = await request(buildApp())
      .post('/api/birds')
      .set('x-test-owner', OWNER)
      .send({ tagId: 'T-002', name: 'Clucky' });

    expect(res.status).toBe(201);
    expect(res.body.data.bird.ownerId).toBe(OWNER);
  });

  test('missing tagId is rejected with 400', async () => {
    const res = await request(buildApp())
      .post('/api/birds')
      .set('x-test-owner', OWNER)
      .send({ name: 'No Tag' });

    expect(res.status).toBe(400);
  });

  test('duplicate tagId for the same owner is rejected with 400', async () => {
    const res = await request(buildApp())
      .post('/api/birds')
      .set('x-test-owner', OWNER)
      .send({ tagId: 'T-001' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DUPLICATE');
  });

  test('a second owner may reuse the same tagId (uniqueness is per-owner)', async () => {
    const res = await request(buildApp())
      .post('/api/birds')
      .set('x-test-owner', OTHER)
      .send({ tagId: 'T-001', name: 'Also T-001' });

    expect(res.status).toBe(201);
  });
});
