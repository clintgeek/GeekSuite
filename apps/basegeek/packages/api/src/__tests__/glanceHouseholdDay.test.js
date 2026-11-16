/**
 * glanceHouseholdDay.test.js
 *
 * Ask's "what's due today" grounds its answer on a glanceToday snapshot the
 * resolver takes for itself (no date from the client). That snapshot's day
 * was the container's UTC day, so from about 6-7 PM Central it was tomorrow's
 * (SUITE_REVIEW_2026-11, ranked item 6). It is the household day now.
 *
 * The clock is frozen at 7:00 PM CST on Sunday 2026-11-15 (01:00 UTC on the
 * 16th). aiService is mocked; Mongo is the in-memory server.
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';

// The containers and CI run in UTC (THE_CONTEXT §3.1). On a dev box set to
// Central the old `format(new Date())` passes by luck — run this file with
// TZ=UTC to see it catch the bug. (Jest sandboxes process.env, so setting TZ
// from inside the file does not reach the clock.)

const callAI = jest.fn();
const aiServiceMock = { callAI, lastProviderInfo: null };
jest.unstable_mockModule('../services/aiService.js', () => ({ default: aiServiceMock }));

const { getAppConnection } = await import('../graphql/shared/appConnections.js');
const { resolvers, defaultDateString } = await import('../graphql/glance/resolvers.js');
const { Query } = resolvers;

// 7:00 PM CST on Sunday 2026-11-15 — the UTC date is already the 16th.
const EVENING_CENTRAL = new Date('2026-11-16T01:00:00.000Z');
const ALICE = new mongoose.Types.ObjectId();
const ctx = { user: { id: String(ALICE) } };
let tasks;
let TAG;

function freezeAt(instant) {
  jest.useFakeTimers({
    now: instant,
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance'],
  });
}

const answerPlan = {
  kind: 'answer', keywords: ['due'], apps: [], types: [], since: null, shelf: null, tags: [],
};

beforeAll(async () => {
  TAG = new mongoose.Types.ObjectId().toString();
  const conn = getAppConnection('todogeek');
  await conn.asPromise();
  tasks = conn.collection('tasks');
}, 60000);

beforeEach(() => {
  callAI.mockReset();
  aiServiceMock.lastProviderInfo = { provider: 'groq', model: 'test' };
});

afterEach(async () => {
  jest.useRealTimers();
  await tasks.deleteMany({ __householdDayTest: TAG });
});

afterAll(async () => {
  await getAppConnection('todogeek').close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('glance default day is the household day', () => {
  test('defaultDateString is the Chicago day at 7 PM Central, not the UTC day', () => {
    expect(defaultDateString(EVENING_CENTRAL)).toBe('2026-11-15');
    // morning: both agree
    expect(defaultDateString(new Date('2026-11-16T14:00:00.000Z'))).toBe('2026-11-16');
  });

  test("glanceAsk at 7 PM Central answers 'due today' from today's snapshot, not tomorrow's", async () => {
    freezeAt(EVENING_CENTRAL);
    const base = {
      createdBy: ALICE, status: 'pending', signifier: '*', __householdDayTest: TAG,
      createdAt: new Date('2026-11-10T00:00:00.000Z'), updatedAt: new Date('2026-11-10T00:00:00.000Z'),
    };
    await tasks.insertMany([
      { ...base, content: 'due on the fifteenth', dueDate: new Date('2026-11-15T00:00:00.000Z') },
      { ...base, content: 'due on the sixteenth', dueDate: new Date('2026-11-16T00:00:00.000Z') },
    ]);

    callAI
      .mockImplementationOnce(async () => JSON.stringify(answerPlan))
      .mockImplementationOnce(async () => JSON.stringify({ answer: 'One thing.', citations: [] }));

    await Query.glanceAsk(null, { query: "what's due today" }, ctx);

    expect(callAI).toHaveBeenCalledTimes(2);
    const prompt = JSON.stringify(callAI.mock.calls[1]);
    expect(prompt).toContain('\\"date\\":\\"2026-11-15\\"');
    expect(prompt).toContain('due on the fifteenth');
    expect(prompt).not.toContain('\\"date\\":\\"2026-11-16\\"');
  });
});
