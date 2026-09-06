/**
 * notegeekContentCeilings.test.js
 *
 * Where the note-body ceiling is checked, and in what ORDER — BURN_REVIEW_2
 * #4 and #6, which are the same bug seen from two ends:
 *
 *   #4 `validation.js` cannot know the stored type, so an `updateNote` that
 *      omits `type` gets the 5 000 000 snapshot ceiling. The resolver then
 *      read the stored type, found `text`, and handed 5 MB to jsdom +
 *      DOMPurify — **measured at 16 365 ms** of fully synchronous, gateway-wide
 *      event-loop block, for all eight apps.
 *
 *   #6 Sanitizing can make a body LONGER: `hardenRel` adds `rel`/`target` to
 *      every anchor and DOMPurify escapes bare `&`. A 100 000-character body
 *      of small anchors was stored at 187 486 characters — past the ceiling it
 *      had just passed — and every later save of that note was rejected.
 *      The note became permanently unsaveable.
 *
 * The fixed order is: resolve the effective type, apply THAT type's ceiling to
 * the input, sanitize (only `text` is touched), then apply the ceiling again
 * to the sanitizer's output. This file pins each step, including the negative:
 * a 5 MB `handwritten` snapshot is still a legitimate note and must go through
 * untouched.
 *
 * `sanitizeNoteArgs` is wrapped in a spy — the real implementation, just
 * counted — because "was the sanitizer reached at all?" is the assertion #4
 * turns on, and it is invisible from the result.
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';

const actualSanitize = await import('../graphql/notegeek/sanitize.js');
const sanitizeSpy = jest.fn((...args) => actualSanitize.sanitizeNoteArgs(...args));

jest.unstable_mockModule('../graphql/notegeek/sanitize.js', () => ({
  ...actualSanitize,
  sanitizeNoteArgs: sanitizeSpy,
}));

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');

const { Mutation } = resolvers;
const USER = new mongoose.Types.ObjectId();
const ctx = { user: { id: String(USER) } };

const DOC_MAX = 100_000;
const SNAPSHOT_MAX = 5_000_000;

/** An anchor with no `rel`/`target` — the shape the sanitizer grows. */
const GROWING_UNIT = '<p>see <a href="https://example.com/runbook">a</a></p>';
/** 99 954 characters in, 177 696 out. */
const GROWING_BODY = GROWING_UNIT.repeat(Math.floor(DOC_MAX / GROWING_UNIT.length));

/** Assert a rejected promise carries the shared gateway validation shape. */
async function expectBadInput(promise) {
  let caught;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(GraphQLError);
  expect(caught.extensions.code).toBe('BAD_USER_INPUT');
  expect(Array.isArray(caught.extensions.details)).toBe(true);
  return caught;
}

beforeAll(async () => {
  await Note.db.asPromise();
}, 60000);

beforeEach(() => {
  sanitizeSpy.mockClear();
});

afterEach(async () => {
  await Note.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
});

describe('the ceiling is re-checked on what is actually stored (#6)', () => {
  test('the premise: this body passes the ceiling and the sanitizer grows it past it', () => {
    expect(GROWING_BODY.length).toBeLessThanOrEqual(DOC_MAX);
    const grown = actualSanitize.sanitizeNoteContent(GROWING_BODY, 'text');
    expect(grown.length).toBeGreaterThan(DOC_MAX);
  });

  test('updateNote rejects a body whose sanitized form exceeds the limit, and names it', async () => {
    const note = await Mutation.createNote(null, { content: '<p>start</p>', type: 'text' }, ctx);

    const err = await expectBadInput(
      Mutation.updateNote(null, { id: String(note._id), content: GROWING_BODY, type: 'text' }, ctx)
    );
    expect(err.extensions.details[0].path).toBe('content');
    expect(err.extensions.details[0].message).toContain(String(DOC_MAX));

    // …and the row is untouched, so the note is still editable.
    expect((await Note.findById(note._id)).content).toBe('<p>start</p>');
  });

  test('createNote will not store a note it could never save again', async () => {
    const err = await expectBadInput(
      Mutation.createNote(null, { content: GROWING_BODY, type: 'text' }, ctx)
    );
    expect(err.extensions.details[0].message).toContain(String(DOC_MAX));
    expect(await Note.countDocuments({})).toBe(0);
  });

  test('a body that survives sanitization unchanged is still stored', async () => {
    const note = await Mutation.createNote(
      null,
      { content: '<p>ordinary</p>'.repeat(100), type: 'text' },
      ctx
    );
    expect(note.content).toBe('<p>ordinary</p>'.repeat(100));
  });
});

