/**
 * dashboardOwnership.test.js
 *
 * The dashboard resolvers aggregate across every app's database using
 * strict:false models, so nothing casts or validates the filters for them.
 * Each widget must (a) require an authenticated user and (b) filter by that
 * app's own owner field — with the documented exception of BookGeek, whose
 * `books` collection is a deliberately shared library with no owner field.
 */

import mongoose from 'mongoose';

const { getAppConnection } = await import('../graphql/shared/appConnections.js');
const { resolvers } = await import('../graphql/dashboard/resolvers.js');

const { Query } = resolvers;

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

const APPS = ['bujogeek', 'notegeek', 'bookgeek', 'fitnessgeek', 'flockgeek'];

// The day-window helpers in the resolvers parse a YYYY-MM-DD string as UTC and
// then snap it to local midnight, so "today" there is not necessarily today
// here. Mirror that arithmetic instead of guessing, and pin an explicit date.
const TARGET_DATE = '2026-01-15';
const inDayWindow = () => {
  const d = new Date(TARGET_DATE);
  d.setHours(12, 0, 0, 0);
  return d;
};
const conns = {};
const col = (app, name) => conns[app].collection(name);

beforeAll(async () => {
  for (const app of APPS) {
    conns[app] = getAppConnection(app);
    await conns[app].asPromise();
  }
}, 60000);

afterEach(async () => {
  await Promise.all([
    col('bujogeek', 'tasks').deleteMany({}),
    col('bujogeek', 'journalentries').deleteMany({}),
    col('notegeek', 'notes').deleteMany({}),
    col('bookgeek', 'books').deleteMany({}),
    col('fitnessgeek', 'food_logs').deleteMany({}),
    col('fitnessgeek', 'weights').deleteMany({}),
    col('flockgeek', 'birds').deleteMany({}),
    col('flockgeek', 'eggproductions').deleteMany({}),
  ]);
});

