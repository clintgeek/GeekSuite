/**
 * notegeekComposeNotes.test.js — Compose from several notes
 * (apps/notegeek/DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md §4).
 *
 * composeNotes is the single-note Compose pipeline fed a pile assembled from
 * the caller's notes, so these tests watch what reaches the model (the
 * aiService is mocked; every call is recorded) and what comes back:
 *   - order (oldest createdAt first), the `# title` / `Written` / `---` shape
 *   - skips with reasons, owner scoping, and no model call below two notes
 *   - TipTap HTML stripped by a parser (a literal `<` in code survives)
 *   - the size refusal, and the framing rule present on THIS path only
 *   - counts-only logging, and that nothing is written
 */
import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const callAI = jest.fn();
const aiServiceMock = { callAI, lastProviderInfo: { provider: 'groq', model: 'test-model' } };
jest.unstable_mockModule('../services/aiService.js', () => ({ default: aiServiceMock }));

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');
const { _resetCounters, _resetNeedCache } = await import('../services/aiFeatureRunner.js');
const compose = await import('../graphql/notegeek/compose.js');

const {
  COMPOSE_SINGLE_PROMPT, COMPOSE_MAP_PROMPT, COMPOSE_REDUCE_PROMPT, MAX_COMPOSE_CHARS,
  SINGLE_CALL_CHARS, COMPOSE_MANY_MAP_EXTRA, composeManyFraming, htmlToPlainText, composeNotes,
} = compose;
const { Mutation } = resolvers;

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId, extra = {}) => (userId ? { user: { id: String(userId), ...extra } } : {});

/** What each model call was sent: { system, user }. */
const sent = () => callAI.mock.calls.map(([prompt, opts]) => {
  const msgs = opts?.messages || [];
  return {
    system: msgs.find((m) => m.role === 'system')?.content ?? '',
    user: msgs.filter((m) => m.role === 'user').map((m) => m.content).join('\n') || prompt,
  };
});

/** A note with a fixed createdAt (timestamps would otherwise stamp "now"). */
async function note(fields, createdAt) {
  const n = await Note.create({ userId: ALICE, type: 'markdown', content: 'body', ...fields });
  if (createdAt) await Note.collection.updateOne({ _id: n._id }, { $set: { createdAt: new Date(createdAt) } });
  return n;
}
const idsOf = (...notes) => notes.map((n) => String(n._id));
const run = (noteIds, userId = ALICE, extra) => Mutation.composeNotes(null, { noteIds }, ctx(userId, extra));

beforeAll(async () => {
  await Note.db.asPromise();
}, 60000);

beforeEach(() => {
  _resetCounters();
  _resetNeedCache();
  callAI.mockReset();
  callAI.mockImplementation(async () => '# Combined\n\nThe merged document.');
});

afterEach(async () => {
  await Note.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
});

describe('order and shape of the pile', () => {
  test('oldest createdAt first, whatever order the ids came in; `---` between notes', async () => {
    const newest = await note({ title: 'Newest', content: 'third body' }, '2026-03-03T15:00:00Z');
    const oldest = await note({ title: 'Oldest', content: 'first body' }, '2026-01-01T15:00:00Z');
    const middle = await note({ title: 'Middle', content: 'second body' }, '2026-02-02T15:00:00Z');

    const out = await run(idsOf(newest, middle, oldest));

    expect(out.sources.used).toEqual(idsOf(oldest, middle, newest));
    expect(out.sources.skipped).toEqual([]);
    expect(callAI).toHaveBeenCalledTimes(1);
    expect(sent()[0].user).toBe([
      '# Oldest\nWritten 2026-01-01\n\nfirst body',
      '# Middle\nWritten 2026-02-02\n\nsecond body',
      '# Newest\nWritten 2026-03-03\n\nthird body',
    ].join('\n\n---\n\n'));
    expect(out.markdown).toBe('# Combined\n\nThe merged document.');
    expect(out.stats.strategy).toBe('single');
  });

  test('`---` keeps note boundaries as fragment boundaries', async () => {
    const a = await note({ title: 'A', content: 'alpha' }, '2026-01-01T12:00:00Z');
    const b = await note({ title: 'B', content: 'beta' }, '2026-01-02T12:00:00Z');
    await run(idsOf(a, b));
    const frags = compose.segmentFragments(sent()[0].user);
    expect(frags).toEqual(['# A\nWritten 2026-01-01', 'alpha', '# B\nWritten 2026-01-02', 'beta']);
  });

  test('an untitled note is "Untitled"; Written is the caller’s calendar day', async () => {
    // 03:00 UTC on Jan 2 is still Jan 1 in Chicago (the default zone).
    const a = await note({ title: '', content: 'alpha' }, '2026-01-02T03:00:00Z');
    const b = await note({ title: 'B', content: 'beta' }, '2026-01-03T12:00:00Z');
    await run(idsOf(a, b));
    expect(sent()[0].user.startsWith('# Untitled\nWritten 2026-01-01\n\nalpha')).toBe(true);

    callAI.mockClear();
    _resetCounters();
    await run(idsOf(a, b), ALICE, { profile: { timezone: 'Asia/Tokyo' } });
    expect(sent()[0].user.startsWith('# Untitled\nWritten 2026-01-02\n\nalpha')).toBe(true);
  });
});

