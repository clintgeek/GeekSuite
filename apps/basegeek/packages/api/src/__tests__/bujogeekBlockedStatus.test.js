/**
 * bujogeekBlockedStatus.test.js
 *
 * Covers the "blocked" task state — a task parked because it is waiting on
 * something outside itself:
 *   1. block/unblock round trip: blockedReason/blockedAt stamped and cleared,
 *      the original dueDate untouched throughout.
 *   2. invalid transitions (block a completed/cancelled task, unblock a task
 *      that is not blocked, an over-long reason) are BAD_USER_INPUT / 400.
 *   3. ownership: user B can neither block nor unblock user A's task, and it
 *      never appears in B's blockedTasks.
 *   4. a blocked task leaves every log view — it is not "due today" and not
 *      overdue — but is still in the `all` corpus, and comes straight back
 *      (as overdue, when its date has passed) on unblock.
 *   5. blockedTasks lists the owner's parked tasks, newest-blocked first.
 *   6. completing a blocked task directly is allowed and clears the blocked
 *      fields.
 *   7. recurrence: a blocked series master stops expanding, and blocking a
 *      single virtual occurrence materializes exactly one blocked override
 *      without spawning a duplicate.
 */

import mongoose from 'mongoose';

const { default: Task } = await import('../graphql/bujogeek/models/Task.js');
const { default: taskService, MAX_BLOCKED_REASON } = await import(
  '../graphql/bujogeek/services/taskService.js'
);
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

/** Run a rejecting call and hand back the error for extension inspection. */
const catchError = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to reject');
};

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

describe('block / unblock happy path', () => {
  test('blockTask parks the task, keeps its dueDate, and stamps reason + blockedAt', async () => {
    const due = new Date('2026-01-09T00:00:00Z');
    const t = await makeTask({ dueDate: due });

    const blocked = await resolvers.Mutation.blockTask(
      null,
      { id: String(t._id), reason: '  waiting on the vendor  ' },
      ctx(ALICE)
    );

    expect(blocked.status).toBe('blocked');
    expect(blocked.blockedReason).toBe('waiting on the vendor');
    expect(blocked.blockedAt).toBeInstanceOf(Date);
    // Parked, not rescheduled: the due date survives.
    expect(blocked.dueDate.getTime()).toBe(due.getTime());

    const fresh = await Task.findById(t._id);
    expect(fresh.status).toBe('blocked');
    expect(fresh.blockedAt).toBeInstanceOf(Date);
  });

  test('a reason is optional — blockedReason stays null', async () => {
    const t = await makeTask();
    const blocked = await taskService.blockTask(String(t._id), undefined, ALICE);
    expect(blocked.status).toBe('blocked');
    expect(blocked.blockedReason).toBeNull();
    expect(blocked.blockedAt).toBeInstanceOf(Date);
  });

  test('unblockTask returns the task to pending and clears the blocked fields', async () => {
    const due = new Date('2026-01-09T00:00:00Z');
    const t = await makeTask({ dueDate: due });
    await taskService.blockTask(String(t._id), 'waiting', ALICE);

    const unblocked = await resolvers.Mutation.unblockTask(null, { id: String(t._id) }, ctx(ALICE));
    expect(unblocked.status).toBe('pending');
    expect(unblocked.blockedReason).toBeNull();
    expect(unblocked.blockedAt).toBeNull();
    expect(unblocked.dueDate.getTime()).toBe(due.getTime());

    const fresh = await Task.findById(t._id);
    expect(fresh.blockedReason).toBeNull();
    expect(fresh.blockedAt).toBeNull();
  });

  test('re-blocking rewrites the reason but keeps the original parked-since', async () => {
    const t = await makeTask();
    const first = await taskService.blockTask(String(t._id), 'waiting on Bob', ALICE);
    const again = await taskService.blockTask(String(t._id), 'waiting on legal', ALICE);
    expect(again.blockedReason).toBe('waiting on legal');
    expect(again.blockedAt.getTime()).toBe(first.blockedAt.getTime());
  });

  test('updateTaskStatus("blocked") routes through the same guard and stamps blockedAt', async () => {
    const t = await makeTask();
    const blocked = await resolvers.Mutation.updateTaskStatus(
      null,
      { id: String(t._id), status: 'blocked' },
      ctx(ALICE)
    );
    expect(blocked.status).toBe('blocked');
    expect(blocked.blockedAt).toBeInstanceOf(Date);
    expect(blocked.blockedReason).toBeNull();
  });
});

