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

// ---------------------------------------------------------------------------
// PUT /api/settings — the write shape
// ---------------------------------------------------------------------------
//
// This route used to compose an update object with TWO `$set` keys — the
// Garmin dot-paths first, then a second `$set` for the ordinary fields — so
// the second silently won and any body carrying both dropped the Garmin write
// entirely. That is every save the Settings page makes. (BURN_REVIEW #6.)
//
// The throwaway key below is fixed and worthless; crypto-vault reads
// KEY_VAULT_SECRET once at module load, so it is set before the first import
// that reaches it.
process.env.KEY_VAULT_SECRET = 'ab'.repeat(32);

const { default: mongoose } = await import('mongoose');
const vault = await import('@geeksuite/crypto-vault');
const schemaModule = await import('@geeksuite/schemas/fitnessgeek/userSettings');
const { createUserSettingsSchema } = schemaModule.default ?? schemaModule;

/** The update object the route handed the model. */
const capturedUpdate = () => UserSettings.findOneAndUpdate.mock.calls[0][1];

/**
 * Run the shared schema's registered pre-middleware over a real (unexecuted)
 * mongoose query carrying `update`, exactly as the live write would. Same
 * technique as __tests__/security/garminPasswordEncryption.test.js — this
 * suite has no Mongo, and a hand-rolled stand-in would not prove the hook is
 * registered on the operation the route actually uses.
 */
let modelSeq = 0;
const runUpdateHooks = async (update) => {
  const schema = createUserSettingsSchema(mongoose);
  const Model = mongoose.model(`UserSettingsRoute_${modelSeq += 1}`, schema);
  const query = Model.findOneAndUpdate({ user_id: OWNER }, update);
  await new Promise((resolve, reject) => {
    schema.s.hooks.execPre('findOneAndUpdate', query, [], (err) => (err ? reject(err) : resolve()));
  });
  return query.getUpdate();
};

describe('PUT /api/settings write shape', () => {
  const okDoc = () => ({ toObject: () => ({ user_id: OWNER }) });

  test('a Garmin write in the same body as an ordinary field survives — one $set, dot paths', async () => {
    UserSettings.findOneAndUpdate.mockResolvedValue(okDoc());

    const res = await request(buildApp())
      .put('/api/settings')
      .set('x-test-user', OWNER)
      .send({ garmin: { enabled: true, username: 'me@example.com' }, theme: 'dark' });

    expect(res.status).toBe(200);
    const update = capturedUpdate();
    // Exactly one $set — the old shape had two and the second overwrote the first.
    expect(Object.keys(update)).toEqual(['$set']);
    expect(update.$set).toEqual({
      'garmin.enabled': true,
      'garmin.username': 'me@example.com',
      theme: 'dark',
    });
    // Scoped to the caller.
    expect(UserSettings.findOneAndUpdate.mock.calls[0][0]).toEqual({ user_id: OWNER });
  });

  test('every sub-document is dotted, so a partial nutrition_goal save merges', async () => {
    UserSettings.findOneAndUpdate.mockResolvedValue(okDoc());

    await request(buildApp())
      .put('/api/settings')
      .set('x-test-user', OWNER)
      .send({ nutrition_goal: { enabled: false } });

    // Not `{nutrition_goal: {enabled:false}}`, which would replace the whole
    // sub-document and erase bmr/tdee/weekly_schedule/keto.
    expect(capturedUpdate().$set).toEqual({ 'nutrition_goal.enabled': false });
  });

  test('an array field is written whole, not merged index by index', async () => {
    UserSettings.findOneAndUpdate.mockResolvedValue(okDoc());

    await request(buildApp())
      .put('/api/settings')
      .set('x-test-user', OWNER)
      .send({ dashboard: { card_order: ['weight_goal', 'nutrition_goal'] } });

    expect(capturedUpdate().$set).toEqual({
      'dashboard.card_order': ['weight_goal', 'nutrition_goal'],
    });
  });

  test('a Garmin password sent through REST reaches Mongo encrypted', async () => {
    UserSettings.findOneAndUpdate.mockResolvedValue(okDoc());
    const PLAINTEXT = 'garmin-pass-example';

    const res = await request(buildApp())
      .put('/api/settings')
      .set('x-test-user', OWNER)
      .send({ garmin: { enabled: true, username: 'me@example.com', password: PLAINTEXT }, theme: 'dark' });

    expect(res.status).toBe(200);
    // The route's own update still carries the credential (it is on its way to
    // the model)...
    expect(capturedUpdate().$set['garmin.password']).toBe(PLAINTEXT);

    // ...and the shared schema's pre(findOneAndUpdate) hook packs it before it
    // reaches the driver. The dot-path shape is the one this route writes.
    const hooked = await runUpdateHooks(capturedUpdate());
    const stored = hooked.$set['garmin.password'];
    expect(vault.isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain(PLAINTEXT);
    expect(vault.decrypt(stored)).toBe(PLAINTEXT);
    // The rest of the same $set is untouched.
    expect(hooked.$set['garmin.username']).toBe('me@example.com');
    expect(hooked.$set.theme).toBe('dark');
    // And the response never carries it back.
    expect(JSON.stringify(res.body)).not.toContain(PLAINTEXT);
  });

  test('household is not writable here — the ownership hazard the gateway refuses', async () => {
    UserSettings.findOneAndUpdate.mockResolvedValue(okDoc());

    const res = await request(buildApp())
      .put('/api/settings')
      .set('x-test-user', OWNER)
      .send({ household: { share_weight: true }, theme: 'dark' });

    expect(res.status).toBe(200);
    // Shaped by zod, then dropped by the route's allow-list — same answer
    // basegeek's updateFitnessUserSettings gives. Membership and the share
    // flags belong to PUT /household and /household/create|join|leave.
    expect(capturedUpdate().$set).toEqual({ theme: 'dark' });
  });

  test('a body with nothing writable in it does not send an empty $set', async () => {
    UserSettings.findOneAndUpdate.mockResolvedValue(okDoc());

    const res = await request(buildApp())
      .put('/api/settings')
      .set('x-test-user', OWNER)
      .send({ household: { share_meals: true } });

    expect(res.status).toBe(200);
    // An empty $set is a MongoDB error; the upsert falls back to $setOnInsert.
    expect(capturedUpdate()).toEqual({ $setOnInsert: { user_id: OWNER } });
  });
});
