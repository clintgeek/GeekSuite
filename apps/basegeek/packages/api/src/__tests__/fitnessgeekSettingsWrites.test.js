/**
 * fitnessgeekSettingsWrites.test.js
 *
 * `updateFitnessUserSettings` is a PARTIAL save. Every client of it sends the
 * two or three keys the user just touched, never the whole document — the
 * Settings page sends `garmin: {enabled, username}` with `password` only when
 * it is retyped, and AIGoalPlanner's "Remove Goal" sends
 * `{nutrition_goal: {enabled: false}}`.
 *
 * `UserSettings.updateSettings` hands its argument to `{ $set: … }` verbatim,
 * and `$set` with a NESTED object replaces the whole sub-document. So those
 * two saves used to delete the encrypted Garmin credential, both OAuth tokens
 * and `last_connected_at`; and start/target weight, bmr, tdee,
 * weekly_schedule and the entire keto block, respectively. (BURN_REVIEW #5.)
 *
 * What is pinned here:
 *   1. the flattener itself — dot paths for sub-documents, whole values for
 *      arrays, Dates and the Mixed OAuth token blobs
 *   2. a partial `garmin` save keeps the password and the tokens
 *   3. `garmin.password` is still encrypted at rest in the dot-path form
 *   4. a partial `nutrition_goal` save keeps its siblings
 *   5. `household` is still refused outright (BURN_REVIEW #9's gateway half —
 *      fitnessgeek's REST twin now mirrors it)
 */

import mongoose from 'mongoose';
import * as vault from '@geeksuite/crypto-vault';

const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');
const { resolvers, flattenSettingsUpdate } = await import('../graphql/fitnessgeek/resolvers.js');

const ALICE = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: userId } } : {});
const M = resolvers.Mutation;

const PASSWORD = 'garmin-pass-example';
const OAUTH1 = { oauth_token: 'o1-token', oauth_token_secret: 'o1-secret' };
const OAUTH2 = { access_token: 'o2-access', refresh_token: 'o2-refresh', expires_in: 3600 };
const CONNECTED_AT = new Date('2026-08-01T12:00:00.000Z');

/** The stored (still packed) value — the path getter would decrypt it. */
const storedPassword = (doc) => doc.get('garmin.password', null, { getters: false });

const seed = () =>
  UserSettings.create({
    user_id: ALICE,
    garmin: {
      enabled: false,
      username: 'me@example.com',
      password: PASSWORD, // the pre('save') hook encrypts this
      oauth1_token: OAUTH1,
      oauth2_token: OAUTH2,
      last_connected_at: CONNECTED_AT,
    },
    nutrition_goal: {
      enabled: true,
      start_weight: 230,
      target_weight: 190,
      bmr: 1850,
      tdee: 2600,
      daily_calorie_target: 2100,
      weekly_schedule: [2100, 2100, 2100, 2100, 2100, 2400, 2400],
      mode: 'keto',
      keto: { net_carb_limit_g: 25, track_net_carbs: true },
    },
    household: { household_id: 'abc123def456', display_name: 'Alice' },
  });

beforeAll(async () => {
  await UserSettings.db.asPromise();
}, 60000);

afterEach(async () => {
  await UserSettings.deleteMany({});
});

