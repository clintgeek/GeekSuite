/**
 * bujogeekRecurrenceUnification.test.js
 *
 * BuJoGeek used to carry two recurrence systems; RRULE is now the only one.
 * This suite covers the three moving parts of that unification:
 *   1. The legacy `recurrencePattern` shim — accepted on input, translated to
 *      an equivalent RRULE series master at create time.
 *   2. The removal of the legacy auto-spawn-on-completion branch.
 *   3. scripts/migrate-bujogeek-recurrence.js — conversion, ownership
 *      preservation, and idempotency.
 */

import mongoose from 'mongoose';

const { default: Task } = await import('../graphql/bujogeek/models/Task.js');
const { default: taskService, recurrencePatternToRRule, formatDtstart } =
  await import('../graphql/bujogeek/services/taskService.js');
const { resolvers } = await import('../graphql/bujogeek/resolvers.js');
const { migrateBujogeekRecurrence } =
  await import('../../scripts/migrate-bujogeek-recurrence.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => ({ user: { id: String(userId) } });

const DUE = new Date('2026-03-15T09:00:00.000Z');

/** Insert a document straight into Mongo, bypassing the service's shim. */
const rawTask = (overrides = {}) =>
  Task.create({
    content: 'legacy chore',
    createdBy: ALICE,
    originalDate: DUE,
    dueDate: DUE,
    ...overrides,
  });

const silent = () => {};

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

/* ────────────────────────────────────────────────────────────────────────── */

describe('RRULE string format', () => {
  test('formatDtstart emits an iCalendar UTC timestamp', () => {
    expect(formatDtstart(DUE)).toBe('20260315T090000Z');
  });

  test('recurrencePatternToRRule builds DTSTART + RRULE', () => {
    expect(recurrencePatternToRRule('weekly', DUE)).toBe(
      'DTSTART:20260315T090000Z\nRRULE:FREQ=WEEKLY'
    );
    expect(recurrencePatternToRRule('daily', DUE)).toBe(
      'DTSTART:20260315T090000Z\nRRULE:FREQ=DAILY'
    );
    expect(recurrencePatternToRRule('monthly', DUE)).toBe(
      'DTSTART:20260315T090000Z\nRRULE:FREQ=MONTHLY'
    );
  });

  test('recurrencePatternToRRule returns null for non-recurring / unknown input', () => {
    expect(recurrencePatternToRRule('none', DUE)).toBeNull();
    expect(recurrencePatternToRRule(null, DUE)).toBeNull();
    expect(recurrencePatternToRRule('yearly', DUE)).toBeNull();
    expect(recurrencePatternToRRule('weekly', 'not-a-date')).toBeNull();
  });
});

describe('createTask — legacy recurrencePattern shim', () => {
  test('translates recurrencePattern into an RRULE series master', async () => {
    const task = await resolvers.Mutation.createTask(
      null,
      { content: 'water plants', dueDate: DUE, recurrencePattern: 'weekly' },
      ctx(ALICE)
    );

    expect(task.recurrenceRule).toBe('DTSTART:20260315T090000Z\nRRULE:FREQ=WEEKLY');
    expect(task.isSeriesMaster).toBe(true);
    // The legacy field is never persisted alongside an RRULE.
    expect(task.recurrencePattern).toBe('none');
    expect(String(task.createdBy)).toBe(String(ALICE));
  });

  test('falls back to originalDate for DTSTART when there is no dueDate', async () => {
    const task = await taskService.createTask({
      content: 'no due date',
      createdBy: ALICE,
      originalDate: DUE,
      recurrencePattern: 'daily',
    });
    expect(task.recurrenceRule).toBe('DTSTART:20260315T090000Z\nRRULE:FREQ=DAILY');
    expect(task.isSeriesMaster).toBe(true);
  });

  test('an explicit recurrenceRule wins over recurrencePattern', async () => {
    const rule = 'DTSTART:20260101T090000Z\nRRULE:FREQ=MONTHLY';
    const task = await resolvers.Mutation.createTask(
      null,
      { content: 'rent', dueDate: DUE, recurrencePattern: 'weekly', recurrenceRule: rule },
      ctx(ALICE)
    );
    expect(task.recurrenceRule).toBe(rule);
    expect(task.isSeriesMaster).toBe(true);
    expect(task.recurrencePattern).toBe('none');
  });

  test('recurrencePattern "none" creates a plain, non-series task', async () => {
    const task = await resolvers.Mutation.createTask(
      null,
      { content: 'one off', dueDate: DUE, recurrencePattern: 'none' },
      ctx(ALICE)
    );
    expect(task.recurrenceRule).toBeNull();
    expect(task.isSeriesMaster).toBe(false);
  });

  test('the shimmed rule actually expands into virtual occurrences', async () => {
    await resolvers.Mutation.createTask(
      null,
      { content: 'standup', dueDate: DUE, recurrencePattern: 'daily' },
      ctx(ALICE)
    );

    const tasks = await taskService.getTasksForDateRange({
      userId: ALICE,
      startDate: '2026-03-17',
      endDate: '2026-03-17',
      viewType: 'daily',
    });

    const virtual = tasks.filter((t) => t.isVirtual);
    expect(virtual.length).toBeGreaterThan(0);
    expect(virtual[0].content).toBe('standup');
    // The master itself is never returned as a real row.
    expect(tasks.some((t) => t.isSeriesMaster)).toBe(false);
  });
});

describe('updateTaskStatus — no more legacy auto-spawn', () => {
  test('completing a legacy recurrencePattern task spawns nothing', async () => {
    const legacy = await rawTask({ recurrencePattern: 'daily', status: 'pending' });

    const updated = await resolvers.Mutation.updateTaskStatus(
      null,
      { id: String(legacy._id), status: 'completed' },
      ctx(ALICE)
    );

    expect(updated.status).toBe('completed');
    expect(updated.completedAt).toBeInstanceOf(Date);
    expect(await Task.countDocuments({})).toBe(1);
  });

  test('completing a weekly legacy task spawns nothing', async () => {
    await rawTask({ content: 'weekly review', recurrencePattern: 'weekly' });
    const t = await Task.findOne({ content: 'weekly review' });
    await resolvers.Mutation.updateTaskStatus(
      null,
      { id: String(t._id), status: 'completed' },
      ctx(ALICE)
    );
    expect(await Task.countDocuments({ status: 'pending' })).toBe(0);
    expect(await Task.countDocuments({})).toBe(1);
  });

  test('completing an RRULE occurrence still materializes a single override', async () => {
    const master = await taskService.createTask({
      content: 'stretch',
      createdBy: ALICE,
      originalDate: DUE,
      dueDate: DUE,
      recurrenceRule: 'DTSTART:20260315T090000Z\nRRULE:FREQ=DAILY',
    });

    const occurrence = new Date('2026-03-17T09:00:00.000Z');
    const done = await taskService.updateTaskStatus(
      `virtual_${ master._id }_${ occurrence.getTime() }`,
      'completed',
      ALICE
    );

    expect(done.status).toBe('completed');
    expect(String(done.seriesId)).toBe(String(master._id));
    expect(done.isSeriesMaster).toBe(false);
    // master + exactly one override — no runaway spawning
    expect(await Task.countDocuments({})).toBe(2);
  });
});

describe('updateTask — recurrence promotion / demotion', () => {
  test('setting a recurrenceRule promotes a plain task to a series master', async () => {
    const t = await rawTask({ content: 'gym' });
    const rule = 'DTSTART:20260315T090000Z\nRRULE:FREQ=WEEKLY';

    const updated = await resolvers.Mutation.updateTask(
      null,
      { id: String(t._id), input: { recurrenceRule: rule } },
      ctx(ALICE)
    );

    expect(updated.recurrenceRule).toBe(rule);
    expect(updated.isSeriesMaster).toBe(true);
  });

  test('clearing the rule demotes the master back to a plain task', async () => {
    const master = await taskService.createTask({
      content: 'gym',
      createdBy: ALICE,
      originalDate: DUE,
      dueDate: DUE,
      recurrenceRule: 'DTSTART:20260315T090000Z\nRRULE:FREQ=WEEKLY',
    });

    const updated = await taskService.updateTask(
      String(master._id),
      { recurrenceRule: null },
      'ALL_INSTANCES',
      ALICE
    );

    expect(updated.recurrenceRule).toBeNull();
    expect(updated.isSeriesMaster).toBe(false);
  });

  test('an ordinary edit leaves an existing series untouched', async () => {
    const rule = 'DTSTART:20260315T090000Z\nRRULE:FREQ=WEEKLY';
    const master = await taskService.createTask({
      content: 'gym',
      createdBy: ALICE,
      originalDate: DUE,
      dueDate: DUE,
      recurrenceRule: rule,
    });

    const updated = await taskService.updateTask(
      String(master._id),
      { content: 'gym (renamed)' },
      'ALL_INSTANCES',
      ALICE
    );

    expect(updated.content).toBe('gym (renamed)');
    expect(updated.recurrenceRule).toBe(rule);
    expect(updated.isSeriesMaster).toBe(true);
  });
});

describe('migrate-bujogeek-recurrence script', () => {
  const seedLegacy = async () => {
    await rawTask({ content: 'alice daily', recurrencePattern: 'daily', createdBy: ALICE });
    await rawTask({
      content: 'bob monthly',
      recurrencePattern: 'monthly',
      createdBy: BOB,
      dueDate: null,
      originalDate: new Date('2026-02-01T09:00:00.000Z'),
    });
    await rawTask({
      content: 'already done',
      recurrencePattern: 'weekly',
      status: 'completed',
      completedAt: new Date('2026-03-15T10:00:00.000Z'),
    });
    await rawTask({
      content: 'plain task',
    });
    await rawTask({
      content: 'already rrule',
      recurrenceRule: 'DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY',
      isSeriesMaster: true,
    });
  };

  test('dry run reports work without writing anything', async () => {
    await seedLegacy();
    const stats = await migrateBujogeekRecurrence({ dryRun: true, log: silent });

    expect(stats).toMatchObject({ converted: 2, cleared: 1, skipped: 0, dryRun: true });
    expect(await Task.countDocuments({ recurrencePattern: { $ne: 'none' } })).toBe(3);
    expect(await Task.countDocuments({ isSeriesMaster: true })).toBe(1);
  });

  test('converts pending legacy tasks into RRULE series masters', async () => {
    await seedLegacy();
    const stats = await migrateBujogeekRecurrence({ dryRun: false, log: silent });
    expect(stats).toMatchObject({ converted: 2, cleared: 1, skipped: 0 });

    const alice = await Task.findOne({ content: 'alice daily' });
    expect(alice.recurrenceRule).toBe('DTSTART:20260315T090000Z\nRRULE:FREQ=DAILY');
    expect(alice.isSeriesMaster).toBe(true);
    expect(alice.recurrencePattern).toBe('none');
    expect(String(alice.createdBy)).toBe(String(ALICE));

    // DTSTART falls back to originalDate when dueDate is null; ownership preserved.
    const bob = await Task.findOne({ content: 'bob monthly' });
    expect(bob.recurrenceRule).toBe('DTSTART:20260201T090000Z\nRRULE:FREQ=MONTHLY');
    expect(bob.isSeriesMaster).toBe(true);
    expect(String(bob.createdBy)).toBe(String(BOB));
  });

  test('completed legacy occurrences stay plain completed tasks', async () => {
    await seedLegacy();
    await migrateBujogeekRecurrence({ dryRun: false, log: silent });

    const done = await Task.findOne({ content: 'already done' });
    expect(done.status).toBe('completed');
    expect(done.recurrenceRule).toBeNull();
    expect(done.isSeriesMaster).toBe(false);
    expect(done.recurrencePattern).toBe('none');
  });

  test('leaves plain tasks and existing RRULE series alone', async () => {
    await seedLegacy();
    await migrateBujogeekRecurrence({ dryRun: false, log: silent });

    const plain = await Task.findOne({ content: 'plain task' });
    expect(plain.recurrenceRule).toBeNull();
    expect(plain.isSeriesMaster).toBe(false);

    const existing = await Task.findOne({ content: 'already rrule' });
    expect(existing.recurrenceRule).toBe('DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY');
  });

  test('is idempotent — a second run converts nothing', async () => {
    await seedLegacy();
    await migrateBujogeekRecurrence({ dryRun: false, log: silent });
    const before = await Task.find({}).sort({ content: 1 }).lean();

    const second = await migrateBujogeekRecurrence({ dryRun: false, log: silent });
    expect(second).toMatchObject({ converted: 0, cleared: 0, skipped: 0 });

    const after = await Task.find({}).sort({ content: 1 }).lean();
    expect(after.map((t) => t.recurrenceRule)).toEqual(before.map((t) => t.recurrenceRule));
    expect(after.length).toBe(before.length);
  });

  test('migrated series expand into virtual occurrences for their owner only', async () => {
    await seedLegacy();
    await migrateBujogeekRecurrence({ dryRun: false, log: silent });

    const aliceTasks = await taskService.getTasksForDateRange({
      userId: ALICE,
      startDate: '2026-03-18',
      endDate: '2026-03-18',
      viewType: 'daily',
    });
    expect(aliceTasks.some((t) => t.isVirtual && t.content === 'alice daily')).toBe(true);
    expect(aliceTasks.some((t) => t.content === 'bob monthly')).toBe(false);
  });
});
