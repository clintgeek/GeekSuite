/**
 * diagramSketch — a page of handwriting as a Mermaid flowchart
 * (apps/notegeek/DOCS/HANDWRITING.md, "Turn into a diagram").
 *
 * What must not quietly change:
 *   - validation (the page image, and previous + problem together) runs BEFORE
 *     any model is asked or the counter moves;
 *   - the call asks for `vision+code:balanced`, its own feature, temperature 0;
 *   - the prompt's rules: flowchart only, labels as written and quoted, [?],
 *     -->|text|, no styling / click / %%{init} / HTML, "[no diagram]";
 *   - a bad answer gets ONE automatic retry with the problem named; a second
 *     bad answer is an error; a client repair request is one call;
 *   - "[no diagram]" is AI_NOT_A_DIAGRAM; today's spending limit is AI_BUDGET;
 *   - nothing is written: not the note, not its transcript, not its history.
 *
 * aiService is mocked; no model is called.
 */
import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';

const callAI = jest.fn();
const aiServiceMock = { callAI, lastProviderInfo: { provider: 'openrouter', model: 'openai/gpt-4.1-mini' } };
jest.unstable_mockModule('../services/aiService.js', () => ({ default: aiServiceMock }));

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { default: NoteVersion } = await import('../graphql/notegeek/models/NoteVersion.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');
const { _resetCounters, _resetNeedCache, callsToday } = await import('../services/aiFeatureRunner.js');
const {
  diagramSketch, diagramPromptFor, DIAGRAM_NEED, DIAGRAM_PROMPT, DIAGRAM_DAILY_CAP, NO_DIAGRAM,
} = await import('../graphql/notegeek/diagram.js');
const { checkMermaid, mermaidLabels, MERMAID_MAX_CHARS, MERMAID_MAX_NODES } = await import('../graphql/notegeek/mermaidCheck.js');
const { diagramSketchArgsSchema, validateInput } = await import('../graphql/notegeek/validation.js');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDA==';
const GOOD = 'flowchart TD\n  n1["Idea"] --> n2{"Good?"}\n  n2 -->|yes| n3("Build it")';
const BAD = 'flowchart TD\n  n1["Idea --> n2';
const { Mutation } = resolvers;
const validate = validateInput(diagramSketchArgsSchema);

const fakeAI = (impl, extra = {}) => ({
  callAI: jest.fn(impl),
  lastProviderInfo: { provider: 'openrouter', model: 'openai/gpt-4.1-mini' },
  ...extra,
});

async function rejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the promise to reject');
}

function expectBadInput(fn, pattern) {
  let caught;
  try { fn(); } catch (err) { caught = err; }
  expect(caught).toBeInstanceOf(GraphQLError);
  expect(caught.extensions.code).toBe('BAD_USER_INPUT');
  if (pattern) expect(caught.extensions.details.map((d) => d.message).join(' | ')).toMatch(pattern);
}

beforeAll(async () => {
  await Note.db.asPromise();
}, 60000);

beforeEach(() => {
  _resetCounters();
  _resetNeedCache();
  callAI.mockReset();
});

afterEach(async () => {
  await Note.deleteMany({});
  await NoteVersion.deleteMany({});
});

describe('validation', () => {
  test('the same page image rules as transcribeSketch', () => {
    expect(validate({ image: PNG, mediaType: 'image/png' })).toMatchObject({ image: PNG, mediaType: 'image/png', source: 'sketch' });
    expect(validate({ image: JPEG, mediaType: 'image/jpeg', source: 'photo' }).source).toBe('photo');
    expectBadInput(() => validate({ image: PNG, mediaType: 'image/webp' }), /image\/png or image\/jpeg/);
    expectBadInput(() => validate({ image: `data:image/png;base64,${PNG}`, mediaType: 'image/png' }), /data: prefix/);
    expectBadInput(() => validate({ image: JPEG, mediaType: 'image/png' }), /not a PNG/);
    expectBadInput(() => validate({ image: PNG, mediaType: 'image/png', source: 'scan' }), /source/);
    expectBadInput(() => validate({ image: PNG, mediaType: 'image/png', noteId: 'x' }));
  });

  test('previous and problem come together or not at all', () => {
    expect(validate({ image: PNG, mediaType: 'image/png', previous: BAD, problem: 'Parse error on line 2' }).previous).toBe(BAD);
    expectBadInput(() => validate({ image: PNG, mediaType: 'image/png', previous: BAD }), /both previous and problem/);
    expectBadInput(() => validate({ image: PNG, mediaType: 'image/png', problem: 'x' }), /both previous and problem/);
    expectBadInput(() => validate({ image: PNG, mediaType: 'image/png', previous: 'x'.repeat(20001), problem: 'p' }), /too long/);
  });

  test('the resolver validates before anything is asked or counted', async () => {
    const err = await rejection(Mutation.diagramSketch(null, { image: PNG, mediaType: 'image/gif' }, { user: { id: 'u-val' } }));
    expect(err.extensions.code).toBe('BAD_USER_INPUT');
    expect(callAI).not.toHaveBeenCalled();
    expect(callsToday({ app: 'notegeek', feature: 'diagram', userId: 'u-val' })).toBe(0);
  });

  test('the resolver needs a signed-in user', async () => {
    const err = await rejection(Mutation.diagramSketch(null, { image: PNG, mediaType: 'image/png' }, {}));
    expect(err.message).toBe('Unauthorized');
    expect(callAI).not.toHaveBeenCalled();
  });
});

