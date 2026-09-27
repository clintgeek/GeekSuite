/**
 * transcribeSketch — reading a page of handwriting (apps/notegeek/DOCS/HANDWRITING.md §2).
 *
 * What must not quietly change:
 *   - validation runs BEFORE any model is asked or the cap counts;
 *   - the daily cap is 40 per user;
 *   - the call asks for `vision+prose:balanced`, never a model id;
 *   - the prompt forbids inventing, summarising and tidying (Compose's job);
 *   - a failure is an error with a readable message, never an empty text.
 *
 * No real provider is called: `ai` is a fake with the aiService shape the
 * gateway's other AI tests use.
 */
import { jest } from '@jest/globals';
import { GraphQLError } from 'graphql';
import { _resetCounters, _resetNeedCache, callsToday } from '../services/aiFeatureRunner.js';
import {
  transcribeSketch,
  TRANSCRIBE_NEED,
  TRANSCRIBE_DAILY_CAP,
  TRANSCRIBE_PROMPT,
  TRANSCRIBE_PHOTO_PROMPT,
} from '../graphql/notegeek/transcribe.js';
import {
  transcribeSketchArgsSchema,
  validateInput,
  TRANSCRIBE_MAX_BASE64_CHARS,
} from '../graphql/notegeek/validation.js';
import { resolvers } from '../graphql/notegeek/resolvers.js';

// A real 1x1 PNG and the start of a real JPEG, as base64.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDA==';

const fakeAI = (impl, extra = {}) => ({
  callAI: jest.fn(impl),
  lastProviderInfo: { provider: 'openrouter', model: 'openai/gpt-4.1-mini' },
  ...extra,
});

const validate = validateInput(transcribeSketchArgsSchema);

function expectBadInput(fn, messagePattern) {
  let caught;
  try { fn(); } catch (err) { caught = err; }
  expect(caught).toBeInstanceOf(GraphQLError);
  expect(caught.extensions.code).toBe('BAD_USER_INPUT');
  const messages = caught.extensions.details.map((d) => d.message).join(' | ');
  if (messagePattern) expect(messages).toMatch(messagePattern);
  return caught;
}

async function rejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the promise to reject');
}

beforeEach(() => { _resetCounters(); _resetNeedCache(); });

describe('transcribeSketch input validation', () => {
  test('accepts a PNG and a JPEG', () => {
    expect(validate({ image: PNG, mediaType: 'image/png' })).toEqual({ image: PNG, mediaType: 'image/png', source: 'sketch' });
    expect(validate({ image: JPEG, mediaType: 'image/jpeg' }).mediaType).toBe('image/jpeg');
  });

  test('rejects any other media type', () => {
    expectBadInput(() => validate({ image: PNG, mediaType: 'image/webp' }), /image\/png or image\/jpeg/);
    expectBadInput(() => validate({ image: PNG, mediaType: 'application/pdf' }), /mediaType/);
  });

  test('rejects an image over about 8 MB of base64', () => {
    const huge = PNG + 'A'.repeat(TRANSCRIBE_MAX_BASE64_CHARS);
    expectBadInput(() => validate({ image: huge, mediaType: 'image/png' }), /too large/);
    expect(TRANSCRIBE_MAX_BASE64_CHARS).toBe(8 * 1024 * 1024);
  });

  test('rejects a data: URI, non-base64 and an empty image', () => {
    expectBadInput(() => validate({ image: `data:image/png;base64,${PNG}`, mediaType: 'image/png' }), /data: prefix/);
    expectBadInput(() => validate({ image: 'not base64 at all!', mediaType: 'image/png' }), /base64/);
    expectBadInput(() => validate({ image: '', mediaType: 'image/png' }), /empty/);
  });

  test('rejects bytes that do not match the declared type', () => {
    expectBadInput(() => validate({ image: JPEG, mediaType: 'image/png' }), /not a PNG/);
    expectBadInput(() => validate({ image: PNG, mediaType: 'image/jpeg' }), /not a JPEG/);
  });

  test('the resolver validates before anything reaches the AI runner or the cap', async () => {
    const context = { user: { id: 'u-val' } };
    const err = await rejection(resolvers.Mutation.transcribeSketch(null, { image: PNG, mediaType: 'image/gif' }, context));
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err.extensions.code).toBe('BAD_USER_INPUT');
    // Nothing was counted, so nothing was asked.
    expect(callsToday({ app: 'notegeek', feature: 'transcribe', userId: 'u-val' })).toBe(0);
  });

  test('the resolver needs a signed-in user', async () => {
    const err = await rejection(resolvers.Mutation.transcribeSketch(null, { image: PNG, mediaType: 'image/png' }, {}));
    expect(err.message).toBe('Unauthorized');
  });
});

