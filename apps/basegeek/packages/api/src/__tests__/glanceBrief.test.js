/**
 * glanceBrief.test.js
 *
 * StartGeek's morning brief (AI_IDEAS.md #5, stream R118). The brief is the
 * one AI feature in the suite that is allowed to say nothing at all, so the
 * contract worth pinning is mostly about restraint:
 *
 *   - before 5 a.m. local there is no brief, and no work is done to find out
 *   - the model only ever *words* facts code computed; it is never shown a
 *     note body, a cover path, an id or a health number
 *   - prose that runs long or rambles past three sentences is thrown away and
 *     the deterministic three-liner ships instead
 *   - one model call per user per day, because the answer is cached — but a
 *     fallback is never cached, so an aiGeek that was down at 05:58 does not
 *     cost the whole day
 *
 * No Mongo and no model: `buildBrief` takes its snapshot loader and its
 * aiService as arguments, and both are fakes here.
 */

import { jest } from '@jest/globals';

// The logger is mocked rather than spied on: `startgeek.brief.shown` is this
// feature's one usage metric, so the assertion that it is emitted (and only
// when there is actually a brief) belongs in the suite, and a pino instance is
// not reliably spy-able through its prototype.
const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), fatal: jest.fn(), trace: jest.fn() };
jest.unstable_mockModule('../lib/logger.js', () => ({ default: loggerMock, logger: loggerMock }));

const {
  buildBrief,
  briefFacts,
  deterministicBrief,
  bestStreak,
  countSentences,
  isUsableBrief,
  _resetBriefCache,
  BRIEF_MAX_CALLS_PER_DAY,
  BRIEF_MIN_LOCAL_HOUR,
} = await import('../graphql/glance/briefService.js');
const { _resetCounters } = await import('../services/aiFeatureRunner.js');

const DATE = '2026-09-06';

/** A full-fat glanceToday snapshot, including the parts the brief must drop. */
const snapshot = (overrides = {}) => ({
  date: DATE,
  tasks: {
    due: [
      { id: 'a', content: 'Call the roofer', status: 'pending', dueDate: '2026-09-06T14:00:00Z', tags: ['home'] },
      { id: 'b', content: 'Standup', status: 'pending', dueDate: '2026-09-06T15:00:00Z', tags: [] },
      { id: 'c', content: 'Renew the domain', status: 'pending', dueDate: '2026-09-06T16:00:00Z', tags: [] },
      { id: 'd', content: 'Water the tomatoes', status: 'pending', dueDate: '2026-09-06T17:00:00Z', tags: [] },
    ],
    overdue: [{ id: 'e', content: 'Reply to Chef', status: 'pending', dueDate: '2026-09-03T09:00:00Z', tags: [] }],
    events: [],
    upcoming: [{ id: 'f', content: 'Dentist', status: 'pending', dueDate: '2026-09-12T09:00:00Z', tags: [] }],
    completedCount: 2,
    blockedCount: 1,
  },
  habits: [
    { id: 'h1', name: 'reading', color: '#fff', doneToday: true, currentStreak: 12 },
    { id: 'h2', name: 'walking', color: '#000', doneToday: false, currentStreak: 3 },
  ],
  recentNotes: [{ id: 'n1', title: 'Secret plans', type: 'text', tags: [], updatedAt: new Date(), snippet: 'the body of a note' }],
  reading: [{ id: 'bk1', title: 'Lock In', authors: ['John Scalzi'], readingProgress: 62, pageCount: 336, coverPath: '/covers/lock-in.jpg' }],
  fitness: { calories: 1450, calorieGoal: 2100, mealsLogged: 2, loginStreak: 6, lastActivity: { activityName: 'Run' } },
  flock: { activeBirds: 6, todayEggs: 4, weekEggs: 21 },
  ...overrides,
});

function fakeAI(impl, info = { provider: 'groq', model: 'llama-3.3-70b-versatile' }) {
  return { callAI: jest.fn(impl), lastProviderInfo: info };
}

