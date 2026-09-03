/**
 * glanceOwnership.test.js
 *
 * The glance resolvers aggregate across every app's database using the real
 * Mongoose models. Each widget must (a) require an authenticated user and
 * (b) filter by that app's own owner field — with the documented exception
 * of BookGeek, whose `books` collection is a deliberately shared library with
 * no owner field.
 */

import mongoose from 'mongoose';

const { getAppConnection } = await import('../graphql/shared/appConnections.js');
const { resolvers } = await import('../graphql/glance/resolvers.js');

const { Query } = resolvers;

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

const APPS = ['bujogeek', 'notegeek', 'bookgeek', 'fitnessgeek', 'flockgeek'];

const TARGET_DATE = '2026-01-15';
const inDayWindow = () => new Date(`${TARGET_DATE}T12:00:00Z`);

const FIELDS_DATE = '2026-01-12'; // Monday
const FIELDS_TUESDAY = '2026-01-13';

const conns = {};
const rawCol = (app, name) => conns[app].collection(name);
let TEST_TAG;

const col = (app, name) => {
  const c = rawCol(app, name);
  return new Proxy(c, {
    get(target, prop) {
      if (prop === 'insertOne') {
        return (doc, opts) => target.insertOne({ ...doc, __glanceTest: TEST_TAG }, opts);
      }
      if (prop === 'insertMany') {
        return (docs, opts) => target.insertMany(
          docs.map((d) => ({ ...d, __glanceTest: TEST_TAG })),
          opts
        );
      }
      return target[prop];
    },
  });
};

beforeAll(async () => {
  TEST_TAG = new mongoose.Types.ObjectId().toString();
  for (const app of APPS) {
    conns[app] = getAppConnection(app);
    await conns[app].asPromise();
  }
}, 60000);

afterEach(async () => {
  await Promise.all([
    col('bujogeek', 'tasks').deleteMany({ __glanceTest: TEST_TAG }),
    col('bujogeek', 'habits').deleteMany({ __glanceTest: TEST_TAG }),
    col('bujogeek', 'habitlogs').deleteMany({ __glanceTest: TEST_TAG }),
    col('notegeek', 'notes').deleteMany({ __glanceTest: TEST_TAG }),
    col('bookgeek', 'books').deleteMany({ __glanceTest: TEST_TAG }),
    col('fitnessgeek', 'fooditems').deleteMany({ __glanceTest: TEST_TAG }),
    col('fitnessgeek', 'foodlogs').deleteMany({ __glanceTest: TEST_TAG }),
    col('fitnessgeek', 'dailysummaries').deleteMany({ __glanceTest: TEST_TAG }),
    col('fitnessgeek', 'usersettings').deleteMany({ __glanceTest: TEST_TAG }),
    col('fitnessgeek', 'loginstreaks').deleteMany({ __glanceTest: TEST_TAG }),
    col('fitnessgeek', 'weights').deleteMany({ __glanceTest: TEST_TAG }),
    col('flockgeek', 'birds').deleteMany({ __glanceTest: TEST_TAG }),
    col('flockgeek', 'eggproductions').deleteMany({ __glanceTest: TEST_TAG }),
  ]);
});

