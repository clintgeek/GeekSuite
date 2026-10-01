/**
 * Fold-in — new information folded into an existing note as anchored edits.
 *
 * The invariants, in the order they matter:
 *   1. the model never writes the note: only validated operations change it,
 *      and everything they do not touch is byte-identical afterwards
 *   2. an operation that does not name exactly one place is dropped AND
 *      reported, and what it carried lands in `unplaced`
 *   3. code fences are never edited inside
 *   4. preview writes nothing; apply snapshots first, re-validates, and
 *      refuses a stale base whose anchors broke
 */
import { jest } from '@jest/globals';
import mongoose from 'mongoose';

// The resolver path calls the real aiFeatureRunner, which calls aiService.
// No network in tests: aiService is replaced before anything imports it.
const callAI = jest.fn();
const fakeService = {
  callAI,
  lastProviderInfo: { provider: 'openrouter', model: 'test-model' },
};
jest.unstable_mockModule('../services/aiService.js', () => ({ default: fakeService }));

const { _resetCounters, _resetNeedCache } = await import('../services/aiFeatureRunner.js');
const foldin = await import('../graphql/notegeek/foldin.js');
const {
  planOperations,
  applyPlan,
  parseMarkdown,
  operationSchema,
  foldInPreview,
  buildNoteContext,
  FOLD_IN_NEED,
  MAX_FOLD_INPUT_CHARS,
  MAX_OPERATIONS,
  WHOLE_NOTE_CHARS,
} = foldin;
const { FOLD_IN_INPUT_MAX, FOLD_IN_OPS_MAX } = await import('../graphql/notegeek/validation.js');
const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { default: NoteVersion } = await import('../graphql/notegeek/models/NoteVersion.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');

const { Mutation } = resolvers;

const SPIDERS = `# Spiders

Notes on spiders I've seen around the house.

## Widow spiders

Venomous; shiny black.

- Black widow
- Red widow

## Jumping spiders

| Name | Region | Size |
|------|--------|------|
| Bold jumper | East US | 13 mm |
| Zebra jumper | Europe | 6 mm |

### Notes

Harmless.

## Code

\`\`\`bash
# not a heading
- not a list
grep spider notes.md
\`\`\`

## Sightings

1. Garage, May
2. Porch, June

## Chores

- [ ] Sweep the porch
  - [ ] corners
  - [x] steps
- [ ] Check the shed
`;

const plan = (ops, content = SPIDERS) => planOperations(content, ops);
const run = (ops, content = SPIDERS) => {
  const p = plan(ops, content);
  return { p, out: applyPlan(content, p) };
};

/** Everything an insert did not touch is still there, in order, byte for byte. */
const withoutInsert = (out, inserted) => {
  const at = out.indexOf(inserted);
  expect(at).toBeGreaterThanOrEqual(0);
  return out.slice(0, at) + out.slice(at + inserted.length);
};
const squashBlank = (s) => s.replace(/\n{3,}/g, '\n\n');

beforeEach(() => {
  _resetCounters();
  _resetNeedCache();
  callAI.mockReset();
  fakeService.lastProviderInfo = { provider: 'openrouter', model: 'test-model' };
});

