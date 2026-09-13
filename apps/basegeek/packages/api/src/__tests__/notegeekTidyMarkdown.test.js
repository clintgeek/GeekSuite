import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { GraphQLError } from 'graphql';
import { validateInput, tidyMarkdownArgsSchema } from '../graphql/notegeek/validation.js';
import { tidyMarkdown, TIDY_SYSTEM_PROMPT } from '../graphql/notegeek/tidy.js';
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
