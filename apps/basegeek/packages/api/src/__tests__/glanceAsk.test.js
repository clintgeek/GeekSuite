/**
 * glanceAsk.test.js
 *
 * StartGeek Ask puts a model between the user's sentence and the search that
 * already works. The contract that matters is that the model can never make
 * things worse:
 *
 *   - a failed / slow / nonsense plan still returns real regex results
 *   - a keyword plan merges every keyword's hits and de-dupes by id
 *   - a null answer stays null (the card is simply not shown)
 *   - locked and encrypted note bodies never reach the model's context
 *   - glanceSearch, which now shares the same search body, is unchanged
 *
 * aiService is mocked; the Mongoose models are real, against the same
 * in-memory Mongo the other glance tests use.
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const callAI = jest.fn();
const aiServiceMock = {
  callAI,
  lastProviderInfo: null,
};

jest.unstable_mockModule('../services/aiService.js', () => ({
  default: aiServiceMock,
}));

const { getAppConnection } = await import('../graphql/shared/appConnections.js');
const { resolvers, searchThings } = await import('../graphql/glance/resolvers.js');
const askService = await import('../graphql/glance/askService.js');

const { Query } = resolvers;

const ALICE = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

const APPS = ['bujogeek', 'notegeek', 'bookgeek', 'fitnessgeek', 'flockgeek'];

const conns = {};
let TEST_TAG;

const col = (app, name) => {
  const c = conns[app].collection(name);
  return new Proxy(c, {
    get(target, prop) {
      if (prop === 'insertOne') {
        return (doc, opts) => target.insertOne({ ...doc, __askTest: TEST_TAG }, opts);
      }
      if (prop === 'insertMany') {
        return (docs, opts) =>
          target.insertMany(docs.map((d) => ({ ...d, __askTest: TEST_TAG })), opts);
      }
      return target[prop];
    },
  });
};

/** Queue one JSON payload per expected aiService.callAI call. */
const modelReturns = (...payloads) => {
  callAI.mockReset();
  aiServiceMock.lastProviderInfo = { provider: 'groq', model: 'llama-3.3-70b-versatile' };
  for (const payload of payloads) {
    callAI.mockImplementationOnce(async () =>
      typeof payload === 'string' ? payload : JSON.stringify(payload)
    );
  }
};

const searchPlan = (overrides = {}) => ({
  kind: 'search',
  keywords: ['alpha'],
  apps: [],
  types: [],
  since: null,
  shelf: null,
  tags: [],
  ...overrides,
});

beforeAll(async () => {
  TEST_TAG = new mongoose.Types.ObjectId().toString();
  for (const app of APPS) {
    conns[app] = getAppConnection(app);
    await conns[app].asPromise();
  }
}, 60000);

beforeEach(() => {
  callAI.mockReset();
  aiServiceMock.lastProviderInfo = null;
});

afterEach(async () => {
  await Promise.all([
    col('bujogeek', 'tasks').deleteMany({ __askTest: TEST_TAG }),
    col('notegeek', 'notes').deleteMany({ __askTest: TEST_TAG }),
    col('bookgeek', 'books').deleteMany({ __askTest: TEST_TAG }),
    col('flockgeek', 'birds').deleteMany({ __askTest: TEST_TAG }),
  ]);
});

