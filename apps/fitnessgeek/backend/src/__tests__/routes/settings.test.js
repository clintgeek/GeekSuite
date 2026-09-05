// Tests for the per-user settings routes (src/routes/settingsRoutes.js).
//
// Hermetic: the UserSettings Mongoose model and the auth middleware are
// jest-mocked; no live Mongo, no basegeek. Coverage focuses on:
//   - auth is required on every settings route
//   - reads/writes are scoped to the caller's own userId
//   - the Garmin password never leaves the API at all (it is stored encrypted
//     and the response carries a `password_set` boolean instead)
//   - the household join/create guards (already-in-household, unknown code)

import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';

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

jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => {
  const UserSettings = jest.fn();
  UserSettings.getOrCreate = jest.fn();
  UserSettings.findOneAndUpdate = jest.fn();
  UserSettings.updateSettings = jest.fn();
  UserSettings.find = jest.fn();
  UserSettings.findOne = jest.fn();
  return { __esModule: true, default: UserSettings };
});

// Dynamic imports: they must resolve AFTER the mock registrations above.
const { default: UserSettings } = await import('../../models/UserSettings.js');
const { default: settingsRoutes } = await import('../../routes/settingsRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRoutes);
  return app;
}

describe('auth required', () => {
  test('GET /api/settings without a user is 401', async () => {
    const res = await request(buildApp()).get('/api/settings');
    expect(res.status).toBe(401);
    expect(UserSettings.getOrCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/settings', () => {
  test('reads the caller-scoped settings and drops the Garmin password entirely', async () => {
    // What the model hands back is the AES-256-GCM ciphertext, because
    // toObject() does not run the schema's decrypt getter. Shipping a user's
    // ciphertext is still shipping it, so the route deletes the field.
    const stored = 'v1:0011223344556677889900aa:bbccddeeff00112233445566778899aa:deadbeef';
    UserSettings.getOrCreate.mockResolvedValue({
      toObject: () => ({
        user_id: OWNER,
        theme: 'dark',
        garmin: { enabled: true, username: 'me@example.com', password: stored },
      }),
    });

    const res = await request(buildApp()).get('/api/settings').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    // Settings are fetched for the authenticated user only.
    expect(UserSettings.getOrCreate).toHaveBeenCalledWith(OWNER);
    // Neither the plaintext nor the stored ciphertext may reach the client.
    expect(res.body.data.garmin).not.toHaveProperty('password');
    expect(JSON.stringify(res.body)).not.toContain(stored);
    // The form only needs to know whether one is on file.
    expect(res.body.data.garmin.password_set).toBe(true);
    // Everything else survives.
    expect(res.body.data.garmin.username).toBe('me@example.com');
    expect(res.body.data.theme).toBe('dark');
  });

  test('password_set is false when no credential is stored', async () => {
    UserSettings.getOrCreate.mockResolvedValue({
      toObject: () => ({ user_id: OWNER, garmin: { enabled: false, username: '' } }),
    });

    const res = await request(buildApp()).get('/api/settings').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.garmin.password_set).toBe(false);
    expect(res.body.data.garmin).not.toHaveProperty('password');
  });
});

describe('POST /api/settings/household/join', () => {
  test('rejects an unknown household code with 404', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ household: {} });
    UserSettings.findOne.mockResolvedValue(null); // no such household

    const res = await request(buildApp())
      .post('/api/settings/household/join')
      .set('x-test-user', OWNER)
      .send({ household_id: 'NOPE12' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HOUSEHOLD_NOT_FOUND');
  });

  test('rejects joining when already in a household (400)', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ household: { household_id: 'H1' } });

    const res = await request(buildApp())
      .post('/api/settings/household/join')
      .set('x-test-user', OWNER)
      .send({ household_id: 'H2' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ALREADY_IN_HOUSEHOLD');
  });
});

describe('POST /api/settings/household/create', () => {
  test('rejects creating a household when already in one (400)', async () => {
    UserSettings.getOrCreate.mockResolvedValue({ household: { household_id: 'H1' } });

    const res = await request(buildApp())
      .post('/api/settings/household/create')
      .set('x-test-user', OWNER)
      .send({ display_name: 'Me' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ALREADY_IN_HOUSEHOLD');
  });
});