describe('invalid transitions are 400-style errors', () => {
  test('blocking a completed task is rejected as BAD_USER_INPUT', async () => {
    const t = await makeTask();
    await taskService.updateTaskStatus(String(t._id), 'completed', ALICE);

    const err = await catchError(
      resolvers.Mutation.blockTask(null, { id: String(t._id), reason: 'nope' }, ctx(ALICE))
    );
    expect(err.message).toMatch(/completed task cannot be blocked/);
    expect(err.extensions?.code).toBe('BAD_USER_INPUT');
    expect(err.extensions?.http?.status).toBe(400);

    const fresh = await Task.findById(t._id);
    expect(fresh.status).toBe('completed');
    expect(fresh.blockedAt).toBeNull();
  });

  test('blocking a cancelled task is rejected', async () => {
    const t = await makeTask();
    await taskService.updateTaskStatus(String(t._id), 'cancelled', ALICE);
    const err = await catchError(
      resolvers.Mutation.blockTask(null, { id: String(t._id) }, ctx(ALICE))
    );
    expect(err.extensions?.code).toBe('BAD_USER_INPUT');
    expect((await Task.findById(t._id)).status).toBe('cancelled');
  });

  test('unblocking a task that is not blocked is rejected', async () => {
    const t = await makeTask();
    const err = await catchError(
      resolvers.Mutation.unblockTask(null, { id: String(t._id) }, ctx(ALICE))
    );
    expect(err.message).toMatch(/not blocked/);
    expect(err.extensions?.code).toBe('BAD_USER_INPUT');
  });

  test('an over-long reason is rejected before anything is written', async () => {
    const t = await makeTask();
    const err = await catchError(
      resolvers.Mutation.blockTask(
        null,
        { id: String(t._id), reason: 'x'.repeat(MAX_BLOCKED_REASON + 1) },
        ctx(ALICE)
      )
    );
    expect(err.extensions?.code).toBe('BAD_USER_INPUT');
    expect((await Task.findById(t._id)).status).toBe('pending');
  });
});

describe('ownership — block / unblock are scoped to the owner', () => {
  test('user B cannot block user A’s task', async () => {
    const t = await makeTask();
    await expect(
      resolvers.Mutation.blockTask(null, { id: String(t._id), reason: 'mine now' }, ctx(BOB))
    ).rejects.toThrow('Task not found');

    const fresh = await Task.findById(t._id);
    expect(fresh.status).toBe('pending');
    expect(fresh.blockedReason).toBeNull();
    expect(fresh.blockedAt).toBeNull();
  });

  test('user B cannot unblock user A’s blocked task', async () => {
    const t = await makeTask();
    await taskService.blockTask(String(t._id), 'waiting', ALICE);
    await expect(
      resolvers.Mutation.unblockTask(null, { id: String(t._id) }, ctx(BOB))
    ).rejects.toThrow('Task not found');
    expect((await Task.findById(t._id)).status).toBe('blocked');
  });

  test('unauthenticated block / unblock throw Unauthorized', async () => {
    const t = await makeTask();
    await expect(
      resolvers.Mutation.blockTask(null, { id: String(t._id) }, ctx(null))
    ).rejects.toThrow('Unauthorized');
    await expect(
      resolvers.Mutation.unblockTask(null, { id: String(t._id) }, ctx(null))
    ).rejects.toThrow('Unauthorized');
  });

  test('blockedTasks never leaks another user’s parked task', async () => {
    const t = await makeTask();
    await taskService.blockTask(String(t._id), 'waiting', ALICE);
    expect(await resolvers.Query.blockedTasks(null, {}, ctx(BOB))).toHaveLength(0);
    expect(await resolvers.Query.blockedTasks(null, {}, ctx(null))).toHaveLength(0);
    expect(await resolvers.Query.blockedTasks(null, {}, ctx(ALICE))).toHaveLength(1);
  });
});

