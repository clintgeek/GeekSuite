// Going-over 2026-09-05 — hatch events: cross-owner references, and the
// unbounded chick-registration loop.
//
// Two bugs this pins, both in `hatchEventController.js`:
//
// 1. `createHatchEvent` and `registerChicks` looked their pairing up with
//    `Pairing.findById(...)` — no owner filter. The hatch event itself was
//    filed under the caller, so this was not theft; but `registerChicks`
//    reads `pairing.name` off that row and stamps it into the brood group's
//    and meat run's name, so a foreign pairing's name (and existence) leaked
//    into the caller's account by naming its id.
//
// 2. `registerChicks` took `count` from the body raw. A fractional value
//    produced fewer temp tag ids than birds — the surplus birds were created
//    with `tagId: undefined` and the loop failed part-way, leaving a
//    half-built brood behind — and a large one turned one HTTP request into
//    an unbounded insert loop.
//
// Same shape as birds.test.js: the real router and controller, with the models
// and the auth middleware replaced by module mocks.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createFakeModel, buildAuthMiddlewareMock } from '../utils/fakeModel.js';

const OWNER = 'owner-1';
const OTHER = 'owner-2';

const AUTH_MIDDLEWARE_PATH = new URL('../../middleware/authMiddleware.js', import.meta.url).pathname;
const HATCH_EVENT_MODEL_PATH = new URL('../../models/HatchEvent.js', import.meta.url).pathname;
const PAIRING_MODEL_PATH = new URL('../../models/Pairing.js', import.meta.url).pathname;
const BIRD_MODEL_PATH = new URL('../../models/Bird.js', import.meta.url).pathname;
const GROUP_MODEL_PATH = new URL('../../models/Group.js', import.meta.url).pathname;
const GROUP_MEMBERSHIP_MODEL_PATH = new URL('../../models/GroupMembership.js', import.meta.url).pathname;
const MEAT_RUN_MODEL_PATH = new URL('../../models/MeatRun.js', import.meta.url).pathname;

jest.unstable_mockModule(AUTH_MIDDLEWARE_PATH, () => buildAuthMiddlewareMock());

const fakeHatchEvent = createFakeModel([]);
const fakePairing = createFakeModel([]);
const fakeBird = createFakeModel([]);
const fakeGroup = createFakeModel([]);
const fakeGroupMembership = createFakeModel([]);
const fakeMeatRun = createFakeModel([]);

jest.unstable_mockModule(HATCH_EVENT_MODEL_PATH, () => ({ default: fakeHatchEvent }));
jest.unstable_mockModule(PAIRING_MODEL_PATH, () => ({ default: fakePairing }));
jest.unstable_mockModule(BIRD_MODEL_PATH, () => ({ default: fakeBird }));
jest.unstable_mockModule(GROUP_MODEL_PATH, () => ({ default: fakeGroup }));
jest.unstable_mockModule(GROUP_MEMBERSHIP_MODEL_PATH, () => ({ default: fakeGroupMembership }));
jest.unstable_mockModule(MEAT_RUN_MODEL_PATH, () => ({ default: fakeMeatRun }));

let hatchEventRoutes;
let MAX_CHICKS_PER_REGISTRATION;

beforeAll(async () => {
  ({ default: hatchEventRoutes } = await import('../../routes/hatchEvents.js'));
  ({ MAX_CHICKS_PER_REGISTRATION } = await import('../../controllers/hatchEventController.js'));
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/hatch-events', hatchEventRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeHatchEvent._reset([
    {
      _id: 'hatch-1',
      ownerId: OWNER,
      pairingId: 'pairing-own',
      purpose: 'layer',
      setDate: new Date('2026-08-01T00:00:00.000Z'),
      hatchDate: new Date('2026-08-22T00:00:00.000Z'),
      eggsSet: 12,
      save: async function save() { return this; },
    },
  ]);
  fakePairing._reset([
    { _id: 'pairing-own', ownerId: OWNER, name: 'Ours' },
    { _id: 'pairing-theirs', ownerId: OTHER, name: 'Their Secret Pen' },
  ]);
  fakeBird._reset([]);
  fakeGroup._reset([]);
  fakeGroupMembership._reset([]);
  fakeMeatRun._reset([]);
});