describe('skips, with reasons', () => {
  test('locked, encrypted, sketch, mind map, empty, missing, foreign and malformed ids', async () => {
    const ok1 = await note({ title: 'Ok 1', content: 'one' }, '2026-01-01T12:00:00Z');
    const ok2 = await note({ title: 'Ok 2', type: 'code', content: JSON.stringify({ code: 'print(1)' }) }, '2026-01-02T12:00:00Z');
    const locked = await note({ title: 'Garden plan', content: 'secret plan', isLocked: true });
    const enc = await note({ title: 'Cipher', content: 'ENCRYPTED-BLOB', isEncrypted: true });
    const sketch = await note({ title: 'Sketch 4', type: 'handwritten', content: '{"store":{}}' });
    const mind = await note({ title: 'Map', type: 'mindmap', content: '{"nodes":[]}' });
    const empty = await note({ title: 'Blank', type: 'text', content: '<p></p><p>   </p>' });
    const bobs = await Note.create({ userId: BOB, title: 'Bob private', content: 'BOB-SECRET', type: 'markdown' });
    const missing = String(new mongoose.Types.ObjectId());

    const out = await run([...idsOf(ok1, ok2, locked, enc, sketch, mind, empty, bobs), missing, 'not-an-id']);

    expect(out.sources.used).toEqual(idsOf(ok1, ok2));
    expect(out.sources.skipped).toEqual([
      { id: String(locked._id), title: 'Garden plan', reason: 'locked' },
      { id: String(enc._id), title: 'Cipher', reason: 'locked' },
      { id: String(sketch._id), title: 'Sketch 4', reason: 'unsupported_type' },
      { id: String(mind._id), title: 'Map', reason: 'unsupported_type' },
      { id: String(empty._id), title: 'Blank', reason: 'empty' },
      { id: String(bobs._id), title: null, reason: 'not_found' },
      { id: missing, title: null, reason: 'not_found' },
      { id: 'not-an-id', title: null, reason: 'not_found' },
    ]);
    const input = sent()[0].user;
    expect(input).toContain('print(1)'); // the JSON code form is unwrapped
    expect(input).not.toContain('secret plan');
    expect(input).not.toContain('ENCRYPTED-BLOB');
    expect(input).not.toContain('BOB-SECRET');
    expect(input).not.toContain('Bob private');
  });

  test('fewer than two usable notes: not_enough_sources, and NO model call', async () => {
    const ok = await note({ title: 'Ok', content: 'one' });
    const locked = await note({ title: 'L', content: 'x', isLocked: true });
    const out = await run(idsOf(ok, locked));
    expect(callAI).not.toHaveBeenCalled();
    expect(out.markdown).toBe('');
    expect(out.provenance).toMatchObject({ source: 'fallback', reason: 'not_enough_sources' });
    expect(out.stats.strategy).toBe('refused');
    expect(out.sources).toEqual({ used: idsOf(ok), skipped: [{ id: String(locked._id), title: 'L', reason: 'locked' }] });
  });

  test('the same id twice is one note', async () => {
    const ok = await note({ title: 'Ok', content: 'one' });
    const out = await run(idsOf(ok, ok));
    expect(out.provenance.reason).toBe('not_enough_sources');
    expect(callAI).not.toHaveBeenCalled();
  });

  test('owner scoping: another user’s notes are not_found and never reach a model', async () => {
    const a = await Note.create({ userId: BOB, title: 'B1', content: 'BOB-ONE', type: 'markdown' });
    const b = await Note.create({ userId: BOB, title: 'B2', content: 'BOB-TWO', type: 'markdown' });
    const out = await run(idsOf(a, b));
    expect(out.sources.skipped.map((s) => s.reason)).toEqual(['not_found', 'not_found']);
    expect(out.sources.skipped.map((s) => s.title)).toEqual([null, null]);
    expect(callAI).not.toHaveBeenCalled();
    // Bob composes his own.
    const bobs = await run(idsOf(a, b), BOB);
    expect(bobs.sources.used).toHaveLength(2);
  });

  test('an archived note is still composable by id (direct read)', async () => {
    const a = await note({ title: 'A', content: 'alpha', archived: true, archivedAt: new Date() });
    const b = await note({ title: 'B', content: 'beta' });
    const out = await run(idsOf(a, b));
    expect(out.sources.used).toHaveLength(2);
  });
});