describe('log views — a blocked task is neither due today nor overdue', () => {
  const daily = (date) =>
    taskService.getTasksForDateRange({ userId: ALICE, startDate: date, endDate: date, viewType: 'daily' });

  test('a blocked task due today drops out of the daily view', async () => {
    const t = await makeTask({ content: 'parked today', dueDate: new Date('2026-01-05T00:00:00Z') });
    expect((await daily('2026-01-05')).some((x) => x.content === 'parked today')).toBe(true);

    await taskService.blockTask(String(t._id), 'waiting on the vendor', ALICE);
    expect((await daily('2026-01-05')).some((x) => x.content === 'parked today')).toBe(false);
  });

  test('a blocked task with a past dueDate is not overdue — and returns to the log on unblock', async () => {
    const t = await makeTask({ content: 'parked overdue', dueDate: new Date('2026-01-05T00:00:00Z') });
    await taskService.blockTask(String(t._id), 'waiting', ALICE);

    // The carry-forward ("overdue") branch of a later day must not pick it up.
    expect((await daily('2026-01-12')).some((x) => x.content === 'parked overdue')).toBe(false);

    await taskService.unblockTask(String(t._id), ALICE);
    const back = await daily('2026-01-12');
    const row = back.find((x) => x.content === 'parked overdue');
    expect(row).toBeDefined();
    // Same due date it went in with — still in the past, so still overdue.
    expect(row.dueDate.getTime()).toBe(new Date('2026-01-05T00:00:00Z').getTime());
  });

  test('a blocked undated task does not float forward like a pending one', async () => {
    const t = await makeTask({ content: 'parked floater', dueDate: null });
    await taskService.blockTask(String(t._id), 'waiting', ALICE);
    expect((await daily('2026-01-12')).some((x) => x.content === 'parked floater')).toBe(false);
  });

  test('weekly and monthly views exclude it too', async () => {
    const t = await makeTask({ content: 'parked week', dueDate: new Date('2026-01-07T00:00:00Z') });
    await taskService.blockTask(String(t._id), 'waiting', ALICE);
    for (const viewType of ['weekly', 'monthly']) {
      const tasks = await taskService.getTasksForDateRange({
        userId: ALICE, startDate: '2026-01-07', endDate: '2026-01-07', viewType,
      });
      expect(tasks.some((x) => x.content === 'parked week')).toBe(false);
    }
  });

  test('the `all` corpus (search / export / backlog) still sees it', async () => {
    const t = await makeTask({ content: 'parked but findable', dueDate: new Date('2026-01-07T00:00:00Z') });
    await taskService.blockTask(String(t._id), 'waiting', ALICE);
    const all = await resolvers.Query.allTasks(null, {}, ctx(ALICE));
    expect(all.some((x) => x.content === 'parked but findable')).toBe(true);
  });
});

describe('blockedTasks query', () => {
  test('lists only blocked tasks, newest-blocked first', async () => {
    const older = await makeTask({ content: 'older block' });
    const newer = await makeTask({ content: 'newer block' });
    await makeTask({ content: 'still pending' });

    await taskService.blockTask(String(older._id), 'first', ALICE);
    await taskService.blockTask(String(newer._id), 'second', ALICE);
    // Pin the timestamps so the ordering assertion cannot race the clock.
    await Task.updateOne({ _id: older._id }, { $set: { blockedAt: new Date('2026-01-05T09:00:00Z') } });
    await Task.updateOne({ _id: newer._id }, { $set: { blockedAt: new Date('2026-01-06T09:00:00Z') } });

    const list = await resolvers.Query.blockedTasks(null, {}, ctx(ALICE));
    expect(list.map((t) => t.content)).toEqual(['newer block', 'older block']);
    expect(list.map((t) => t.blockedReason)).toEqual(['second', 'first']);
  });

  test('an unblocked task leaves the list', async () => {
    const t = await makeTask();
    await taskService.blockTask(String(t._id), 'waiting', ALICE);
    await taskService.unblockTask(String(t._id), ALICE);
    expect(await resolvers.Query.blockedTasks(null, {}, ctx(ALICE))).toHaveLength(0);
  });
});

describe('completing straight from blocked', () => {
  test('a blocked task can be completed, and the blocked fields are cleared', async () => {
    const t = await makeTask({ dueDate: new Date('2026-01-05T00:00:00Z') });
    await taskService.blockTask(String(t._id), 'waiting on the vendor', ALICE);

    const done = await resolvers.Mutation.updateTaskStatus(
      null,
      { id: String(t._id), status: 'completed' },
      ctx(ALICE)
    );
    expect(done.status).toBe('completed');
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(done.blockedReason).toBeNull();
    expect(done.blockedAt).toBeNull();

    const fresh = await Task.findById(t._id);
    expect(fresh.blockedReason).toBeNull();
    expect(fresh.blockedAt).toBeNull();
    expect(await resolvers.Query.blockedTasks(null, {}, ctx(ALICE))).toHaveLength(0);
  });

  test('cancelling from blocked clears them too', async () => {
    const t = await makeTask();
    await taskService.blockTask(String(t._id), 'waiting', ALICE);
    const cancelled = await taskService.updateTaskStatus(String(t._id), 'cancelled', ALICE);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(cancelled.blockedAt).toBeNull();
  });
});

