/**
 * bujogeekReviewDraft.test.js
 *
 * The weekly review draft (`reviewDraft`, DOCS/AI_IDEAS.md #1). What is pinned:
 *
 *   1. The facts are computed, owner-scoped, and read the Monday-to-Sunday
 *      window the caller named — a task in the next week is not in this week's
 *      counts, and Bob's rows are invisible to Alice.
 *   2. `weekStart` must be a Monday. Anything else is a BAD_USER_INPUT before
 *      a single row is read.
 *   3. Opt-in is enforced *server-side*: with the preference off no model is
 *      consulted at all, and the query still answers with the deterministic
 *      draft (`provenance.reason: 'opted_out'`).
 *   4. The model may only reference tasks in the facts. An invented
 *      carry-forward title is dropped; a real one that came back reworded is
 *      snapped back to the canonical title. Neither fails the draft.
 *   5. Every failure mode — cap, unavailable, unparseable, structurally
 *      invalid — lands on a deterministic draft that is still worth reading.
 *   6. Only titles, counts, habit names and collection names leave the box.
 *
 * No real model is ever called: `runAIFeature`'s injectable `ai` is a fake, and
 * the opted-out paths make no call at all.
 */

import mongoose from 'mongoose';
import { jest } from '@jest/globals';

const { default: Task } = await import('../graphql/bujogeek/models/Task.js');
const { default: Collection } = await import('../graphql/bujogeek/models/Collection.js');
const { default: Habit } = await import('../graphql/bujogeek/models/Habit.js');
const { default: HabitLog } = await import('../graphql/bujogeek/models/HabitLog.js');
const { default: JournalEntry } = await import('../graphql/bujogeek/models/JournalEntry.js');
const reviewService = await import('../graphql/bujogeek/services/reviewService.js');
const { resolvers } = await import('../graphql/bujogeek/resolvers.js');
const { User, userGeekConn } = await import('../models/user.js');
const { setAppPreferences } = await import('../lib/appPreferences.js');
const { _resetCounters } = await import('../services/aiFeatureRunner.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

// 2026-08-31 is a Monday; the week runs to Sunday 2026-09-06.
const MONDAY = new Date(Date.UTC(2026, 7, 31));
const day = (n) => new Date(MONDAY.getTime() + n * 86400000);

const makeTask = (overrides = {}) =>
  Task.create({ content: 'A task', createdBy: ALICE, originalDate: day(0), ...overrides });

function fakeAI(impl, info = { provider: 'groq', model: 'llama-3.1-8b' }) {
  return { callAI: jest.fn(impl), lastProviderInfo: info };
}

let seq = 0;
const makeUser = (prefs) => User.create({
  username: `review_user_${Date.now()}_${seq++}`,
  passwordHash: 'unhashed-placeholder',
}).then(async (user) => {
  if (prefs) await setAppPreferences(user, 'bujogeek', prefs);
  return user;
});

beforeAll(async () => {
  await Task.db.asPromise();
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
}, 60000);

beforeEach(() => _resetCounters());

afterEach(async () => {
  await Promise.all([
    Task.deleteMany({}),
    Collection.deleteMany({}),
    Habit.deleteMany({}),
    HabitLog.deleteMany({}),
    JournalEntry.deleteMany({}),
    User.deleteMany({}),
  ]);
  jest.restoreAllMocks();
});

afterAll(async () => {
  await Task.db.close();
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('gatherFacts — the deterministic half', () => {
  test('counts each bucket inside the Monday-to-Sunday window only', async () => {
    await makeTask({ content: 'Shipped it', status: 'completed', completedAt: day(2) });
    await makeTask({ content: 'Also shipped', status: 'completed', completedAt: day(6) });
    // Completed the Monday AFTER the window — out.
    await makeTask({ content: 'Next week', status: 'completed', completedAt: day(7) });
    await makeTask({ content: 'Dropped it', status: 'cancelled', cancelledAt: day(3) });
    await makeTask({ content: 'Waiting on the roofer', status: 'blocked', blockedAt: day(1), blockedReason: 'roofer has not called back' });
    await makeTask({ content: 'Still open', status: 'pending', dueDate: day(4) });

    const facts = await reviewService.gatherFacts({ userId: ALICE, weekStart: MONDAY });

    expect(facts.weekStart).toBe('2026-08-31');
    expect(facts.weekEnd).toBe('2026-09-06');
    expect(facts.counts).toMatchObject({ completed: 2, cancelled: 1, blocked: 1, carriedForward: 1 });
    // Five of the six were created inside the week (the sixth too — every
    // fixture defaults originalDate to the Monday), so `created` counts them all.
    expect(facts.counts.created).toBe(6);
  });

  test('overdue and blocked lists carry the title and its collection, never the note', async () => {
    const house = await Collection.create({ name: 'House', createdBy: ALICE });
    await makeTask({
      content: 'Call the roofer',
      status: 'pending',
      dueDate: day(1),
      collectionId: house._id,
      note: 'his mobile is in the shoebox',
      tags: ['house', 'urgent'],
    });
    await makeTask({
      content: 'Order the felt',
      status: 'blocked',
      blockedAt: day(2),
      blockedReason: 'waiting on the roofer',
      collectionId: house._id,
    });

    const facts = await reviewService.gatherFacts({ userId: ALICE, weekStart: MONDAY });

    expect(facts.overdue).toEqual([
      { title: 'Call the roofer', collection: 'House', dueDate: '2026-09-01', daysOverdue: 5 },
    ]);
    expect(facts.blocked).toEqual([
      { title: 'Order the felt', collection: 'House', reason: 'waiting on the roofer', blockedSince: '2026-09-02' },
    ]);

    // Rule 4 of the AI contract: only what the idea lists leaves the box.
    const outbound = JSON.stringify(reviewService.factsForModel(facts));
    expect(outbound).not.toContain('shoebox');
    expect(outbound).not.toContain('urgent');
  });

  test('habits report the streak as of the week’s last day, and the week’s own tally', async () => {
    const habit = await Habit.create({ name: 'Morning pages', createdBy: ALICE });
    for (let i = 0; i <= 6; i += 1) {
      await HabitLog.create({ habitId: habit._id, createdBy: ALICE, date: day(i) });
    }

    const facts = await reviewService.gatherFacts({ userId: ALICE, weekStart: MONDAY });

    expect(facts.habits).toHaveLength(1);
    expect(facts.habits[0]).toMatchObject({ name: 'Morning pages', daysDone: 7, daysScheduled: 7 });
    expect(facts.habits[0].streak).toBe(7);
  });

  test('another user’s week is invisible', async () => {
    await Task.create({ content: 'Bob shipped it', createdBy: BOB, status: 'completed', completedAt: day(2), originalDate: day(0) });
    await Task.create({ content: 'Bob is stuck', createdBy: BOB, status: 'blocked', blockedAt: day(2), originalDate: day(0) });

    const facts = await reviewService.gatherFacts({ userId: ALICE, weekStart: MONDAY });
    expect(facts.counts).toMatchObject({ completed: 0, blocked: 0, created: 0 });
    expect(facts.overdue).toEqual([]);
    expect(facts.blocked).toEqual([]);
  });
});

describe('reviewDraft resolver — arguments and the opt-in', () => {
  test('weekStart must be a Monday', async () => {
    // 2026-09-02 is a Wednesday.
    await expect(
      resolvers.Query.reviewDraft(null, { weekStart: '2026-09-02' }, ctx(ALICE))
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });

    await expect(
      resolvers.Query.reviewDraft(null, { weekStart: 'not a date' }, ctx(ALICE))
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  test('an unauthenticated caller gets nothing', async () => {
    await expect(
      resolvers.Query.reviewDraft(null, { weekStart: '2026-08-31' }, ctx(null))
    ).rejects.toThrow('Unauthorized');
  });

  test('opted out: the query answers, with facts and a deterministic draft', async () => {
    const user = await makeUser(null);
    await Task.create({ content: 'Shipped it', createdBy: user._id, status: 'completed', completedAt: day(2), originalDate: day(0) });

    const result = await resolvers.Query.reviewDraft(null, { weekStart: '2026-08-31' }, ctx(user._id));

    expect(result.provenance).toMatchObject({ source: 'fallback', reason: 'opted_out', model: null });
    expect(result.facts.counts.completed).toBe(1);
    expect(result.draft.summary).toContain('Completed 1 task');
  });

  test('opting in is what makes the resolver willing to call a model', async () => {
    const off = await makeUser({ aiReviewDraft: false });
    const on = await makeUser({ aiReviewDraft: true });

    const offResult = await resolvers.Query.reviewDraft(null, { weekStart: '2026-08-31' }, ctx(off._id));
    expect(offResult.provenance.reason).toBe('opted_out');

    // Opted in with no aiGeek reachable in the test process: the runner's own
    // fail-soft path answers, which is a different reason than opting out.
    const onResult = await resolvers.Query.reviewDraft(null, { weekStart: '2026-08-31' }, ctx(on._id));
    expect(onResult.provenance.source).toBe('fallback');
    expect(onResult.provenance.reason).not.toBe('opted_out');
  });
});

describe('reviewDraft service — the model half', () => {
  const draftFrom = (payload, opts = {}) => reviewService.reviewDraft({
    userId: ALICE,
    weekStart: MONDAY,
    optedIn: true,
    ai: fakeAI(async () => payload),
    ...opts,
  });

  beforeEach(async () => {
    await makeTask({ content: 'Call the roofer', status: 'pending', dueDate: day(1) });
    await makeTask({ content: 'Order the felt', status: 'blocked', blockedAt: day(2), blockedReason: 'waiting on the roofer' });
    await makeTask({ content: 'Shipped it', status: 'completed', completedAt: day(2) });
  });

  test('a well-formed draft comes back as the model wrote it', async () => {
    const result = await draftFrom(JSON.stringify({
      summary: 'You closed one thing and left two open. The roof is the theme of the week. It has not moved. Next week it should.',
      wins: ['Completed 1 task'],
      carryForward: [{ title: 'Call the roofer', reason: 'Overdue by 5 days.' }],
      suggestedFocus: 'Ring the roofer first thing Monday.',
    }));

    expect(result.provenance).toMatchObject({ source: 'model', provider: 'groq', model: 'llama-3.1-8b', cap: 10 });
    expect(result.draft.carryForward).toEqual([{ title: 'Call the roofer', reason: 'Overdue by 5 days.' }]);
    expect(result.draft.wins).toEqual(['Completed 1 task']);
    expect(result.facts.counts.completed).toBe(1);
  });

  test('an invented carry-forward is dropped, not fatal', async () => {
    const result = await draftFrom(JSON.stringify({
      summary: 'A summary.',
      wins: [],
      carryForward: [
        { title: 'File the taxes', reason: 'Never existed.' },
        { title: 'Call the roofer', reason: 'Still open.' },
      ],
      suggestedFocus: 'The roof.',
    }));

    expect(result.provenance.source).toBe('model');
    expect(result.draft.carryForward.map((r) => r.title)).toEqual(['Call the roofer']);
  });

  test('a reworded title is snapped back to the task the user would recognise', async () => {
    const result = await draftFrom(JSON.stringify({
      summary: 'A summary.',
      wins: [],
      carryForward: [{ title: '  call   THE Roofer ', reason: 'Overdue.' }],
      suggestedFocus: 'The roof.',
    }));

    expect(result.draft.carryForward).toEqual([{ title: 'Call the roofer', reason: 'Overdue.' }]);
  });

  test('at most three carry-forwards survive, de-duplicated', async () => {
    for (const content of ['One', 'Two', 'Three', 'Four']) {
      await makeTask({ content, status: 'pending', dueDate: day(1) });
    }
    const result = await draftFrom(JSON.stringify({
      summary: 'A summary.',
      wins: [],
      carryForward: [
        { title: 'One', reason: 'a' },
        { title: 'one', reason: 'duplicate' },
        { title: 'Two', reason: 'b' },
        { title: 'Three', reason: 'c' },
        { title: 'Four', reason: 'd' },
      ],
      suggestedFocus: 'One.',
    }));

    expect(result.draft.carryForward.map((r) => r.title)).toEqual(['One', 'Two', 'Three']);
  });

  test('the prompt carries the facts and nothing else', async () => {
    const ai = fakeAI(async () => JSON.stringify({
      summary: 'A summary.', wins: [], carryForward: [], suggestedFocus: 'Focus.',
    }));
    await reviewService.reviewDraft({ userId: ALICE, weekStart: MONDAY, optedIn: true, ai });

    const [, config] = ai.callAI.mock.calls[0];
    expect(config).toMatchObject({ useAppConfig: true, appName: 'bujogeek', feature: 'review' });
    const userTurn = config.messages.find((m) => m.role === 'user').content;
    const sent = JSON.parse(userTurn);
    expect(Object.keys(sent).sort()).toEqual(['blocked', 'counts', 'habits', 'overdue', 'weekEnd', 'weekStart']);
    expect(sent.overdue[0].title).toBe('Call the roofer');
  });

  test.each([
    ['unparseable output', 'I am afraid I cannot do that', 'unparseable'],
    ['a structurally invalid object', JSON.stringify({ summary: '', wins: [], carryForward: [], suggestedFocus: 'x' }), 'invalid'],
  ])('%s settles on the deterministic draft', async (_label, payload, reason) => {
    const result = await draftFrom(payload);

    expect(result.provenance).toMatchObject({ source: 'fallback', reason });
    expect(result.draft.summary).toContain('Week of 2026-08-31 to 2026-09-06');
    expect(result.draft.carryForward.map((r) => r.title)).toContain('Call the roofer');
  });

  test('a model that is down never blanks the card', async () => {
    const result = await reviewService.reviewDraft({
      userId: ALICE,
      weekStart: MONDAY,
      optedIn: true,
      ai: fakeAI(async () => { throw new Error('ECONNREFUSED'); }),
    });

    expect(result.provenance).toMatchObject({ source: 'fallback', reason: 'unavailable' });
    expect(result.draft.summary.length).toBeGreaterThan(20);
    expect(result.draft.suggestedFocus).toContain('Call the roofer');
  });

  test('the eleventh draft of a day is deterministic', async () => {
    const ai = fakeAI(async () => JSON.stringify({
      summary: 'A summary.', wins: [], carryForward: [], suggestedFocus: 'Focus.',
    }));
    const args = { userId: ALICE, weekStart: MONDAY, optedIn: true, ai };
    for (let i = 0; i < 10; i += 1) await reviewService.reviewDraft(args);

    const eleventh = await reviewService.reviewDraft(args);
    expect(eleventh.provenance).toMatchObject({ source: 'fallback', reason: 'cap', cap: 10, callsToday: 10 });
    expect(ai.callAI).toHaveBeenCalledTimes(10);
  });
});

describe('buildFallbackDraft — the review that needs no model', () => {
  test('reads as a review even when the week was empty', () => {
    const facts = {
      weekStart: '2026-08-31',
      weekEnd: '2026-09-06',
      counts: { completed: 0, carriedForward: 0, blocked: 0, cancelled: 0, created: 0 },
      habits: [],
      overdue: [],
      blocked: [],
    };
    const draft = reviewService.buildFallbackDraft(facts);

    expect(draft.summary).toContain('Completed 0 tasks');
    expect(draft.summary).toContain('Nothing was left overdue.');
    expect(draft.wins).toEqual([]);
    expect(draft.carryForward).toEqual([]);
    expect(draft.suggestedFocus).toBeTruthy();
  });

  test('names habits that held and tasks that did not', () => {
    const facts = {
      weekStart: '2026-08-31',
      weekEnd: '2026-09-06',
      counts: { completed: 12, carriedForward: 4, blocked: 1, cancelled: 2, created: 9 },
      habits: [{ name: 'Morning pages', streak: 14, daysDone: 7, daysScheduled: 7 }],
      overdue: [{ title: 'Call the roofer', collection: 'House', dueDate: '2026-09-01', daysOverdue: 5 }],
      blocked: [{ title: 'Order the felt', collection: 'House', reason: 'waiting on the roofer', blockedSince: '2026-09-02' }],
    };
    const draft = reviewService.buildFallbackDraft(facts);

    expect(draft.summary).toContain('Completed 12 tasks');
    expect(draft.summary).toContain('Morning pages 14 days (7/7 this week)');
    expect(draft.summary).toContain('"Call the roofer" (House)');
    expect(draft.wins).toEqual(['Completed 12 tasks', 'Morning pages — 14-day streak']);
    expect(draft.carryForward).toEqual([
      { title: 'Call the roofer', reason: 'Overdue by 5 days.' },
      { title: 'Order the felt', reason: 'Parked: waiting on the roofer' },
    ]);
  });
});

describe('JournalEntry.aiDrafted — the provenance mark that survives the save', () => {
  test('defaults to false and is set only when the caller says so', async () => {
    const plain = await resolvers.Mutation.createJournalEntry(
      null,
      { title: 'Week of 31 Aug', content: 'Written by hand.' },
      ctx(ALICE)
    );
    expect(plain.aiDrafted).toBe(false);

    const drafted = await resolvers.Mutation.createJournalEntry(
      null,
      { title: 'Week of 31 Aug', content: 'Started from a draft.', type: 'weekly', aiDrafted: true },
      ctx(ALICE)
    );
    expect(drafted.aiDrafted).toBe(true);
    expect(drafted.type).toBe('weekly');

    const cleared = await resolvers.Mutation.updateJournalEntry(
      null,
      { id: String(drafted._id), aiDrafted: false },
      ctx(ALICE)
    );
    expect(cleared.aiDrafted).toBe(false);
  });
});