afterAll(async () => {
  await Promise.all(APPS.map((app) => conns[app].close()));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ── Gating ──────────────────────────────────────────────────────────────────

describe('glanceAsk gating', () => {
  test('anonymous callers are rejected, exactly like glanceSearch', async () => {
    await expect(Query.glanceAsk(null, { query: 'a' }, ctx(null))).rejects.toThrow('Unauthorized');
    expect(callAI).not.toHaveBeenCalled();
  });
});

// ── Degraded plan ───────────────────────────────────────────────────────────

describe('a failed plan still returns real results', () => {
  test('aiService throwing degrades to the literal query and regex results', async () => {
    await col('notegeek', 'notes').insertOne({
      title: 'alpha note',
      content: 'x',
      userId: ALICE,
      updatedAt: new Date(),
    });

    callAI.mockRejectedValue(new Error('all providers failed'));

    const ask = await Query.glanceAsk(null, { query: 'alpha' }, ctx(ALICE));

    expect(ask.intent.kind).toBe('search');
    expect(ask.intent.keywords).toEqual(['alpha']);
    expect(ask.answer).toBeNull();
    expect(ask.citations).toEqual([]);
    expect(ask.results.map((r) => r.title)).toContain('alpha note');
  });

  test('a non-JSON plan response degrades rather than throwing', async () => {
    await col('notegeek', 'notes').insertOne({
      title: 'alpha note',
      content: 'x',
      userId: ALICE,
      updatedAt: new Date(),
    });

    modelReturns('I am afraid I cannot do that, Chef.');

    const ask = await Query.glanceAsk(null, { query: 'alpha' }, ctx(ALICE));

    expect(ask.intent.keywords).toEqual(['alpha']);
    expect(ask.results.map((r) => r.title)).toContain('alpha note');
  });

  test('the plan call times out after 3s and still returns results', async () => {
    await col('notegeek', 'notes').insertOne({
      title: 'alpha note',
      content: 'x',
      userId: ALICE,
      updatedAt: new Date(),
    });

    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    callAI.mockImplementation(() => new Promise(() => {})); // never settles

    const pending = Query.glanceAsk(null, { query: 'alpha' }, ctx(ALICE));
    await Promise.resolve();
    jest.advanceTimersByTime(askService.ASK_TIMEOUT_MS + 1);
    jest.useRealTimers();

    const ask = await pending;
    expect(ask.intent.keywords).toEqual(['alpha']);
    expect(ask.results.map((r) => r.title)).toContain('alpha note');
  }, 20000);
});

// ── Keyword merge ───────────────────────────────────────────────────────────

describe('a keyword plan merges results and de-dupes by id', () => {
  test('every keyword contributes, and a doubly-matched Thing appears once', async () => {
    const shared = new mongoose.Types.ObjectId();
    await col('notegeek', 'notes').insertMany([
      { _id: shared, title: 'coop henhouse plans', content: 'x', userId: ALICE, updatedAt: new Date('2026-03-03') },
      { title: 'coop only', content: 'x', userId: ALICE, updatedAt: new Date('2026-03-02') },
      { title: 'henhouse only', content: 'x', userId: ALICE, updatedAt: new Date('2026-03-01') },
      { title: 'unrelated', content: 'x', userId: ALICE, updatedAt: new Date('2026-03-04') },
    ]);

    modelReturns(searchPlan({ keywords: ['coop', 'henhouse'], apps: ['notegeek'], types: ['note'] }));

    const ask = await Query.glanceAsk(null, { query: 'notes about the coop' }, ctx(ALICE));

    expect(ask.intent.keywords).toEqual(['coop', 'henhouse']);
    expect(ask.intent.apps).toEqual(['notegeek']);

    const titles = ask.results.map((r) => r.title);
    expect(titles).toEqual(expect.arrayContaining(['coop henhouse plans', 'coop only', 'henhouse only']));
    expect(titles).not.toContain('unrelated');

    const ids = ask.results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === shared.toString())).toHaveLength(1);
  });

  test('the plan narrows by app: a bird match is dropped when apps = [notegeek]', async () => {
    await col('notegeek', 'notes').insertOne({
      title: 'alpha note',
      content: 'x',
      userId: ALICE,
      updatedAt: new Date(),
    });
    await col('flockgeek', 'birds').insertOne({
      ownerId: String(ALICE),
      tagId: 'A1',
      name: 'alpha bird',
      updatedAt: new Date(),
    });

    modelReturns(searchPlan({ keywords: ['alpha'], apps: ['notegeek'], types: ['note'] }));

    const ask = await Query.glanceAsk(null, { query: 'alpha' }, ctx(ALICE));
    expect(ask.results.map((r) => r.app)).toEqual(['notegeek']);
  });

  test('provider and model come back from aiService for the footer', async () => {
    modelReturns(searchPlan({ keywords: ['alpha'] }));

    const ask = await Query.glanceAsk(null, { query: 'alpha' }, ctx(ALICE));
    expect(ask.provider).toBe('groq');
    expect(ask.model).toBe('llama-3.3-70b-versatile');
  });
});

// ── Grounded answers ────────────────────────────────────────────────────────

