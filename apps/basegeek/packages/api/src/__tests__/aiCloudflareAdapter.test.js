/**
 * The Cloudflare Workers AI adapter must talk chat, not prompt.
 *
 * 2026-09-07: StartGeek Ask timed out on every call because this adapter
 * flattened messages into one `prompt` string. Without a chat template the
 * model never emitted end-of-turn and generated until max_tokens (15 s+ for
 * `{"word":"pong"}`). Chat `messages` + Workers AI's own `response_format`
 * make the same call return in ~1 s.
 */
import { jest } from '@jest/globals';
import axios from 'axios';

process.env.KEY_VAULT_SECRET ||= 'test-only-not-a-real-secret-0123456789abcdef0123456789abcdef';
const { default: aiService } = await import('../services/aiService.js');

const SCHEMA = { name: 'Smoke', description: 's', schema: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] } };

let originalPost;
let originalProvider;
beforeAll(() => {
  originalPost = axios.post;
  originalProvider = aiService.providers.cloudflare;
  aiService.providers.cloudflare = { ...originalProvider, accountId: 'acct', apiKey: 'test-key-not-real', baseURL: 'https://cf.test/accounts' };
});
afterAll(() => {
  axios.post = originalPost;
  aiService.providers.cloudflare = originalProvider;
});

function captureCloudflare(result) {
  const calls = [];
  axios.post = jest.fn(async (url, body, opts) => {
    calls.push({ url, body, opts });
    return { data: { result } };
  });
  return calls;
}

describe('callCloudflare', () => {
  test('sends chat messages with roles, a temperature, and the bare JSON schema as response_format', async () => {
    const calls = captureCloudflare({ response: { word: 'pong' }, usage: { prompt_tokens: 3, completion_tokens: 2 } });
    const out = await aiService.callCloudflare('ping', {
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      messages: [{ role: 'system', content: 'Reply with JSON.' }, { role: 'user', content: 'ping' }],
      maxTokens: 60,
      temperature: 0,
      responseFormat: { type: 'json_schema', json_schema: SCHEMA },
    });
    expect(calls).toHaveLength(1);
    const { url, body } = calls[0];
    expect(url).toBe('https://cf.test/accounts/acct/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    expect(body.prompt).toBeUndefined();
    expect(body.messages).toEqual([{ role: 'system', content: 'Reply with JSON.' }, { role: 'user', content: 'ping' }]);
    expect(body.max_tokens).toBe(60);
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: SCHEMA.schema });
    expect(body.stop).toBeUndefined();
    // JSON mode hands back an object; callers get text.
    expect(out.content).toBe('{"word":"pong"}');
    expect(out.outputTokens).toBe(2);
  });

  test('a bare prompt becomes one user message and no response_format is sent', async () => {
    const calls = captureCloudflare({ response: 'hello' });
    const out = await aiService.callCloudflare('hi there', { model: 'm' });
    expect(calls[0].body.messages).toEqual([{ role: 'user', content: 'hi there' }]);
    expect(calls[0].body.response_format).toBeUndefined();
    expect(out.content).toBe('hello');
  });
});