describe('POST /api/hatch-events (createHatchEvent)', () => {
  test('accepts a pairing the caller owns', async () => {
    const res = await request(buildApp())
      .post('/api/hatch-events')
      .set('x-test-owner', OWNER)
      .send({ pairingId: 'pairing-own', setDate: '2026-09-01', eggsSet: 6 });

    expect(res.status).toBe(201);
    expect(res.body.data.hatchEvent.ownerId).toBe(OWNER);
  });

  test("refuses another owner's pairing id, and files nothing", async () => {
    const res = await request(buildApp())
      .post('/api/hatch-events')
      .set('x-test-owner', OWNER)
      .send({ pairingId: 'pairing-theirs', setDate: '2026-09-01', eggsSet: 6 });

    expect(res.status).toBe(400);
    expect(fakeHatchEvent.create).not.toHaveBeenCalled();
    // and the foreign pairing's name is nowhere in the response
    expect(JSON.stringify(res.body)).not.toContain('Their Secret Pen');
  });
});

describe('POST /api/hatch-events/:id/register-chicks (registerChicks)', () => {
  test('registers a whole number of chicks under the caller', async () => {
    const res = await request(buildApp())
      .post('/api/hatch-events/hatch-1/register-chicks')
      .set('x-test-owner', OWNER)
      .send({ count: 3 });

    expect(res.status).toBe(201);
    expect(res.body.data.birds).toHaveLength(3);
    for (const bird of res.body.data.birds) {
      expect(bird.ownerId).toBe(OWNER);
      expect(bird.tagId).toBeTruthy();
    }
  });

  test('a fractional count is rejected rather than building a half brood', async () => {
    const res = await request(buildApp())
      .post('/api/hatch-events/hatch-1/register-chicks')
      .set('x-test-owner', OWNER)
      .send({ count: 2.5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(fakeBird.create).not.toHaveBeenCalled();
    expect(fakeGroup.create).not.toHaveBeenCalled();
  });

  test('a count past the ceiling is rejected rather than run as an unbounded insert loop', async () => {
    const res = await request(buildApp())
      .post('/api/hatch-events/hatch-1/register-chicks')
      .set('x-test-owner', OWNER)
      .send({ count: MAX_CHICKS_PER_REGISTRATION + 1 });

    expect(res.status).toBe(400);
    expect(fakeBird.create).not.toHaveBeenCalled();
  });

  test('a non-numeric count is rejected', async () => {
    const res = await request(buildApp())
      .post('/api/hatch-events/hatch-1/register-chicks')
      .set('x-test-owner', OWNER)
      .send({ count: '3' });

    expect(res.status).toBe(400);
    expect(fakeBird.create).not.toHaveBeenCalled();
  });

  test("a hatch event pointing at another owner's pairing cannot borrow its name", async () => {
    fakeHatchEvent._reset([
      {
        _id: 'hatch-x',
        ownerId: OWNER,
        pairingId: 'pairing-theirs',
        purpose: 'layer',
        setDate: new Date('2026-08-01T00:00:00.000Z'),
        eggsSet: 4,
        save: async function save() { return this; },
      },
    ]);

    const res = await request(buildApp())
      .post('/api/hatch-events/hatch-x/register-chicks')
      .set('x-test-owner', OWNER)
      .send({ count: 2 });

    expect(res.status).toBe(400);
    expect(fakeGroup.create).not.toHaveBeenCalled();
    expect(fakeBird.create).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('Their Secret Pen');
  });

  test("another owner cannot register chicks against this hatch event", async () => {
    const res = await request(buildApp())
      .post('/api/hatch-events/hatch-1/register-chicks')
      .set('x-test-owner', OTHER)
      .send({ count: 2 });

    expect(res.status).toBe(404);
    expect(fakeBird.create).not.toHaveBeenCalled();
  });
});
