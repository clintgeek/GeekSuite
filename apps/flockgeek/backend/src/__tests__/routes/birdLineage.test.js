// Going-over 2026-09-05 — the lineage reads used to cross owner boundaries.
//
// `getLineageBlacklist` and `canBreedWith` fetched a bird's origin pairing (and
// a membership's group) with `Model.findById(...)`, no owner filter. The bird
// itself was owner-scoped, so this only fired for a bird whose `pairingId`
// points across accounts — which the REST layer allowed until today, because
// `createBird`/`updateBird` never checked that a `pairingId` was the caller's.
//
// The payload is the leak: `getLineageBlacklist` returns the pairing's
// `roosterIds`/`henIds` as `blacklistedBirdIds` — another owner's bird ids,
// handed to a caller who only had to name a pairing id.
//
// These pin the owner filter on both reads.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createFakeModel, buildAuthMiddlewareMock } from '../utils/fakeModel.js';

const OWNER = 'owner-1';
const OTHER = 'owner-2';

const AUTH_MIDDLEWARE_PATH = new URL('../../middleware/authMiddleware.js', import.meta.url).pathname;
const BIRD_MODEL_PATH = new URL('../../models/Bird.js', import.meta.url).pathname;
const PAIRING_MODEL_PATH = new URL('../../models/Pairing.js', import.meta.url).pathname;
const GROUP_MODEL_PATH = new URL('../../models/Group.js', import.meta.url).pathname;
const GROUP_MEMBERSHIP_MODEL_PATH = new URL('../../models/GroupMembership.js', import.meta.url).pathname;

jest.unstable_mockModule(AUTH_MIDDLEWARE_PATH, () => buildAuthMiddlewareMock());

const fakeBird = createFakeModel([]);
const fakePairing = createFakeModel([]);
const fakeGroup = createFakeModel([]);
const fakeGroupMembership = createFakeModel([]);

jest.unstable_mockModule(BIRD_MODEL_PATH, () => ({ default: fakeBird }));
jest.unstable_mockModule(PAIRING_MODEL_PATH, () => ({ default: fakePairing }));
jest.unstable_mockModule(GROUP_MODEL_PATH, () => ({ default: fakeGroup }));
jest.unstable_mockModule(GROUP_MEMBERSHIP_MODEL_PATH, () => ({ default: fakeGroupMembership }));

let birdRoutes;

beforeAll(async () => {
  ({ default: birdRoutes } = await import('../../routes/birds.js'));
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/birds', birdRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeBird._reset([
    // The caller's bird, pointing at a pairing that belongs to someone else.
    { _id: 'bird-mine', ownerId: OWNER, tagId: 'M-1', pairingId: 'pairing-theirs' },
    // A second bird of the caller's, pointing at their own pairing.
    { _id: 'bird-own-line', ownerId: OWNER, tagId: 'M-2', pairingId: 'pairing-mine' },
  ]);
  fakePairing._reset([
    { _id: 'pairing-mine', ownerId: OWNER, name: 'Ours', roosterIds: ['r-mine'], henIds: ['h-mine'] },
    { _id: 'pairing-theirs', ownerId: OTHER, name: 'Theirs', roosterIds: ['r-theirs'], henIds: ['h-theirs'] },
  ]);
  fakeGroup._reset([]);
  fakeGroupMembership._reset([]);
});

describe('GET /api/birds/:id/lineage-blacklist', () => {
  test("does not surface another owner's pairing members", async () => {
    const res = await request(buildApp())
      .get('/api/birds/bird-mine/lineage-blacklist')
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.blacklistedBirdIds).not.toContain('r-theirs');
    expect(res.body.data.blacklistedBirdIds).not.toContain('h-theirs');
  });

  test("still reads the caller's own pairing", async () => {
    const res = await request(buildApp())
      .get('/api/birds/bird-own-line/lineage-blacklist')
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.blacklistedBirdIds).toEqual(
      expect.arrayContaining(['r-mine', 'h-mine'])
    );
  });

  test("another owner cannot read this bird's lineage at all", async () => {
    const res = await request(buildApp())
      .get('/api/birds/bird-mine/lineage-blacklist')
      .set('x-test-owner', OTHER);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/birds/:id/can-breed-with/:targetId', () => {
  test("a foreign origin pairing cannot decide the answer", async () => {
    fakeBird._reset([
      { _id: 'bird-a', ownerId: OWNER, tagId: 'A', pairingId: 'pairing-theirs' },
      // 'bird-b' *is* one of the foreign pairing's roosters, so before the fix
      // the unscoped `Pairing.findById` said "target_is_parent" — an answer
      // computed entirely from another account's row.
      { _id: 'r-theirs', ownerId: OWNER, tagId: 'B', pairingId: 'pairing-mine' },
    ]);

    const res = await request(buildApp())
      .get('/api/birds/bird-a/can-breed-with/r-theirs')
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.reason).not.toBe('target_is_parent');
  });

  test("the caller's own pairing still blocks a parent match", async () => {
    fakeBird._reset([
      { _id: 'bird-a', ownerId: OWNER, tagId: 'A', pairingId: 'pairing-mine' },
      { _id: 'r-mine', ownerId: OWNER, tagId: 'B', pairingId: 'pairing-theirs' },
    ]);

    const res = await request(buildApp())
      .get('/api/birds/bird-a/can-breed-with/r-mine')
      .set('x-test-owner', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.canBreed).toBe(false);
    expect(res.body.data.reason).toBe('target_is_parent');
  });
});