describe('transcribeSketch routing', () => {
  test('asks for vision+prose:balanced, and sends the image as a content part', async () => {
    const resolveNeedCandidates = jest.fn(async () => [{ provider: 'openrouter', modelId: 'openai/gpt-4.1-mini' }]);
    const ai = fakeAI(async () => 'milk\neggs', { resolveNeedCandidates });

    const result = await transcribeSketch({ image: PNG, mediaType: 'image/png', userId: 'u1', ai });

    expect(TRANSCRIBE_NEED).toBe('vision+prose:balanced');
    expect(resolveNeedCandidates).toHaveBeenCalledWith('vision+prose:balanced');
    const [, opts] = ai.callAI.mock.calls[0];
    expect(opts.appName).toBe('notegeek');
    expect(opts.feature).toBe('transcribe');
    const userTurn = opts.messages.find((m) => m.role === 'user');
    expect(userTurn.content).toContainEqual({ type: 'image', mediaType: 'image/png', data: PNG });
    expect(result.text).toBe('milk\neggs');
    expect(result.provenance.source).toBe('model');
  });

  test('the cap is 40 a day per user, and the 41st call never reaches a model', async () => {
    const ai = fakeAI(async () => 'a line');
    for (let i = 0; i < 40; i += 1) {
      await transcribeSketch({ image: PNG, mediaType: 'image/png', userId: 'u-cap', ai });
    }
    expect(TRANSCRIBE_DAILY_CAP).toBe(40);
    const err = await rejection(transcribeSketch({ image: PNG, mediaType: 'image/png', userId: 'u-cap', ai }));
    expect(err.extensions.code).toBe('AI_CAP');
    expect(err.extensions.details[0].message).toMatch(/40/);
    expect(ai.callAI).toHaveBeenCalledTimes(40);

    // Someone else's cap is their own.
    await transcribeSketch({ image: PNG, mediaType: 'image/png', userId: 'u-other', ai });
    expect(ai.callAI).toHaveBeenCalledTimes(41);
  });
});

describe('transcribeSketch prompt', () => {
  test('is the system turn', async () => {
    const ai = fakeAI(async () => 'text');
    await transcribeSketch({ image: PNG, mediaType: 'image/png', userId: 'u1', ai });
    const [, opts] = ai.callAI.mock.calls[0];
    expect(opts.messages[0]).toEqual({ role: 'system', content: TRANSCRIBE_PROMPT });
  });

  test('forbids inventing, summarising and tidying', () => {
    expect(TRANSCRIBE_PROMPT).toMatch(/NEVER INVENT, SUMMARISE OR TIDY/);
    expect(TRANSCRIBE_PROMPT).toMatch(/Do not add words, fix grammar, correct spelling, reorder/);
  });

  test('keeps layout, marks unreadable words, describes drawings briefly, plain text only', () => {
    expect(TRANSCRIBE_PROMPT).toMatch(/Keep line breaks/i);
    expect(TRANSCRIBE_PROMPT).toMatch(/list structure/);
    expect(TRANSCRIBE_PROMPT).toMatch(/"\[\?\]"/);
    expect(TRANSCRIBE_PROMPT).toMatch(/\[drawing: \.\.\.\]/);
    expect(TRANSCRIBE_PROMPT).toMatch(/"\[ \]".*"\[x\]"/);
    expect(TRANSCRIBE_PROMPT).toMatch(/PLAIN TEXT ONLY/);
  });
});

describe('transcribeSketch failures are errors, never an empty transcript', () => {
  test('a provider failure', async () => {
    const ai = fakeAI(async () => { throw new Error('502 from upstream'); });
    const err = await rejection(transcribeSketch({ image: PNG, mediaType: 'image/png', userId: 'u1', ai }));
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err.extensions.code).toBe('AI_UNAVAILABLE');
    expect(err.extensions.details[0].message).toMatch(/unavailable/i);
  });

  test('an empty answer', async () => {
    const ai = fakeAI(async () => '   ');
    const err = await rejection(transcribeSketch({ image: PNG, mediaType: 'image/png', userId: 'u1', ai }));
    expect(err.extensions.code).toBe('AI_EMPTY');
    expect(err.extensions.details[0].message).toMatch(/nothing/i);
  });

  test('an answer that is only an empty code fence', async () => {
    // The runner already refuses whitespace; a bare fence gets past it and
    // is empty once unwrapped.
    const ai = fakeAI(async () => '```\n\n```');
    const err = await rejection(transcribeSketch({ image: PNG, mediaType: 'image/png', userId: 'u1', ai }));
    expect(err.extensions.code).toBe('AI_EMPTY');
  });

  test('a looping answer', async () => {
    const loop = Array.from({ length: 12 }, () => 'the same long line over and over').join('\n');
    const ai = fakeAI(async () => loop);
    const err = await rejection(transcribeSketch({ image: PNG, mediaType: 'image/png', userId: 'u1', ai }));
    expect(err.extensions.code).toBe('AI_DEGENERATE');
  });

  test('an outer code fence is removed, the text inside kept verbatim', async () => {
    const ai = fakeAI(async () => '```\n- [ ] call roofer\n-> quote by Fri\n```');
    const { text } = await transcribeSketch({ image: PNG, mediaType: 'image/png', userId: 'u1', ai });
    expect(text).toBe('- [ ] call roofer\n-> quote by Fri');
  });
});

// ── HANDWRITING.md §3: a photographed notebook page ─────────────────────────

