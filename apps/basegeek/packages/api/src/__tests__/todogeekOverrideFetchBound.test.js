/**
 * TODOGEEK_REVIEW §3.1 leftover — the override fetch is bounded.
 *
 * getTasksForDateRange used to pull EVERY materialised override of every
 * series on every load. The map is only read for occurrences inside the view
 * window and for the single carry-forward occurrence just before it, so the
 * fetch is limited to those. Results must not change.
 */
import mongoose from 'mongoose';
import { jest } from '@jest/globals';

const { default: Task } = await import('../graphql/todogeek/models/Task.js');
const { default: taskService } = await import('../graphql/todogeek/services/taskService.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const at = (d) => new Date(`${d}T09:00:00.000Z`);

beforeAll(async () => { await Task.db.asPromise(); }, 60000);
afterEach(async () => { jest.restoreAllMocks(); await Task.deleteMany({}); });
afterAll(async () => {
  await Task.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

async function seed() {
  const master = await Task.create({
    content: 'stretch', createdBy: ALICE, originalDate: at('2026-03-01'),
    isSeriesMaster: true, dueDate: at('2026-03-01'),
    recurrenceRule: 'DTSTART:20260301T090000Z\nRRULE:FREQ=DAILY',
  });
  const mk = (day) => Task.create({
    content: 'stretch', createdBy: ALICE, originalDate: at(day), seriesId: master._id,
    dueDate: at(day), originalDueDate: at(day), status: 'completed',
  });
  await mk('2026-03-05'); // long ago: irrelevant to a 03-20 view
  await mk('2026-03-19'); // the carry-forward occurrence
  await mk('2026-03-20'); // inside the view
  // Somebody else's override (their own series) must never be fetched.
  await Task.create({
    content: 'bob', createdBy: BOB, originalDate: at('2026-03-20'),
    seriesId: new mongoose.Types.ObjectId(), dueDate: at('2026-03-20'), originalDueDate: at('2026-03-20'),
  });
  return master;
}

const run = () => taskService.getTasksForDateRange({
  userId: ALICE, startDate: '2026-03-20', endDate: '2026-03-20', viewType: 'daily',
});

test('overrides in the window and at the carry-forward date still suppress their virtuals', async () => {
  await seed();
  const out = await run();
  expect(out.filter((t) => t.isVirtual)).toEqual([]);
  expect(out.filter((t) => !t.isVirtual && t.seriesId).length).toBe(1);
});

test('the override query is bounded and fetches neither old nor foreign rows', async () => {
  await seed();
  const fetched = [];
  const realFind = Task.find.bind(Task);
  const spy = jest.spyOn(Task, 'find').mockImplementation((q, ...rest) => {
    const cur = realFind(q, ...rest);
    if (q && Array.isArray(q.$or) && q.$or.some((c) => c.seriesId)) {
      const origThen = cur.then.bind(cur);
      cur.then = (res, rej) => origThen((r) => { fetched.push(...r); return r; }).then(res, rej);
    }
    return cur;
  });
  await run();
  const overrideQ = spy.mock.calls.map((c) => c[0]).find((q) => q && Array.isArray(q.$or) && q.$or.some((c) => c.seriesId));
  expect(overrideQ).toBeDefined();
  expect(String(overrideQ.createdBy)).toBe(String(ALICE));
  expect(overrideQ.$or.every((c) => c.originalDueDate)).toBe(true);
  const dates = fetched.map((r) => r.originalDueDate.toISOString().slice(0, 10)).sort();
  expect(dates).toEqual(['2026-03-19', '2026-03-20']);
});
