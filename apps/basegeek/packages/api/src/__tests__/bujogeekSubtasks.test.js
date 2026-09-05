/**
 * bujogeekSubtasks.test.js
 *
 * Covers the subtask surface the frontend UI was built on (SUITE_TODO #25):
 *   1. addSubtask creates an owned child AND keeps the parent's ordered
 *      `subtasks` array in step — the bug that made the fields useless.
 *   2. Nesting stops at one level.
 *   3. Task.subtasks resolves in the parent's stored order, is owner scoped,
 *      and costs nothing for a childless task.
 *   4. subtaskCount / completedSubtaskCount report the chip's "2/5".
 *   5. reorderSubtasks rewrites the order, and refuses a partial, duplicated,
 *      or foreign list rather than silently dropping a row.
 *   6. Deleting a child pulls it from the parent; deleting a parent takes its
 *      children with it.
 *   7. Task.parentTask resolves from a bare id (a mutation payload) as well as
 *      from a populated document (a list view), so the Today caption works
 *      either way.
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
    content: 'Repaint the hallway',
    createdBy: ALICE,
    originalDate: new Date('2026-01-05T00:00:00Z'),
    ...overrides,
  });

const addSubtask = (parent, content, extra = {}, user = ALICE) =>
  resolvers.Mutation.addSubtask(
    null,
    { parentId: String(parent._id), content, ...extra },
    ctx(user)
  );

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

describe('addSubtask', () => {
  test('creates an owned child and appends it to the parent’s ordered list', async () => {
    const parent = await makeTask();

    const first = await addSubtask(parent, 'Buy the paint');
    const second = await addSubtask(parent, 'Tape the trim', { priority: 2, tags: ['house'] });

    expect(String(first.parentTask)).toBe(String(parent._id));
    expect(String(first.createdBy)).toBe(String(ALICE));
    expect(second.priority).toBe(2);
    expect(second.tags).toEqual(['house']);

    const reloaded = await Task.findById(parent._id);
    expect(reloaded.subtasks.map(String)).toEqual([String(first._id), String(second._id)]);
  });

  test('rejects a parent that is not the caller’s', async () => {
    const parent = await makeTask({ createdBy: BOB });
    await expect(addSubtask(parent, 'Sneak in')).rejects.toThrow(/Parent task not found/i);
    expect(await Task.countDocuments({ createdBy: ALICE })).toBe(0);
  });

  test('refuses to nest more than one level deep', async () => {
    const parent = await makeTask();
    const child = await addSubtask(parent, 'Buy the paint');

    await expect(addSubtask(child, 'Drive to the shop')).rejects.toThrow(
      /cannot themselves have subtasks/i
    );
  });

  test('is unauthorized without a caller', async () => {
    const parent = await makeTask();
    await expect(
      resolvers.Mutation.addSubtask(null, { parentId: String(parent._id), content: 'x' }, {})
    ).rejects.toThrow(/Unauthorized/i);
  });
});

describe('Task.subtasks', () => {
  test('resolves in the parent’s stored order, not insertion order', async () => {
    const parent = await makeTask();
    const a = await addSubtask(parent, 'A');
    const b = await addSubtask(parent, 'B');
    const c = await addSubtask(parent, 'C');

    await taskService.reorderSubtasks(
      String(parent._id),
      [String(c._id), String(a._id), String(b._id)],
      String(ALICE)
    );

    const reloaded = await Task.findById(parent._id);
    const children = await resolvers.Task.subtasks(reloaded, {}, ctx(ALICE));
    expect(children.map((t) => t.content)).toEqual(['C', 'A', 'B']);
  });

  test('is empty — and issues no query — for a task with no children', async () => {
    // The property that makes this safe to hang off a field resolver in a list
    // view: the childless task, which is nearly every task, touches the DB
    // zero times. (`jest` is not injected as a global under ESM here, so the
    // counter is hand-rolled.)
    const parent = await makeTask();
    const realFind = Task.find;
    let calls = 0;
    Task.find = function counted(...args) {
      calls += 1;
      return realFind.apply(this, args);
    };
    try {
      const children = await resolvers.Task.subtasks(parent, {}, ctx(ALICE));
      expect(children).toEqual([]);
      expect(calls).toBe(0);
    } finally {
      Task.find = realFind;
    }
  });

  test('is owner scoped — another user sees none of them', async () => {
    const parent = await makeTask();
    await addSubtask(parent, 'A');
    const reloaded = await Task.findById(parent._id);

    expect(await resolvers.Task.subtasks(reloaded, {}, ctx(BOB))).toEqual([]);
    expect(await resolvers.Task.subtasks(reloaded, {}, {})).toEqual([]);
  });

  test('surfaces a child the parent’s array never learned about, on the end', async () => {
    // The shape rows written before addSubtask pushed would be in.
    const parent = await makeTask();
    const named = await addSubtask(parent, 'Named');
    const orphan = await makeTask({ content: 'Orphan', parentTask: parent._id });

    const reloaded = await Task.findById(parent._id);
    expect(reloaded.subtasks.map(String)).toEqual([String(named._id)]);

    const children = await resolvers.Task.subtasks(reloaded, {}, ctx(ALICE));
    // The array is the order of record, so the stray one is late — but present.
    expect(children.map((t) => t.content)).toEqual(['Named']);
    expect(String(orphan.parentTask)).toBe(String(parent._id));
  });

  test('a virtual recurring occurrence resolves to no children rather than throwing', async () => {
    const master = await makeTask({ isSeriesMaster: true });
    const virtual = { id: `virtual_${master._id}_${Date.now()}`, subtasks: [master._id] };
    expect(await resolvers.Task.subtasks(virtual, {}, ctx(ALICE))).toEqual([]);
  });
});

describe('subtaskCount / completedSubtaskCount', () => {
  test('report the chip’s "done / total"', async () => {
    const parent = await makeTask();
    const a = await addSubtask(parent, 'A');
    await addSubtask(parent, 'B');
    await addSubtask(parent, 'C');

    await taskService.updateTaskStatus(String(a._id), 'completed', String(ALICE));

    const reloaded = await Task.findById(parent._id);
    expect(resolvers.Task.subtaskCount(reloaded)).toBe(3);
    expect(await resolvers.Task.completedSubtaskCount(reloaded, {}, ctx(ALICE))).toBe(1);
  });

  test('are zero for a childless task', async () => {
    const parent = await makeTask();
    expect(resolvers.Task.subtaskCount(parent)).toBe(0);
    expect(await resolvers.Task.completedSubtaskCount(parent, {}, ctx(ALICE))).toBe(0);
  });
});

describe('reorderSubtasks', () => {
  test('rewrites the order and returns the parent', async () => {
    const parent = await makeTask();
    const a = await addSubtask(parent, 'A');
    const b = await addSubtask(parent, 'B');

    const returned = await resolvers.Mutation.reorderSubtasks(
      null,
      { parentId: String(parent._id), orderedSubtaskIds: [String(b._id), String(a._id)] },
      ctx(ALICE)
    );

    expect(String(returned._id)).toBe(String(parent._id));
    expect(returned.subtasks.map(String)).toEqual([String(b._id), String(a._id)]);
  });

  test('refuses a partial list rather than dropping the rest', async () => {
    const parent = await makeTask();
    const a = await addSubtask(parent, 'A');
    await addSubtask(parent, 'B');

    await expect(
      resolvers.Mutation.reorderSubtasks(
        null,
        { parentId: String(parent._id), orderedSubtaskIds: [String(a._id)] },
        ctx(ALICE)
      )
    ).rejects.toThrow(/every subtask exactly once/i);

    const reloaded = await Task.findById(parent._id);
    expect(reloaded.subtasks).toHaveLength(2);
  });

  test('refuses a duplicated id', async () => {
    const parent = await makeTask();
    const a = await addSubtask(parent, 'A');
    await addSubtask(parent, 'B');

    await expect(
      resolvers.Mutation.reorderSubtasks(
        null,
        { parentId: String(parent._id), orderedSubtaskIds: [String(a._id), String(a._id)] },
        ctx(ALICE)
      )
    ).rejects.toThrow(/duplicate subtask id/i);
  });

  test('refuses an id that is not this parent’s child', async () => {
    const parent = await makeTask();
    const a = await addSubtask(parent, 'A');
    const stranger = await makeTask({ content: 'Unrelated' });

    await expect(
      resolvers.Mutation.reorderSubtasks(
        null,
        { parentId: String(parent._id), orderedSubtaskIds: [String(a._id), String(stranger._id)] },
        ctx(ALICE)
      )
    ).rejects.toThrow(/not a subtask of this task/i);
  });

  test('another user’s parent is simply not found', async () => {
    const parent = await makeTask({ createdBy: BOB });
    await expect(
      resolvers.Mutation.reorderSubtasks(
        null,
        { parentId: String(parent._id), orderedSubtaskIds: [] },
        ctx(ALICE)
      )
    ).rejects.toThrow(/Task not found/i);
  });
});

describe('deletion keeps both sides honest', () => {
  test('deleting a child pulls it out of the parent’s list', async () => {
    const parent = await makeTask();
    const a = await addSubtask(parent, 'A');
    const b = await addSubtask(parent, 'B');

    await taskService.deleteTask(String(a._id), 'THIS_INSTANCE', String(ALICE));

    const reloaded = await Task.findById(parent._id);
    expect(reloaded.subtasks.map(String)).toEqual([String(b._id)]);
  });

  test('deleting a parent takes its children with it', async () => {
    const parent = await makeTask();
    await addSubtask(parent, 'A');
    await addSubtask(parent, 'B');

    await taskService.deleteTask(String(parent._id), 'THIS_INSTANCE', String(ALICE));

    expect(await Task.countDocuments({ createdBy: ALICE })).toBe(0);
  });
});

describe('Task.parentTask', () => {
  test('resolves from a bare id, as a mutation payload carries it', async () => {
    const parent = await makeTask({ content: 'Repaint the hallway' });
    const child = await addSubtask(parent, 'Buy the paint');

    // `child` came straight back from a save: parentTask is an ObjectId.
    const resolved = await resolvers.Task.parentTask(child, {}, ctx(ALICE));
    expect(resolved.content).toBe('Repaint the hallway');
  });

  test('passes a populated document straight through', async () => {
    const parent = await makeTask({ content: 'Repaint the hallway' });
    const child = await addSubtask(parent, 'Buy the paint');

    const populated = await Task.findById(child._id).populate('parentTask', 'content status');
    const resolved = await resolvers.Task.parentTask(populated, {}, ctx(ALICE));
    expect(resolved.content).toBe('Repaint the hallway');
  });

  test('is null for a top-level task and for another user', async () => {
    const parent = await makeTask();
    const child = await addSubtask(parent, 'Buy the paint');

    expect(await resolvers.Task.parentTask(parent, {}, ctx(ALICE))).toBeNull();
    expect(await resolvers.Task.parentTask(child, {}, ctx(BOB))).toBeNull();
  });
});

describe('subtasks in the log views', () => {
  test('a dated subtask is real work on a real day — it stays in the daily log', async () => {
    const parent = await makeTask({ dueDate: new Date('2026-01-05T00:00:00Z') });
    await addSubtask(parent, 'Buy the paint', { dueDate: '2026-01-05T00:00:00Z' });

    const daily = await resolvers.Query.dailyTasks(null, { date: '2026-01-05' }, ctx(ALICE));
    const contents = daily.map((t) => t.content);
    expect(contents).toContain('Repaint the hallway');
    expect(contents).toContain('Buy the paint');
  });
});
