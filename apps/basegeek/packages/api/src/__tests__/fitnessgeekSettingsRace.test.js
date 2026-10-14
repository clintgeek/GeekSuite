/**
 * One settings row per user, even when the first load races.
 *
 * Found 2026-10-14: Heather had THREE fitnessgeek usersettings rows created
 * in the same millisecond, Chef two, another user two. getOrCreate was
 * find-then-insert, the app's first load fires several settings reads at
 * once, and the "unique" user_id index was shadowed by a non-unique one
 * (path-level `index: true`, same name). A household join then landed on
 * whichever duplicate findOne happened to return.
 */
import mongoose from 'mongoose';

const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');

const USER = String(new mongoose.Types.ObjectId());

beforeAll(async () => {
  await UserSettings.db.asPromise();
  await UserSettings.syncIndexes();
}, 60000);

afterEach(async () => {
  await UserSettings.deleteMany({});
});

test('five simultaneous first loads make ONE row', async () => {
  const rows = await Promise.all(Array.from({ length: 5 }, () => UserSettings.getOrCreate(USER)));
  expect(new Set(rows.map((r) => String(r._id))).size).toBe(1);
  expect(await UserSettings.countDocuments({ user_id: USER })).toBe(1);
});

test('the user_id index is unique', async () => {
  const indexes = await UserSettings.collection.indexes();
  const byUser = indexes.filter((i) => JSON.stringify(i.key) === JSON.stringify({ user_id: 1 }));
  expect(byUser).toHaveLength(1);
  expect(byUser[0].unique).toBe(true);
});

test('a returned row is a saveable document, as callers expect', async () => {
  const settings = await UserSettings.getOrCreate(USER);
  settings.household = { household_id: 'ABC123DEF456', display_name: 'Heather' };
  await settings.save();
  expect((await UserSettings.findOne({ user_id: USER })).household.household_id).toBe('ABC123DEF456');
});
