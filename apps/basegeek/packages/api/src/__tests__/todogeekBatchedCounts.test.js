/**
 * TODOGEEK_REVIEW §3.2 — the two N+1s in list views.
 *
 * Collection.taskCount / completedCount used to cost four count queries per
 * collection; Habit.currentStreak one HabitLog query per habit. Now each list
 * costs ONE query per request, with identical answers and owner scoping.
 */
import mongoose from 'mongoose';
import { jest } from '@jest/globals';

const { default: Task } = await import('../graphql/todogeek/models/Task.js');
const { default: Collection } = await import('../graphql/todogeek/models/Collection.js');
const { default: Habit } = await import('../graphql/todogeek/models/Habit.js');
const { default: HabitLog } = await import('../graphql/todogeek/models/HabitLog.js');
const { resolvers } = await import('../graphql/todogeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (id) => ({ user: { id: String(id) } });

beforeAll(async () => { await Task.db.asPromise(); }, 60000);
afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([Task, Collection, Habit, HabitLog].map((m) => m.deleteMany({})));
});
afterAll(async () => {
  await Task.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const entry = (collectionId, status, createdBy = ALICE) =>
  Task.create({ content: 'x', createdBy, collectionId, status, originalDate: new Date('2026-01-05T00:00:00Z') });

test('counts for many collections come from ONE query, with correct numbers', async () => {
  const [a, b, c] = await Promise.all(
    ['A', 'B', 'C'].map((name) => Collection.create({ name, createdBy: ALICE }))
  );
  await entry(a._id, 'completed'); await entry(a._id, 'pending'); await entry(a._id, 'pending');
  await entry(b._id, 'completed');
  await entry(a._id, 'completed', BOB); // Bob's entry in Alice's collection id: never counted for her

  const countSpy = jest.spyOn(Task, 'countDocuments');
  const aggSpy = jest.spyOn(Task, 'aggregate');
  const context = ctx(ALICE); // one context == one request

  const out = await Promise.all(
    [a, b, c].flatMap((col) => [
      resolvers.Collection.taskCount(col, {}, context),
      resolvers.Collection.completedCount(col, {}, context),
    ])
  );

  expect(out).toEqual([3, 1, 1, 1, 0, 0]);
  expect(countSpy).not.toHaveBeenCalled();
  expect(aggSpy).toHaveBeenCalledTimes(1);
  expect(String(aggSpy.mock.calls[0][0][0].$match.createdBy)).toBe(String(ALICE));
});

test("another user's context sees zero for a collection it does not own", async () => {
  const a = await Collection.create({ name: 'A', createdBy: ALICE });
  await entry(a._id, 'completed');
  expect(await resolvers.Collection.taskCount(a, {}, ctx(BOB))).toBe(0);
  expect(await resolvers.Collection.completedCount(a, {}, ctx(BOB))).toBe(0);
});

test('streaks for many habits come from ONE HabitLog query, with correct numbers', async () => {
  const mk = (name) => Habit.create({ name, createdBy: ALICE });
  const [h1, h2, h3] = await Promise.all([mk('one'), mk('two'), mk('three')]);
  const day = (d) => new Date(`2026-03-${d}T00:00:00.000Z`);
  const log = (h, d, createdBy = ALICE) => HabitLog.create({ habitId: h._id, createdBy, date: day(d) });
  await Promise.all([log(h1, 20), log(h1, 19), log(h1, 18), log(h2, 20), log(h2, 18)]);
  await log(h3, 20, BOB); // not Alice's log

  const findSpy = jest.spyOn(HabitLog, 'find');
  const context = ctx(ALICE);
  const out = await Promise.all(
    [h1, h2, h3].map((h) => resolvers.Habit.currentStreak(h, { today: '2026-03-20' }, context))
  );

  expect(out).toEqual([3, 1, 0]);
  expect(findSpy).toHaveBeenCalledTimes(1);
});
