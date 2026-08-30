/**
 * bujogeekTaskOwnership.test.js
 *
 * Covers the three bugs fixed in the bujogeek GraphQL module:
 *   1. IDOR — every task read/write is scoped by createdBy (service layer),
 *      including recurring `virtual_<masterId>_<epochMs>` ids.
 *   2. editScope is threaded from the resolver into the service.
 *   3. completedAt actually persists (and clears when un-completed).
 */

import { jest } from '@jest/globals';
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

describe('BUG 1 — ownership scoping', () => {
  test('task query returns null for another user’s task', async () => {
    const t = await makeTask();
    expect(await resolvers.Query.task(null, { id: String(t._id) }, ctx(ALICE))).not.toBeNull();
    expect(await resolvers.Query.task(null, { id: String(t._id) }, ctx(BOB))).toBeNull();
    expect(await resolvers.Query.task(null, { id: String(t._id) }, ctx(null))).toBeNull();
  });

  test('updateTask cannot touch another user’s task', async () => {
    const t = await makeTask();
    await expect(
      resolvers.Mutation.updateTask(null, { id: String(t._id), input: { content: 'pwned' } }, ctx(BOB))
    ).rejects.toThrow('Task not found');
    expect((await Task.findById(t._id)).content).toBe('a task');
  });

  test('deleteTask cannot delete another user’s task', async () => {
    const t = await makeTask();
    await expect(
      resolvers.Mutation.deleteTask(null, { id: String(t._id) }, ctx(BOB))
    ).rejects.toThrow('Task not found');
    expect(await Task.findById(t._id)).not.toBeNull();
  });

  test('updateTaskStatus cannot complete another user’s task', async () => {
    const t = await makeTask();
    await expect(
      resolvers.Mutation.updateTaskStatus(null, { id: String(t._id), status: 'completed' }, ctx(BOB))
    ).rejects.toThrow('Task not found');
    expect((await Task.findById(t._id)).status).toBe('pending');
  });

  test('migrateTaskToFuture cannot move another user’s task', async () => {
    const t = await makeTask({ dueDate: new Date('2026-01-05T00:00:00Z') });
    await expect(
      resolvers.Mutation.migrateTaskToFuture(
        null,
        { id: String(t._id), futureDate: new Date('2026-02-01T00:00:00Z') },
        ctx(BOB)
      )
    ).rejects.toThrow('Task not found');
  });

  test('addSubtask rejects a parent owned by someone else', async () => {
    const parent = await makeTask();
    await expect(
      resolvers.Mutation.addSubtask(null, { parentId: String(parent._id), content: 'sub' }, ctx(BOB))
    ).rejects.toThrow('Parent task not found');
  });

  test('unauthenticated mutations throw Unauthorized', async () => {
    const t = await makeTask();
    for (const call of [
      () => resolvers.Mutation.updateTask(null, { id: String(t._id), input: {} }, ctx(null)),
      () => resolvers.Mutation.deleteTask(null, { id: String(t._id) }, ctx(null)),
      () => resolvers.Mutation.updateTaskStatus(null, { id: String(t._id), status: 'completed' }, ctx(null)),
      () => resolvers.Mutation.migrateTaskToFuture(null, { id: String(t._id), futureDate: new Date() }, ctx(null)),
    ]) {
      await expect(call()).rejects.toThrow('Unauthorized');
    }
  });

  test('service layer refuses to run unscoped', async () => {
    const t = await makeTask();
    await expect(taskService.getTaskById(String(t._id))).rejects.toThrow('Unauthorized');
    await expect(taskService.updateTask(String(t._id), {}, 'THIS_INSTANCE')).rejects.toThrow('Unauthorized');
    await expect(taskService.deleteTask(String(t._id), 'THIS_INSTANCE')).rejects.toThrow('Unauthorized');
    await expect(taskService.updateTaskStatus(String(t._id), 'completed')).rejects.toThrow('Unauthorized');
  });

  test('virtual occurrence ids are ownership-checked after master resolution', async () => {
    const master = await makeTask({
      content: 'weekly standup',
      isSeriesMaster: true,
      dueDate: new Date('2026-01-05T09:00:00Z'),
      recurrenceRule: 'DTSTART:20260105T090000Z\nRRULE:FREQ=WEEKLY',
    });
    const occurrence = new Date('2026-01-12T09:00:00Z');
    const virtualId = `virtual_${master._id}_${occurrence.getTime()}`;

    await expect(
      resolvers.Mutation.updateTask(null, { id: virtualId, input: { content: 'pwned' } }, ctx(BOB))
    ).rejects.toThrow('Task not found');
    expect(await Task.countDocuments({ createdBy: BOB })).toBe(0);

    const override = await resolvers.Mutation.updateTask(
      null,
      { id: virtualId, input: { content: 'moved' } },
      ctx(ALICE)
    );
    expect(String(override.createdBy)).toBe(String(ALICE));
    expect(override.seriesId).toBe(String(master._id));
  });

  test('malformed ids do not throw a CastError', async () => {
    expect(await resolvers.Query.task(null, { id: 'not-an-objectid' }, ctx(ALICE))).toBeNull();
    await expect(
      resolvers.Mutation.deleteTask(null, { id: 'not-an-objectid' }, ctx(ALICE))
    ).rejects.toThrow('Task not found');
  });
});