describe('the type is resolved before the ceiling is applied (#4)', () => {
  test('a 5 MB typeless update on a text row is rejected BEFORE the sanitizer is reached', async () => {
    const note = await Mutation.createNote(null, { content: '<p>start</p>', type: 'text' }, ctx);
    sanitizeSpy.mockClear();

    const huge = 'x'.repeat(SNAPSHOT_MAX);
    // The schema accepts this — it cannot know the row is `text`.
    const err = await expectBadInput(
      Mutation.updateNote(null, { id: String(note._id), content: huge }, ctx)
    );
    expect(err.extensions.details[0].message).toContain(String(DOC_MAX));

    // The assertion this test exists for: jsdom + DOMPurify never saw 5 MB.
    expect(sanitizeSpy).not.toHaveBeenCalled();
    expect((await Note.findById(note._id)).content).toBe('<p>start</p>');
  }, 60000);

  test('a 5 MB handwritten snapshot still passes, untouched, with or without the type argument', async () => {
    const snapshot = `{"records":"${'s'.repeat(SNAPSHOT_MAX - 16)}"}`;
    expect(snapshot.length).toBeLessThanOrEqual(SNAPSHOT_MAX);

    const note = await Mutation.createNote(null, { content: snapshot, type: 'handwritten' }, ctx);
    expect(note.content).toBe(snapshot);

    // The same body again, this time with no `type` at all: the stored type is
    // read, the snapshot ceiling applies, and nothing is sanitized.
    const updated = await Mutation.updateNote(null, { id: String(note._id), content: snapshot }, ctx);
    expect(updated.content).toBe(snapshot);
    expect(updated.content).toHaveLength(snapshot.length);
    expect(sanitizeSpy).toHaveBeenCalled();
    expect(sanitizeSpy.mock.calls.at(-1)[1]).toBe('handwritten');
  }, 120000);

  test('a 5 MB body with an explicit text type never gets past the schema', async () => {
    const note = await Mutation.createNote(null, { content: '<p>start</p>', type: 'text' }, ctx);
    sanitizeSpy.mockClear();
    await expectBadInput(
      Mutation.updateNote(null, { id: String(note._id), content: 'x'.repeat(SNAPSHOT_MAX), type: 'text' }, ctx)
    );
    expect(sanitizeSpy).not.toHaveBeenCalled();
  }, 60000);
});

describe('the cost of the largest body the gateway will accept', () => {
  /**
   * The ceiling is only a protection if the work it bounds is bounded. A
   * realistic 100 000-character rich-text note — 260 paragraphs, links and
   * bold — is the largest `text` body that can now reach the sanitizer.
   * Measured on the dev box at 95–224 ms warm; the 500 ms bar is the guard,
   * not the target. (The pre-fix path was 5 MB at 16 365 ms.)
   */
  test('sanitizing a 100 000-character text note stays well under half a second', () => {
    const para =
      '<p>Deploy notes: ' +
      'the quick brown fox jumps over the lazy dog. '.repeat(5) +
      'See <a target="_blank" rel="noopener noreferrer" href="https://example.com/runbook">the runbook</a>' +
      ' and <strong>hold the line</strong>.</p>';
    const body = para.repeat(Math.floor(DOC_MAX / para.length));
    expect(body.length).toBeGreaterThan(DOC_MAX - para.length);

    // Warm the lazily-built jsdom window first — it costs ~50 ms once per
    // process and is not part of what this measures.
    actualSanitize.sanitizeNoteContent('<p>warm</p>', 'text');

    const started = Date.now();
    const out = actualSanitize.sanitizeNoteContent(body, 'text');
    const elapsed = Date.now() - started;

    expect(out).toBe(body);
    expect(elapsed).toBeLessThan(500);
  });
});
