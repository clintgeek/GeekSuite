import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { GraphQLError } from 'graphql';
import { validateInput, tidyMarkdownArgsSchema } from '../graphql/notegeek/validation.js';
import { tidyMarkdown, TIDY_SYSTEM_PROMPT, MAX_TIDY_CHARS } from '../graphql/notegeek/tidy.js';
import { _resetCounters } from '../services/aiFeatureRunner.js';

function fakeAI(impl, info = { provider: 'groq', model: 'llama-3.3' }) {
  return { callAI: jest.fn(impl), lastProviderInfo: info };
}

beforeEach(() => _resetCounters());

describe('tidyMarkdownArgsSchema validation', () => {
  const validate = validateInput(tidyMarkdownArgsSchema);

  test('accepts valid markdown content', () => {
    const input = { content: '# Raw Notes\n- messy point 1\n- point 2' };
    const result = validate(input);
    expect(result.content).toBe(input.content);
  });

  test('rejects content exceeding 100,000 characters', () => {
    const longContent = 'a'.repeat(100_001);
    expect(() => validate({ content: longContent })).toThrow(GraphQLError);
  });

  test('rejects unknown arguments (strict schema)', () => {
    expect(() => validate({ content: 'valid', unknownField: true })).toThrow(GraphQLError);
  });
});

describe('tidyMarkdown handler', () => {
  test('returns empty content immediately without calling AI', async () => {
    const ai = fakeAI(async () => 'some response');
    const result = await tidyMarkdown({ content: '   ', userId: 'user-123', ai });
    expect(result.formatted).toBe('   ');
    expect(result.provenance.source).toBe('fallback');
    expect(result.provenance.reason).toBe('empty_content');
    expect(ai.callAI).not.toHaveBeenCalled();
  });

  test('calls ai.callAI with correct prompt and returns formatted result with model provenance', async () => {
    const rawContent = 'fix the nginx timeout: proxy_read_timeout 60s -> 300s in /etc/nginx/conf.d';
    const cleanedOutput = '## Nginx Configuration\n\n- Update `proxy_read_timeout` from `60s` to `300s` in `/etc/nginx/conf.d`.';

    const ai = fakeAI(async () => cleanedOutput, { provider: 'gemini', model: 'gemini-1.5-flash' });
    const result = await tidyMarkdown({ content: rawContent, userId: 'user-123', ai });

    expect(ai.callAI).toHaveBeenCalledTimes(1);
    const callArgs = ai.callAI.mock.calls[0];
    expect(callArgs[0]).toBe(rawContent);
    expect(callArgs[1]).toMatchObject({
      appName: 'notegeek',
      feature: 'tidy_markdown',
      messages: [
        { role: 'system', content: TIDY_SYSTEM_PROMPT },
        { role: 'user', content: rawContent },
      ],
    });

    expect(result.formatted).toBe(cleanedOutput);
    expect(result.provenance.source).toBe('model');
    expect(result.provenance.model).toBe('gemini-1.5-flash');
    expect(result.provenance.provider).toBe('gemini');
  });

  test('strips accidental outer ```markdown fences if the model wraps output in them', async () => {
    const wrappedOutput = '```markdown\n# Tidied Title\n\nContent here\n```';
    const expectedOutput = '# Tidied Title\n\nContent here';

    const ai = fakeAI(async () => wrappedOutput, { provider: 'groq', model: 'llama-3.3' });
    const result = await tidyMarkdown({ content: 'raw', userId: 'user-123', ai });
    expect(result.formatted).toBe(expectedOutput);
  });

  test('falls back to raw content on AI failure', async () => {
    const ai = fakeAI(async () => { throw new Error('Model rate limited'); });
    const rawContent = 'my raw thoughts here';
    const result = await tidyMarkdown({ content: rawContent, userId: 'user-123', ai });
    expect(result.formatted).toBe(rawContent);
    expect(result.provenance.source).toBe('fallback');
    expect(result.provenance.reason).toBe('unavailable');
  });
});

