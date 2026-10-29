/**
 * todogeekDailyOrder.test.js
 *
 * TodoGeek's Today drag-to-reorder (2026-10-29). The per-day manual order
 * (`TaskOrder`, one row per user and LOCAL day `yyyy-MM-dd`):
 *   1. `dailyTaskOrder(dateKey)` reads it back — the caller's own row only;
 *      another user's order for the same day is never returned;
 *   2. virtual occurrence ids (`virtual_<masterId>_<epochMs>`) PERSIST — they
 *      used to be dropped, so a dragged repeating task snapped back;
 *   3. anything that is not a task id or a virtual id is rejected, as is a
 *      list over 500, and saving is an idempotent upsert;
 *   4. rows written before the ids became strings (ObjectIds) still read, and
 *      `dailyTasks` still applies the order — virtual ids included.
 */

import mongoose from 'mongoose';

const { default: Task } = await import('../graphql/todogeek/models/Task.js');
const { default: TaskOrder } = await import('../graphql/todogeek/models/TaskOrder.js');
const { default: taskService } = await import('../graphql/todogeek/services/taskService.js');
const { resolvers } = await import('../graphql/todogeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});
const oid = () => String(new mongoose.Types.ObjectId());

const save = (userId, dateKey, orderedTaskIds) =>
  resolvers.Mutation.saveDailyTaskOrder(null, { dateKey, orderedTaskIds }, ctx(userId));
const read = (userId, dateKey) => resolvers.Query.dailyTaskOrder(null, { dateKey }, ctx(userId));

const expectBadInput = async (promise) => {
  await expect(promise).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
};

beforeAll(async () => {
  await Task.db.asPromise();
  await TaskOrder.db.asPromise();
  await TaskOrder.init();
}, 60000);

afterEach(async () => {
  await Promise.all([Task.deleteMany({}), TaskOrder.deleteMany({})]);
});

afterAll(async () => {
  await Task.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('dailyTaskOrder — read back, owner only', () => {
  test('returns what was saved, in order', async () => {
    const ids = [oid(), oid(), oid()];
    const res = await save(ALICE, '2026-10-29', ids);
    expect(res.success).toBe(true);
    expect(await read(ALICE, '2026-10-29')).toEqual(ids);
  });

  test('is empty for a day with no saved order', async () => {
    expect(await read(ALICE, '2026-10-30')).toEqual([]);
  });

  test('another user’s order for the same day is never returned', async () => {
    const mine = [oid(), oid()];
    await save(BOB, '2026-10-29', [oid(), oid(), oid()]);
    expect(await read(ALICE, '2026-10-29')).toEqual([]);
    await save(ALICE, '2026-10-29', mine);
    expect(await read(ALICE, '2026-10-29')).toEqual(mine);
    expect(await read(BOB, '2026-10-29')).not.toEqual(mine);
  });

  test('signed out reads as no order', async () => {
    await save(ALICE, '2026-10-29', [oid()]);
    expect(await read(null, '2026-10-29')).toEqual([]);
  });

  test('a malformed dateKey is rejected', async () => {
    await expectBadInput(read(ALICE, '29/10/2026'));
    await expectBadInput(read(ALICE, '2026-13-01'));
  });
});

describe('saveDailyTaskOrder — virtual ids persist', () => {
  test('a repeating task’s occurrence keeps its place among real tasks', async () => {
    const realA = oid();
    const realB = oid();
    const virtual = `virtual_${oid()}_1761696000000`;
    await save(ALICE, '2026-10-29', [realA, virtual, realB]);
    expect(await read(ALICE, '2026-10-29')).toEqual([realA, virtual, realB]);
  });

  test('saving is an idempotent upsert — one row per user and day', async () => {
    const ids = [oid(), `virtual_${oid()}_1761696000000`];
    await save(ALICE, '2026-10-29', ids);
    await save(ALICE, '2026-10-29', ids);
    expect(await TaskOrder.countDocuments({ userId: ALICE, dateKey: '2026-10-29' })).toBe(1);
    const reordered = [ids[1], ids[0]];
    await save(ALICE, '2026-10-29', reordered);
    expect(await TaskOrder.countDocuments({ userId: ALICE })).toBe(1);
    expect(await read(ALICE, '2026-10-29')).toEqual(reordered);
  });

  test('duplicates keep their first place', async () => {
    const a = oid();
    const b = oid();
    await save(ALICE, '2026-10-29', [a, b, a]);
    expect(await read(ALICE, '2026-10-29')).toEqual([a, b]);
  });
});

describe('saveDailyTaskOrder — invalid input is rejected', () => {
  test.each([
    ['a word', 'not-an-id'],
    ['a short hex', 'abc123'],
    ['a virtual id with a bad master', 'virtual_nothex_1761696000000'],
    ['a virtual id with no time', `virtual_${new mongoose.Types.ObjectId()}_`],
    ['a virtual id with a non-numeric time', `virtual_${new mongoose.Types.ObjectId()}_soon`],
    ['an operator object smuggled as a string', '{"$gt":""}'],
    ['an empty string', ''],
  ])('%s', async (_label, bad) => {
    await expectBadInput(save(ALICE, '2026-10-29', [oid(), bad]));
    expect(await TaskOrder.countDocuments({})).toBe(0);
  });

  test('more than 500 ids', async () => {
    const many = Array.from({ length: 501 }, oid);
    await expectBadInput(save(ALICE, '2026-10-29', many));
    expect(await TaskOrder.countDocuments({})).toBe(0);
  });

  test('a malformed dateKey', async () => {
    await expectBadInput(save(ALICE, 'tomorrow', [oid()]));
  });

  test('signed out is refused', async () => {
    await expect(save(null, '2026-10-29', [oid()])).rejects.toThrow('Unauthorized');
  });

  test('the service guards the same shapes when called directly', async () => {
    await expect(
      taskService.saveDailyOrder({ userId: ALICE, dateKey: '2026-10-29', orderedTaskIds: ['nope'] })
    ).rejects.toMatchObject({ code: 'BAD_USER_INPUT' });
  });

  test('an empty list is valid (clears the order)', async () => {
    await save(ALICE, '2026-10-29', [oid()]);
    await save(ALICE, '2026-10-29', []);
    expect(await read(ALICE, '2026-10-29')).toEqual([]);
  });
});

describe('rows from before the ids were strings, and dailyTasks', () => {
  test('a stored ObjectId array still reads back as id strings', async () => {
    const a = new mongoose.Types.ObjectId();
    const b = new mongoose.Types.ObjectId();
    await TaskOrder.collection.insertOne({ userId: ALICE, dateKey: '2026-10-29', orderedTaskIds: [a, b], updatedAt: new Date() });
    expect(await read(ALICE, '2026-10-29')).toEqual([String(a), String(b)]);
  });

  test('dailyTasks applies a legacy ObjectId order', async () => {
    const day = new Date('2026-10-29T00:00:00Z');
    const first = await Task.create({ content: 'first by rule', createdBy: ALICE, dueDate: day, priority: 1, originalDate: day });
    const second = await Task.create({ content: 'second by rule', createdBy: ALICE, dueDate: day, priority: 3, originalDate: day });
    await TaskOrder.collection.insertOne({
      userId: ALICE, dateKey: '2026-10-29', orderedTaskIds: [second._id, first._id], updatedAt: new Date(),
    });
    const daily = await resolvers.Query.dailyTasks(null, { date: '2026-10-29' }, ctx(ALICE));
    expect(daily.map((t) => t.content)).toEqual(['second by rule', 'first by rule']);
  });

  test('dailyTasks applies a saved order holding a virtual occurrence', async () => {
    const day = new Date('2026-10-29T00:00:00Z');
    const plain = await Task.create({ content: 'plain, high', createdBy: ALICE, dueDate: day, priority: 1, originalDate: day });
    const master = await Task.create({
      content: 'every day',
      createdBy: ALICE,
      isSeriesMaster: true,
      dueDate: new Date('2026-10-20T09:00:00Z'),
      originalDate: new Date('2026-10-20T09:00:00Z'),
      recurrenceRule: 'DTSTART:20261020T090000Z\nRRULE:FREQ=DAILY',
    });
    const before = await resolvers.Query.dailyTasks(null, { date: '2026-10-29' }, ctx(ALICE));
    const occurrence = before.find((t) => String(t._id).startsWith(`virtual_${master._id}_`) && t.content === 'every day'
      && new Date(t.dueDate).toISOString().startsWith('2026-10-29'));
    expect(occurrence).toBeTruthy();
    // By the rule the high-priority plain task comes first; the drag put the repeat on top.
    expect(before[0].content).toBe('plain, high');

    await save(ALICE, '2026-10-29', [String(occurrence._id), String(plain._id)]);
    const after = await resolvers.Query.dailyTasks(null, { date: '2026-10-29' }, ctx(ALICE));
    expect(String(after[0]._id)).toBe(String(occurrence._id));
    expect(String(after[1]._id)).toBe(String(plain._id));
  });

  test('another user’s saved order does not reorder my day', async () => {
    const day = new Date('2026-10-29T00:00:00Z');
    const high = await Task.create({ content: 'high', createdBy: ALICE, dueDate: day, priority: 1, originalDate: day });
    const low = await Task.create({ content: 'low', createdBy: ALICE, dueDate: day, priority: 3, originalDate: day });
    await save(BOB, '2026-10-29', [String(low._id), String(high._id)]);
    const daily = await resolvers.Query.dailyTasks(null, { date: '2026-10-29' }, ctx(ALICE));
    expect(daily.map((t) => t.content)).toEqual(['high', 'low']);
  });
});