afterAll(async () => {
  await Promise.all(APPS.map((app) => conns[app].close()));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('glanceToday and glanceSearch require an authenticated user', () => {
  test('anonymous callers are rejected, never served an unscoped aggregate', async () => {
    await expect(Query.glanceToday(null, {}, ctx(null))).rejects.toThrow('Unauthorized');
    await expect(Query.glanceSearch(null, { query: 'a' }, ctx(null))).rejects.toThrow('Unauthorized');
  });
});

describe('personal widgets are owner-scoped', () => {
  test("recentNotes returns only the caller's notes", async () => {
    await col('notegeek', 'notes').insertMany([
      { title: 'Alice', content: 'a', userId: ALICE, updatedAt: new Date() },
      { title: 'Bob', content: 'b', userId: BOB, updatedAt: new Date() },
    ]);

    const today = await Query.glanceToday(null, { date: TARGET_DATE }, ctx(ALICE));
    expect(today.recentNotes.map((n) => n.title)).toEqual(['Alice']);
    expect(today.recentNotes).toHaveLength(1);
  });

  test("tasks.due contains only the caller's tasks due on the date", async () => {
    const when = inDayWindow();
    await col('bujogeek', 'tasks').insertMany([
      { content: 'alice task', createdBy: ALICE, dueDate: when, status: 'pending' },
      { content: 'bob task', createdBy: BOB, dueDate: when, status: 'pending' },
    ]);

    const today = await Query.glanceToday(null, { date: TARGET_DATE }, ctx(ALICE));
    expect(today.tasks.due.map((t) => t.content)).toEqual(['alice task']);
    expect(today.tasks.due).toHaveLength(1);
  });

  test('a non-ObjectId user id yields an empty result, not a cross-tenant one', async () => {
    await col('bujogeek', 'tasks').insertOne({
      content: 'alice task',
      createdBy: ALICE,
      dueDate: inDayWindow(),
      status: 'pending',
    });
    await col('notegeek', 'notes').insertOne({
      title: 'Alice',
      content: 'a',
      userId: ALICE,
      updatedAt: new Date(),
    });

    const today = await Query.glanceToday(null, { date: TARGET_DATE }, ctx('not-an-objectid'));
    expect(today.tasks.due).toHaveLength(0);
    expect(today.recentNotes).toHaveLength(0);
  });

  test('fitness is per-user', async () => {
    const foodId = new mongoose.Types.ObjectId();
    const when = inDayWindow();
    await col('fitnessgeek', 'fooditems').insertOne({
      _id: foodId,
      name: 'Test Food',
      source: 'custom',
      nutrition: { calories_per_serving: 500, protein_grams: 0, carbs_grams: 0, fat_grams: 0 },
      serving: { size: 100, unit: 'g' },
    });
    await col('fitnessgeek', 'foodlogs').insertMany([
      { user_id: String(ALICE), log_date: when, meal_type: 'breakfast', food_item_id: foodId, servings: 1 },
      { user_id: String(BOB), log_date: when, meal_type: 'breakfast', food_item_id: foodId, servings: 1 },
    ]);

    const today = await Query.glanceToday(null, { date: TARGET_DATE }, ctx(ALICE));
    expect(today.fitness).not.toBeNull();
    expect(today.fitness.calories).toBe(500);
    expect(today.fitness.mealsLogged).toBe(1);
  });

  test("flock counts only the caller's active birds and eggs", async () => {
    await col('flockgeek', 'birds').insertMany([
      { ownerId: String(ALICE), tagId: 'A1', status: 'active' },
      { ownerId: String(BOB), tagId: 'B1', status: 'active' },
      { ownerId: String(BOB), tagId: 'B2', status: 'active' },
    ]);
    await col('flockgeek', 'eggproductions').insertMany([
      { ownerId: String(ALICE), date: inDayWindow(), eggsCount: 3 },
      { ownerId: String(BOB), date: inDayWindow(), eggsCount: 40 },
    ]);

    const today = await Query.glanceToday(null, { date: TARGET_DATE }, ctx(ALICE));
    expect(today.flock).not.toBeNull();
    expect(today.flock.activeBirds).toBe(1);
    expect(today.flock.todayEggs).toBe(3);
  });
});

describe('glanceSearch', () => {
  test('notes and birds are scoped to the caller', async () => {
    await col('notegeek', 'notes').insertMany([
      { title: 'alpha note', content: 'x', userId: ALICE, updatedAt: new Date() },
      { title: 'alpha note', content: 'x', userId: BOB, updatedAt: new Date() },
    ]);
    await col('flockgeek', 'birds').insertMany([
      { ownerId: String(ALICE), tagId: 'A1', name: 'alpha bird' },
      { ownerId: String(BOB), tagId: 'B1', name: 'alpha bird' },
    ]);

    const results = await Query.glanceSearch(null, { query: 'alpha' }, ctx(ALICE));
    expect(results.filter((r) => r.app === 'notegeek')).toHaveLength(1);
    expect(results.filter((r) => r.app === 'flockgeek')).toHaveLength(1);
  });

  test('regex metacharacters in the query are treated literally', async () => {
    await col('notegeek', 'notes').insertMany([
      { title: 'plain title', content: 'x', userId: ALICE, updatedAt: new Date() },
      { title: 'has .* inside', content: 'x', userId: ALICE, updatedAt: new Date() },
    ]);

    const results = await Query.glanceSearch(null, { query: '.*' }, ctx(ALICE));
    expect(results.map((r) => r.title)).toEqual(['has .* inside']);
  });
});

describe('deliberately shared data keeps working', () => {
  test("BookGeek's library is shared: every signed-in user sees the same shelf", async () => {
    await col('bookgeek', 'books').insertMany([
      { title: 'Shared Book - glance', authors: ['Someone'], shelf: 'reading', readingProgress: 10, pageCount: 100 },
    ]);

    const alice = await Query.glanceToday(null, { date: TARGET_DATE }, ctx(ALICE));
    const bob = await Query.glanceToday(null, { date: TARGET_DATE }, ctx(BOB));
    const aBook = alice.reading.find((b) => b.title === 'Shared Book - glance');
    const bBook = bob.reading.find((b) => b.title === 'Shared Book - glance');
    expect(aBook).toBeDefined();
    expect(bBook).toBeDefined();
    expect(aBook.readingProgress).toBe(10);

    const search = await Query.glanceSearch(null, { query: 'glance' }, ctx(BOB));
    expect(search.filter((r) => r.app === 'bookgeek').length).toBeGreaterThanOrEqual(1);
  });
});

describe('glanceToday field correctness', () => {
  test('task content: "Buy eggs", dueDate: today -> in tasks.due', async () => {
    await col('bujogeek', 'tasks').insertOne({
      content: 'Buy eggs',
      createdBy: ALICE,
      dueDate: new Date(FIELDS_DATE),
      status: 'pending',
    });

    const today = await Query.glanceToday(null, { date: FIELDS_DATE }, ctx(ALICE));
    expect(today.tasks.due.map((t) => t.content)).toContain('Buy eggs');
  });

  test('pending task due after the date -> in tasks.upcoming, sorted, not in due/overdue', async () => {
    await col('bujogeek', 'tasks').insertMany([
      { content: 'Later', createdBy: ALICE, dueDate: new Date('2026-01-20'), status: 'pending' },
      { content: 'Sooner', createdBy: ALICE, dueDate: new Date('2026-01-14'), status: 'pending' },
      { content: 'Done already', createdBy: ALICE, dueDate: new Date('2026-01-16'), status: 'completed' },
      { content: 'Not mine', createdBy: BOB, dueDate: new Date('2026-01-16'), status: 'pending' },
    ]);

    const today = await Query.glanceToday(null, { date: FIELDS_DATE }, ctx(ALICE));
    expect(today.tasks.upcoming.map((t) => t.content)).toEqual(['Sooner', 'Later']);
    expect(today.tasks.due).toHaveLength(0);
    expect(today.tasks.overdue).toHaveLength(0);
  });

  test('signifier @ task -> in tasks.events', async () => {
    await col('bujogeek', 'tasks').insertOne({
      content: 'Call vet',
      signifier: '@',
      createdBy: ALICE,
      dueDate: new Date(FIELDS_DATE),
      status: 'pending',
    });

    const today = await Query.glanceToday(null, { date: FIELDS_DATE }, ctx(ALICE));
    expect(today.tasks.events.map((t) => t.content)).toContain('Call vet');
  });

  test('cancelled task -> nowhere', async () => {
    await col('bujogeek', 'tasks').insertOne({
      content: 'nope',
      createdBy: ALICE,
      dueDate: new Date(FIELDS_DATE),
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date(),
    });

    const today = await Query.glanceToday(null, { date: FIELDS_DATE }, ctx(ALICE));
    expect(today.tasks.due).toHaveLength(0);
    expect(today.tasks.overdue).toHaveLength(0);
    expect(today.tasks.events).toHaveLength(0);
  });

  test('blocked task -> not in due/overdue; blockedCount = 1', async () => {
    await col('bujogeek', 'tasks').insertOne({
      content: 'stuck',
      createdBy: ALICE,
      dueDate: new Date(FIELDS_DATE),
      status: 'blocked',
      blockedAt: new Date(),
    });

    const today = await Query.glanceToday(null, { date: FIELDS_DATE }, ctx(ALICE));
    expect(today.tasks.due).toHaveLength(0);
    expect(today.tasks.overdue).toHaveLength(0);
    expect(today.tasks.events).toHaveLength(0);
    expect(today.tasks.blockedCount).toBe(1);
  });

  test('habit daysOfWeek: [] returned every day; [1] only on a Monday', async () => {
    const dailyHabit = new mongoose.Types.ObjectId();
    const monHabit = new mongoose.Types.ObjectId();
    await col('bujogeek', 'habits').insertMany([
      { _id: dailyHabit, name: 'Daily', daysOfWeek: [], createdBy: ALICE },
      { _id: monHabit, name: 'Monday', daysOfWeek: [1], createdBy: ALICE },
    ]);

    const mon = await Query.glanceToday(null, { date: FIELDS_DATE }, ctx(ALICE));
    const names = mon.habits.map((h) => h.name);
    expect(names).toContain('Daily');
    expect(names).toContain('Monday');

    const tue = await Query.glanceToday(null, { date: FIELDS_TUESDAY }, ctx(ALICE));
    const tueNames = tue.habits.map((h) => h.name);
    expect(tueNames).toContain('Daily');
    expect(tueNames).not.toContain('Monday');
  });

  test('isEncrypted: true note -> snippet: null', async () => {
    await col('notegeek', 'notes').insertMany([
      { title: 'Open', content: 'readable', userId: ALICE, isEncrypted: false, updatedAt: new Date() },
      { title: 'Locked', content: 'secret', userId: ALICE, isEncrypted: true, updatedAt: new Date() },
    ]);

    const today = await Query.glanceToday(null, { date: FIELDS_DATE }, ctx(ALICE));
    expect(today.recentNotes).toHaveLength(2);
    const open = today.recentNotes.find((n) => n.title === 'Open');
    const locked = today.recentNotes.find((n) => n.title === 'Locked');
    expect(open.snippet).toBe('readable');
    expect(locked.snippet).toBeNull();
  });

  test('shelf: reading, readingProgress: 42 -> 42', async () => {
    await col('bookgeek', 'books').insertOne({
      title: 'Dune',
      authors: ['Frank Herbert'],
      shelf: 'reading',
      readingProgress: 42,
      pageCount: 900,
    });

    const today = await Query.glanceToday(null, { date: FIELDS_DATE }, ctx(ALICE));
    const dune = today.reading.find((b) => b.title === 'Dune');
    expect(dune).toBeDefined();
    expect(dune.readingProgress).toBe(42);
    expect(dune.pageCount).toBe(900);
  });
});

describe('glanceSearch field correctness', () => {
  test('glanceSearch("eggs") finds the task via content', async () => {
    await col('bujogeek', 'tasks').insertOne({
      content: 'Buy eggs',
      createdBy: ALICE,
      dueDate: new Date(FIELDS_DATE),
      status: 'pending',
    });

    const results = await Query.glanceSearch(null, { query: 'eggs' }, ctx(ALICE));
    const task = results.find((r) => r.app === 'bujogeek' && r.type === 'task');
    expect(task).toBeDefined();
    expect(task.title).toBe('Buy eggs');
  });

  test('glanceSearch("a.*b") is literal', async () => {
    await col('bujogeek', 'tasks').insertMany([
      { content: 'has a.*b inside', createdBy: ALICE, dueDate: new Date(FIELDS_DATE), status: 'pending' },
      { content: 'has ab inside', createdBy: ALICE, dueDate: new Date(FIELDS_DATE), status: 'pending' },
    ]);

    const results = await Query.glanceSearch(null, { query: 'a.*b' }, ctx(ALICE));
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('has a.*b inside');
  });
});