const run = (opts = {}) =>
  buildBrief({
    userId: 'u1',
    date: DATE,
    localHour: 7,
    loadGlance: async () => snapshot(),
    ...opts,
  });

beforeEach(() => {
  _resetBriefCache();
  _resetCounters();
  loggerMock.info.mockClear();
  loggerMock.warn.mockClear();
});

// ── Facts ───────────────────────────────────────────────────────────────────

describe('briefFacts', () => {
  test('keeps counts, titles, streaks, the book and the eggs', () => {
    const facts = briefFacts(snapshot());
    expect(facts.date).toBe(DATE);
    expect(facts.tasks).toMatchObject({ dueCount: 4, overdueCount: 1, completedCount: 2 });
    expect(facts.tasks.due).toEqual(['Call the roofer', 'Standup', 'Renew the domain']); // capped at 3
    expect(facts.tasks.overdue).toEqual(['Reply to Chef']);
    expect(facts.habits).toEqual([
      { name: 'reading', doneToday: true, currentStreak: 12 },
      { name: 'walking', doneToday: false, currentStreak: 3 },
    ]);
    expect(facts.book).toEqual({ title: 'Lock In', authors: ['John Scalzi'], readingProgress: 62 });
    expect(facts.flock).toEqual({ todayEggs: 4 });
  });

  test('nothing a model has no business seeing survives the trim', () => {
    const json = JSON.stringify(briefFacts(snapshot()));
    // note bodies and titles
    expect(json).not.toContain('the body of a note');
    expect(json).not.toContain('Secret plans');
    // ids — the brief cites nothing, so it needs none
    expect(json).not.toContain('"bk1"');
    expect(json).not.toContain('"h1"');
    // cover paths, page counts and every health number
    expect(json).not.toContain('coverPath');
    expect(json).not.toContain('1450');
    expect(json).not.toContain('calorieGoal');
    expect(json).not.toContain('lastActivity');
  });

  test('a thin day yields a thin facts object, not undefined keys', () => {
    const facts = briefFacts({ date: DATE, tasks: {}, habits: [], reading: [], flock: null });
    expect(facts.tasks).toEqual({ dueCount: 0, overdueCount: 0, completedCount: 0, due: [], overdue: [] });
    expect(facts.habits).toBeUndefined();
    expect(facts.book).toBeUndefined();
    expect(facts.flock).toBeUndefined();
  });

  test('no snapshot, no facts', () => {
    expect(briefFacts(null)).toBeNull();
    expect(briefFacts('nope')).toBeNull();
  });
});

// ── The deterministic brief ─────────────────────────────────────────────────