describe('recurring series — blocking never spawns a duplicate', () => {
  const RULE = 'DTSTART:20260105T090000Z\nRRULE:FREQ=WEEKLY';

  test('a blocked series master stops expanding new virtual occurrences', async () => {
    const master = await makeTask({
      content: 'weekly standup',
      isSeriesMaster: true,
      dueDate: new Date('2026-01-05T09:00:00Z'),
      recurrenceRule: RULE,
    });
    const before = await taskService.getTasksForDateRange({
      userId: ALICE, startDate: '2026-01-12', endDate: '2026-01-12', viewType: 'daily',
    });
    expect(before.some((t) => t.isVirtual && String(t.seriesId) === String(master._id))).toBe(true);

    await taskService.blockTask(String(master._id), 'series on hold', ALICE);

    const after = await taskService.getTasksForDateRange({
      userId: ALICE, startDate: '2026-01-12', endDate: '2026-01-12', viewType: 'daily',
    });
    expect(after.some((t) => t.isVirtual && String(t.seriesId) === String(master._id))).toBe(false);
    // And the parked master itself is not smuggled into the log either.
    expect(after.some((t) => String(t._id) === String(master._id))).toBe(false);
  });

  test('blocking one occurrence materializes a single blocked override, master untouched', async () => {
    const master = await makeTask({
      content: 'weekly standup',
      isSeriesMaster: true,
      dueDate: new Date('2026-01-05T09:00:00Z'),
      recurrenceRule: RULE,
    });
    const occurrence = new Date('2026-01-12T09:00:00Z');

    const override = await taskService.blockTask(
      `virtual_${master._id}_${occurrence.getTime()}`,
      'that week is a holiday',
      ALICE
    );
    expect(override.status).toBe('blocked');
    expect(override.blockedReason).toBe('that week is a holiday');
    expect(override.blockedAt).toBeInstanceOf(Date);
    expect(override.isSeriesMaster).toBe(false);
    expect(String(override.seriesId)).toBe(String(master._id));

    const freshMaster = await Task.findById(master._id);
    expect(freshMaster.status).toBe('pending');
    expect(freshMaster.recurrenceRule).toBe(RULE);

    // Master + exactly one override; nothing else was materialized.
    expect(await Task.countDocuments({})).toBe(2);

    // The blocked date shows neither the override (blocked tasks leave the
    // log) nor a re-expanded virtual in its place.
    const blockedDay = await taskService.getTasksForDateRange({
      userId: ALICE, startDate: '2026-01-12', endDate: '2026-01-12', viewType: 'daily',
    });
    const onBlockedDate = blockedDay.filter(
      (t) => t.content === 'weekly standup' && t.dueDate?.getTime() === occurrence.getTime()
    );
    expect(onBlockedDate).toHaveLength(0);
    // What IS still there is the daily view's ordinary carry-forward of the
    // series' PREVIOUS (Jan 5) occurrence, which nobody blocked — pre-existing
    // behaviour, and proof the parked occurrence was suppressed on its own
    // merits rather than the whole series going quiet.
    expect(
      blockedDay.filter((t) => t.content === 'weekly standup' && t.isVirtual)
        .map((t) => t.dueDate.toISOString())
    ).toEqual(['2026-01-05T09:00:00.000Z']);

    // A different occurrence of the same series is unaffected.
    const otherDay = await taskService.getTasksForDateRange({
      userId: ALICE, startDate: '2026-01-19', endDate: '2026-01-19', viewType: 'daily',
    });
    expect(otherDay.filter((t) => t.content === 'weekly standup')).toHaveLength(1);

    // ...and the parked occurrence is exactly one row in the blocked list.
    const list = await resolvers.Query.blockedTasks(null, {}, ctx(ALICE));
    expect(list).toHaveLength(1);
    expect(String(list[0]._id)).toBe(String(override._id));
  });
});