describe('TipTap HTML is stripped with a parser', () => {
  test('tags gone, entities decoded, a literal `<` in code survives, blocks keep their breaks', () => {
    const html = '<h2>Plan</h2><p>Use <strong>bold</strong> &amp; more</p>'
      + '<pre><code>if (a &lt; b &amp;&amp; c > d) {\n  go();\n}</code></pre>'
      + '<ul><li><p>one</p></li><li><p>two</p></li></ul><p>x < y and 3<4</p>';
    const text = htmlToPlainText(html);
    expect(text).not.toMatch(/<\/?(p|h2|strong|pre|code|ul|li)\b/);
    expect(text).toContain('Use bold & more');
    expect(text).toContain('if (a < b && c > d) {\n  go();\n}');
    expect(text).toContain('x < y and 3<4');
    expect(text.split(/\n\s*\n/).length).toBeGreaterThan(2); // paragraphs are paragraphs
  });

  test('a text note reaches the model as plain text', async () => {
    const t = await note({ title: 'Rich', type: 'text', content: '<p>Hello <em>there</em></p><pre><code>a &lt; b</code></pre>' }, '2026-01-01T12:00:00Z');
    const legacy = await note({ title: 'Legacy', content: '<p>old &amp; typeless</p>' }, '2026-01-02T12:00:00Z');
    await Note.collection.updateOne({ _id: legacy._id }, { $unset: { type: '' } });
    await run(idsOf(t, legacy));
    const input = sent()[0].user;
    expect(input).toContain('Hello there');
    expect(input).toContain('a < b');
    expect(input).toContain('old & typeless'); // the legacy null type is TipTap HTML
    expect(input).not.toMatch(/<p>|<em>|<pre>|&lt;|&amp;/);
  });
});

describe('size: refused, never truncated', () => {
  test('a selection over the ceiling is refused with the total, and no call', async () => {
    const half = Math.ceil(MAX_COMPOSE_CHARS / 2);
    const a = await note({ title: 'A', content: 'a'.repeat(half) });
    const b = await note({ title: 'B', content: 'b'.repeat(half) });
    const out = await run(idsOf(a, b));
    expect(callAI).not.toHaveBeenCalled();
    expect(out.provenance.reason).toBe('content_too_long');
    expect(out.stats.strategy).toBe('refused');
    expect(out.stats.inputChars).toBeGreaterThan(MAX_COMPOSE_CHARS);
    expect(out.sources.used).toHaveLength(2);
  });
});