describe('operation schema', () => {
  test('accepts each op type', () => {
    const ok = [
      { type: 'insert_after_heading', heading: 'A', markdown: 'x' },
      { type: 'insert_under_section_end', heading: 'A', markdown: 'x' },
      { type: 'append_to_list', anchor: 'a', items: ['b'] },
      { type: 'add_table_row', tableHeaderRow: '| a |', cells: ['b'] },
      { type: 'replace_text', find: 'a', replace: 'b', reason: 'r' },
      { type: 'new_section', afterHeading: null, heading: 'H', level: 2, markdown: '' },
    ];
    for (const op of ok) expect(operationSchema.safeParse(op).success).toBe(true);
  });

  test('rejects missing fields, empty inserts, unknown types and multi-line headings', () => {
    const bad = [
      { type: 'insert_after_heading', heading: 'A' },
      { type: 'insert_after_heading', heading: 'A', markdown: '   ' },
      { type: 'append_to_list', anchor: 'a', items: [] },
      { type: 'replace_text', replace: 'b' },
      { type: 'rewrite_note', markdown: 'everything' },
      { type: 'new_section', heading: 'two\nlines' },
      { heading: 'A', markdown: 'x' },
    ];
    for (const op of bad) expect(operationSchema.safeParse(op).success).toBe(false);
  });

  test('a malformed op is dropped and reported, not thrown', () => {
    const { accepted, dropped } = plan([{ type: 'rewrite_note', markdown: 'all new' }]);
    expect(accepted).toHaveLength(0);
    expect(dropped[0]).toMatchObject({ index: 0, reason: 'malformed' });
    expect(dropped[0].content).toBe('all new');
  });

  test('the gateway envelope limits match the module', () => {
    expect(FOLD_IN_INPUT_MAX).toBe(MAX_FOLD_INPUT_CHARS);
    expect(FOLD_IN_OPS_MAX).toBe(MAX_OPERATIONS);
  });
});

