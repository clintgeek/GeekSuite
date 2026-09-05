// Input-validation coverage for settingsRoutes.js's PUT/PATCH surface
// (PUT /, PUT /ai, PUT /dashboard, PUT /household), added as part of
// DOCS/TODO_ORDER.md #22.
//
// Hermetic: the UserSettings model and auth middleware are jest-mocked, no
// live Mongo. See src/validation/schemas/settings.js for why `_id`/`__v` are
// stripped before validation (every nested object in the shared UserSettings
// schema is a Mongoose single-nested subdocument and carries its own _id,
// which the real frontend round-trips from GET straight back into PUT).

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
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

function fakeSettingsDoc(overrides = {}) {
  return {
    toObject: () => ({ user_id: OWNER, ...overrides }),
    ...overrides,
  };
}

beforeEach(() => {
  UserSettings.findOneAndUpdate.mockResolvedValue(fakeSettingsDoc());
  UserSettings.updateSettings.mockResolvedValue(fakeSettingsDoc({ ai: { enabled: true }, dashboard: {} }));
});

describe('PUT /api/settings validation', () => {
  test('accepted: a normal partial settings update round-trips (including a subdocument _id, stripped before validation)', async () => {
    const res = await request(buildApp())
      .put('/api/settings')
      .set('x-test-user', OWNER)
      .send({
        theme: 'dark',
        nutrition_goal: { _id: '650f1f77bcf86cd799439011', enabled: true, daily_calorie_target: 1800 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(UserSettings.findOneAndUpdate).toHaveBeenCalled();
  });

  test('rejected: an unrecognized top-level field is a 400 (previously silently dropped by the route\'s own allow-list)', async () => {
    const res = await request(buildApp())
      .put('/api/settings')
      .set('x-test-user', OWNER)
      .send({ not_a_real_field: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // zod's `.strict()` reports unrecognized keys as one root-level issue
    // naming them, rather than a per-key path.
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('not_a_real_field') })])
    );
    expect(UserSettings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('rejected: theme outside its enum is a 400', async () => {
    const res = await request(buildApp())
      .put('/api/settings')
      .set('x-test-user', OWNER)
      .send({ theme: 'solarized' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'theme' })])
    );
  });
});

describe('PUT /api/settings/ai validation', () => {
  test('accepted: toggling a known AI feature', async () => {
    const res = await request(buildApp())
      .put('/api/settings/ai')
      .set('x-test-user', OWNER)
      .send({ enabled: true, features: { meal_suggestions: false } });

    expect(res.status).toBe(200);
    expect(UserSettings.updateSettings).toHaveBeenCalledWith(
      OWNER,
      { ai: { enabled: true, features: { meal_suggestions: false } } }
    );
  });

  test('rejected: an unknown AI feature key is a 400', async () => {
    const res = await request(buildApp())
      .put('/api/settings/ai')
      .set('x-test-user', OWNER)
      .send({ features: { time_travel: true } });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({
        path: 'features',
        message: expect.stringContaining('time_travel'),
      })])
    );
  });
});

describe('PUT /api/settings/dashboard validation', () => {
  test('accepted: reordering cards', async () => {
    const res = await request(buildApp())
      .put('/api/settings/dashboard')
      .set('x-test-user', OWNER)
      .send({ card_order: ['current_weight', 'blood_pressure'] });

    expect(res.status).toBe(200);
    expect(UserSettings.updateSettings).toHaveBeenCalled();
  });

  test('rejected: show_current_weight as a string instead of a boolean is a 400', async () => {
    const res = await request(buildApp())
      .put('/api/settings/dashboard')
      .set('x-test-user', OWNER)
      .send({ show_current_weight: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'show_current_weight' })])
    );
  });
});

describe('PUT /api/settings/household validation', () => {
  test('accepted: a single-field sharing patch (the shape HouseholdSettings.jsx actually sends)', async () => {
    UserSettings.getOrCreate.mockResolvedValue({
      household: { household_id: 'ABC123' },
      save: jest.fn().mockResolvedValue(true),
    });

    const res = await request(buildApp())
      .put('/api/settings/household')
      .set('x-test-user', OWNER)
      .send({ share_weight: true });

    expect(res.status).toBe(200);
  });

  test('rejected: attempting to set household_id through this route is a 400 (it is not part of this route\'s contract)', async () => {
    UserSettings.getOrCreate.mockResolvedValue({
      household: { household_id: 'ABC123' },
      save: jest.fn().mockResolvedValue(true),
    });

    const res = await request(buildApp())
      .put('/api/settings/household')
      .set('x-test-user', OWNER)
      .send({ household_id: 'HIJACKED' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('household_id') })])
    );
  });
});

describe('400 shape', () => {
  test('matches { success:false, error: { message, code, details: [{ path, message }] } }', async () => {
    const res = await request(buildApp())
      .put('/api/settings')
      .set('x-test-user', OWNER)
      .send({ theme: 'nope' });

    expect(res.body).toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
      },
    });
    expect(res.body.error.details[0]).toMatchObject({
      path: expect.any(String),
      message: expect.any(String),
    });
  });
});