describe('routing', () => {
  test('asks for vision+code:balanced on its own feature, at temperature 0, with the image as a content part', async () => {
    const resolveNeedCandidates = jest.fn(async () => [{ provider: 'openrouter', modelId: 'openai/gpt-4.1-mini' }]);
    const ai = fakeAI(async () => GOOD, { resolveNeedCandidates });
    const result = await diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u1', ai });

    expect(DIAGRAM_NEED).toBe('vision+code:balanced');
    expect(resolveNeedCandidates).toHaveBeenCalledWith('vision+code:balanced');
    const [, opts] = ai.callAI.mock.calls[0];
    expect(opts.appName).toBe('notegeek');
    expect(opts.feature).toBe('diagram');
    expect(opts.temperature).toBe(0);
    expect(opts.messages[0]).toEqual({ role: 'system', content: DIAGRAM_PROMPT });
    expect(opts.messages.find((m) => m.role === 'user').content).toContainEqual({ type: 'image', mediaType: 'image/png', data: PNG });
    expect(result).toEqual({ mermaid: GOOD, provenance: expect.objectContaining({ source: 'model' }), repaired: false });
  });

  test('an outer code fence is removed', async () => {
    const ai = fakeAI(async () => `\`\`\`mermaid\n${GOOD}\n\`\`\``);
    expect((await diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u1', ai })).mermaid).toBe(GOOD);
  });

  test('a photo and a form page get their own line after the rules', () => {
    expect(diagramPromptFor('sketch')).toBe(DIAGRAM_PROMPT);
    expect(diagramPromptFor('photo')).toContain(DIAGRAM_PROMPT);
    expect(diagramPromptFor('photo')).toMatch(/Ignore ruled lines/);
    expect(diagramPromptFor('form')).toMatch(/printed form/);
  });

  test('the counter is a runaway bound', async () => {
    expect(DIAGRAM_DAILY_CAP).toBeGreaterThanOrEqual(100);
    const ai = fakeAI(async () => GOOD);
    for (let i = 0; i < 2; i += 1) await diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u-cap', ai, dailyCap: 2 });
    const err = await rejection(diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u-cap', ai, dailyCap: 2 }));
    expect(err.extensions.code).toBe('AI_CAP');
    expect(ai.callAI).toHaveBeenCalledTimes(2);
  });
});

describe('the prompt', () => {
  test('flowchart only, TD or LR', () => {
    expect(DIAGRAM_PROMPT).toMatch(/FLOWCHART ONLY/);
    expect(DIAGRAM_PROMPT).toMatch(/"flowchart TD"/);
    expect(DIAGRAM_PROMPT).toMatch(/"flowchart LR"/);
  });

  test('labels exactly as written, quoted, never invented; [?] for what it cannot read', () => {
    expect(DIAGRAM_PROMPT).toMatch(/label in double quotes, exactly as written on the page/);
    expect(DIAGRAM_PROMPT).toMatch(/Never invent, summarise, translate, correct or tidy a label/);
    expect(DIAGRAM_PROMPT).toMatch(/Write \[\?\] for each word you cannot read/);
  });

  test('arrow labels as -->|text|', () => {
    expect(DIAGRAM_PROMPT).toContain('n1 -->|text| n2');
  });

  test('no styling, no click, no %%{init}, no HTML, nothing else; "[no diagram]"', () => {
    expect(DIAGRAM_PROMPT).toMatch(/No styling \(style, classDef, class, linkStyle\)/);
    expect(DIAGRAM_PROMPT).toMatch(/no click or links/);
    expect(DIAGRAM_PROMPT).toMatch(/no %%\{init\}%%/);
    expect(DIAGRAM_PROMPT).toMatch(/no HTML/);
    expect(DIAGRAM_PROMPT).toMatch(/nothing before or after the diagram/);
    expect(DIAGRAM_PROMPT).toContain(`"${NO_DIAGRAM}"`);
  });
});

describe('the automatic retry', () => {
  test('a bad first answer is retried once, with the problem and the answer named', async () => {
    const answers = [BAD, GOOD];
    const ai = fakeAI(async () => answers.shift());
    const result = await diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u-r', ai });
    expect(result).toMatchObject({ mermaid: GOOD, repaired: true });
    expect(ai.callAI).toHaveBeenCalledTimes(2);
    const retry = ai.callAI.mock.calls[1][1].messages;
    expect(retry.find((m) => m.role === 'assistant').content).toBe(BAD);
    expect(retry.at(-1).content).toMatch(/That diagram has a problem: .*bracket|quote/);
    expect(retry.find((m) => m.role === 'user').content).toContainEqual({ type: 'image', mediaType: 'image/png', data: PNG });
  });

  test('a second bad answer is a plain error, and there is no third call', async () => {
    const ai = fakeAI(async () => 'sequenceDiagram\nA->>B: hi');
    const err = await rejection(diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u-r2', ai }));
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err.extensions.code).toBe('AI_BAD_DIAGRAM');
    expect(err.extensions.details[0].message).toMatch(/could not be used/);
    expect(ai.callAI).toHaveBeenCalledTimes(2);
  });

  test("the client's repair request is exactly one call, marked repaired", async () => {
    const ai = fakeAI(async () => GOOD);
    const result = await diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u-fix', ai, previous: BAD, problem: 'Parse error on line 2' });
    expect(result).toMatchObject({ mermaid: GOOD, repaired: true });
    expect(ai.callAI).toHaveBeenCalledTimes(1);
    const msgs = ai.callAI.mock.calls[0][1].messages;
    expect(msgs.find((m) => m.role === 'assistant').content).toBe(BAD);
    expect(msgs.at(-1).content).toMatch(/Parse error on line 2/);
  });

  test('a repair that is still bad is an error, not a second retry', async () => {
    const ai = fakeAI(async () => BAD);
    const err = await rejection(diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u-fix2', ai, previous: BAD, problem: 'x' }));
    expect(err.extensions.code).toBe('AI_BAD_DIAGRAM');
    expect(ai.callAI).toHaveBeenCalledTimes(1);
  });
});

describe('failures are errors', () => {
  test('"[no diagram]" is AI_NOT_A_DIAGRAM, with no retry', async () => {
    const ai = fakeAI(async () => '[no diagram]');
    const err = await rejection(diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u-nd', ai }));
    expect(err.extensions.code).toBe('AI_NOT_A_DIAGRAM');
    expect(err.extensions.details[0].message).toMatch(/doesn't look like a diagram/);
    expect(ai.callAI).toHaveBeenCalledTimes(1);
  });

  test("today's spending limit is AI_BUDGET; an outage is AI_UNAVAILABLE", async () => {
    const down = async () => { throw new Error('No free-tier model is available'); };
    const paid = { paidFirstFor: async () => ({ provider: 'openrouter', model: 'openai/gpt-4.1-mini' }) };
    const spent = fakeAI(down, { ...paid, paidGovernorVerdict: async () => ({ ok: false, reason: 'paid_budget_per_day' }) });
    const err = await rejection(diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u-b', ai: spent }));
    expect(err.extensions.code).toBe('AI_BUDGET');
    expect(err.extensions.details[0].message).toMatch(/spending limit is used up/);

    const out = fakeAI(down, { ...paid, paidGovernorVerdict: async () => ({ ok: true }) });
    const err2 = await rejection(diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u-o', ai: out }));
    expect(err2.extensions.code).toBe('AI_UNAVAILABLE');
  });

  test('an empty answer is AI_EMPTY', async () => {
    const ai = fakeAI(async () => '```\n\n```');
    const err = await rejection(diagramSketch({ image: PNG, mediaType: 'image/png', userId: 'u-e', ai }));
    expect(err.extensions.code).toBe('AI_EMPTY');
  });
});

describe('nothing is written', () => {
  test('the note, its transcript and its history are untouched', async () => {
    const userId = new mongoose.Types.ObjectId();
    const note = await Note.create({
      userId, type: 'handwritten', title: 'Flow', content: '{"store":{},"schema":{}}',
      sketchTranscript: { status: 'searchable', text: 'old words', source: 'auto' },
    });
    const before = await Note.findById(note._id).lean();
    const versionsBefore = await NoteVersion.countDocuments({});
    callAI.mockResolvedValue(GOOD);

    const result = await Mutation.diagramSketch(null, { image: PNG, mediaType: 'image/png' }, { user: { id: String(userId) } });

    expect(result.mermaid).toBe(GOOD);
    expect(callAI).toHaveBeenCalledTimes(1);
    expect(await Note.findById(note._id).lean()).toEqual(before);
    expect(await Note.countDocuments({})).toBe(1);
    expect(await NoteVersion.countDocuments({})).toBe(versionsBefore);
  });
});

describe('checkMermaid', () => {
  const ok = (s) => expect(checkMermaid(s)).toEqual({ ok: true });
  const refused = (s, re) => {
    const v = checkMermaid(s);
    expect(v.ok).toBe(false);
    if (re) expect(v.problem).toMatch(re);
  };

  test('accepts flowcharts in every direction, graph too, and two-headed arrows', () => {
    ok(GOOD);
    for (const dir of ['TD', 'TB', 'BT', 'LR', 'RL']) ok(`flowchart ${dir}\n  a --> b`);
    ok('graph LR\n  a["A"] <--> b["B"]\n  a --- b');
    ok('flowchart TD\n  a["click here to see href"] --> b'); // words in a label are words
    ok('flowchart TD\n  a["x < y"] --> b');
  });

  test('refuses a missing header, directives, click, href, javascript: and HTML', () => {
    refused('sequenceDiagram\n  A->>B: hi', /first line/);
    refused('A --> B', /first line/);
    refused('%%{init: {"theme":"dark"}}%%\nflowchart TD\n  a --> b', /directive/);
    refused('flowchart TD\n  a --> b\n  click a callback', /click/);
    refused('flowchart TD\n  a --> b\n  a href x', /href/);
    refused('flowchart TD\n  a["javascript:alert(1)"] --> b', /javascript/);
    refused('flowchart TD\n  a["<img src=x>"] --> b', /HTML/);
  });

  test('refuses unbalanced brackets and quotes', () => {
    refused('flowchart TD\n  a["x] --> b', /quote/);
    refused('flowchart TD\n  a["x" --> b', /bracket/);
    refused('flowchart TD\n  a("x"] --> b', /brackets do not match/);
    refused('flowchart TD\n  a -->|yes b', /\|/);
  });

  test('refuses an empty diagram, an over-long one, and too many nodes', () => {
    refused('flowchart TD', /no nodes/);
    refused(`flowchart TD\n${'  a --> b\n'.repeat(Math.ceil(MERMAID_MAX_CHARS / 10))}`, /longer/);
    const many = Array.from({ length: MERMAID_MAX_NODES + 1 }, (_, i) => `  n${i} --> n${i + 1}`).join('\n');
    refused(`flowchart TD\n${many}`, /more than/);
  });
});

describe('a ```mermaid fence in search text and the list preview (noteDerived.js)', () => {
  const body = [
    'From handwritten note: [Flow](/notes/abc)',
    '',
    '```mermaid',
    GOOD,
    '```',
    '',
    'Then the rest.',
  ].join('\n');

  test('contributes its labels as plain words, not syntax', async () => {
    const { wordTextFor, previewFor, markdownToText } = await import('../graphql/notegeek/noteDerived.js');
    const words = wordTextFor({ type: 'markdown', content: body });
    expect(words).toContain('Idea · Good? · yes · Build it');
    expect(words).not.toMatch(/flowchart|-->|n1|\["/);
    expect(words).toContain('Then the rest.');
    expect(previewFor({ type: 'markdown', title: 'Diagram: Flow', content: body }))
      .toBe('From handwritten note: Flow Idea · Good? · yes · Build it Then the rest.');
    // Other fences are untouched; a longer fence and tildes are fences too.
    expect(markdownToText('```js\nconst a = 1;\n```')).toBe('const a = 1;');
    expect(markdownToText(`~~~~mermaid\n${GOOD}\n~~~~`)).toBe('Idea · Good? · yes · Build it');
    expect(markdownToText(`\`\`\`\`mermaid\n${GOOD}\n\`\`\`\nstill inside\n\`\`\`\`\nafter`)).toBe('Idea · Good? · yes · Build it\nafter');
  });
});

describe('mermaidLabels', () => {
  test('node and arrow labels in order, once each, without syntax or ids', () => {
    expect(mermaidLabels(GOOD)).toEqual(['Idea', 'Good?', 'yes', 'Build it']);
    expect(mermaidLabels('flowchart LR\n  a(("Start")) -- calls --> b[Service]\n  b -->|"ok"| c{{"Done [?]"}}'))
      .toEqual(['Start', 'calls', 'Service', 'ok', 'Done [?]']);
    expect(mermaidLabels('flowchart TD\n  subgraph s1 ["Backend"]\n    a1["API"]\n  end')).toEqual(['Backend', 'API']);
    expect(mermaidLabels('flowchart TD\n  a --> b')).toEqual([]);
  });
});
