/**
 * TodoGeek data integrity, 2026-11 (DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md,
 * Tier 1): the gateway half of items 1.1, 1.6, 1.7, 1.8 (D3), 1.10, 1.12,
 * 5.13 and the TodoGeek items in 1.21. Contracts C1 (clientId) and C2
 * (hasDueTime) are pinned here.
 */
import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const { default: Task } = await import('../graphql/todogeek/models/Task.js');
const { default: PushSubscription } = await import('../graphql/todogeek/models/PushSubscription.js');
const { default: taskService } = await import('../graphql/todogeek/services/taskService.js');
const { default: reminderService } = await import('../graphql/todogeek/services/reminderService.js');
const { resolvers } = await import('../graphql/todogeek/resolvers.js');
const { recurrenceRuleProblem } = await import('../graphql/todogeek/validation.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});
const create = (args, who = ALICE) => resolvers.Mutation.createTask(null, args, ctx(who));
const status = (id, s, editScope, who = ALICE) =>
  resolvers.Mutation.updateTaskStatus(null, { id, status: s, editScope }, ctx(who));
const update = (id, input, editScope, who = ALICE) =>
  resolvers.Mutation.updateTask(null, { id, input, editScope }, ctx(who));
const remove = (id, editScope, who = ALICE) =>
  resolvers.Mutation.deleteTask(null, { id, editScope }, ctx(who));
const daily = (date, tz = null) =>
  taskService.getTasksForDateRange({ userId: ALICE, startDate: date, endDate: date, viewType: 'daily', tzOffsetMinutes: tz });
const all = () => taskService.getTasksForDateRange({ userId: ALICE, startDate: new Date(), endDate: new Date(), viewType: 'all' });
const dtstamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

beforeAll(async () => {
  await Task.db.asPromise();
  await Task.init();
  await PushSubscription.init();
}, 60000);

afterEach(async () => {
  await Task.deleteMany({});
  await PushSubscription.deleteMany({});
  jest.restoreAllMocks();
});

afterAll(async () => {
  reminderService.transport = null;
  reminderService.transportReady = false;
  await Task.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

/* ───────────────────────── 1.1 / C2 hasDueTime ───────────────────────── */

describe('C2 — hasDueTime is explicit (plan 1.1)', () => {
  // 6 pm US-Central (CST) is exactly UTC midnight.
  const SIX_PM_CENTRAL = '2026-11-21T00:00:00.000Z';

  test('a task timed at 6 pm Central keeps its time when the client says so', async () => {
    const t = await create({ content: 'pick up kids', dueDate: SIX_PM_CENTRAL, hasDueTime: true });
    expect(t.hasDueTime).toBe(true);
    expect(resolvers.Task.hasDueTime(t)).toBe(true);
    expect((await Task.findById(t._id)).hasDueTime).toBe(true);
  });

  test('an old client (no flag) gets the legacy rule, stored', async () => {
    const dateOnly = await create({ content: 'a day', dueDate: '2026-11-21' });
    const timed = await create({ content: 'a time', dueDate: '2026-11-21T15:00:00.000Z' });
    expect((await Task.findById(dateOnly._id)).hasDueTime).toBe(false);
    expect((await Task.findById(timed._id)).hasDueTime).toBe(true);
  });

  test('a row written before the field is read with the legacy rule', async () => {
    const legacy = await Task.collection.insertOne({
      content: 'legacy', createdBy: ALICE, dueDate: new Date('2026-11-21T15:00:00Z'), status: 'pending',
    });
    const row = await Task.findById(legacy.insertedId);
    expect(row.hasDueTime).toBeUndefined();
    expect(resolvers.Task.hasDueTime(row)).toBe(true);
    expect(resolvers.Task.hasDueTime({ dueDate: new Date('2026-11-21T00:00:00Z') })).toBe(false);
    expect(resolvers.Task.hasDueTime({ dueDate: null, hasDueTime: true })).toBe(false);
  });

  test('moving the date re-derives the flag unless the client sends it', async () => {
    const t = await create({ content: 'x', dueDate: '2026-11-21T15:00:00.000Z', hasDueTime: true });
    const moved = await update(String(t._id), { dueDate: '2026-11-22' });
    expect(moved.hasDueTime).toBe(false);
    const timed = await update(String(t._id), { dueDate: SIX_PM_CENTRAL, hasDueTime: true });
    expect(timed.hasDueTime).toBe(true);
  });

  test('the reminder sweep reminds a 6 pm Central task', async () => {
    const sends = [];
    reminderService.setTransport({ sendNotification: async (_sub, payload) => { sends.push(JSON.parse(payload)); } });
    await PushSubscription.create({ createdBy: ALICE, endpoint: 'https://push.example/a', keys: { p256dh: 'p', auth: 'a' } });
    await create({ content: 'pick up kids', dueDate: SIX_PM_CENTRAL, hasDueTime: true });
    const summary = await reminderService.tick(new Date('2026-11-21T00:00:30.000Z'));
    expect(summary.sent).toBe(1);
    expect(sends[0].title).toBe('pick up kids');
  });
});

/* ───────────────────────── 1.10 / C1 clientId ───────────────────────── */

describe('C1 — a retried create returns the task it already made (plan 1.10)', () => {
  test('same user + same clientId → one task, same id, no error', async () => {
    const a = await create({ content: 'buy milk', clientId: 'c-1' });
    const b = await create({ content: 'buy milk', clientId: 'c-1' });
    expect(String(b._id)).toBe(String(a._id));
    expect(await Task.countDocuments({ createdBy: ALICE })).toBe(1);
  });

  test('concurrent retries still make one task', async () => {
    const [a, b, c] = await Promise.all([
      create({ content: 'once', clientId: 'ng:abc' }),
      create({ content: 'once', clientId: 'ng:abc' }),
      create({ content: 'once', clientId: 'ng:abc' }),
    ]);
    expect(new Set([a, b, c].map((t) => String(t._id))).size).toBe(1);
    expect(await Task.countDocuments({ createdBy: ALICE })).toBe(1);
  });

  test('another user with the same clientId gets their own task', async () => {
    await create({ content: 'mine', clientId: 'shared' });
    await create({ content: 'theirs', clientId: 'shared' }, BOB);
    expect(await Task.countDocuments({})).toBe(2);
  });

  test('creates without a clientId are never deduplicated', async () => {
    await create({ content: 'twice' });
    await create({ content: 'twice' });
    expect(await Task.countDocuments({ createdBy: ALICE })).toBe(2);
  });

  test('an occurrence of a series made with a clientId does not inherit it', async () => {
    const master = await create({
      content: 'vitamins', clientId: 'c-series',
      recurrenceRule: 'DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY', dueDate: '2026-01-01T09:00:00.000Z',
    });
    const v1 = `virtual_${master._id}_${Date.parse('2026-01-02T09:00:00Z')}`;
    const v2 = `virtual_${master._id}_${Date.parse('2026-01-03T09:00:00Z')}`;
    await status(v1, 'completed');
    await status(v2, 'completed'); // would hit the clientId unique index if copied
    expect(await Task.countDocuments({ seriesId: String(master._id) })).toBe(2);
  });
});

/* ───────────────────────── 1.21 create stamps ───────────────────────── */

describe('createTask: status and isSeriesMaster (1.21)', () => {
  test("status 'completed' stamps completedAt (NoteGeek x lines)", async () => {
    const before = Date.now();
    const t = await create({ content: 'done already', status: 'completed' });
    expect(t.completedAt).toBeInstanceOf(Date);
    expect(t.completedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  test("status 'cancelled' stamps cancelledAt", async () => {
    const t = await create({ content: 'nope', status: 'cancelled' });
    expect(t.cancelledAt).toBeInstanceOf(Date);
  });

  test('a client-sent isSeriesMaster without a rule is ignored', async () => {
    const t = await create({ content: 'ghost', isSeriesMaster: true });
    expect(t.isSeriesMaster).toBe(false);
    expect((await all()).some((x) => x.content === 'ghost')).toBe(true);
  });
});

/* ───────────────────────── 1.21 recurrence validation ───────────────────────── */

describe('recurrence rules are judged by what they expand to (1.21)', () => {
  const start = 'DTSTART:20260101T090000Z\nRRULE:';
  test.each([
    ['FREQ=SECONDLY'], ['FREQ=MINUTELY'], ['FREQ=HOURLY'],
    ['FREQ=DAILY;COUNT=100000'], ['FREQ=DAILY;BYHOUR=1,2,3'], ['FREQ=DAILY;INTERVAL=0'],
  ])('refuses %s', async (rule) => {
    expect(recurrenceRuleProblem(`${start}${rule}`)).not.toBeNull();
    await expect(create({ content: 'x', recurrenceRule: `${start}${rule}` }))
      .rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  test('refuses text that is not an RRULE', () => {
    expect(recurrenceRuleProblem('lol')).not.toBeNull();
  });

  test.each([['FREQ=DAILY'], ['FREQ=WEEKLY'], ['FREQ=MONTHLY'], ['FREQ=YEARLY'], ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'], ['FREQ=DAILY;COUNT=30']])(
    'accepts %s', (rule) => {
      expect(recurrenceRuleProblem(`${start}${rule}`)).toBeNull();
    });

  test('updateTask refuses a bad rule too', async () => {
    const t = await create({ content: 'x' });
    await expect(update(String(t._id), { recurrenceRule: `${start}FREQ=SECONDLY` }))
      .rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });
});

/* ───────────────────────── 1.6 master rows ───────────────────────── */

describe('a master straight after create acts as its first occurrence (1.6)', () => {
  const makeSeries = () => create({
    content: 'vitamins',
    recurrenceRule: 'DTSTART:20260310T090000Z\nRRULE:FREQ=DAILY',
    dueDate: '2026-03-10T09:00:00.000Z',
  });

  test('ticking the master completes the first occurrence, not the series', async () => {
    const master = await makeSeries();
    const result = await status(String(master._id), 'completed');
    expect(String(result._id)).not.toBe(String(master._id));
    expect(result.originalDueDate.toISOString()).toBe('2026-03-10T09:00:00.000Z');
    const fresh = await Task.findById(master._id);
    expect(fresh.status).toBe('pending');
    const next = await daily('2026-03-11');
    expect(next.some((t) => t.content === 'vitamins' && t.status === 'pending')).toBe(true);
  });

  test('ALL_INSTANCES still finishes the whole series', async () => {
    const master = await makeSeries();
    await status(String(master._id), 'completed', 'ALL_INSTANCES');
    expect((await Task.findById(master._id)).status).toBe('completed');
  });

  test('deleting the master THIS_INSTANCE removes only the first occurrence', async () => {
    const master = await makeSeries();
    await remove(String(master._id), 'THIS_INSTANCE');
    const fresh = await Task.findById(master._id);
    expect(fresh).not.toBeNull();
    expect(fresh.exdates.map((d) => d.toISOString())).toEqual(['2026-03-10T09:00:00.000Z']);
    expect((await daily('2026-03-10')).some((t) => t.content === 'vitamins' && t.dueDate?.toISOString?.() === '2026-03-10T09:00:00.000Z')).toBe(false);
    expect((await daily('2026-03-11')).some((t) => t.content === 'vitamins')).toBe(true);
  });

  test('deleting with ALL_INSTANCES removes the series', async () => {
    const master = await makeSeries();
    await remove(String(master._id), 'ALL_INSTANCES');
    expect(await Task.findById(master._id)).toBeNull();
  });
});

/* ───────────────────────── 1.7 deleting an override ───────────────────────── */

describe('deleting a materialised occurrence keeps it deleted (1.7)', () => {
  test('a completed occurrence deleted on its own does not come back', async () => {
    const master = await create({
      content: 'stretch', recurrenceRule: 'DTSTART:20260310T090000Z\nRRULE:FREQ=DAILY', dueDate: '2026-03-10T09:00:00.000Z',
    });
    const vid = `virtual_${master._id}_${Date.parse('2026-03-12T09:00:00Z')}`;
    const override = await status(vid, 'completed');
    await remove(String(override._id), 'THIS_INSTANCE');
    const day = await daily('2026-03-12');
    expect(day.some((t) => t.content === 'stretch' && new Date(t.dueDate).toISOString() === '2026-03-12T09:00:00.000Z')).toBe(false);
    expect((await Task.findById(master._id)).exdates.map((d) => d.toISOString())).toContain('2026-03-12T09:00:00.000Z');
  });

  test('a moved occurrence deleted on its own does not come back on its old day', async () => {
    const master = await create({
      content: 'stretch', recurrenceRule: 'DTSTART:20260310T090000Z\nRRULE:FREQ=DAILY', dueDate: '2026-03-10T09:00:00.000Z',
    });
    const vid = `virtual_${master._id}_${Date.parse('2026-03-12T09:00:00Z')}`;
    const moved = await update(vid, { dueDate: '2026-03-15T09:00:00.000Z' });
    await remove(String(moved._id), 'THIS_INSTANCE');
    expect((await daily('2026-03-12')).some((t) => t.content === 'stretch' && new Date(t.dueDate).toISOString() === '2026-03-12T09:00:00.000Z')).toBe(false);
  });
});

/* ───────────────────────── 1.8 / D3 one late row ───────────────────────── */

describe('D3 — one late row per series; completing it skips the earlier misses (1.8)', () => {
  const daysAgo = (n) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    d.setUTCHours(9, 0, 0, 0);
    return d;
  };
  const latePending = (rows, masterId, now = new Date()) => rows
    .filter((t) => String(t.seriesId) === String(masterId) && t.status === 'pending' && new Date(t.dueDate) < now)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  test('allTasks carries a missed daily forward as at most two past rows, not a year of them', async () => {
    const start = daysAgo(10);
    const master = await create({ content: 'vitamins', recurrenceRule: `DTSTART:${dtstamp(start)}\nRRULE:FREQ=DAILY`, dueDate: start.toISOString() });
    const late = latePending(await all(), master._id);
    expect(late.length).toBeGreaterThanOrEqual(1);
    expect(late.length).toBeLessThanOrEqual(3);
  });

  test('ticking the latest late row leaves no earlier miss behind', async () => {
    const start = daysAgo(10);
    const master = await create({ content: 'vitamins', recurrenceRule: `DTSTART:${dtstamp(start)}\nRRULE:FREQ=DAILY`, dueDate: start.toISOString() });
    const before = latePending(await all(), master._id);
    const latest = before[before.length - 1];
    await status(String(latest._id), 'completed');
    const after = latePending(await all(), master._id)
      .filter((t) => new Date(t.dueDate) < new Date(latest.dueDate));
    expect(after).toEqual([]);
  });

  test('ticking a FUTURE occurrence early does not hide the ones before it', async () => {
    const start = daysAgo(3);
    const master = await create({ content: 'vitamins', recurrenceRule: `DTSTART:${dtstamp(start)}\nRRULE:FREQ=DAILY`, dueDate: start.toISOString() });
    const future = new Date(Date.now() + 5 * 86400000);
    future.setUTCHours(9, 0, 0, 0);
    await status(`virtual_${master._id}_${future.getTime()}`, 'completed');
    expect(latePending(await all(), master._id).length).toBeGreaterThanOrEqual(1);
  });

  test("the 'all' view adds the next occurrence past its window (Later / Search)", async () => {
    const start = new Date(Date.now() + 200 * 86400000);
    start.setUTCHours(9, 0, 0, 0);
    const master = await create({ content: 'yearly', recurrenceRule: `DTSTART:${dtstamp(start)}\nRRULE:FREQ=YEARLY`, dueDate: start.toISOString() });
    const rows = (await all()).filter((t) => String(t.seriesId) === String(master._id));
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].dueDate).toISOString()).toBe(start.toISOString());
  });
});

/* ───────────────────────── 1.21 series time for "all" ───────────────────────── */

describe('changing the time "for all" moves every occurrence (1.21)', () => {
  test('9am → 7am from one occurrence moves the series', async () => {
    const master = await create({
      content: 'walk', recurrenceRule: 'DTSTART:20260310T090000Z\nRRULE:FREQ=DAILY', dueDate: '2026-03-10T09:00:00.000Z',
    });
    // complete one occurrence first: its override must follow the series
    const done = await status(`virtual_${master._id}_${Date.parse('2026-03-11T09:00:00Z')}`, 'completed');
    const vid = `virtual_${master._id}_${Date.parse('2026-03-12T09:00:00Z')}`;
    await update(vid, { dueDate: '2026-03-12T07:00:00.000Z', hasDueTime: true }, 'ALL_INSTANCES');
    const day = await daily('2026-03-14');
    const row = day.find((t) => t.content === 'walk' && new Date(t.dueDate).toISOString().startsWith('2026-03-14'));
    expect(new Date(row.dueDate).toISOString()).toBe('2026-03-14T07:00:00.000Z');
    // The completed 11th is still the 11th's occurrence — no pending virtual reappears.
    const eleventh = await daily('2026-03-11');
    expect(eleventh.filter((t) => t.content === 'walk' && t.status === 'pending' && new Date(t.dueDate).toISOString().startsWith('2026-03-11'))).toEqual([]);
    expect((await Task.findById(done._id)).originalDueDate.toISOString()).toBe('2026-03-11T07:00:00.000Z');
  });

  test('a one-day shift of a daily series does not trip the unique occurrence index', async () => {
    const master = await create({
      content: 'walk', recurrenceRule: 'DTSTART:20260310T090000Z\nRRULE:FREQ=DAILY', dueDate: '2026-03-10T09:00:00.000Z',
    });
    await status(`virtual_${master._id}_${Date.parse('2026-03-11T09:00:00Z')}`, 'completed');
    await status(`virtual_${master._id}_${Date.parse('2026-03-12T09:00:00Z')}`, 'completed');
    await expect(update(`virtual_${master._id}_${Date.parse('2026-03-13T09:00:00Z')}`,
      { dueDate: '2026-03-14T09:00:00.000Z' }, 'ALL_INSTANCES')).resolves.toBeTruthy();
  });
});

/* ───────────────────────── 1.21 DST ───────────────────────── */

describe('a series with a time zone keeps its wall-clock time across DST (1.21)', () => {
  // 9 am CDT on 30 Oct 2026 = 14:00Z. US DST ends 1 Nov 2026.
  const rule = 'DTSTART:20261030T140000Z\nRRULE:FREQ=DAILY';

  test('with America/Chicago it is 9 am CST (15:00Z) after the change', async () => {
    await create({ content: 'meds', recurrenceRule: rule, dueDate: '2026-10-30T14:00:00.000Z', timeZone: 'America/Chicago' });
    const row = (await daily('2026-11-05')).find((t) => t.content === 'meds' && new Date(t.dueDate).toISOString().startsWith('2026-11-05'));
    expect(new Date(row.dueDate).toISOString()).toBe('2026-11-05T15:00:00.000Z');
    const before = (await daily('2026-10-31')).find((t) => t.content === 'meds' && new Date(t.dueDate).toISOString().startsWith('2026-10-31'));
    expect(new Date(before.dueDate).toISOString()).toBe('2026-10-31T14:00:00.000Z');
  });

  test('ticking a corrected occurrence suppresses exactly that one', async () => {
    const master = await create({ content: 'meds', recurrenceRule: rule, dueDate: '2026-10-30T14:00:00.000Z', timeZone: 'America/Chicago' });
    await status(`virtual_${master._id}_${Date.parse('2026-11-05T15:00:00Z')}`, 'completed');
    const rows = (await daily('2026-11-05')).filter((t) => t.content === 'meds' && new Date(t.dueDate).toISOString() === '2026-11-05T15:00:00.000Z');
    expect(rows.map((r) => r.status)).toEqual(['completed']);
  });

  test('without a zone it expands exactly as before (fixed UTC)', async () => {
    await create({ content: 'legacy meds', recurrenceRule: rule, dueDate: '2026-10-30T14:00:00.000Z' });
    const row = (await daily('2026-11-05')).find((t) => t.content === 'legacy meds' && new Date(t.dueDate).toISOString().startsWith('2026-11-05'));
    expect(new Date(row.dueDate).toISOString()).toBe('2026-11-05T14:00:00.000Z');
  });

  test('a bad zone is refused', async () => {
    await expect(create({ content: 'x', timeZone: 'Mars/Olympus' }))
      .rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });
});

/* ───────────────────────── 1.21 tick / un-tick ───────────────────────── */

describe('tick then un-tick on one occurrence (1.21)', () => {
  const makeSeries = () => create({
    content: 'water', recurrenceRule: 'DTSTART:20260310T090000Z\nRRULE:FREQ=DAILY', dueDate: '2026-03-10T09:00:00.000Z',
  });

  test('both name the virtual id; the second updates the override instead of failing', async () => {
    const master = await makeSeries();
    const vid = `virtual_${master._id}_${Date.parse('2026-03-12T09:00:00Z')}`;
    const a = await status(vid, 'completed');
    const b = await status(vid, 'pending');
    expect(String(b._id)).toBe(String(a._id));
    expect(b.status).toBe('pending');
    expect(await Task.countDocuments({ seriesId: String(master._id) })).toBe(1);
  });

  test('two at once still leave one row', async () => {
    const master = await makeSeries();
    const vid = `virtual_${master._id}_${Date.parse('2026-03-12T09:00:00Z')}`;
    await Promise.all([status(vid, 'completed'), status(vid, 'completed')]);
    expect(await Task.countDocuments({ seriesId: String(master._id) })).toBe(1);
  });
});

/* ───────────────────────── 1.12 anonymous reads ───────────────────────── */

describe('a signed-out task read is UNAUTHENTICATED, never an empty list (1.12)', () => {
  test.each(['allTasks', 'dailyTasks', 'weeklyTasks', 'monthlyTasks', 'tasks', 'taskTags', 'blockedTasks'])('%s', async (q) => {
    await expect(resolvers.Query[q](null, {}, ctx(null)))
      .rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  test('a signed-in empty list is still an empty list', async () => {
    expect(await resolvers.Query.allTasks(null, {}, ctx(ALICE))).toEqual([]);
  });
});
