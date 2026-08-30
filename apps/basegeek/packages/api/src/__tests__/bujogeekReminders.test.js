/**
 * bujogeekReminders.test.js
 *
 * Covers web-push task reminders — the one BuJoGeek feature that fires without
 * anybody looking at the app:
 *   1. hasDueTime encodes the module's date-only convention: a dueDate at
 *      exactly UTC midnight is a calendar date and never reminds.
 *   2. tick() sends exactly once, only for pending + timed + due-in-window
 *      tasks, and to that task owner's devices only.
 *   3. remindedAt is stamped even when every push fails, so a reminder is
 *      fired once and never backlogged.
 *   4. The 15-minute missed-reminder cap: a restart does not spam old tasks.
 *   5. A 404/410 from the push service prunes the dead subscription row.
 *   6. Subscription CRUD is owner-scoped and idempotent per endpoint.
 *
 * The push transport is injected (reminderService.setTransport) rather than
 * module-mocked — the service is built for it, and nothing here touches the
 * network or the real `web-push` VAPID configuration.
 */

import mongoose from 'mongoose';
import { jest } from '@jest/globals';

const { default: Task } = await import('../graphql/bujogeek/models/Task.js');
const { default: PushSubscription } = await import(
  '../graphql/bujogeek/models/PushSubscription.js'
);
const { default: reminderService, hasDueTime, MISSED_WINDOW_MS } = await import(
  '../graphql/bujogeek/services/reminderService.js'
);
const { resolvers } = await import('../graphql/bujogeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

/** A fixed "now" so every window assertion is arithmetic, not wall-clock luck. */
const NOW = new Date('2026-03-15T14:30:00.000Z');
const minutesBefore = (mins) => new Date(NOW.getTime() - mins * 60 * 1000);

const makeTask = (overrides = {}) =>
  Task.create({
    content: 'Call the dentist',
    createdBy: ALICE,
    status: 'pending',
    dueDate: minutesBefore(1),
    originalDate: NOW,
    ...overrides,
  });

const subscribe = (userId = ALICE, endpoint = 'https://push.example/alice-phone') =>
  PushSubscription.create({
    createdBy: userId,
    endpoint,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  });

/** A transport that records every send; `failWith` makes the next sends throw. */
const makeTransport = (failWith = null) => ({
  sends: [],
  sendNotification: jest.fn(function (subscription, payload) {
    this.sends.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
    if (failWith) return Promise.reject(failWith);
    return Promise.resolve({ statusCode: 201 });
  }),
});

const useTransport = (failWith = null) => {
  const transport = makeTransport(failWith);
  reminderService.setTransport(transport);
  return transport;
};

beforeAll(async () => {
  await Task.db.asPromise();
  await PushSubscription.init();
}, 60000);

afterEach(async () => {
  await Task.deleteMany({});
  await PushSubscription.deleteMany({});
  jest.restoreAllMocks();
});

afterAll(async () => {
  reminderService.stop();
  // Put the transport back to "not injected" so nothing leaks into other suites.
  reminderService.transport = null;
  reminderService.transportReady = false;
  await Task.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('hasDueTime — the date-only convention', () => {
  test('exactly UTC midnight is a calendar date, not a moment', () => {
    expect(hasDueTime(new Date('2026-03-15T00:00:00.000Z'))).toBe(false);
  });

  test('any other instant carries a real due time', () => {
    expect(hasDueTime(new Date('2026-03-15T00:00:00.001Z'))).toBe(true);
    expect(hasDueTime(new Date('2026-03-15T09:00:00.000Z'))).toBe(true);
    expect(hasDueTime(new Date('2026-03-15T23:59:00.000Z'))).toBe(true);
  });

  test('null and unparseable values are not reminder-eligible', () => {
    expect(hasDueTime(null)).toBe(false);
    expect(hasDueTime(undefined)).toBe(false);
    expect(hasDueTime(new Date('nope'))).toBe(false);
  });
});

describe('tick — what gets a reminder', () => {
  test('a timed, due, unreminded pending task pushes to its owner’s devices', async () => {
    const transport = useTransport();
    await subscribe(ALICE, 'https://push.example/alice-phone');
    await subscribe(ALICE, 'https://push.example/alice-laptop');
    const task = await makeTask({ content: 'Call the dentist', tags: ['health'] });

    const summary = await reminderService.tick(NOW);

    expect(summary).toMatchObject({ considered: 1, sent: 2, pruned: 0, failed: 0 });
    expect(transport.sends.map((s) => s.endpoint).sort()).toEqual([
      'https://push.example/alice-laptop',
      'https://push.example/alice-phone',
    ]);
    const { payload } = transport.sends[0];
    expect(payload.title).toBe('Call the dentist');
    expect(payload.url).toBe('/today');
    expect(payload.taskId).toBe(String(task._id));
    expect(payload.tags).toEqual(['health']);
    expect(payload.dueDate).toBe(task.dueDate.toISOString());
  });

  test('remindedAt is stamped, so a second tick is silent', async () => {
    const transport = useTransport();
    await subscribe();
    const task = await makeTask();

    await reminderService.tick(NOW);
    const afterFirst = await Task.findById(task._id);
    expect(afterFirst.remindedAt).toBeInstanceOf(Date);
    expect(afterFirst.remindedAt.getTime()).toBe(NOW.getTime());

    transport.sendNotification.mockClear();
    const second = await reminderService.tick(NOW);
    expect(second.considered).toBe(0);
    expect(transport.sendNotification).not.toHaveBeenCalled();
  });

  test('a title longer than 80 chars is truncated', async () => {
    const transport = useTransport();
    await subscribe();
    await makeTask({ content: 'x'.repeat(200) });

    await reminderService.tick(NOW);
    expect(transport.sends[0].payload.title).toHaveLength(80);
  });

  test('a UTC-midnight dueDate never reminds, however overdue', async () => {
    const transport = useTransport();
    await subscribe();
    // Midnight *inside* the window, so only the date-only rule can exclude it.
    const midnight = new Date('2026-03-15T00:00:00.000Z');
    const at = new Date(midnight.getTime() + 60 * 1000);
    await makeTask({ dueDate: midnight });

    const summary = await reminderService.tick(at);

    expect(summary.considered).toBe(0);
    expect(transport.sendNotification).not.toHaveBeenCalled();
  });

  test('a task not yet due, a completed one, and another user’s are all skipped', async () => {
    const transport = useTransport();
    await subscribe(ALICE);
    await makeTask({ content: 'Later', dueDate: new Date(NOW.getTime() + 5 * 60 * 1000) });
    await makeTask({ content: 'Done', status: 'completed' });
    await makeTask({ content: 'Cancelled', status: 'cancelled' });
    await makeTask({ content: 'Undated', dueDate: null });
    await makeTask({ content: 'Bob’s', createdBy: BOB });

    const summary = await reminderService.tick(NOW);

    // Bob's task is due and timed, so it is considered — but Bob has no device.
    expect(summary.considered).toBe(1);
    expect(summary.sent).toBe(0);
    expect(transport.sendNotification).not.toHaveBeenCalled();
  });

  test('a device belongs to one user — Alice’s reminder never reaches Bob', async () => {
    const transport = useTransport();
    await subscribe(BOB, 'https://push.example/bob-phone');
    await makeTask({ content: 'Alice only', createdBy: ALICE });

    await reminderService.tick(NOW);

    expect(transport.sendNotification).not.toHaveBeenCalled();
  });
});

describe('tick — the missed-reminder window', () => {
  test('a task due 14 minutes ago still fires', async () => {
    const transport = useTransport();
    await subscribe();
    await makeTask({ dueDate: minutesBefore(14) });

    const summary = await reminderService.tick(NOW);

    expect(summary.sent).toBe(1);
    expect(transport.sendNotification).toHaveBeenCalledTimes(1);
  });

  test('a task older than the cap is never reminded, and stays unreminded', async () => {
    const transport = useTransport();
    await subscribe();
    const stale = await makeTask({
      dueDate: new Date(NOW.getTime() - MISSED_WINDOW_MS - 1000),
    });

    const summary = await reminderService.tick(NOW);

    expect(summary.considered).toBe(0);
    expect(transport.sendNotification).not.toHaveBeenCalled();
    // Left alone rather than marked — it simply falls out of the window.
    expect((await Task.findById(stale._id)).remindedAt).toBeNull();
  });
});

describe('tick — failure handling', () => {
  test('a 410 Gone prunes the dead subscription', async () => {
    const gone = Object.assign(new Error('Gone'), { statusCode: 410 });
    useTransport(gone);
    await subscribe(ALICE, 'https://push.example/dead');
    await makeTask();

    const summary = await reminderService.tick(NOW);

    expect(summary.pruned).toBe(1);
    expect(await PushSubscription.countDocuments({ createdBy: ALICE })).toBe(0);
  });

  test('a 404 prunes too; an unknown failure leaves the row alone', async () => {
    useTransport(Object.assign(new Error('Not Found'), { statusCode: 404 }));
    await subscribe(ALICE, 'https://push.example/dead-404');
    await makeTask();
    expect((await reminderService.tick(NOW)).pruned).toBe(1);
    expect(await PushSubscription.countDocuments({})).toBe(0);

    await Task.deleteMany({});
    useTransport(Object.assign(new Error('Service Unavailable'), { statusCode: 503 }));
    await subscribe(ALICE, 'https://push.example/flaky');
    await makeTask();
    const summary = await reminderService.tick(NOW);
    expect(summary).toMatchObject({ pruned: 0, failed: 1 });
    expect(await PushSubscription.countDocuments({})).toBe(1);
  });

  test('remindedAt is stamped even when every push fails — fire once, never backlog', async () => {
    useTransport(Object.assign(new Error('boom'), { statusCode: 500 }));
    await subscribe();
    const task = await makeTask();

    await reminderService.tick(NOW);

    expect((await Task.findById(task._id)).remindedAt).toBeInstanceOf(Date);
  });
});

describe('subscriptions — owner scoped', () => {
  test('savePushSubscription stamps the caller and is idempotent per endpoint', async () => {
    const input = {
      endpoint: 'https://push.example/alice-phone',
      keys: { p256dh: 'k1', auth: 'a1' },
      userAgent: 'Firefox',
    };
    const first = await resolvers.Mutation.savePushSubscription(null, { input }, ctx(ALICE));
    expect(String(first.createdBy)).toBe(String(ALICE));

    const again = await resolvers.Mutation.savePushSubscription(
      null,
      { input: { ...input, keys: { p256dh: 'k2', auth: 'a2' } } },
      ctx(ALICE)
    );
    expect(String(again._id)).toBe(String(first._id));
    expect(again.keys.p256dh).toBe('k2');
    expect(await PushSubscription.countDocuments({})).toBe(1);
  });

  test('an unauthenticated caller cannot subscribe', async () => {
    await expect(
      resolvers.Mutation.savePushSubscription(
        null,
        { input: { endpoint: 'https://push.example/x', keys: { p256dh: 'k', auth: 'a' } } },
        ctx(null)
      )
    ).rejects.toThrow('Unauthorized');
  });

  test('a subscription missing its keys is rejected', async () => {
    await expect(
      reminderService.saveSubscription({ endpoint: 'https://push.example/x' }, ALICE)
    ).rejects.toThrow(/endpoint and both keys/);
  });

  test('pushSubscriptions lists only the caller’s devices', async () => {
    await subscribe(ALICE, 'https://push.example/alice');
    await subscribe(BOB, 'https://push.example/bob');

    const mine = await resolvers.Query.pushSubscriptions(null, {}, ctx(ALICE));
    expect(mine).toHaveLength(1);
    expect(mine[0].endpoint).toBe('https://push.example/alice');
  });

  test('removePushSubscription cannot delete somebody else’s endpoint', async () => {
    await subscribe(BOB, 'https://push.example/bob');

    const res = await resolvers.Mutation.removePushSubscription(
      null,
      { endpoint: 'https://push.example/bob' },
      ctx(ALICE)
    );
    expect(res.success).toBe(false);
    expect(await PushSubscription.countDocuments({})).toBe(1);

    const own = await resolvers.Mutation.removePushSubscription(
      null,
      { endpoint: 'https://push.example/bob' },
      ctx(BOB)
    );
    expect(own.success).toBe(true);
    expect(await PushSubscription.countDocuments({})).toBe(0);
  });

  test('pushVapidKey is the configured key, and null for an anonymous caller', async () => {
    const previous = process.env.VAPID_PUBLIC_KEY;
    process.env.VAPID_PUBLIC_KEY = 'BTestPublicKey';
    try {
      expect(resolvers.Query.pushVapidKey(null, {}, ctx(ALICE))).toBe('BTestPublicKey');
      expect(resolvers.Query.pushVapidKey(null, {}, ctx(null))).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.VAPID_PUBLIC_KEY;
      else process.env.VAPID_PUBLIC_KEY = previous;
    }
  });
});

describe('rescheduling re-arms the reminder', () => {
  test('moving dueDate clears remindedAt; editing anything else does not', async () => {
    useTransport();
    await subscribe();
    const task = await makeTask();
    await reminderService.tick(NOW);
    expect((await Task.findById(task._id)).remindedAt).not.toBeNull();

    await resolvers.Mutation.updateTask(
      null,
      { id: String(task._id), input: { content: 'Call the dentist back' } },
      ctx(ALICE)
    );
    expect((await Task.findById(task._id)).remindedAt).not.toBeNull();

    const moved = new Date(NOW.getTime() + 60 * 60 * 1000);
    await resolvers.Mutation.updateTask(
      null,
      { id: String(task._id), input: { dueDate: moved } },
      ctx(ALICE)
    );
    const after = await Task.findById(task._id);
    expect(after.remindedAt).toBeNull();
    expect(after.dueDate.getTime()).toBe(moved.getTime());
  });

  test('re-sending the same dueDate leaves remindedAt intact', async () => {
    useTransport();
    await subscribe();
    const task = await makeTask();
    await reminderService.tick(NOW);

    await resolvers.Mutation.updateTask(
      null,
      { id: String(task._id), input: { dueDate: task.dueDate } },
      ctx(ALICE)
    );
    expect((await Task.findById(task._id)).remindedAt).not.toBeNull();
  });
});

describe('scheduler', () => {
  test('start is a no-op without VAPID keys, and runs when configured', () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(reminderService.start()).toBe(false);

    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    try {
      expect(reminderService.start()).toBe(true);
      // Already running — a second start must not stack a second interval.
      expect(reminderService.start()).toBe(false);
    } finally {
      expect(reminderService.stop()).toBe(true);
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
    }
  });
});