describe('grounded answers', () => {
  test('answer null when the model returns null', async () => {
    await col('bookgeek', 'books').insertOne({
      title: 'Dune - ask test',
      authors: ['Frank Herbert'],
      shelf: 'reading',
      updatedAt: new Date(),
    });

    modelReturns(
      searchPlan({ kind: 'answer', keywords: ['reading'] }),
      { answer: null, citations: ['made-up-id'] }
    );

    const ask = await Query.glanceAsk(null, { query: 'what am I reading' }, ctx(ALICE));

    expect(callAI).toHaveBeenCalledTimes(2);
    expect(ask.intent.kind).toBe('answer');
    expect(ask.answer).toBeNull();
    expect(ask.citations).toEqual([]);
  });

  test('an answer is returned with only citations that exist in the context', async () => {
    const bookId = new mongoose.Types.ObjectId();
    await col('bookgeek', 'books').insertOne({
      _id: bookId,
      title: 'Dune - ask test',
      authors: ['Frank Herbert'],
      shelf: 'reading',
      readingProgress: 42,
      updatedAt: new Date(),
    });

    modelReturns(
      searchPlan({ kind: 'answer', keywords: ['Dune - ask test'] }),
      { answer: 'You are 42% through Dune.', citations: [bookId.toString(), 'not-a-real-id'] }
    );

    const ask = await Query.glanceAsk(null, { query: 'what am I reading' }, ctx(ALICE));

    expect(ask.answer).toBe('You are 42% through Dune.');
    expect(ask.citations).toEqual([bookId.toString()]);
  });

  test('a search-kind plan never makes the second call', async () => {
    modelReturns(searchPlan({ kind: 'search', keywords: ['alpha'] }));

    await Query.glanceAsk(null, { query: 'alpha' }, ctx(ALICE));
    expect(callAI).toHaveBeenCalledTimes(1);
  });

  test('a failing answer call leaves the results intact and the answer null', async () => {
    await col('notegeek', 'notes').insertOne({
      title: 'alpha note',
      content: 'x',
      userId: ALICE,
      updatedAt: new Date(),
    });

    callAI.mockReset();
    aiServiceMock.lastProviderInfo = { provider: 'groq', model: 'llama-3.3-70b-versatile' };
    callAI
      .mockImplementationOnce(async () => JSON.stringify(searchPlan({ kind: 'answer', keywords: ['alpha'] })))
      .mockImplementationOnce(async () => {
        throw new Error('provider exploded');
      });

    const ask = await Query.glanceAsk(null, { query: 'alpha?' }, ctx(ALICE));

    expect(ask.answer).toBeNull();
    expect(ask.results.map((r) => r.title)).toContain('alpha note');
  });
});

// ── Locked notes ────────────────────────────────────────────────────────────

describe('locked and encrypted notes never reach the model', () => {
  test('a locked note body is not searched, not returned, and not in the context', async () => {
    await col('notegeek', 'notes').insertMany([
      { title: 'Open', content: 'secretword here', userId: ALICE, isLocked: false, isEncrypted: false, updatedAt: new Date() },
      { title: 'Vault', content: 'secretword here', userId: ALICE, isLocked: true, isEncrypted: true, updatedAt: new Date() },
    ]);

    modelReturns(
      searchPlan({ kind: 'answer', keywords: ['secretword'] }),
      { answer: null, citations: [] }
    );

    const ask = await Query.glanceAsk(null, { query: 'secretword' }, ctx(ALICE));

    expect(ask.results.map((r) => r.title)).toEqual(['Open']);
    expect(ask.results.map((r) => r.title)).not.toContain('Vault');

    // The second call is the grounded-answer call: inspect what it was shown.
    const answerCall = callAI.mock.calls[1];
    const sentText = JSON.stringify(answerCall);
    expect(sentText).toContain('Open');
    expect(sentText).not.toContain('Vault');
  });

  test('a locked note matched by title carries no snippet into the context', async () => {
    await col('notegeek', 'notes').insertOne({
      title: 'zeta vault',
      content: 'classified body text',
      userId: ALICE,
      isLocked: true,
      isEncrypted: true,
      updatedAt: new Date(),
    });

    const hits = await searchThings(String(ALICE), 'zeta');
    expect(hits.map((r) => r.title)).toEqual(['zeta vault']);
    expect(hits[0].snippet).toBeNull();

    const shaped = askService.sanitizeResults(hits);
    expect(JSON.stringify(shaped)).not.toContain('classified body text');
  });
});