describe('the framing rule is on this path only', () => {
  test('composeNotes appends it to the single-call prompt', async () => {
    const a = await note({ title: 'A', content: 'alpha' });
    const b = await note({ title: 'B', content: 'beta' });
    await run(idsOf(a, b));
    expect(sent()[0].system).toBe(`${COMPOSE_SINGLE_PROMPT}\n\n${composeManyFraming(2)}`);
    expect(sent()[0].system).toMatch(/2 separate notes, oldest first/);
    expect(sent()[0].system).toMatch(/the later note is the newer information/);
  });

  test('…and to every MAP and the REDUCE prompt when it map-reduces', async () => {
    const big = (w) => Array.from({ length: 12 }, (_, i) => `${w} ${i} ${'x'.repeat(500)}`).join('\n\n');
    const a = await note({ title: 'A', content: big('alpha') }, '2026-01-01T12:00:00Z');
    const b = await note({ title: 'B', content: big('beta') }, '2026-01-02T12:00:00Z');
    callAI.mockImplementation(async (_p, opts) => (
      opts.messages[0].content.startsWith(COMPOSE_MAP_PROMPT) ? '- a point' : '# Doc\n\n- a point'));
    const out = await run(idsOf(a, b));
    expect(out.stats.inputChars).toBeGreaterThan(SINGLE_CALL_CHARS);
    expect(out.stats.strategy).toBe('map_reduce');
    const systems = sent().map((c) => c.system);
    const maps = systems.filter((s) => s.startsWith(COMPOSE_MAP_PROMPT));
    expect(maps.length).toBeGreaterThan(0);
    for (const s of maps) expect(s).toBe(`${COMPOSE_MAP_PROMPT}\n\n${composeManyFraming(2)} ${COMPOSE_MANY_MAP_EXTRA}`);
    expect(systems.at(-1)).toBe(`${COMPOSE_REDUCE_PROMPT}\n\n${composeManyFraming(2)}`);
  });

  test('single-note composeNote sends its prompt exactly as before', async () => {
    await Mutation.composeNote(null, { content: 'a scrap\n\nanother scrap' }, ctx(ALICE));
    expect(sent()[0].system).toBe(COMPOSE_SINGLE_PROMPT);
    expect(sent()[0].system).not.toMatch(/separate notes/);
  });
});

describe('the result, the budget, and what is written and logged', () => {
  test('ComposedNote fields + sources; same feature as Compose; nothing written', async () => {
    const a = await note({ title: 'A', content: 'alpha' });
    const b = await note({ title: 'B', content: 'beta' });
    const before = await Note.countDocuments({});
    const out = await run(idsOf(a, b));
    expect(Object.keys(out).sort()).toEqual(['markdown', 'provenance', 'sources', 'stats']);
    expect(out.stats).toMatchObject({ chunksFailed: 0, truncated: false });
    expect(out.provenance).toMatchObject({ source: 'model', cap: compose.COMPOSE_DAILY_CAP });
    expect(callAI.mock.calls[0][1]).toMatchObject({ appName: 'notegeek', feature: 'compose_note' });
    expect(await Note.countDocuments({})).toBe(before);
    expect((await Note.findById(a._id).lean()).content).toBe('alpha');
  });

  test('logs counts only, never note text or titles', async () => {
    const info = jest.fn();
    const notes = [
      { _id: new mongoose.Types.ObjectId(), title: 'TITLE-SECRET', content: 'BODY-SECRET', type: 'markdown', createdAt: new Date('2026-01-01') },
      { _id: new mongoose.Types.ObjectId(), title: 'T2', content: 'BODY-TWO', type: 'markdown', createdAt: new Date('2026-01-02') },
    ];
    await composeNotes({ noteIds: notes.map((n) => String(n._id)), notes, userId: String(ALICE), log: { info } });
    expect(info).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toMatch(/SECRET|BODY|T2|merged document/);
    expect(info.mock.calls[0][0]).toMatchObject({ requested: 2, used: 2, skipped: 0 });
  });
});

describe('validation', () => {
  test('2–20 ids, and a session is required', async () => {
    const one = [String(new mongoose.Types.ObjectId())];
    await expect(run(one)).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    const many = Array.from({ length: 21 }, () => String(new mongoose.Types.ObjectId()));
    await expect(run(many)).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    await expect(run([...one, ...one], null)).rejects.toThrow('Unauthorized');
    expect(callAI).not.toHaveBeenCalled();
  });
});
