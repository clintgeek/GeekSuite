/**
 * appPreferences.test.js — guards the appPreferences Map-vs-Object drift bug.
 *
 * The regression: user routes read appPreferences via BOTH `.get()` (Map) and
 * bracket access (Object) and wrote it ad-hoc. Bracket access on a MongooseMap
 * returns undefined, so reads missed data and writes could vanish on re-fetch.
 * These tests pin the canonical Map behaviour through src/lib/appPreferences.js:
 *
 *   1. A write survives a fresh findById (the silent-write-failure regression).
 *   2. Merging into one app never clobbers another app's prefs, and a partial
 *      patch merges rather than replaces.
 *   3. Old documents whose appPreferences was stored as a plain object read
 *      back correctly and accept new writes.
 *   4. The migration normalises malformed containers (null / missing / array /
 *      JSON string) without disturbing well-formed data, and is idempotent.
 *
 * Mongo is the in-memory instance from globalSetup; USERGEEK_MONGODB_URI points
 * at it via setEnv.js, so the User model's own connection lands there too.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';

const { default: mongoose } = await import('mongoose');
const { User, userGeekConn } = await import('../models/user.js');
const {
  appPreferencesToObject,
  getAppPreferences,
  setAppPreferences,
} = await import('../lib/appPreferences.js');
const { migrateAppPrefsToMap } = await import('../../scripts/migrate-appprefs-to-map.js');

let seq = 0;
const makeUser = (overrides = {}) =>
  User.create({
    username: `prefs_user_${ Date.now() }_${ seq++ }`,
    passwordHash: 'unhashed-placeholder',
    ...overrides,
  });

beforeAll(async () => {
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
}, 60000);

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('appPreferences — canonical Map access', () => {
  it('a write survives a fresh re-fetch (silent-write-failure regression)', async () => {
    const user = await makeUser();

    await setAppPreferences(user, 'notegeek', { editorFontSize: 16 });

    // Re-fetch from the DB — the whole point of the regression.
    const reloaded = await User.findById(user._id);
    expect(reloaded.appPreferences).toBeInstanceOf(Map);
    expect(getAppPreferences(reloaded, 'notegeek')).toEqual({ editorFontSize: 16 });
    expect(appPreferencesToObject(reloaded)).toEqual({ notegeek: { editorFontSize: 16 } });
  });

  it('writing a second app does not clobber the first, and patches merge', async () => {
    const user = await makeUser();

    await setAppPreferences(user, 'notegeek', { editorFontSize: 16 });
    const afterFirst = await User.findById(user._id);
    await setAppPreferences(afterFirst, 'bujogeek', { dailyPageLayout: 'timeline' });

    const afterSecond = await User.findById(user._id);
    // partial patch of an existing app merges rather than replaces
    await setAppPreferences(afterSecond, 'notegeek', { theme: 'dark' });

    const final = await User.findById(user._id);
    expect(appPreferencesToObject(final)).toEqual({
      notegeek: { editorFontSize: 16, theme: 'dark' },
      bujogeek: { dailyPageLayout: 'timeline' },
    });
  });

  it('reads and writes an old plain-object document correctly', async () => {
    // Simulate a document written before the Map schema: insert raw BSON so the
    // container is a plain object, bypassing any model-side casting.
    const _id = new mongoose.Types.ObjectId();
    await User.collection.insertOne({
      _id,
      username: `legacy_${ Date.now() }`,
      passwordHash: 'x',
      appPreferences: { notegeek: { editorFontSize: 12 } },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const loaded = await User.findById(_id);
    expect(loaded.appPreferences).toBeInstanceOf(Map); // Mongoose casts on hydration
    expect(getAppPreferences(loaded, 'notegeek')).toEqual({ editorFontSize: 12 });

    await setAppPreferences(loaded, 'notegeek', { editorFontSize: 18 });
    const reloaded = await User.findById(_id);
    expect(getAppPreferences(reloaded, 'notegeek')).toEqual({ editorFontSize: 18 });
  });

  it('getAppPreferences returns a copy, not the stored reference', async () => {
    const user = await makeUser();
    await setAppPreferences(user, 'notegeek', { editorFontSize: 16 });
    const reloaded = await User.findById(user._id);

    const prefs = getAppPreferences(reloaded, 'notegeek');
    prefs.editorFontSize = 999; // mutate the copy

    const again = await User.findById(user._id);
    expect(getAppPreferences(again, 'notegeek')).toEqual({ editorFontSize: 16 });
  });
});

describe('migrate-appprefs-to-map', () => {
  it('normalises malformed containers and preserves well-formed ones (idempotent)', async () => {
    const goodId = new mongoose.Types.ObjectId();
    const nullId = new mongoose.Types.ObjectId();
    const missingId = new mongoose.Types.ObjectId();
    const arrayId = new mongoose.Types.ObjectId();
    const jsonStringId = new mongoose.Types.ObjectId();

    const base = (extra) => ({
      passwordHash: 'x',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...extra,
    });

    await User.collection.insertMany([
      base({ _id: goodId, username: 'good', appPreferences: { notegeek: { fontSize: 12 } } }),
      base({ _id: nullId, username: 'nulled', appPreferences: null }),
      base({ _id: missingId, username: 'missing' }), // no appPreferences field
      base({ _id: arrayId, username: 'arrayed', appPreferences: [] }),
      base({ _id: jsonStringId, username: 'stringified', appPreferences: '{"bujogeek":{"x":1}}' }),
    ]);

    const dry = await migrateAppPrefsToMap({ dryRun: true, log: () => {} });
    expect(dry.normalised).toBe(4); // good doc excluded, the other four fixed
    // dry run wrote nothing
    expect((await User.collection.findOne({ _id: nullId })).appPreferences).toBeNull();

    const applied = await migrateAppPrefsToMap({ dryRun: false, log: () => {} });
    expect(applied.normalised).toBe(4);

    const raw = async (id) => (await User.collection.findOne({ _id: id })).appPreferences;
    expect(await raw(goodId)).toEqual({ notegeek: { fontSize: 12 } }); // untouched
    expect(await raw(nullId)).toEqual({});
    expect(await raw(missingId)).toEqual({});
    expect(await raw(arrayId)).toEqual({});
    expect(await raw(jsonStringId)).toEqual({ bujogeek: { x: 1 } }); // parsed

    // Every container now hydrates as a Map through the model.
    for (const id of [goodId, nullId, missingId, arrayId, jsonStringId]) {
      expect((await User.findById(id)).appPreferences).toBeInstanceOf(Map);
    }

    // Idempotent: a second apply changes nothing.
    const again = await migrateAppPrefsToMap({ dryRun: false, log: () => {} });
    expect(again.normalised).toBe(0);
  });
});