// ── glanceSearch is unchanged ───────────────────────────────────────────────

describe('glanceSearch is unchanged by the refactor', () => {
  test('it never calls the model', async () => {
    await col('notegeek', 'notes').insertOne({
      title: 'alpha note',
      content: 'x',
      userId: ALICE,
      updatedAt: new Date(),
    });

    const results = await Query.glanceSearch(null, { query: 'alpha' }, ctx(ALICE));
    expect(callAI).not.toHaveBeenCalled();
    expect(results.map((r) => r.title)).toContain('alpha note');
  });

  test('regex metacharacters are still literal, results still newest-first', async () => {
    await col('bujogeek', 'tasks').insertMany([
      { content: 'has a.*b inside', createdBy: ALICE, status: 'pending', updatedAt: new Date('2026-02-01') },
      { content: 'has ab inside', createdBy: ALICE, status: 'pending', updatedAt: new Date('2026-02-02') },
    ]);

    const results = await Query.glanceSearch(null, { query: 'a.*b' }, ctx(ALICE));
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('has a.*b inside');
  });

  test('the limit is respected and equals searchThings with no filters', async () => {
    await col('bujogeek', 'tasks').insertMany([
      { content: 'omega one', createdBy: ALICE, status: 'pending', updatedAt: new Date('2026-02-01') },
      { content: 'omega two', createdBy: ALICE, status: 'pending', updatedAt: new Date('2026-02-02') },
      { content: 'omega three', createdBy: ALICE, status: 'pending', updatedAt: new Date('2026-02-03') },
    ]);

    const viaResolver = await Query.glanceSearch(null, { query: 'omega', limit: 2 }, ctx(ALICE));
    const viaHelper = await searchThings(String(ALICE), 'omega', { limit: 2 });

    expect(viaResolver).toHaveLength(2);
    expect(viaResolver.map((r) => r.title)).toEqual(['omega three', 'omega two']);
    expect(viaHelper.map((r) => r.title)).toEqual(viaResolver.map((r) => r.title));
  });
});

// ── askService units ────────────────────────────────────────────────────────

describe('askService normalization', () => {
  test('junk from the model is coerced into a runnable plan', () => {
    const intent = askService.normalizeIntent(
      { kind: 'nonsense', keywords: [1, '  ', 'coop'], apps: ['notegeek', 'nasa'], types: ['note', 'ufo'], since: 'later', shelf: 'shelf-9', tags: ['flock'] },
      'the coop'
    );

    expect(intent.kind).toBe('search');
    expect(intent.keywords).toEqual(['coop']);
    expect(intent.apps).toEqual(['notegeek']);
    expect(intent.types).toEqual(['note']);
    expect(intent.since).toBeNull();
    expect(intent.shelf).toBeNull();
    expect(intent.tags).toEqual(['flock']);
  });

  test('an empty keyword list falls back to the raw query', () => {
    const intent = askService.normalizeIntent({ kind: 'search', keywords: [] }, 'the coop');
    expect(intent.keywords).toEqual(['the coop']);
  });

  test('trimGlanceToday keeps what a question could need and drops the rest', () => {
    const trimmed = askService.trimGlanceToday({
      date: '2026-09-04',
      tasks: {
        due: [{ id: 't1', content: 'Buy eggs', dueDate: new Date('2026-09-04'), tags: [] }],
        overdue: [],
        events: [{ id: 't9', content: 'never sent' }],
        upcoming: [{ id: 't8', content: 'never sent' }],
        completedCount: 2,
      },
      reading: [{ id: 'b1', title: 'Dune', authors: ['FH'], readingProgress: 42, coverPath: '/covers/dune.jpg' }],
      habits: [{ id: 'h1', name: 'Walk', doneToday: true, currentStreak: 3, color: '#fff' }],
      flock: { activeBirds: 4, todayEggs: 3, weekEggs: 20 },
    });

    expect(trimmed.tasks.due[0].content).toBe('Buy eggs');
    expect(trimmed.tasks.events).toBeUndefined();
    expect(trimmed.tasks.upcoming).toBeUndefined();
    expect(JSON.stringify(trimmed)).not.toContain('coverPath');
    expect(trimmed.flock.weekEggs).toBe(20);
  });
});