describe('transcribeSketch source', () => {
  test('is optional and means a sketch when absent or null', () => {
    expect(validate({ image: PNG, mediaType: 'image/png' }).source).toBe('sketch');
    expect(validate({ image: PNG, mediaType: 'image/png', source: null }).source).toBe('sketch');
    expect(validate({ image: JPEG, mediaType: 'image/jpeg', source: 'photo' }).source).toBe('photo');
    expect(validate({ image: PNG, mediaType: 'image/png', source: 'sketch' }).source).toBe('sketch');
  });

  test('anything else is refused, by name', () => {
    expectBadInput(() => validate({ image: JPEG, mediaType: 'image/jpeg', source: 'scan' }), /source must be sketch or photo/);
    expectBadInput(() => validate({ image: JPEG, mediaType: 'image/jpeg', source: 'PHOTO' }), /source/);
    expectBadInput(() => validate({ image: JPEG, mediaType: 'image/jpeg', source: '' }), /source/);
  });

  test('a bad source is refused before the AI runner or the cap', async () => {
    const context = { user: { id: 'u-src' } };
    const err = await rejection(
      resolvers.Mutation.transcribeSketch(null, { image: JPEG, mediaType: 'image/jpeg', source: 'scan' }, context)
    );
    expect(err.extensions.code).toBe('BAD_USER_INPUT');
    expect(callsToday({ app: 'notegeek', feature: 'transcribe', userId: 'u-src' })).toBe(0);
  });

  test('a photo is read with the photo prompt; a sketch (or no source) with the sketch prompt', async () => {
    const ai = fakeAI(async () => 'text');
    await transcribeSketch({ image: JPEG, mediaType: 'image/jpeg', source: 'photo', userId: 'u1', ai });
    await transcribeSketch({ image: PNG, mediaType: 'image/png', source: 'sketch', userId: 'u1', ai });
    await transcribeSketch({ image: PNG, mediaType: 'image/png', userId: 'u1', ai });
    const systems = ai.callAI.mock.calls.map(([, opts]) => opts.messages[0]);
    expect(systems[0]).toEqual({ role: 'system', content: TRANSCRIBE_PHOTO_PROMPT });
    expect(systems[1]).toEqual({ role: 'system', content: TRANSCRIBE_PROMPT });
    expect(systems[2]).toEqual({ role: 'system', content: TRANSCRIBE_PROMPT });
  });

  test('a photo counts against the same cap of 40, and asks the same need', async () => {
    const resolveNeedCandidates = jest.fn(async () => [{ provider: 'openrouter', modelId: 'openai/gpt-4.1-mini' }]);
    const ai = fakeAI(async () => 'a line', { resolveNeedCandidates });
    for (let i = 0; i < 20; i += 1) {
      await transcribeSketch({ image: JPEG, mediaType: 'image/jpeg', source: 'photo', userId: 'u-mix', ai });
      await transcribeSketch({ image: PNG, mediaType: 'image/png', source: 'sketch', userId: 'u-mix', ai });
    }
    expect(resolveNeedCandidates).toHaveBeenCalledWith('vision+prose:balanced');
    const err = await rejection(transcribeSketch({ image: JPEG, mediaType: 'image/jpeg', source: 'photo', userId: 'u-mix', ai }));
    expect(err.extensions.code).toBe('AI_CAP');
    expect(ai.callAI).toHaveBeenCalledTimes(40);
  });
});

describe('the photo prompt', () => {
  test('keeps every rule of the sketch prompt, word for word', () => {
    const sketchRules = TRANSCRIBE_PROMPT.slice(TRANSCRIBE_PROMPT.indexOf('Rules:\n'));
    expect(sketchRules.length).toBeGreaterThan(500);
    expect(TRANSCRIBE_PHOTO_PROMPT).toContain(sketchRules);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/NEVER INVENT, SUMMARISE OR TIDY/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/"\[no writing\]"/);
  });

  test('says it is a photographed paper notebook page', () => {
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/photograph of a page from a paper notebook/);
    expect(TRANSCRIBE_PROMPT).not.toMatch(/photograph/);
  });

  test('transcribes handwritten ink only', () => {
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/HANDWRITTEN INK ONLY/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/only what the writer wrote by hand/);
  });

  test('ignores ruled lines, margins, edges, holes, shadows and the background', () => {
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/Ignore ruled lines/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/margin lines/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/page edges/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/punched holes/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/shadows/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/the desk and anything else in the background/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/a ruled line is never an underline/);
  });

  test('ignores anything printed on the notebook: headers, dates, logos', () => {
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/IGNORE PRINTED TEXT/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/printed on the notebook itself/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/page headers, printed dates/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/brand names and logos/);
  });

  test('copes with slight skew', () => {
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/COPE WITH SKEW/);
    expect(TRANSCRIBE_PHOTO_PROMPT).toMatch(/slight angle/);
  });

  test('the sketch prompt has none of the photo rules', () => {
    expect(TRANSCRIBE_PROMPT).not.toMatch(/ruled lines|IGNORE PRINTED TEXT|COPE WITH SKEW/);
  });
});
