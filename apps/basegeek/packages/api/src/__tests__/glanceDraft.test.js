/**
 * glanceDraft.test.js
 *
 * The capture fallback: a `>` or `<` line the deterministic parser could not
 * read, drafted by the model into the variables the create mutations already
 * take. The contract that matters is the same one glanceAsk has — the model
 * can never make things worse:
 *
 *   - a task draft round-trips into CREATE_TASK's exact variables
 *   - invalid field values are dropped or normalized, never passed through
 *   - a tag the person did not type never survives
 *   - any failure degrades to `draft: null`, which the client reads as
 *     "carry on as if AI were off"
 *   - the server drafts and nothing else: no Thing is ever written here
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
const { resolvers } = await import('../graphql/glance/resolvers.js');
const askService = await import('../graphql/glance/askService.js');

const { Query } = resolvers;

const ALICE = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

const APPS = ['bujogeek', 'notegeek'];
const conns = {};

/** Queue one JSON payload for the single expected aiService.callAI call. */
const modelReturns = (payload) => {
  callAI.mockReset();
  aiServiceMock.lastProviderInfo = { provider: 'groq', model: 'llama-3.3-70b-versatile' };
  callAI.mockImplementationOnce(async () =>
    typeof payload === 'string' ? payload : JSON.stringify(payload)
  );
};

const taskDraft = (overrides = {}) => ({
  content: 'Call the vet',
  dueDate: '2026-09-11T14:00:00',
  priority: null,
  tags: ['flock'],
  signifier: '*',
  summary: 'Task: call the vet, Friday at 2 PM, tagged flock.',
  ...overrides,
});

const VET_LINE = 'remind me to call the vet friday afternoon #flock';

beforeAll(async () => {
  for (const app of APPS) {
    conns[app] = getAppConnection(app);
    await conns[app].asPromise();
  }
}, 60000);

beforeEach(() => {
  callAI.mockReset();
  aiServiceMock.lastProviderInfo = null;
});

afterAll(async () => {
  await Promise.all(APPS.map((app) => conns[app].close()));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ── Gating ──────────────────────────────────────────────────────────────────

describe('glanceDraft gating', () => {
  test('anonymous callers are rejected before the model is touched', async () => {
    await expect(
      Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(null))
    ).rejects.toThrow('Unauthorized');
    expect(callAI).not.toHaveBeenCalled();
  });

  test('an unknown kind degrades instead of guessing', async () => {
    const out = await Query.glanceDraft(null, { input: VET_LINE, kind: 'book' }, ctx(ALICE));
    expect(out.degraded).toBe(true);
    expect(out.draft).toBeNull();
    expect(callAI).not.toHaveBeenCalled();
  });

  test('an empty line degrades without a model call', async () => {
    const out = await Query.glanceDraft(null, { input: '   ', kind: 'task' }, ctx(ALICE));
    expect(out.degraded).toBe(true);
    expect(out.draft).toBeNull();
    expect(callAI).not.toHaveBeenCalled();
  });
});

// ── The round trip ──────────────────────────────────────────────────────────

describe('a task draft round-trips into CREATE_TASK variables', () => {
  test('every field the mutation takes comes back, shaped as it takes it', async () => {
    modelReturns(taskDraft());

    const out = await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));

    expect(out.degraded).toBe(false);
    expect(out.kind).toBe('task');
    expect(out.draft).toEqual({
      content: 'Call the vet',
      title: null,
      dueDate: '2026-09-11T14:00:00',
      priority: null,
      tags: ['flock'],
      signifier: '*',
    });
    expect(out.summary).toBe('Task: call the vet, Friday at 2 PM, tagged flock.');
    expect(out.provider).toBe('groq');
    expect(out.model).toBe('llama-3.3-70b-versatile');
  });

  test('the dueDate is a string `new Date()` reads back as the drafted moment', async () => {
    modelReturns(taskDraft());

    const out = await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));
    const when = new Date(out.draft.dueDate);

    expect(Number.isNaN(when.getTime())).toBe(false);
    expect(when.getFullYear()).toBe(2026);
    expect(when.getMonth()).toBe(8); // September
    expect(when.getDate()).toBe(11);
    expect(when.getHours()).toBe(14);
  });

  test('the model is asked through aiGeek App Routing, with today in the prompt', async () => {
    modelReturns(taskDraft());

    await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));

    const [, config] = callAI.mock.calls[0];
    expect(config.useAppConfig).toBe(true);
    expect(config.appName).toBe(askService.ASK_APP_NAME);
    expect(config.responseFormat.type).toBe('json_schema');

    const system = config.messages[0].content;
    expect(system).toContain(askService.serverToday().iso);
    expect(system).toContain('!high');   // the grammar the parser implements
    expect(system).toContain('#tag');
  });

  test('a note draft carries title, content and tags and nothing task-shaped', async () => {
    modelReturns({
      title: 'Coop wiring',
      content: 'The coop wiring needs a GFCI before winter.',
      tags: ['flock'],
      summary: 'Note: coop wiring.',
    });

    const out = await Query.glanceDraft(
      null,
      { input: 'the coop wiring needs a gfci before winter #flock', kind: 'note' },
      ctx(ALICE)
    );

    expect(out.degraded).toBe(false);
    expect(out.kind).toBe('note');
    expect(out.draft.title).toBe('Coop wiring');
    expect(out.draft.content).toBe('The coop wiring needs a GFCI before winter.');
    expect(out.draft.tags).toEqual(['flock']);
    expect(out.draft.dueDate).toBeNull();
    expect(out.draft.priority).toBeNull();
    expect(out.draft.signifier).toBeNull();
  });
});

