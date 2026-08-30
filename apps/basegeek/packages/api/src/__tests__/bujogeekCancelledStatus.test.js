/**
 * bujogeekCancelledStatus.test.js
 *
 * Covers the new "cancelled" task state — a way to strike a task as
 * irrelevant without deleting it:
 *   1. cancelledAt is set on cancellation and cleared when a task leaves
 *      the cancelled state (mirrors the completedAt pattern).
 *   2. cancelled sinks below active tasks in sortTasks, alongside completed.
 *   3. a cancelled, undated task does not carry forward into a later daily
 *      view the way a pending undated task does.
 *   4. cancelling a virtual recurring instance materializes a cancelled
 *      override, leaving the series master and other occurrences alone.
 *   5. ownership scoping still applies to the cancelled status transition.
 */

import mongoose from 'mongoose';

const { default: Task } = await import('../graphql/bujogeek/models/Task.js');
const { default: taskService } = await import('../graphql/bujogeek/services/taskService.js');
const { resolvers } = await import('../graphql/bujogeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

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
});

afterAll(async () => {
  await Task.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('cancelledAt lifecycle', () => {
  test('set on cancellation, cleared when re-opened', async () => {
    const t = await makeTask();
    const cancelled = await resolvers.Mutation.updateTaskStatus(
      null,
      { id: String(t._id), status: 'cancelled' },
      ctx(ALICE)
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(cancelled.completedAt).toBeNull();
    expect((await Task.findById(t._id)).cancelledAt).toBeInstanceOf(Date);

    const reopened = await resolvers.Mutation.updateTaskStatus(
      null,
      { id: String(t._id), status: 'pending' },
      ctx(ALICE)
    );
    expect(reopened.cancelledAt).toBeNull();
    expect((await Task.findById(t._id)).cancelledAt).toBeNull();
  });

  test('cancelledAt and completedAt are mutually exclusive', async () => {
    const t = await makeTask();
    const completed = await taskService.updateTaskStatus(String(t._id), 'completed', ALICE);
    expect(completed.completedAt).toBeInstanceOf(Date);
    expect(completed.cancelledAt).toBeNull();

    const cancelled = await taskService.updateTaskStatus(String(t._id), 'cancelled', ALICE);
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(cancelled.completedAt).toBeNull();
  });
});

describe('sorting — cancelled sinks with completed', () => {
  test('sortTasks places cancelled below pending, alongside completed', () => {
    const tasks = [
      { _id: '1', status: 'cancelled', priority: 1 },
      { _id: '2', status: 'pending', priority: 3 },
      { _id: '3', status: 'completed', priority: 1 },
      { _id: '4', status: 'pending', priority: 1 },
    ];
    const sorted = taskService.sortTasks([...tasks]);
    const statuses = sorted.map((t) => t.status);
    // Both pending tasks sort before both sunk (completed/cancelled) tasks.
    const firstSunkIdx = statuses.findIndex((s) => s !== 'pending');
    expect(statuses.slice(0, firstSunkIdx).every((s) => s === 'pending')).toBe(true);
    expect(statuses.slice(firstSunkIdx).every((s) => s !== 'pending')).toBe(true);
    // Cancelled sorts after completed (spec doesn't define an order between
    // them, so we default to cancelled-last).
    const completedIdx = sorted.findIndex((t) => t.status === 'completed');
    const cancelledIdx = sorted.findIndex((t) => t.status === 'cancelled');
    expect(cancelledIdx).toBeGreaterThan(completedIdx);
  });
});

describe('carry-forward — cancelled does not re-surface', () => {
  test('a cancelled, undated task does not float into a later daily view', async () => {
    await makeTask({
      content: 'cancelled floater',
      status: 'cancelled',
      cancelledAt: new Date('2026-01-05T12:00:00Z'),
      dueDate: null,
      originalDate: new Date('2026-01-05T00:00:00Z'),
      updatedAt: new Date('2026-01-05T12:00:00Z'),
    });

    const later = await taskService.getTasksForDateRange({
      userId: ALICE,
      startDate: '2026-01-08',
      endDate: '2026-01-08',
      viewType: 'daily',
    });
    expect(later.some((t) => t.content === 'cancelled floater')).toBe(false);

    // A pending sibling with the same shape DOES float, for contrast.
    await makeTask({
      content: 'pending floater',
      status: 'pending',
      dueDate: null,
      originalDate: new Date('2026-01-05T00:00:00Z'),
      createdAt: new Date('2026-01-05T00:00:00Z'),
    });
    const laterAgain = await taskService.getTasksForDateRange({
      userId: ALICE,
      startDate: '2026-01-08',
      endDate: '2026-01-08',
      viewType: 'daily',
    });
    expect(laterAgain.some((t) => t.content === 'pending floater')).toBe(true);
  });

  test('a cancelled task still shows on the day it was cancelled', async () => {
    const day = new Date('2026-01-05T12:00:00Z');
    const created = await makeTask({
      content: 'cancelled today',
      status: 'cancelled',
      cancelledAt: day,
      dueDate: null,
      originalDate: day,
    });
    // The pre('save') hook stamps updatedAt with the real wall-clock time on
    // every .save(); bypass it with a raw update so this fixture reflects a
    // task actually cancelled back in the test's simulated date window.
    await Task.updateOne({ _id: created._id }, { $set: { updatedAt: day } });

    const sameDay = await taskService.getTasksForDateRange({
      userId: ALICE,
      startDate: '2026-01-05',
      endDate: '2026-01-05',
      viewType: 'daily',
    });
    expect(sameDay.some((t) => t.content === 'cancelled today')).toBe(true);
  });

  test('cancelled series masters stop expanding new virtual occurrences', async () => {
    const master = await makeTask({
      content: 'was recurring',
      isSeriesMaster: true,
      status: 'cancelled',
      cancelledAt: new Date('2026-01-05T09:00:00Z'),
      dueDate: new Date('2026-01-05T09:00:00Z'),
      recurrenceRule: 'DTSTART:20260105T090000Z\nRRULE:FREQ=DAILY',
    });
    const tasks = await taskService.getTasksForDateRange({
      userId: ALICE,
      startDate: '2026-01-12',
      endDate: '2026-01-12',
      viewType: 'daily',
    });
    expect(tasks.some((t) => t.isVirtual && t.seriesId === String(master._id))).toBe(false);
  });
});

describe('recurring — cancelling a virtual instance materializes an override', () => {
  const RULE = 'DTSTART:20260105T090000Z\nRRULE:FREQ=WEEKLY';

  test('THIS_INSTANCE cancel creates a cancelled override, master untouched', async () => {
    const master = await makeTask({
      content: 'weekly standup',
      isSeriesMaster: true,
      dueDate: new Date('2026-01-05T09:00:00Z'),
      recurrenceRule: RULE,
    });
    const occurrence = new Date('2026-01-12T09:00:00Z');

    const override = await taskService.updateTaskStatus(
      `virtual_${master._id}_${occurrence.getTime()}`,
      'cancelled',
      ALICE
    );

    expect(override.status).toBe('cancelled');
    expect(override.cancelledAt).toBeInstanceOf(Date);
    expect(override.isSeriesMaster).toBe(false);
    expect(String(override.seriesId)).toBe(String(master._id));

    const freshMaster = await Task.findById(master._id);
    expect(freshMaster.status).not.toBe('cancelled');
    expect(freshMaster.recurrenceRule).toBe(RULE);

    // Only master + one override exist — no other occurrence was touched.
    expect(await Task.countDocuments({})).toBe(2);
  });
});

describe('ownership — cancelled transition is still scoped', () => {
  test('updateTaskStatus cannot cancel another user’s task', async () => {
    const t = await makeTask();
    await expect(
      resolvers.Mutation.updateTaskStatus(null, { id: String(t._id), status: 'cancelled' }, ctx(BOB))
    ).rejects.toThrow('Task not found');
    const fresh = await Task.findById(t._id);
    expect(fresh.status).toBe('pending');
    expect(fresh.cancelledAt).toBeNull();
  });

  test('unauthenticated cancel throws Unauthorized', async () => {
    const t = await makeTask();
    await expect(
      resolvers.Mutation.updateTaskStatus(null, { id: String(t._id), status: 'cancelled' }, ctx(null))
    ).rejects.toThrow('Unauthorized');
  });
});