describe('BUG 2 — editScope passthrough', () => {
  const RULE = 'DTSTART:20260105T090000Z\nRRULE:FREQ=WEEKLY';

  const makeSeries = () =>
    makeTask({
      content: 'weekly standup',
      isSeriesMaster: true,
      dueDate: new Date('2026-01-05T09:00:00Z'),
      recurrenceRule: RULE,
    });

  test('resolver forwards editScope to the service', async () => {
    const spy = jest.spyOn(taskService, 'updateTask').mockResolvedValue({ _id: 'x' });
    await resolvers.Mutation.updateTask(
      null,
      { id: 'abc', input: { content: 'c' }, editScope: 'ALL_INSTANCES' },
      ctx(ALICE)
    );
    expect(spy).toHaveBeenCalledWith('abc', { content: 'c' }, 'ALL_INSTANCES', String(ALICE));
    spy.mockRestore();

    const delSpy = jest.spyOn(taskService, 'deleteTask').mockResolvedValue({ _id: 'x' });
    await resolvers.Mutation.deleteTask(null, { id: 'abc', editScope: 'ALL_INSTANCES' }, ctx(ALICE));
    expect(delSpy).toHaveBeenCalledWith('abc', 'ALL_INSTANCES', String(ALICE));
    delSpy.mockRestore();
  });

  test('THIS_INSTANCE materializes an override, leaving the master alone', async () => {
    const master = await makeSeries();
    const occ = new Date('2026-01-12T09:00:00Z');
    const res = await taskService.updateTask(
      `virtual_${master._id}_${occ.getTime()}`,
      { content: 'just this one' },
      'THIS_INSTANCE',
      ALICE
    );
    expect(res.content).toBe('just this one');
    expect(res.isSeriesMaster).toBe(false);
    expect(res.recurrenceRule).toBeNull();
    expect((await Task.findById(master._id)).content).toBe('weekly standup');
  });

  test('ALL_INSTANCES edits the series master, creating no override', async () => {
    const master = await makeSeries();
    const occ = new Date('2026-01-12T09:00:00Z');
    await taskService.updateTask(
      `virtual_${master._id}_${occ.getTime()}`,
      { content: 'renamed series' },
      'ALL_INSTANCES',
      ALICE
    );
    expect((await Task.findById(master._id)).content).toBe('renamed series');
    expect(await Task.countDocuments({ seriesId: String(master._id) })).toBe(0);
  });

  test('ALL_INSTANCES delete removes the master and its overrides', async () => {
    const master = await makeSeries();
    await makeTask({ seriesId: String(master._id), originalDueDate: new Date('2026-01-12T09:00:00Z') });
    const res = await taskService.deleteTask(
      `virtual_${master._id}_${new Date('2026-01-19T09:00:00Z').getTime()}`,
      'ALL_INSTANCES',
      ALICE
    );
    expect(res).not.toBeNull();
    expect(await Task.countDocuments({})).toBe(0);
  });

  test('THIS_INSTANCE delete only adds an exdate', async () => {
    const master = await makeSeries();
    const occ = new Date('2026-01-12T09:00:00Z');
    await taskService.deleteTask(`virtual_${master._id}_${occ.getTime()}`, 'THIS_INSTANCE', ALICE);
    const fresh = await Task.findById(master._id);
    expect(fresh).not.toBeNull();
    expect(fresh.exdates.map((d) => d.getTime())).toContain(occ.getTime());
  });

  test('FUTURE_INSTANCES splits the series at the occurrence', async () => {
    const master = await makeSeries();
    const occ = new Date('2026-01-19T09:00:00Z');
    const newMaster = await taskService.updateTask(
      `virtual_${master._id}_${occ.getTime()}`,
      { content: 'from here on' },
      'FUTURE_INSTANCES',
      ALICE
    );
    const old = await Task.findById(master._id);
    expect(old.recurrenceRule).toMatch(/UNTIL=/);
    expect(newMaster.isSeriesMaster).toBe(true);
    expect(newMaster.content).toBe('from here on');
    expect(String(newMaster._id)).not.toBe(String(master._id));
  });

  test('FUTURE_INSTANCES delete truncates the series without removing the past', async () => {
    const master = await makeSeries();
    const occ = new Date('2026-01-19T09:00:00Z');
    await taskService.deleteTask(`virtual_${master._id}_${occ.getTime()}`, 'FUTURE_INSTANCES', ALICE);
    const old = await Task.findById(master._id);
    expect(old).not.toBeNull();
    expect(old.recurrenceRule).toMatch(/UNTIL=/);
  });

  test('an unknown editScope falls back to THIS_INSTANCE', async () => {
    const master = await makeSeries();
    const occ = new Date('2026-01-12T09:00:00Z');
    await taskService.updateTask(
      `virtual_${master._id}_${occ.getTime()}`,
      { content: 'x' },
      'BOGUS',
      ALICE
    );
    expect((await Task.findById(master._id)).content).toBe('weekly standup');
  });
});

describe('BUG 3 — completedAt persists', () => {
  test('set on completion, cleared when re-opened', async () => {
    const t = await makeTask();
    const done = await resolvers.Mutation.updateTaskStatus(
      null,
      { id: String(t._id), status: 'completed' },
      ctx(ALICE)
    );
    expect(done.completedAt).toBeInstanceOf(Date);
    expect((await Task.findById(t._id)).completedAt).toBeInstanceOf(Date);

    const reopened = await resolvers.Mutation.updateTaskStatus(
      null,
      { id: String(t._id), status: 'pending' },
      ctx(ALICE)
    );
    expect(reopened.completedAt).toBeNull();
    expect((await Task.findById(t._id)).completedAt).toBeNull();
  });
});