// ── Invalid values ──────────────────────────────────────────────────────────

describe('invalid field values are dropped or normalized', () => {
  test('an out-of-range priority, a junk signifier and an unparseable date all fall away', async () => {
    modelReturns(
      taskDraft({ priority: 9, signifier: '§', dueDate: 'friday afternoon', tags: [] })
    );

    const out = await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));

    expect(out.degraded).toBe(false);
    expect(out.draft.priority).toBeNull();
    expect(out.draft.signifier).toBe('*');   // the parser's default
    expect(out.draft.dueDate).toBeNull();
  });

  test('a bare date becomes 09:00, exactly as the parser defaults it', async () => {
    modelReturns(taskDraft({ dueDate: '2026-09-11' }));

    const out = await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));
    expect(out.draft.dueDate).toBe('2026-09-11T09:00:00');
  });

  test('a tag the person never typed is thrown away', async () => {
    modelReturns(taskDraft({ tags: ['flock', 'chores', 'errands'] }));

    const out = await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));
    expect(out.draft.tags).toEqual(['flock']);
  });

  test('a leading # on a tag the person did type is stripped, not rejected', async () => {
    modelReturns(taskDraft({ tags: ['#flock'] }));

    const out = await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));
    expect(out.draft.tags).toEqual(['flock']);
  });

  test('an over-long note title is cut to 60 characters', async () => {
    const long = 'x'.repeat(200);
    modelReturns({ title: long, content: 'body', tags: [], summary: 'Note.' });

    const out = await Query.glanceDraft(null, { input: 'a line about x', kind: 'note' }, ctx(ALICE));
    expect(out.draft.title).toHaveLength(60);
  });

  test('a missing summary is replaced with one built from the draft', async () => {
    modelReturns(taskDraft({ summary: '' }));

    const out = await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));
    expect(out.summary).toBe('Task: Call the vet');
  });
});

// ── Failure degrades ────────────────────────────────────────────────────────