afterAll(async () => {
  await Promise.all(APPS.map((app) => conns[app].close()));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('every widget requires an authenticated user', () => {
  test('anonymous callers are rejected, never served an unscoped aggregate', async () => {
    const calls = [
      () => Query.dashBujoSummary(null, {}, ctx(null)),
      () => Query.dashRecentNotes(null, {}, ctx(null)),
      () => Query.dashBookProgress(null, {}, ctx(null)),
      () => Query.dashNutritionSummary(null, {}, ctx(null)),
      () => Query.dashWeightTrend(null, {}, ctx(null)),
      () => Query.dashFlockStatus(null, {}, ctx(null)),
      () => Query.dashSearch(null, { query: 'a' }, ctx(null)),
      () => Query.dashWeeklyDigest(null, {}, ctx(null)),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow('Unauthorized');
  });
});

describe('personal widgets are owner-scoped', () => {
  test('dashRecentNotes returns only the caller’s notes', async () => {
    await col('notegeek', 'notes').insertMany([
      { title: 'Alice', content: 'a', userId: ALICE, updatedAt: new Date() },
      { title: 'Bob', content: 'b', userId: BOB, updatedAt: new Date() },
    ]);

    const alice = await Query.dashRecentNotes(null, {}, ctx(ALICE));
    expect(alice.map((n) => n.title)).toEqual(['Alice']);
    expect(await Query.dashRecentNotes(null, {}, ctx(BOB))).toHaveLength(1);
  });

  test('dashBujoSummary counts only the caller’s tasks', async () => {
    const when = inDayWindow();
    await col('bujogeek', 'tasks').insertMany([
      { content: 'alice task', createdBy: ALICE, dueDate: when, status: 'pending' },
      { content: 'bob task', createdBy: BOB, dueDate: when, status: 'pending' },
    ]);

    const summary = await Query.dashBujoSummary(null, { date: TARGET_DATE }, ctx(ALICE));
    expect(summary.totalTasks).toBe(1);
    expect(summary.openTasks).toBe(1);
  });

  test('a non-ObjectId user id yields an empty summary, not a cross-tenant one', async () => {
    await col('bujogeek', 'tasks').insertOne({
      content: 'alice task',
      createdBy: ALICE,
      dueDate: inDayWindow(),
      status: 'pending',
    });
    const summary = await Query.dashBujoSummary(null, { date: TARGET_DATE }, ctx('not-an-objectid'));
    expect(summary.totalTasks).toBe(0);
  });

  test('dashNutritionSummary and dashWeightTrend are per-user', async () => {
    const when = inDayWindow();
    await col('fitnessgeek', 'food_logs').insertMany([
      { user_id: String(ALICE), log_date: when, servings: 1, nutrition: { calories: 500 } },
      { user_id: String(BOB), log_date: when, servings: 1, nutrition: { calories: 900 } },
    ]);
    await col('fitnessgeek', 'weights').insertMany([
      { userId: String(ALICE), log_date: new Date(), weight_value: 180 },
      { userId: String(BOB), log_date: new Date(), weight_value: 250 },
    ]);

    const nutrition = await Query.dashNutritionSummary(null, { date: TARGET_DATE }, ctx(ALICE));
    expect(nutrition.calories).toBe(500);
    expect(nutrition.mealsLogged).toBe(1);

    const trend = await Query.dashWeightTrend(null, {}, ctx(ALICE));
    expect(trend.entries.map((e) => e.weight)).toEqual([180]);
  });

  test('dashFlockStatus counts only the caller’s flock', async () => {
    await col('flockgeek', 'birds').insertMany([
      { ownerId: String(ALICE), tagId: 'A1', status: 'active' },
      { ownerId: String(BOB), tagId: 'B1', status: 'active' },
      { ownerId: String(BOB), tagId: 'B2', status: 'active' },
    ]);
    await col('flockgeek', 'eggproductions').insertMany([
      { ownerId: String(ALICE), date: new Date(), eggsCount: 3 },
      { ownerId: String(BOB), date: new Date(), eggsCount: 40 },
    ]);

    const status = await Query.dashFlockStatus(null, {}, ctx(ALICE));
    expect(status.totalBirds).toBe(1);
    expect(status.activeBirds).toBe(1);
    expect(status.todayEggs).toBe(3);
  });
});

describe('dashSearch', () => {
  test('notes and birds are scoped to the caller', async () => {
    await col('notegeek', 'notes').insertMany([
      { title: 'alpha note', content: 'x', userId: ALICE, updatedAt: new Date() },
      { title: 'alpha note', content: 'x', userId: BOB, updatedAt: new Date() },
    ]);
    await col('flockgeek', 'birds').insertMany([
      { ownerId: String(ALICE), tagId: 'A1', name: 'alpha bird' },
      { ownerId: String(BOB), tagId: 'B1', name: 'alpha bird' },
    ]);

    const results = await Query.dashSearch(null, { query: 'alpha' }, ctx(ALICE));
    expect(results.filter((r) => r.app === 'notegeek')).toHaveLength(1);
    expect(results.filter((r) => r.app === 'flockgeek')).toHaveLength(1);
  });

  test('regex metacharacters in the query are treated literally', async () => {
    await col('notegeek', 'notes').insertMany([
      { title: 'plain title', content: 'x', userId: ALICE, updatedAt: new Date() },
      { title: 'has .* inside', content: 'x', userId: ALICE, updatedAt: new Date() },
    ]);

    const results = await Query.dashSearch(null, { query: '.*' }, ctx(ALICE));
    expect(results.map((r) => r.title)).toEqual(['has .* inside']);
  });
});

describe('deliberately shared data keeps working', () => {
  test('BookGeek’s library is shared: every signed-in user sees the same shelf', async () => {
    await col('bookgeek', 'books').insertMany([
      { title: 'Shared Book', authors: ['Someone'], shelf: 'reading', currentPage: 10, totalPages: 100 },
    ]);

    const alice = await Query.dashBookProgress(null, {}, ctx(ALICE));
    const bob = await Query.dashBookProgress(null, {}, ctx(BOB));
    expect(alice.map((b) => b.title)).toEqual(['Shared Book']);
    expect(bob.map((b) => b.title)).toEqual(['Shared Book']);
    expect(alice[0].percentComplete).toBe(10);

    const search = await Query.dashSearch(null, { query: 'Shared' }, ctx(BOB));
    expect(search.filter((r) => r.app === 'bookgeek')).toHaveLength(1);
  });
});