/**
 * The destruction, pinned.
 *
 * Reported 2026-09-21 as "absolutely DOES NOT work — destructive and
 * non-sensical". Three compounding faults:
 *
 *   1. TIDY_MAX_TOKENS capped the OUTPUT at ~12k characters, and a tidy's
 *      output is about as long as its input. A 19k-character note came back
 *      cut off around 63% of the way through and that stump replaced the
 *      whole note. `finish_reason` never reaches this module, so a
 *      guillotined response was indistinguishable from a complete one.
 *   2. The prompt asked the model to "tighten phrasing" and "reorganize
 *      language" — a rewriter, not a formatter, with no concept of a note
 *      that is already fine.
 *   3. The "already clean" guard was exact string equality against an LLM
 *      response, so it never fired.
 */
describe('tidyMarkdown refuses rather than truncates', () => {
  test('a note too long to round-trip is returned UNCHANGED', async () => {
    const longNote = 'x'.repeat(MAX_TIDY_CHARS + 1);
    const ai = fakeAI(async () => 'a short truncated stump');

    const result = await tidyMarkdown({ content: longNote, userId: 'u1', ai });

    expect(result.formatted).toBe(longNote);
    expect(result.provenance.reason).toBe('content_too_long');
    // And it does not spend a call to discover that.
    expect(ai.callAI).not.toHaveBeenCalled();
  });

  test('a note just under the limit is still attempted', async () => {
    const note = 'x'.repeat(MAX_TIDY_CHARS - 1);
    const ai = fakeAI(async () => 'y'.repeat(MAX_TIDY_CHARS - 1));

    const result = await tidyMarkdown({ content: note, userId: 'u1', ai });

    expect(ai.callAI).toHaveBeenCalledTimes(1);
    expect(result.provenance.reason).not.toBe('content_too_long');
  });

  test('a result that lost material content is DISCARDED', async () => {
    // The backstop: a response truncated anyway, or a model that summarised.
    const note = 'a'.repeat(2000);
    const stump = 'a'.repeat(500);
    const ai = fakeAI(async () => stump);

    const result = await tidyMarkdown({ content: note, userId: 'u1', ai });

    expect(result.formatted).toBe(note);
    expect(result.provenance.reason).toBe('result_too_short');
  });

  test('a slightly shorter result is accepted — formatting can tighten whitespace', () => {
    // The guard is a truncation detector, not a style check.
    const note = 'a'.repeat(1000);
    const tightened = 'a'.repeat(900);
    const ai = fakeAI(async () => tightened);

    return tidyMarkdown({ content: note, userId: 'u1', ai }).then((result) => {
      expect(result.formatted).toBe(tightened);
      expect(result.provenance.reason).not.toBe('result_too_short');
    });
  });

  test('a longer result is fine — structure costs characters', async () => {
    const note = 'heading\nsome text';
    const formatted = '## Heading\n\nSome text\n';
    const ai = fakeAI(async () => formatted);

    const result = await tidyMarkdown({ content: note, userId: 'u1', ai });
    // Compared trimmed: the runner strips trailing whitespace, which is
    // pre-existing and unrelated to the length guard under test.
    expect(result.formatted.trim()).toBe(formatted.trim());
    expect(result.provenance.reason).not.toBe('result_too_short');
  });
});

describe('the prompt is a formatter, not an editor', () => {
  test('forbids rephrasing, summarising and dropping content', () => {
    // The old prompt invited exactly this: "tighten phrasing", "reorganize
    // language for clarity".
    expect(TIDY_SYSTEM_PROMPT).toMatch(/do not rephrase/i);
    expect(TIDY_SYSTEM_PROMPT).toMatch(/summaris|summariz/i);
    expect(TIDY_SYSTEM_PROMPT).not.toMatch(/tighten phrasing/i);
  });

  test('tells the model that returning the note unchanged is a valid answer', () => {
    // Without this there is no way for a tidy to be a no-op, so an
    // already-clean note gets restructured for the sake of it.
    expect(TIDY_SYSTEM_PROMPT).toMatch(/unchanged/i);
  });

  test('tells the model to prefer the original over a partial answer', () => {
    expect(TIDY_SYSTEM_PROMPT).toMatch(/rather than a partial/i);
  });
});
