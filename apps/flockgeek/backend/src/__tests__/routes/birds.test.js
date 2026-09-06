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

  // BURN_REVIEW #18: updateBird used to spread req.body straight into the
  // update document, so a caller who included `ownerId` in the body could
  // reassign the record to another account. The filter is owner-scoped
  // (`_id`+`ownerId`), so this was self-transfer rather than theft — but
  // the record still ends up owned by whoever the caller names.
  test('a body ownerId cannot reassign the bird — the record stays with its owner', async () => {
    const res = await request(buildApp())
      .put('/api/birds/bird-1')
      .set('x-test-owner', OWNER)
      .send({ name: 'Big Red', ownerId: OTHER });

    expect(res.status).toBe(200);
    expect(res.body.data.bird.ownerId).toBe(OWNER);
    const stored = fakeBird._docs().find((b) => b._id === 'bird-1');
    expect(stored.ownerId).toBe(OWNER);
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

  // BURN_REVIEW #4: createBird used to spread req.body last
  // (`Bird.create({ ownerId, ...data })`), so a body `ownerId` won the
  // spread and the record was created under whatever account the caller
  // named — not the session's.
  test('a body ownerId cannot set the owner — the bird is created for the session owner', async () => {
    const res = await request(buildApp())
      .post('/api/birds')
      .set('x-test-owner', OWNER)
      .send({ tagId: 'T-003', name: 'Spoofed', ownerId: OTHER });

    expect(res.status).toBe(201);
    expect(res.body.data.bird.ownerId).toBe(OWNER);
    const stored = fakeBird._docs().find((b) => b.tagId === 'T-003');
    expect(stored.ownerId).toBe(OWNER);
  });
});

// Going-over 2026-09-05 — the free-text search used to build its filter with
// `new RegExp(q, "i")` on the raw query value. A bird named "Hen (Big)" could
// not be searched for at all (`SyntaxError: Unterminated group` → 500), a `.`
// silently matched more than the user typed, and `(a+)+$` is catastrophic
// backtracking aimed at the API process.
describe('GET /api/birds (listBirds) — the ?q= search', () => {
  test('regex metacharacters are matched literally, not compiled', async () => {
    fakeBird._reset([
      seedBird({ _id: 'bird-paren', tagId: 'T-100', name: 'Hen (Big)' }),
      seedBird({ _id: 'bird-plain', tagId: 'T-101', name: 'Hen Big' }),
    ]);

    const res = await request(buildApp())
      .get('/api/birds')
      .query({ q: 'Hen (Big)' })
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    const names = res.body.data.birds.map((b) => b.name);
    expect(names).toContain('Hen (Big)');
    expect(names).not.toContain('Hen Big');
  });

  test('a wildcard-shaped query does not match everything', async () => {
    fakeBird._reset([
      seedBird({ _id: 'bird-1', tagId: 'T-200', name: 'Clucky' }),
      seedBird({ _id: 'bird-2', tagId: 'T-201', name: 'Pecky' }),
    ]);

    const res = await request(buildApp())
      .get('/api/birds')
      .query({ q: '.*' })
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.birds).toHaveLength(0);
  });

  test('a catastrophic-backtracking pattern is just a string to search for', async () => {
    fakeBird._reset([seedBird({ _id: 'bird-1', tagId: 'T-300', name: 'Clucky' })]);

    const res = await request(buildApp())
      .get('/api/birds')
      .query({ q: '(a+)+$' })
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.birds).toHaveLength(0);
  });
});

// Going-over 2026-09-05 — `parseInt` straight off the query string meant
// `?page=abc` produced `.skip(NaN)` (a driver error, i.e. a 500 on a
// malformed URL) and `?limit=1000000` asked Mongo for the whole collection.
describe('GET /api/birds (listBirds) — pagination bounds', () => {
  test('a garbage page is the first page, not a 500', async () => {
    const res = await request(buildApp())
      .get('/api/birds')
      .query({ page: 'abc' })
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(1);
  });

  test('an enormous limit is clamped in the echoed pagination', async () => {
    const res = await request(buildApp())
      .get('/api/birds')
      .query({ limit: '1000000' })
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.limit).toBeLessThanOrEqual(200);
  });
});