describe('deterministicBrief', () => {
  test('reads as three sentences of plain fact', () => {
    const text = deterministicBrief(briefFacts(snapshot()));
    expect(text).toBe('4 tasks due, 1 overdue. Day 12 of reading. 62% through Lock In.');
    expect(isUsableBrief(text)).toBe(true);
  });

  test('singular counts, and a day with nothing due', () => {
    const one = deterministicBrief(briefFacts(snapshot({
      tasks: { due: [{ id: 'a', content: 'One thing' }], overdue: [], completedCount: 0 },
    })));
    expect(one.startsWith('1 task due.')).toBe(true);

    const none = deterministicBrief(briefFacts(snapshot({ tasks: { due: [], overdue: [] } })));
    expect(none.startsWith('Nothing is due today.')).toBe(true);
  });

  test('falls back through the facts it has: eggs stand in for a book', () => {
    const text = deterministicBrief(briefFacts(snapshot({ reading: [] })));
    expect(text).toContain('4 eggs collected today.');
  });

  test('a book with no progress is still worth a sentence', () => {
    const text = deterministicBrief(briefFacts(snapshot({
      reading: [{ id: 'b', title: 'Dune', authors: [], readingProgress: null }],
    })));
    expect(text).toContain('You are reading Dune.');
  });

  test('an empty day still says something, and never more than three sentences', () => {
    const text = deterministicBrief(briefFacts({ date: DATE }));
    expect(text).toBe('Nothing is due today.');
    expect(countSentences(text)).toBe(1);
  });

  test('bestStreak ignores broken streaks', () => {
    expect(bestStreak({ habits: [{ name: 'a', currentStreak: 0 }, { name: 'b', currentStreak: 4 }] }))
      .toMatchObject({ name: 'b' });
    expect(bestStreak({ habits: [{ name: 'a', currentStreak: 0 }] })).toBeNull();
    expect(bestStreak(null)).toBeNull();
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('isUsableBrief', () => {
  test('counts sentences the way a reader would', () => {
    expect(countSentences('One. Two. Three.')).toBe(3);
    expect(countSentences('No terminator at all')).toBe(1);
    expect(countSentences('')).toBe(0);
  });

  test('three sentences and 400 characters are the walls', () => {
    expect(isUsableBrief('Four tasks are due. You are on day twelve. You are most of the way through Lock In.')).toBe(true);
    expect(isUsableBrief('One. Two. Three. Four.')).toBe(false);
    expect(isUsableBrief(`${'x'.repeat(401)}`)).toBe(false);
    expect(isUsableBrief('   ')).toBe(false);
    expect(isUsableBrief(null)).toBe(false);
    expect(isUsableBrief(42)).toBe(false);
  });
});

// ── buildBrief ──────────────────────────────────────────────────────────────

describe('buildBrief', () => {
  test('before 5 a.m. local there is no brief and no work', async () => {
    const loadGlance = jest.fn(async () => snapshot());
    const ai = fakeAI(async () => 'never asked');
    const res = await run({ localHour: BRIEF_MIN_LOCAL_HOUR - 1, loadGlance, ai });

    expect(res).toMatchObject({ date: DATE, brief: null, facts: null });
    expect(res.provenance).toMatchObject({ source: 'fallback', reason: 'before_hour' });
    expect(loadGlance).not.toHaveBeenCalled();
    expect(ai.callAI).not.toHaveBeenCalled();
  });

  test('at 5 a.m. exactly the brief is on', async () => {
    const ai = fakeAI(async () => 'Four tasks are due. You are on day twelve of reading. Lock In is most of the way done.');
    const res = await run({ localHour: BRIEF_MIN_LOCAL_HOUR, ai });
    expect(res.brief).toContain('Four tasks are due.');
  });

  test('routes through the startgeek:brief row in free-text mode', async () => {
    const ai = fakeAI(async () => 'You have four tasks due. You are on day twelve of reading. Lock In is at sixty-two percent.');
    const res = await run({ ai });

    expect(res.provenance).toMatchObject({ source: 'model', provider: 'groq', model: 'llama-3.3-70b-versatile', cached: false });
    const [, cfg] = ai.callAI.mock.calls[0];
    // Phase 2: no routing switch — "nothing at all" is `auto` reading the
    // app's row, which is what `useAppConfig: true` used to mean.
    expect(cfg).toMatchObject({ appName: 'startgeek', feature: 'brief', userId: 'u1' });
    // Free text: no JSON schema is imposed on a paragraph.
    expect(cfg.responseFormat).toBeUndefined();
    // The facts, and only the facts, are the user turn.
    expect(JSON.parse(ai.callAI.mock.calls[0][0])).toEqual(res.facts);
  });

  test('prose that breaks the contract is thrown away for the deterministic line', async () => {
    const tooMany = await run({ ai: fakeAI(async () => 'One. Two. Three. Four.') });
    expect(tooMany.provenance).toMatchObject({ source: 'fallback', reason: 'invalid' });
    expect(tooMany.brief).toBe('4 tasks due, 1 overdue. Day 12 of reading. 62% through Lock In.');

    _resetCounters();
    const tooLong = await run({ ai: fakeAI(async () => `${'x'.repeat(500)}`) });
    expect(tooLong.provenance.reason).toBe('invalid');
    expect(tooLong.brief).toBe('4 tasks due, 1 overdue. Day 12 of reading. 62% through Lock In.');
  });

  test('aiGeek down or slow is a fallback, never an error', async () => {
    const down = await run({ ai: fakeAI(async () => { throw new Error('ECONNREFUSED'); }) });
    expect(down.provenance).toMatchObject({ source: 'fallback', reason: 'unavailable' });
    expect(down.brief).toBeTruthy();
  });

  test('a snapshot that will not load means an empty hero, not a 500', async () => {
    const res = await run({ loadGlance: async () => { throw new Error('mongo is having a day'); } });
    expect(res).toMatchObject({ brief: null, facts: null });
    expect(res.provenance.reason).toBe('no_snapshot');
  });

  // ── The once-a-day cache ──

  test('a model brief is produced once a day and replayed after that', async () => {
    const loadGlance = jest.fn(async () => snapshot());
    const ai = fakeAI(async () => 'You have four tasks due. Day twelve of reading. Lock In is at sixty-two percent.');

    const first = await run({ loadGlance, ai });
    const second = await run({ loadGlance, ai });

    expect(second.brief).toBe(first.brief);
    expect(second.provenance.cached).toBe(true);
    expect(first.provenance.cached).toBe(false);
    expect(ai.callAI).toHaveBeenCalledTimes(1);
    expect(loadGlance).toHaveBeenCalledTimes(1); // the second call reads no Mongo either
  });

  test('a fallback is returned but never cached, so the next load can try again', async () => {
    const flaky = jest.fn()
      .mockImplementationOnce(async () => { throw new Error('down'); })
      .mockImplementationOnce(async () => 'You have four tasks due. Day twelve of reading. Lock In is at sixty-two percent.');
    const ai = { callAI: flaky, lastProviderInfo: { provider: 'groq', model: 'llama' } };

    const first = await run({ ai });
    expect(first.provenance.source).toBe('fallback');

    const second = await run({ ai });
    expect(second.provenance.source).toBe('model');
    expect(second.brief).toContain('You have four tasks due.');
  });

  test('another user and another day get their own brief', async () => {
    const ai = fakeAI(async () => 'You have four tasks due. Day twelve of reading. Lock In is at sixty-two percent.');
    await run({ ai });
    await run({ ai, userId: 'u2' });
    expect(ai.callAI).toHaveBeenCalledTimes(2);

    // Tomorrow sweeps yesterday's key rather than accumulating it.
    await run({ ai, date: '2026-09-07' });
    expect(ai.callAI).toHaveBeenCalledTimes(3);
    const back = await run({ ai });
    expect(back.provenance.cached).toBe(false); // yesterday's entry is gone
  });

  test(`the cap holds at ${BRIEF_MAX_CALLS_PER_DAY} model calls a day even with the cache defeated`, async () => {
    const ai = fakeAI(async () => 'One. Two. Three. Four.'); // always invalid → never cached
    for (let i = 0; i < BRIEF_MAX_CALLS_PER_DAY + 2; i += 1) await run({ ai });
    expect(ai.callAI).toHaveBeenCalledTimes(BRIEF_MAX_CALLS_PER_DAY);

    const capped = await run({ ai });
    expect(capped.provenance).toMatchObject({ reason: 'cap', cap: BRIEF_MAX_CALLS_PER_DAY });
    expect(capped.brief).toBeTruthy(); // still says something
  });

  // ── The metric ──

  const shownMetrics = () =>
    loggerMock.info.mock.calls.filter(([fields]) => fields?.metric === 'startgeek.brief.shown');

  test('produces the one usage metric, and only when there is a brief', async () => {
    await run({ ai: fakeAI(async () => 'You have four tasks due. Day twelve of reading. Lock In is at sixty-two percent.') });
    expect(shownMetrics()).toHaveLength(1);
    expect(shownMetrics()[0][0]).toMatchObject({ metric: 'startgeek.brief.shown', source: 'model' });

    loggerMock.info.mockClear();
    await run({ localHour: 3 });
    expect(shownMetrics()).toHaveLength(0);
  });

  test('the metric is counted once a day, not once a page load', async () => {
    const ai = fakeAI(async () => 'You have four tasks due. Day twelve of reading. Lock In is at sixty-two percent.');
    await run({ ai });
    await run({ ai });
    await run({ ai });
    expect(shownMetrics()).toHaveLength(1);
  });
});