describe('each operation on a real note', () => {
  test('insert_after_heading lands right under the heading; nothing else changes', () => {
    const { p, out } = run([{ type: 'insert_after_heading', heading: 'Widow spiders', markdown: 'Widows hang upside down.' }]);
    expect(p.dropped).toEqual([]);
    expect(out).toContain('## Widow spiders\n\nWidows hang upside down.\n\nVenomous; shiny black.');
    expect(squashBlank(withoutInsert(out, 'Widows hang upside down.'))).toBe(SPIDERS);
  });

  test('insert_under_section_end lands at the end of the section own text, before its sub-heading', () => {
    const { out } = run([{ type: 'insert_under_section_end', heading: 'Jumping spiders', markdown: 'They see in colour.' }]);
    expect(out).toContain('| Zebra jumper | Europe | 6 mm |\n\nThey see in colour.\n\n### Notes');
    expect(squashBlank(withoutInsert(out, 'They see in colour.'))).toBe(SPIDERS);
  });

  test('append_to_list adds after the last sibling, in the list style', () => {
    const { p, out } = run([{ type: 'append_to_list', anchor: 'Black widow', items: ['Brown widow — urban, egg sacs spiky'] }]);
    expect(p.dropped).toEqual([]);
    expect(out).toContain('- Black widow\n- Red widow\n- Brown widow — urban, egg sacs spiky\n\n## Jumping spiders');
    expect(withoutInsert(out, '- Brown widow — urban, egg sacs spiky\n')).toBe(SPIDERS);
  });

  test('ordered lists continue their numbering', () => {
    const { out } = run([{ type: 'append_to_list', anchor: 'Garage, May', items: ['3. Shed, July'] }]);
    expect(out).toContain('1. Garage, May\n2. Porch, June\n3. Shed, July\n');
  });

  test('nested lists: a nested anchor appends at its depth; a top-level anchor appends after the children', () => {
    const nested = run([{ type: 'append_to_list', anchor: 'corners', items: ['under the bench'] }]).out;
    expect(nested).toContain('  - [x] steps\n  - [ ] under the bench\n- [ ] Check the shed');
    const top = run([{ type: 'append_to_list', anchor: 'Sweep the porch', items: ['Oil the gate'] }]).out;
    expect(top).toContain('- [ ] Check the shed\n- [ ] Oil the gate\n');
  });

  test('add_table_row appends after the last row, escapes pipes and pads short rows', () => {
    const { p, out } = run([
      { type: 'add_table_row', tableHeaderRow: '| Name | Region | Size |', cells: ['Peacock | spider', 'Australia'] },
    ]);
    expect(p.dropped).toEqual([]);
    expect(out).toContain('| Zebra jumper | Europe | 6 mm |\n| Peacock \\| spider | Australia |  |\n\n### Notes');
  });

  test('add_table_row with more cells than columns is dropped', () => {
    const { p } = run([{ type: 'add_table_row', tableHeaderRow: '| Name | Region | Size |', cells: ['a', 'b', 'c', 'd'] }]);
    expect(p.dropped[0].reason).toBe('too_many_cells');
  });

  test('replace_text replaces the one exact occurrence', () => {
    const { p, out } = run([{ type: 'replace_text', find: 'Venomous; shiny black.', replace: 'Venomous; shiny black, red hourglass.', reason: 'more precise' }]);
    expect(p.dropped).toEqual([]);
    expect(out).toBe(SPIDERS.replace('Venomous; shiny black.', 'Venomous; shiny black, red hourglass.'));
  });

  test('new_section after a heading goes after its whole section; null goes at the end', () => {
    const after = run([{ type: 'new_section', afterHeading: 'Widow spiders', heading: 'Recluse spiders', markdown: 'Brown recluse: violin mark.' }]).out;
    expect(after).toContain('- Red widow\n\n## Recluse spiders\n\nBrown recluse: violin mark.\n\n## Jumping spiders');
    const end = run([{ type: 'new_section', afterHeading: null, heading: 'Sources', markdown: 'Field guide p. 12' }]).out;
    expect(end.endsWith('- [ ] Check the shed\n\n## Sources\n\nField guide p. 12\n')).toBe(true);
  });

  test('new_section that duplicates an existing heading is dropped', () => {
    const { p } = run([{ type: 'new_section', afterHeading: null, heading: 'widow spiders', markdown: 'x' }]);
    expect(p.dropped[0].reason).toBe('duplicate_heading');
  });

  test('a note without a trailing newline keeps not having one', () => {
    const src = '## A\n\n- one';
    expect(run([{ type: 'append_to_list', anchor: 'one', items: ['two'] }], src).out).toBe('## A\n\n- one\n- two');
    expect(run([{ type: 'insert_under_section_end', heading: 'A', markdown: 'tail' }], src).out).toBe('## A\n\n- one\n\ntail');
  });

  test('several ops at once apply against the original positions', () => {
    const { p, out } = run([
      { type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'] },
      { type: 'add_table_row', tableHeaderRow: '| Name | Region | Size |', cells: ['Peacock', 'Australia', '4 mm'] },
      { type: 'replace_text', find: 'Harmless.', replace: 'Harmless to people.', reason: 'clarify' },
    ]);
    expect(p.accepted).toHaveLength(3);
    expect(out).toContain('- Red widow\n- Brown widow\n');
    expect(out).toContain('| Peacock | Australia | 4 mm |');
    expect(out).toContain('Harmless to people.');
  });
});

describe('anchors', () => {
  test('anchor not found → dropped with the reason, content kept for unplaced', () => {
    const { p } = run([{ type: 'insert_after_heading', heading: 'Wolf spiders', markdown: 'Fast hunters.' }]);
    expect(p.accepted).toHaveLength(0);
    expect(p.dropped[0]).toMatchObject({ reason: 'anchor_not_found', content: 'Fast hunters.' });
  });

  test('loose match: case, whitespace, markdown prefix and a trailing colon are forgiven', () => {
    const { p } = run([
      { type: 'insert_after_heading', heading: '##  widow SPIDERS:', markdown: 'x' },
      { type: 'append_to_list', anchor: '- black widow', items: ['y'] },
    ]);
    expect(p.dropped).toEqual([]);
  });

  test('an ambiguous anchor is dropped', () => {
    const src = '## Notes\n\na\n\n## Other\n\n### Notes\n\nb\n';
    const { p } = run([{ type: 'insert_after_heading', heading: 'notes', markdown: 'x' }], src);
    expect(p.dropped[0].reason).toBe('ambiguous_anchor');
    // Two EXACT matches are just as ambiguous — exactness never breaks a tie.
    const exact = run([{ type: 'insert_after_heading', heading: 'Notes', markdown: 'x' }], src);
    expect(exact.p.dropped[0].reason).toBe('ambiguous_anchor');
    const items = run([{ type: 'append_to_list', anchor: 'same', items: ['x'] }], '- same\n- other\n\ntext\n\n- same\n');
    expect(items.p.dropped[0].reason).toBe('ambiguous_anchor');
  });

  test('replace_text: ambiguous text is dropped, missing text is dropped, never loosely matched', () => {
    const src = 'cat\ncat\nDog\n';
    expect(run([{ type: 'replace_text', find: 'cat', replace: 'kitten' }], src).p.dropped[0].reason).toBe('ambiguous_text');
    expect(run([{ type: 'replace_text', find: 'dog', replace: 'puppy' }], src).p.dropped[0].reason).toBe('text_not_found');
  });
});

describe('code fences are never edited inside', () => {
  test('a heading or list item inside a fence is not an anchor', () => {
    const { p } = run([
      { type: 'insert_after_heading', heading: 'not a heading', markdown: 'x' },
      { type: 'append_to_list', anchor: 'not a list', items: ['y'] },
    ]);
    expect(p.dropped.map((d) => d.reason)).toEqual(['anchor_not_found', 'anchor_not_found']);
  });

  test('replace_text inside a fence is dropped', () => {
    const { p } = run([{ type: 'replace_text', find: 'grep spider notes.md', replace: 'rm -rf /' }]);
    expect(p.dropped[0].reason).toBe('inside_code_fence');
  });

  test('inserted markdown that opens a fence it never closes is dropped', () => {
    const { p } = run([{ type: 'insert_under_section_end', heading: 'Widow spiders', markdown: '```js\nconst a = 1;' }]);
    expect(p.dropped[0].reason).toBe('unbalanced_fence');
  });

  test('a balanced fence in inserted markdown is fine', () => {
    const { p } = run([{ type: 'insert_under_section_end', heading: 'Code', markdown: '```\nls\n```' }]);
    expect(p.dropped).toEqual([]);
  });

  test('nothing is inserted past an unclosed fence', () => {
    const src = '## A\n\ntext\n\n```\n## B\ncode';
    const { p } = run([{ type: 'new_section', afterHeading: null, heading: 'C', markdown: 'x' }], src);
    expect(p.dropped[0].reason).toBe('inside_code_fence');
  });
});

describe('overlap', () => {
  test('two replaces over the same text: the second is dropped', () => {
    const { p } = run([
      { type: 'replace_text', find: 'Venomous; shiny', replace: 'Venomous; glossy' },
      { type: 'replace_text', find: 'shiny black.', replace: 'jet black.' },
    ]);
    expect(p.accepted).toHaveLength(1);
    expect(p.dropped[0]).toMatchObject({ index: 1, reason: 'overlap' });
  });

  test('an insert that would land inside a replaced range is dropped', () => {
    const { p } = run([
      { type: 'replace_text', find: 'spiders\n\nVenomous', replace: 'spiders\n\nDangerous' },
      { type: 'insert_after_heading', heading: 'Widow spiders', markdown: 'x' },
    ]);
    expect(p.dropped[0]).toMatchObject({ index: 1, reason: 'overlap' });
  });

  test('every op is accounted for: accepted + dropped = proposed', () => {
    const ops = [
      { type: 'append_to_list', anchor: 'Red widow', items: ['a'] },
      { type: 'append_to_list', anchor: 'Nope', items: ['b'] },
      { type: 'bogus' },
      ...Array.from({ length: MAX_OPERATIONS }, () => ({ type: 'append_to_list', anchor: 'Red widow', items: ['c'] })),
    ];
    const { accepted, dropped } = plan(ops);
    expect(accepted.length + dropped.length).toBe(ops.length);
    expect(dropped.filter((d) => d.reason === 'too_many')).toHaveLength(3);
  });
});

describe('parseMarkdown', () => {
  test('finds headings, lists and tables outside fences only', () => {
    const doc = parseMarkdown(SPIDERS);
    expect(doc.headings.map((h) => h.text)).toEqual(['Spiders', 'Widow spiders', 'Jumping spiders', 'Notes', 'Code', 'Sightings', 'Chores']);
    expect(doc.tables).toHaveLength(1);
    expect(doc.lists.flatMap((l) => l.items.map((i) => i.text))).not.toContain('not a list');
  });
});

describe('foldInPreview (model mocked)', () => {
  const note = { _id: new mongoose.Types.ObjectId(), title: 'Spiders', content: SPIDERS, type: 'markdown', updatedAt: new Date('2026-09-30T10:00:00Z') };
  const aiReturning = (payload, info = { provider: 'openrouter', model: 'gpt-test' }) => ({
    callAI: jest.fn(async () => (typeof payload === 'string' ? payload : JSON.stringify(payload))),
    resolveNeedCandidates: jest.fn(async () => [{ provider: 'openrouter', modelId: 'gpt-test' }]),
    lastProviderInfo: info,
  });

  test('asks for the deep prose+structured need with a JSON schema, and returns validated ops', async () => {
    const ai = aiReturning({
      summary: 'Added the brown widow.',
      operations: [
        { type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'], why: 'list of widows' },
        { type: 'insert_after_heading', heading: 'Wolf spiders', markdown: 'Wolf spiders carry their young.', why: 'x' },
      ],
      unplaced: ['Found one in the mailbox'],
    });
    const out = await foldInPreview({ note, input: 'found a brown widow', userId: 'u1', ai });
    expect(FOLD_IN_NEED).toBe('prose+structured:deep');
    expect(ai.resolveNeedCandidates).toHaveBeenCalledWith(FOLD_IN_NEED);
    const [, opts] = ai.callAI.mock.calls[0];
    expect(opts.responseFormat?.type).toBe('json_schema');
    expect(opts.feature).toBe('fold_in');
    expect(out.operations).toHaveLength(1);
    expect(out.operations[0]).toMatchObject({ id: 'op1', type: 'append_to_list', location: 'List under "## Widow spiders"', text: '- Brown widow' });
    expect(out.stats).toMatchObject({ proposed: 2, valid: 1, failed: false, strategy: 'whole' });
    expect(out.stats.dropped).toEqual([expect.objectContaining({ index: 1, reason: 'anchor_not_found' })]);
    // The model's own unplaced AND the dropped op's content: nothing is lost.
    expect(out.unplaced).toEqual(['Found one in the mailbox', 'Wolf spiders carry their young.']);
    expect(out.baseUpdatedAt).toEqual(note.updatedAt);
  });

  test('a replace whose explanation came in `reason` shows it as `why`', async () => {
    const ai = aiReturning({ operations: [{ type: 'replace_text', find: 'Harmless.', replace: 'Harmless to people.', reason: 'the new info says so' }] });
    const out = await foldInPreview({ note, input: 'harmless to people', userId: 'u6', ai });
    expect(out.operations[0].why).toBe('the new info says so');
  });

  test('a failed model call is reported as failed, never as "nothing to add"', async () => {
    const ai = { callAI: jest.fn(async () => { throw new Error('502'); }), lastProviderInfo: {} };
    const out = await foldInPreview({ note, input: 'x', userId: 'u2', ai });
    expect(out.operations).toEqual([]);
    expect(out.stats.failed).toBe(true);
    expect(out.provenance.source).toBe('fallback');
  });

  test('an unparseable answer is a failure too', async () => {
    const out = await foldInPreview({ note, input: 'x', userId: 'u3', ai: aiReturning('Sure! Here are some ideas…') });
    expect(out.stats.failed).toBe(true);
    expect(out.provenance.reason).toBe('unparseable');
  });

  test('a truncated answer says so', async () => {
    const ai = aiReturning({ operations: [] }, { provider: 'openrouter', model: 'gpt-test', finishReason: 'length' });
    const out = await foldInPreview({ note, input: 'x', userId: 'u4', ai });
    expect(out.stats.truncated).toBe(true);
  });

  test('a long note sends the outline plus the relevant sections, not the whole note', async () => {
    const filler = (n) => `Paragraph ${n} about ordinary garden things. `.repeat(40);
    const sections = Array.from({ length: 20 }, (_, i) => `## Topic ${i}\n\n${filler(i)}\n`);
    sections.splice(7, 0, '## Widow spiders\n\nBlack widow and red widow live in the woodpile.\n\n- Black widow\n- Red widow\n');
    const long = `# Garden\n\n${sections.join('\n')}`;
    expect(long.length).toBeGreaterThan(WHOLE_NOTE_CHARS);
    const ctx = buildNoteContext({ content: long }, 'found a brown widow in the woodpile');
    expect(ctx.stats.strategy).toBe('outline');
    expect(ctx.stats.sectionsSent).toBeLessThan(ctx.stats.sectionsTotal);
    expect(ctx.text).toContain('<<<SECTION\n## Widow spiders');
    expect(ctx.text).toContain('## Topic 19'); // in the outline
    expect(ctx.text.length).toBeLessThan(long.length);

    const ai = aiReturning({ operations: [{ type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'] }] });
    const out = await foldInPreview({ note: { ...note, content: long }, input: 'found a brown widow in the woodpile', userId: 'u5', ai });
    expect(out.stats.strategy).toBe('outline');
    expect(out.operations).toHaveLength(1);
    expect(ai.callAI.mock.calls[0][0].length).toBeLessThan(long.length);
  });
});

describe('resolvers: preview writes nothing, apply snapshots and re-validates', () => {
  const ALICE = new mongoose.Types.ObjectId();
  const BOB = new mongoose.Types.ObjectId();
  const ctx = (id) => ({ user: { id: String(id) } });

  beforeAll(async () => {
    await Note.db.asPromise();
    if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
    await Note.init();
  }, 60000);
  afterEach(async () => {
    await Note.deleteMany({});
    await NoteVersion.deleteMany({});
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await Note.db.close();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

  const modelSays = (payload) => callAI.mockImplementation(async () => JSON.stringify(payload));
  const makeNote = (over = {}) => Note.create({ title: 'Spiders', content: SPIDERS, type: 'markdown', userId: ALICE, ...over });

  test('preview changes nothing and creates no version', async () => {
    const n = await makeNote();
    modelSays({ operations: [{ type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'] }] });
    const out = await Mutation.foldInPreview(null, { noteId: String(n._id), input: 'brown widow' }, ctx(ALICE));
    expect(out.operations).toHaveLength(1);
    const after = await Note.findById(n._id).lean();
    expect(after.content).toBe(SPIDERS);
    expect(after.updatedAt.getTime()).toBe(n.updatedAt.getTime());
    // Scoped to this note: other suites share the test database and run in
    // parallel, so a global count saw their versions (CI, 2026-10-01).
    expect(await NoteVersion.countDocuments({ noteId: n._id })).toBe(0);
  });

  test('apply snapshots the old note first, applies only what was sent, and returns the version for undo', async () => {
    const n = await makeNote();
    const ops = [{ type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'] }];
    const res = await Mutation.foldInApply(null, { noteId: String(n._id), baseUpdatedAt: n.updatedAt.toISOString(), operations: ops }, ctx(ALICE));
    expect(res.applied).toBe(1);
    expect(res.note.content).toContain('- Red widow\n- Brown widow\n');
    const v = await NoteVersion.findById(res.versionId).lean();
    expect(v).toMatchObject({ content: SPIDERS, reason: 'fold_in' });
    // Undo is the ordinary restore.
    const restored = await Mutation.restoreNoteVersion(null, { versionId: res.versionId }, ctx(ALICE));
    expect(restored.content).toBe(SPIDERS);
  });

  test('a stale base whose anchor broke is a CONFLICT and changes nothing', async () => {
    const n = await makeNote();
    const base = n.updatedAt.toISOString();
    await new Promise((r) => setTimeout(r, 5));
    await Note.updateOne({ _id: n._id }, { content: SPIDERS.replace('- Red widow\n', '') });
    const ops = [{ type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'] }];
    await expect(Mutation.foldInApply(null, { noteId: String(n._id), baseUpdatedAt: base, operations: ops }, ctx(ALICE)))
      .rejects.toMatchObject({ extensions: { code: 'CONFLICT' } });
    expect((await Note.findById(n._id).lean()).content).not.toContain('Brown widow');
    expect(await NoteVersion.countDocuments({ noteId: n._id })).toBe(0);
  });

  test('a stale base whose anchors still hold applies', async () => {
    const n = await makeNote();
    const base = n.updatedAt.toISOString();
    await new Promise((r) => setTimeout(r, 5));
    await Note.updateOne({ _id: n._id }, { content: `${SPIDERS}\nA new line at the end.\n` });
    const ops = [{ type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'] }];
    const res = await Mutation.foldInApply(null, { noteId: String(n._id), baseUpdatedAt: base, operations: ops }, ctx(ALICE));
    expect(res.note.content).toContain('- Brown widow');
    expect(res.note.content).toContain('A new line at the end.');
  });

  test('an op that does not match a fresh note is refused, all or nothing', async () => {
    const n = await makeNote();
    const ops = [
      { type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'] },
      { type: 'append_to_list', anchor: 'No such item', items: ['x'] },
    ];
    await expect(Mutation.foldInApply(null, { noteId: String(n._id), baseUpdatedAt: n.updatedAt.toISOString(), operations: ops }, ctx(ALICE)))
      .rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect((await Note.findById(n._id).lean()).content).toBe(SPIDERS);
  });

  test('a failed snapshot refuses the write', async () => {
    const n = await makeNote();
    jest.spyOn(NoteVersion, 'create').mockRejectedValueOnce(new Error('disk full'));
    const ops = [{ type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'] }];
    await expect(Mutation.foldInApply(null, { noteId: String(n._id), baseUpdatedAt: n.updatedAt.toISOString(), operations: ops }, ctx(ALICE)))
      .rejects.toThrow(/version/);
    expect((await Note.findById(n._id).lean()).content).toBe(SPIDERS);
  });

  test('an edit racing the write is a CONFLICT and leaves no orphan version', async () => {
    const n = await makeNote();
    jest.spyOn(Note, 'findOneAndUpdate').mockResolvedValueOnce(null);
    const ops = [{ type: 'append_to_list', anchor: 'Red widow', items: ['Brown widow'] }];
    await expect(Mutation.foldInApply(null, { noteId: String(n._id), baseUpdatedAt: n.updatedAt.toISOString(), operations: ops }, ctx(ALICE)))
      .rejects.toMatchObject({ extensions: { code: 'CONFLICT' } });
    expect(await NoteVersion.countDocuments({ noteId: n._id })).toBe(0);
  });

  test('owner-scoped, and only markdown notes', async () => {
    const n = await makeNote();
    await expect(Mutation.foldInPreview(null, { noteId: String(n._id), input: 'x' }, ctx(BOB))).rejects.toThrow('Note not found');
    await expect(Mutation.foldInApply(null, { noteId: String(n._id), baseUpdatedAt: n.updatedAt.toISOString(), operations: [{ type: 'append_to_list', anchor: 'Red widow', items: ['x'] }] }, ctx(BOB)))
      .rejects.toThrow('Note not found');
    const rich = await makeNote({ type: 'text', content: '<p>hi</p>' });
    await expect(Mutation.foldInPreview(null, { noteId: String(rich._id), input: 'x' }, ctx(ALICE))).rejects.toThrow(/rich-text/);
    const sketch = await makeNote({ type: 'handwritten', content: '{}' });
    await expect(Mutation.foldInPreview(null, { noteId: String(sketch._id), input: 'x' }, ctx(ALICE))).rejects.toThrow(/markdown and text notes/);
    expect(callAI).not.toHaveBeenCalled();
  });

  test('new info past the ceiling is refused before any model call', async () => {
    const n = await makeNote();
    await expect(Mutation.foldInPreview(null, { noteId: String(n._id), input: 'x'.repeat(MAX_FOLD_INPUT_CHARS + 1) }, ctx(ALICE)))
      .rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(callAI).not.toHaveBeenCalled();
  });
});
