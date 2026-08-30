/**
 * bujogeekCollections.test.js
 *
 * Covers BuJo *collections* — named lists of entries that live outside the
 * daily log:
 *   1. CRUD is owner-scoped end to end (cross-user reads and writes denied).
 *   2. deleteCollection detaches its entries by default, cascades on request.
 *   3. An undated collection entry is excluded from the daily/weekly/monthly
 *      log — including the undated carry-forward float.
 *   4. A *dated* collection entry appears in the daily log like any other
 *      dated task (the bridge between a collection and the log).
 *   5. collectionId is settable and clearable via updateTask, and a task can
 *      never be filed into somebody else's collection.
 */

import mongoose from 'mongoose';

const { default: Task } = await import('../graphql/bujogeek/models/Task.js');
const { default: Collection } = await import('../graphql/bujogeek/models/Collection.js');
const { default: taskService } = await import('../graphql/bujogeek/services/taskService.js');
const { default: collectionService } = await import('../graphql/bujogeek/services/collectionService.js');
const { resolvers } = await import('../graphql/bujogeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

const makeCollection = (overrides = {}) =>
  Collection.create({ name: 'Books to Read', createdBy: ALICE, ...overrides });

const makeTask = (overrides = {}) =>
  Task.create({
    content: 'a task',
    createdBy: ALICE,
    originalDate: new Date('2026-01-05T00:00:00Z'),
    ...overrides,
  });

beforeAll(async () => {
  await Task.db.asPromise();
}, 60000);

afterEach(async () => {
  await Task.deleteMany({});
  await Collection.deleteMany({});
});

afterAll(async () => {
  await Task.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('collection CRUD — owner scoped', () => {
  test('createCollection stamps the caller as owner and trims the name', async () => {
    const created = await resolvers.Mutation.createCollection(
      null,
      { name: '  Gift Ideas  ', description: 'for the holidays' },
      ctx(ALICE)
    );
    expect(created.name).toBe('Gift Ideas');
    expect(created.description).toBe('for the holidays');
    expect(created.archived).toBe(false);
    expect(String(created.createdBy)).toBe(String(ALICE));
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  test('collections lists only the caller’s, unarchived first', async () => {
    await makeCollection({ name: 'Zebra Projects' });
    await makeCollection({ name: 'Archived Thing', archived: true });
    await makeCollection({ name: 'Apple Projects' });
    await makeCollection({ name: 'Bob’s List', createdBy: BOB });

    const mine = await resolvers.Query.collections(null, {}, ctx(ALICE));
    expect(mine.map((c) => c.name)).toEqual([
      'Apple Projects',
      'Zebra Projects',
      'Archived Thing',
    ]);

    const bobs = await resolvers.Query.collections(null, {}, ctx(BOB));
    expect(bobs.map((c) => c.name)).toEqual(['Bob’s List']);

    expect(await resolvers.Query.collections(null, {}, ctx(null))).toEqual([]);
  });

  test('collection(id) is null for another user and for a malformed id', async () => {
    const c = await makeCollection();
    expect(await resolvers.Query.collection(null, { id: String(c._id) }, ctx(ALICE))).not.toBeNull();
    expect(await resolvers.Query.collection(null, { id: String(c._id) }, ctx(BOB))).toBeNull();
    expect(await resolvers.Query.collection(null, { id: 'not-an-objectid' }, ctx(ALICE))).toBeNull();
    expect(await resolvers.Query.collection(null, { id: String(c._id) }, ctx(null))).toBeNull();
  });

  test('updateCollection renames, re-describes and archives; cross-user denied', async () => {
    const c = await makeCollection();

    const renamed = await resolvers.Mutation.updateCollection(
      null,
      { id: String(c._id), name: 'Books, Reordered', description: 'fiction only', archived: true },
      ctx(ALICE)
    );
    expect(renamed.name).toBe('Books, Reordered');
    expect(renamed.description).toBe('fiction only');
    expect(renamed.archived).toBe(true);

    await expect(
      resolvers.Mutation.updateCollection(null, { id: String(c._id), name: 'pwned' }, ctx(BOB))
    ).rejects.toThrow('Collection not found');
    expect((await Collection.findById(c._id)).name).toBe('Books, Reordered');

    await expect(
      resolvers.Mutation.updateCollection(null, { id: String(c._id), name: 'x' }, ctx(null))
    ).rejects.toThrow('Unauthorized');
  });

  test('unauthenticated create/delete throw Unauthorized, and the service refuses to run unscoped', async () => {
    const c = await makeCollection();
    await expect(
      resolvers.Mutation.createCollection(null, { name: 'nope' }, ctx(null))
    ).rejects.toThrow('Unauthorized');
    await expect(
      resolvers.Mutation.deleteCollection(null, { id: String(c._id) }, ctx(null))
    ).rejects.toThrow('Unauthorized');

    await expect(collectionService.listCollections()).rejects.toThrow('Unauthorized');
    await expect(collectionService.findOwnedCollection(String(c._id))).rejects.toThrow('Unauthorized');
    await expect(collectionService.getTasksForCollection(String(c._id))).rejects.toThrow('Unauthorized');
  });
});

describe('deleteCollection — detach vs cascade', () => {
  test('by default the entries survive, detached from the collection', async () => {
    const c = await makeCollection();
    const kept = await makeTask({ content: 'Dune', collectionId: c._id });

    const res = await resolvers.Mutation.deleteCollection(
      null,
      { id: String(c._id), deleteTasks: false },
      ctx(ALICE)
    );
    expect(res.success).toBe(true);
    expect(await Collection.findById(c._id)).toBeNull();

    const fresh = await Task.findById(kept._id);
    expect(fresh).not.toBeNull();
    expect(fresh.collectionId).toBeNull();
  });

  test('deleteTasks: true removes the entries with it', async () => {
    const c = await makeCollection();
    await makeTask({ content: 'Dune', collectionId: c._id });
    await makeTask({ content: 'Piranesi', collectionId: c._id });
    const untouched = await makeTask({ content: 'unfiled task' });

    await resolvers.Mutation.deleteCollection(
      null,
      { id: String(c._id), deleteTasks: true },
      ctx(ALICE)
    );

    expect(await Task.countDocuments({ collectionId: c._id })).toBe(0);
    expect(await Task.findById(untouched._id)).not.toBeNull();
  });

  test('cannot delete another user’s collection, nor touch its entries', async () => {
    const c = await makeCollection();
    const entry = await makeTask({ content: 'Dune', collectionId: c._id });

    await expect(
      resolvers.Mutation.deleteCollection(null, { id: String(c._id), deleteTasks: true }, ctx(BOB))
    ).rejects.toThrow('Collection not found');

    expect(await Collection.findById(c._id)).not.toBeNull();
    expect(String((await Task.findById(entry._id)).collectionId)).toBe(String(c._id));
  });
});

describe('collection entries stay out of the log until dated', () => {
  test('an undated collection entry is excluded from the daily view and its carry-forward', async () => {
    const c = await makeCollection();
    await makeTask({
      content: 'read Dune',
      collectionId: c._id,
      dueDate: null,
      status: 'pending',
      createdAt: new Date('2026-01-05T00:00:00Z'),
    });
    // An identically shaped task with no collection DOES float, for contrast.
    await makeTask({
      content: 'undated floater',
      dueDate: null,
      status: 'pending',
      createdAt: new Date('2026-01-05T00:00:00Z'),
    });

    const sameDay = await taskService.getTasksForDateRange({
      userId: ALICE,
      startDate: '2026-01-05',
      endDate: '2026-01-05',
      viewType: 'daily',
    });
    expect(sameDay.some((t) => t.content === 'read Dune')).toBe(false);
    expect(sameDay.some((t) => t.content === 'undated floater')).toBe(true);

    const daysLater = await taskService.getTasksForDateRange({
      userId: ALICE,
      startDate: '2026-01-12',
      endDate: '2026-01-12',
      viewType: 'daily',
    });
    expect(daysLater.some((t) => t.content === 'read Dune')).toBe(false);
    expect(daysLater.some((t) => t.content === 'undated floater')).toBe(true);
  });

  test('undated collection entries are excluded from the weekly and monthly views too', async () => {
    const c = await makeCollection();
    await makeTask({ content: 'read Dune', collectionId: c._id, dueDate: null });

    for (const viewType of ['weekly', 'monthly']) {
      const tasks = await taskService.getTasksForDateRange({
        userId: ALICE,
        startDate: '2026-01-05',
        endDate: '2026-01-05',
        viewType,
      });
      expect(tasks.some((t) => t.content === 'read Dune')).toBe(false);
    }
  });

  test('a completed undated collection entry does not surface in the log either', async () => {
    const c = await makeCollection();
    const done = await makeTask({
      content: 'read Piranesi',
      collectionId: c._id,
      dueDate: null,
      status: 'completed',
      completedAt: new Date('2026-01-05T12:00:00Z'),
    });
    await Task.updateOne({ _id: done._id }, { $set: { updatedAt: new Date('2026-01-05T12:00:00Z') } });

    const sameDay = await taskService.getTasksForDateRange({
      userId: ALICE,
      startDate: '2026-01-05',
      endDate: '2026-01-05',
      viewType: 'daily',
    });
    expect(sameDay.some((t) => t.content === 'read Piranesi')).toBe(false);
  });

  test('a DATED collection entry appears in the daily log like any other dated task', async () => {
    const c = await makeCollection();
    await makeTask({
      content: 'start Dune',
      collectionId: c._id,
      dueDate: new Date('2026-01-05T09:00:00Z'),
    });

    const sameDay = await taskService.getTasksForDateRange({
      userId: ALICE,
      startDate: '2026-01-05',
      endDate: '2026-01-05',
      viewType: 'daily',
    });
    const found = sameDay.find((t) => t.content === 'start Dune');
    expect(found).toBeDefined();
    expect(String(found.collectionId)).toBe(String(c._id));

    // And it carries forward while it stays pending, like any overdue task.
    const later = await taskService.getTasksForDateRange({
      userId: ALICE,
      startDate: '2026-01-08',
      endDate: '2026-01-08',
      viewType: 'daily',
    });
    expect(later.some((t) => t.content === 'start Dune')).toBe(true);
  });
});

describe('filing tasks into collections', () => {
  test('collectionId is settable and clearable through updateTask', async () => {
    const c = await makeCollection();
    const other = await makeCollection({ name: 'Project X' });
    const t = await makeTask({ content: 'Dune' });

    const filed = await resolvers.Mutation.updateTask(
      null,
      { id: String(t._id), input: { collectionId: String(c._id) } },
      ctx(ALICE)
    );
    expect(String(filed.collectionId)).toBe(String(c._id));

    const moved = await resolvers.Mutation.updateTask(
      null,
      { id: String(t._id), input: { collectionId: String(other._id) } },
      ctx(ALICE)
    );
    expect(String(moved.collectionId)).toBe(String(other._id));

    const cleared = await resolvers.Mutation.updateTask(
      null,
      { id: String(t._id), input: { collectionId: null } },
      ctx(ALICE)
    );
    expect(cleared.collectionId).toBeNull();
    expect((await Task.findById(t._id)).collectionId).toBeNull();
  });

  test('createTask files a new task into a collection', async () => {
    const c = await makeCollection();
    const created = await resolvers.Mutation.createTask(
      null,
      { content: 'read Dune', collectionId: String(c._id) },
      ctx(ALICE)
    );
    expect(String(created.collectionId)).toBe(String(c._id));

    const entries = await collectionService.getTasksForCollection(String(c._id), ALICE);
    expect(entries.map((t) => t.content)).toEqual(['read Dune']);
  });

  test('a task can never be filed into somebody else’s collection', async () => {
    const bobsCollection = await Collection.create({ name: 'Bob’s List', createdBy: BOB });
    const t = await makeTask();

    await expect(
      resolvers.Mutation.createTask(
        null,
        { content: 'sneaky', collectionId: String(bobsCollection._id) },
        ctx(ALICE)
      )
    ).rejects.toThrow('Collection not found');

    await expect(
      resolvers.Mutation.updateTask(
        null,
        { id: String(t._id), input: { collectionId: String(bobsCollection._id) } },
        ctx(ALICE)
      )
    ).rejects.toThrow('Collection not found');

    await expect(
      resolvers.Mutation.updateTask(
        null,
        { id: String(t._id), input: { collectionId: 'not-an-objectid' } },
        ctx(ALICE)
      )
    ).rejects.toThrow('Collection not found');

    expect((await Task.findById(t._id)).collectionId).toBeNull();
  });

  test('a collection’s entries are owner-scoped and canonically sorted', async () => {
    const c = await makeCollection();
    await makeTask({ content: 'done one', collectionId: c._id, status: 'completed' });
    await makeTask({ content: 'low', collectionId: c._id, priority: 3 });
    await makeTask({ content: 'high', collectionId: c._id, priority: 1 });
    await makeTask({ content: 'elsewhere' });

    const entries = await collectionService.getTasksForCollection(String(c._id), ALICE);
    // Canonical order = taskService.sortTasks: pending entries first, completed
    // sunk to the bottom. (Undated peers are ordered by that comparator's own
    // priority rule, which we don't re-specify here.)
    expect(entries).toHaveLength(3);
    expect(entries.slice(0, 2).map((t) => t.status)).toEqual(['pending', 'pending']);
    expect(entries[2].content).toBe('done one');

    // Bob sees nothing through the same id.
    expect(await collectionService.getTasksForCollection(String(c._id), BOB)).toEqual([]);
  });

  test('Collection.tasks / taskCount / completedCount resolvers are user-scoped', async () => {
    const c = await makeCollection();
    await makeTask({ content: 'one', collectionId: c._id });
    await makeTask({ content: 'two', collectionId: c._id, status: 'completed' });

    expect(await resolvers.Collection.taskCount(c, {}, ctx(ALICE))).toBe(2);
    expect(await resolvers.Collection.completedCount(c, {}, ctx(ALICE))).toBe(1);
    expect((await resolvers.Collection.tasks(c, {}, ctx(ALICE))).length).toBe(2);

    expect(await resolvers.Collection.taskCount(c, {}, ctx(BOB))).toBe(0);
    expect(await resolvers.Collection.tasks(c, {}, ctx(BOB))).toEqual([]);
    expect(await resolvers.Collection.taskCount(c, {}, ctx(null))).toBe(0);
  });
});