afterAll(async () => {
  await UserSettings.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// 1. the flattener
// ---------------------------------------------------------------------------

describe('flattenSettingsUpdate', () => {
  test('a sub-document becomes dot paths, so $set merges instead of replacing', () => {
    expect(flattenSettingsUpdate({ garmin: { enabled: true, username: 'me' } })).toEqual({
      'garmin.enabled': true,
      'garmin.username': 'me',
    });
  });

  test('it recurses all the way down', () => {
    expect(
      flattenSettingsUpdate({ nutrition_goal: { keto: { macro_split: { fat_pct: 70 } } } })
    ).toEqual({ 'nutrition_goal.keto.macro_split.fat_pct': 70 });
  });

  test('arrays are values, not sub-documents — card_order must not become card_order.0', () => {
    const order = ['weight_goal', 'nutrition_goal'];
    expect(flattenSettingsUpdate({ dashboard: { card_order: order } })).toEqual({
      'dashboard.card_order': order,
    });
  });

  test('the Mixed OAuth token blobs are written whole, never merged key by key', () => {
    // A per-key merge would leave a previous token's fields beside the new
    // one's and hand a Frankenstein credential to the Garmin client.
    expect(flattenSettingsUpdate({ garmin: { oauth2_token: OAUTH2 } })).toEqual({
      'garmin.oauth2_token': OAUTH2,
    });
  });

  test('Dates, nulls and scalars are leaves; undefined and empty objects are dropped', () => {
    const when = new Date('2026-01-02T03:04:05.000Z');
    expect(
      flattenSettingsUpdate({
        garmin: { last_connected_at: when, username: null, password: undefined },
        nutrition_goal: {},
        theme: 'dark',
      })
    ).toEqual({
      'garmin.last_connected_at': when,
      'garmin.username': null,
      theme: 'dark',
    });
  });
});

// ---------------------------------------------------------------------------
// 2-5. the mutation
// ---------------------------------------------------------------------------

describe('updateFitnessUserSettings is a partial save', () => {
  test('unauthenticated callers are refused', async () => {
    await expect(
      M.updateFitnessUserSettings(null, { input: { units: { weight: 'kg' } } }, ctx(null))
    ).rejects.toThrow(/Unauthorized/);
  });

  test('toggling Garmin keeps the stored password, both OAuth tokens and last_connected_at', async () => {
    await seed();

    // Exactly what pages/Settings.jsx sends when the password box is blank.
    await M.updateFitnessUserSettings(
      null,
      { input: { garmin: { enabled: true, username: 'me@example.com' } } },
      ctx(ALICE)
    );

    const after = await UserSettings.findOne({ user_id: ALICE });
    expect(after.garmin.enabled).toBe(true);
    // The credential survived, still encrypted, still this password.
    expect(vault.isEncrypted(storedPassword(after))).toBe(true);
    expect(after.garmin.password).toBe(PASSWORD); // getter decrypts
    // And so did everything the client never mentioned.
    expect(after.garmin.oauth1_token).toEqual(OAUTH1);
    expect(after.garmin.oauth2_token).toEqual(OAUTH2);
    expect(after.garmin.last_connected_at).toEqual(CONNECTED_AT);
  });

  test('a retyped password is stored encrypted through the dot-path form', async () => {
    await seed();
    const next = 'a-different-garmin-password';

    await M.updateFitnessUserSettings(
      null,
      { input: { garmin: { enabled: true, username: 'me@example.com', password: next } } },
      ctx(ALICE)
    );

    const after = await UserSettings.findOne({ user_id: ALICE });
    const stored = storedPassword(after);
    // The schema's pre(findOneAndUpdate) hook handles `garmin.password` in the
    // dot-path shape as well as the nested one; this is the proof it fires.
    expect(vault.isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain(next);
    expect(after.garmin.password).toBe(next);
  });

  test('"Remove Goal" disables the goal without erasing the plan behind it', async () => {
    await seed();

    await M.updateFitnessUserSettings(null, { input: { nutrition_goal: { enabled: false } } }, ctx(ALICE));

    const after = await UserSettings.findOne({ user_id: ALICE });
    expect(after.nutrition_goal.enabled).toBe(false);
    expect(after.nutrition_goal.start_weight).toBe(230);
    expect(after.nutrition_goal.target_weight).toBe(190);
    expect(after.nutrition_goal.bmr).toBe(1850);
    expect(after.nutrition_goal.tdee).toBe(2600);
    expect(after.nutrition_goal.daily_calorie_target).toBe(2100);
    expect([...after.nutrition_goal.weekly_schedule]).toEqual([2100, 2100, 2100, 2100, 2100, 2400, 2400]);
    expect(after.nutrition_goal.mode).toBe('keto');
    expect(after.nutrition_goal.keto.net_carb_limit_g).toBe(25);
  });

  test('a deep partial write reaches the leaf and leaves its siblings alone', async () => {
    await seed();

    await M.updateFitnessUserSettings(
      null,
      { input: { nutrition_goal: { keto: { net_carb_limit_g: 20 } } } },
      ctx(ALICE)
    );

    const after = await UserSettings.findOne({ user_id: ALICE });
    expect(after.nutrition_goal.keto.net_carb_limit_g).toBe(20);
    expect(after.nutrition_goal.keto.track_net_carbs).toBe(true);
    expect(after.nutrition_goal.bmr).toBe(1850);
  });

  test('card_order is replaced wholesale — an array is a value, not a sub-document', async () => {
    await seed();

    await M.updateFitnessUserSettings(
      null,
      { input: { dashboard: { card_order: ['weight_goal', 'nutrition_goal'] } } },
      ctx(ALICE)
    );

    const after = await UserSettings.findOne({ user_id: ALICE });
    expect([...after.dashboard.card_order]).toEqual(['weight_goal', 'nutrition_goal']);
    // The other dashboard flags keep their defaults rather than vanishing.
    expect(after.dashboard.show_current_weight).toBe(true);
  });

  test('household is refused: a client cannot graft itself onto a household id here', async () => {
    await seed();

    await M.updateFitnessUserSettings(
      null,
      { input: { household: { household_id: 'HIJACKED0000' }, units: { weight: 'kg' } } },
      ctx(ALICE)
    );

    const after = await UserSettings.findOne({ user_id: ALICE });
    expect(after.household.household_id).toBe('abc123def456');
    expect(after.units.weight).toBe('kg'); // the rest of the body still saved
  });

  test('a first save still upserts the document', async () => {
    const bob = String(new mongoose.Types.ObjectId());

    await M.updateFitnessUserSettings(null, { input: { units: { weight: 'kg' } } }, ctx(bob));

    const created = await UserSettings.findOne({ user_id: bob });
    expect(created.units.weight).toBe('kg');
    await UserSettings.deleteOne({ user_id: bob });
  });
});