describe('any failure degrades to no draft', () => {
  test('aiService throwing returns degraded, not an error', async () => {
    callAI.mockReset();
    callAI.mockRejectedValue(new Error('all providers failed'));

    const out = await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));

    expect(out.degraded).toBe(true);
    expect(out.draft).toBeNull();
    expect(out.summary).toBeNull();
    expect(out.kind).toBe('task');
  });

  test('a non-JSON response degrades rather than throwing', async () => {
    modelReturns('I am afraid I cannot do that, Chef.');

    const out = await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));
    expect(out.degraded).toBe(true);
    expect(out.draft).toBeNull();
  });

  test('a draft with no content degrades — an empty task is not a draft', async () => {
    modelReturns(taskDraft({ content: '   ' }));

    const out = await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));
    expect(out.degraded).toBe(true);
    expect(out.draft).toBeNull();
  });

  test('a note with no body degrades too', async () => {
    modelReturns({ title: 'Title only', content: '', tags: [], summary: 'Note.' });

    const out = await Query.glanceDraft(null, { input: 'some line here', kind: 'note' }, ctx(ALICE));
    expect(out.degraded).toBe(true);
    expect(out.draft).toBeNull();
  });

  test('the call times out after the shared 3s budget and degrades', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    callAI.mockReset();
    callAI.mockImplementation(() => new Promise(() => {})); // never settles

    const pending = Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));
    await Promise.resolve();
    jest.advanceTimersByTime(askService.ASK_TIMEOUT_MS + 1);
    jest.useRealTimers();

    const out = await pending;
    expect(out.degraded).toBe(true);
    expect(out.draft).toBeNull();
  }, 20000);
});

// ── Drafting only ───────────────────────────────────────────────────────────

describe('the server drafts and nothing else', () => {
  test('no task and no note is written — the mutation is the client\'s to run', async () => {
    const tasks = conns.bujogeek.collection('tasks');
    const notes = conns.notegeek.collection('notes');

    const before = {
      tasks: await tasks.countDocuments({ createdBy: ALICE }),
      notes: await notes.countDocuments({ userId: ALICE }),
    };

    modelReturns(taskDraft());
    await Query.glanceDraft(null, { input: VET_LINE, kind: 'task' }, ctx(ALICE));

    modelReturns({ title: 'A note', content: 'body text', tags: [], summary: 'Note.' });
    await Query.glanceDraft(null, { input: 'a note about body text', kind: 'note' }, ctx(ALICE));

    expect(await tasks.countDocuments({ createdBy: ALICE })).toBe(before.tasks);
    expect(await notes.countDocuments({ userId: ALICE })).toBe(before.notes);
  });

  test('glanceDraft is a Query — the glance module exposes no capture mutation', () => {
    expect(typeof Query.glanceDraft).toBe('function');
    expect(resolvers.Mutation?.glanceDraft).toBeUndefined();
    expect(resolvers.Mutation?.createTask).toBeUndefined();
  });
});

// ── askService units ────────────────────────────────────────────────────────

describe('askService draft normalization', () => {
  test('normalizeTaskDraft refuses a draft with nothing to do', () => {
    expect(askService.normalizeTaskDraft({ content: '' }, 'x')).toBeNull();
    expect(askService.normalizeTaskDraft(null, 'x')).toBeNull();
    expect(askService.normalizeTaskDraft('nope', 'x')).toBeNull();
  });

  test('normalizeDraftDate keeps a zone the model chose to send', () => {
    expect(askService.normalizeDraftDate('2026-09-11T14:00:00Z')).toBe('2026-09-11T14:00:00Z');
    expect(askService.normalizeDraftDate('2026-09-11T14:00-05:00')).toBe('2026-09-11T14:00:00-05:00');
    expect(askService.normalizeDraftDate('next friday')).toBeNull();
    expect(askService.normalizeDraftDate(null)).toBeNull();
  });

  test('keepOnlyInputTags is a whitelist, not a filter on shape', () => {
    expect(askService.keepOnlyInputTags(['flock', 'chores'], 'call the vet #flock')).toEqual(['flock']);
    expect(askService.keepOnlyInputTags(['Flock'], 'call the vet #flock')).toEqual(['Flock']);
    expect(askService.keepOnlyInputTags(['not a tag'], 'not a tag here')).toEqual([]);
    expect(askService.keepOnlyInputTags('nope', 'anything')).toEqual([]);
  });
});
