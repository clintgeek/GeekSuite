/**
 * todogeekPrivate.test.js
 *
 * "Private" tasks (2026-10-01): the owner does not want a task's words on a
 * shared screen. The desktop UI hides them; the gateway's half is
 *   1. the flag persists — create, update on/off, `null` read as false — and
 *      is backward compatible: a row with no `private` key, and a client that
 *      never sends one, are simply not private;
 *   2. a recurring master's flag carries onto its virtual occurrences;
 *   3. a private task's reminder push NEVER carries its words, tags or note —
 *      not in the title, not in the body, not anywhere in the serialised
 *      payload a push service, an OS or a shared desktop would see;
 *   4. the AI weekly review's facts (the prompt) carry "Private task" in place
 *      of the title and no blocked reason.
 */

import mongoose from 'mongoose';
import { jest } from '@jest/globals';

const { default: Task } = await import('../graphql/todogeek/models/Task.js');
const { default: PushSubscription } = await import('../graphql/todogeek/models/PushSubscription.js');
const { default: reminderService, PRIVATE_TITLE } = await import(
  '../graphql/todogeek/services/reminderService.js'
);
const reviewService = await import('../graphql/todogeek/services/reviewService.js');
const { resolvers } = await import('../graphql/todogeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const ctx = (userId) => ({ user: { id: String(userId) } });

const NOW = new Date('2026-03-15T14:30:00.000Z');
const minutesBefore = (mins) => new Date(NOW.getTime() - mins * 60 * 1000);

const SECRET = 'Fire Jane';
const SECRET_TAG = 'hrJane';
const SECRET_NOTE = 'talk to legal about Jane first';

const makeTransport = () => ({
  sends: [],
  sendNotification: jest.fn(function (subscription, payload) {
    this.sends.push({ endpoint: subscription.endpoint, raw: payload, payload: JSON.parse(payload) });
    return Promise.resolve({ statusCode: 201 });
  }),
});

beforeAll(async () => {
  await Task.db.asPromise();
  await PushSubscription.init();
}, 60000);

afterEach(async () => {
  await Task.deleteMany({});
  await PushSubscription.deleteMany({});
});

afterAll(async () => {
  reminderService.stop();
  reminderService.transport = null;
  reminderService.transportReady = false;
  await Task.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const create = (args) => resolvers.Mutation.createTask(null, { content: SECRET, ...args }, ctx(ALICE));
const update = (id, input) => resolvers.Mutation.updateTask(null, { id: String(id), input }, ctx(ALICE));
const readPrivate = (doc) => resolvers.Task.private(doc);

describe('the private flag persists', () => {
  test('createTask with private: true stores it and resolves true', async () => {
    const task = await create({ private: true });
    const stored = await Task.findById(task._id).lean();
    expect(stored.private).toBe(true);
    expect(readPrivate(task)).toBe(true);
  });

  test('a client that never sends it (every pre-private bundle) gets a non-private task', async () => {
    const task = await create({});
    expect((await Task.findById(task._id).lean()).private).toBe(false);
    expect(readPrivate(task)).toBe(false);
  });

  test('private: null on create is stored as false, never null', async () => {
    const task = await create({ private: null });
    expect((await Task.findById(task._id).lean()).private).toBe(false);
  });

  test('updateTask turns it on and off; null turns it off', async () => {
    const task = await create({});
    expect((await update(task._id, { private: true })).private).toBe(true);
    expect((await Task.findById(task._id).lean()).private).toBe(true);
    expect((await update(task._id, { private: false })).private).toBe(false);
    await update(task._id, { private: true });
    await update(task._id, { private: null });
    expect((await Task.findById(task._id).lean()).private).toBe(false);
  });

  test('an edit that does not mention it leaves it alone', async () => {
    const task = await create({ private: true });
    await update(task._id, { content: 'Fire Jane, kindly' });
    expect((await Task.findById(task._id).lean()).private).toBe(true);
  });

  test('a row written before the field existed resolves false', async () => {
    const { insertedId } = await Task.collection.insertOne({
      content: 'old row', createdBy: ALICE, status: 'pending', originalDate: NOW, tags: [],
    });
    const raw = await Task.collection.findOne({ _id: insertedId });
    expect('private' in raw).toBe(false);
    expect(readPrivate(raw)).toBe(false);
    const all = await resolvers.Query.allTasks(null, {}, ctx(ALICE));
    expect(all.map((t) => readPrivate(t))).toEqual([false]);
  });

  test('a non-boolean is a BAD_USER_INPUT, before anything is written', async () => {
    await expect(create({ private: 'yes' })).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(await Task.countDocuments({})).toBe(0);
  });

  test('a private series master marks its virtual occurrences private', async () => {
    const start = new Date();
    start.setUTCHours(9, 0, 0, 0);
    const dt = start.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    await create({ private: true, dueDate: start, recurrenceRule: `DTSTART:${dt}\nRRULE:FREQ=DAILY` });
    const all = await resolvers.Query.allTasks(null, {}, ctx(ALICE));
    const virtuals = all.filter((t) => String(t._id).startsWith('virtual_'));
    expect(virtuals.length).toBeGreaterThan(0);
    expect(virtuals.every((t) => readPrivate(t) === true)).toBe(true);
  });
});

describe('a private task’s reminder never carries its words', () => {
  test('the payload says "Private task due" and nothing of the task', async () => {
    const transport = makeTransport();
    reminderService.setTransport(transport);
    await PushSubscription.create({
      createdBy: ALICE, endpoint: 'https://push.example/alice', keys: { p256dh: 'p', auth: 'a' },
    });
    const task = await Task.create({
      content: SECRET, note: SECRET_NOTE, tags: [SECRET_TAG], private: true,
      createdBy: ALICE, status: 'pending', dueDate: minutesBefore(1), originalDate: NOW,
    });

    const summary = await reminderService.tick(NOW);
    expect(summary.sent).toBe(1);
    const [{ raw, payload }] = transport.sends;

    expect(payload.title).toBe(PRIVATE_TITLE);
    expect(payload.title).toBe('Private task due');
    expect(payload.body).toBe('Due 14:29 UTC');
    expect(payload.tags).toEqual([]);
    expect(payload.dueDate).toBe(task.dueDate.toISOString());
    // The whole wire string, not just the fields we know about.
    expect(raw).not.toMatch(/Jane/i);
    expect(raw).not.toContain(SECRET_TAG);
    expect(raw).not.toContain('legal');
  });

  test('a non-private task still gets its words (the control)', async () => {
    const payload = reminderService.buildPayload({
      _id: 'x', content: SECRET, tags: [SECRET_TAG], dueDate: minutesBefore(1), private: false,
    });
    expect(payload.title).toBe(SECRET);
    expect(payload.tags).toEqual([SECRET_TAG]);
  });
});

describe('the AI weekly review never sees a private task’s words', () => {
  test('overdue and parked private tasks are "Private task", with no reason', async () => {
    const MONDAY = new Date('2026-03-09T00:00:00.000Z');
    await Task.create({
      content: SECRET, private: true, createdBy: ALICE, status: 'pending',
      dueDate: new Date('2026-03-10T00:00:00.000Z'), originalDate: MONDAY,
    });
    await Task.create({
      content: 'Finish write-up for David', private: true, createdBy: ALICE, status: 'blocked',
      blockedReason: 'waiting on David', blockedAt: new Date('2026-03-11T10:00:00.000Z'),
      dueDate: new Date('2026-03-11T00:00:00.000Z'), originalDate: MONDAY,
    });
    await Task.create({
      content: 'Order seed potatoes', createdBy: ALICE, status: 'pending',
      dueDate: new Date('2026-03-10T00:00:00.000Z'), originalDate: MONDAY,
    });

    const facts = await reviewService.gatherFacts({ userId: ALICE, weekStart: MONDAY });
    const prompt = JSON.stringify(reviewService.factsForModel(facts));
    expect(prompt).not.toMatch(/Jane|David/);
    const overdueTitles = facts.overdue.map((t) => t.title);
    expect(overdueTitles).toContain('Order seed potatoes');
    expect(overdueTitles).toContain(reviewService.PRIVATE_TASK_TITLE);
    expect(facts.blocked).toEqual([
      expect.objectContaining({ title: reviewService.PRIVATE_TASK_TITLE, reason: null }),
    ]);
  });
});
