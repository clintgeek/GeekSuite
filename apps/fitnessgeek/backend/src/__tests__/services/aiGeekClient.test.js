/**
 * aiGeekClient — the request FitnessGeek builds against aiGeek's feature door,
 * and the four ways that call can fail without anyone seeing a stack trace.
 *
 * Contract under test: `POST /api/ai/feature` from
 * apps/basegeek/DOCS/AIGEEK_FRONT_DOOR.md §4.
 *
 *   request  { feature, messages?, system?, user?, schema?, timeoutMs?,
 *              conversationId?, maxTokens?, temperature?, maxCallsPerDay?,
 *              provider?, model? }
 *   response 200 { ok: true,  data, provenance }
 *            200 { ok: false, reason, provenance }
 *            4xx/5xx { success: false, error: { message, type, code } }
 *
 * The HTTP layer is a stub axios instance assigned to `client.http`, so
 * nothing in this file reaches a network — which is the point: the door is
 * being built concurrently, and this suite pins the *shape* we send it.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

import aiGeekClient, { MAX_TIMEOUT_MS, UNAVAILABLE_MESSAGE } from '../../services/aiGeekClient.js';

const okEnvelope = (data = 'the answer') => ({
  data: {
    ok: true,
    data,
    provenance: {
      source: 'model',
      reason: null,
      model: 'some-model',
      provider: 'some-provider',
      cached: false,
      callsToday: 3,
      cap: 50,
      costUsd: 0,
      hints: []
    }
  }
});

/** An axios error as axios itself shapes one. */
const httpError = (status, code) => {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = { status, data: { success: false, error: { message: 'nope', type: 'server_error', code } } };
  return error;
};

let post;

beforeEach(() => {
  post = jest.fn().mockResolvedValue(okEnvelope());
  aiGeekClient.apiKey = 'bg_test_key';
  aiGeekClient.http = { post, get: jest.fn() };
});

describe('the request it builds', () => {
  test('sends feature, system, user and the sampling knobs, and nothing else', async () => {
    await aiGeekClient.feature('coaching', {
      system: 'you are a coach',
      user: 'here is my data',
      maxTokens: 1200,
      temperature: 0.7
    }, { timeoutMs: 45000 });

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, config] = post.mock.calls[0];

    expect(url).toBe('/api/ai/feature');
    expect(body).toEqual({
      feature: 'coaching',
      timeoutMs: 45000,
      system: 'you are a coach',
      user: 'here is my data',
      maxTokens: 1200,
      temperature: 0.7
    });
    // The credential is the app's service key, on the same header the old
    // /api/ai/call used. Nothing in the body says which app is calling.
    expect(config.headers.Authorization).toBe('Bearer bg_test_key');
    expect(body.appName).toBeUndefined();
    expect(body.userId).toBeUndefined();
    expect(body.config).toBeUndefined();
  });

  test('quotaKey rides as an opaque string — the per-user cap bucket', async () => {
    // A service key carries no session, so aiGeek's `userId` is null and every
    // call from this backend would share one app-wide counter. `quotaKey`
    // picks the bucket; it is never auth.
    await aiGeekClient.feature('coaching', { user: 'x', quotaKey: 12345 });
    expect(post.mock.calls[0][1].quotaKey).toBe('12345');

    post.mockClear();
    await aiGeekClient.feature('coaching', { user: 'x' });
    expect('quotaKey' in post.mock.calls[0][1]).toBe(false);
  });

  test('forwards messages, schema, conversationId and maxCallsPerDay when given', async () => {
    const schema = { name: 'proposal', schema: { type: 'object' } };
    await aiGeekClient.feature('chat', {
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      schema,
      conversationId: 42,
      maxCallsPerDay: 25
    });

    const [, body] = post.mock.calls[0];
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.schema).toBe(schema);
    expect(body.conversationId).toBe('42');
    expect(body.maxCallsPerDay).toBe(25);
  });

  test('a provider+model pair is forwarded as a pin; half a pair is not', async () => {
    await aiGeekClient.feature('gm', { user: 'x', provider: 'groq', model: 'llama-3.3-70b' });
    expect(post.mock.calls[0][1]).toMatchObject({ provider: 'groq', model: 'llama-3.3-70b' });

    post.mockClear();
    await aiGeekClient.feature('gm', { user: 'x', provider: 'groq' });
    const [, body] = post.mock.calls[0];
    expect(body.provider).toBeUndefined();
    expect(body.model).toBeUndefined();
  });

  test('clamps timeoutMs to the door ceiling and keeps a little socket headroom', async () => {
    await aiGeekClient.feature('brief', { user: 'x' }, { timeoutMs: 999999 });
    const [, body, config] = post.mock.calls[0];
    expect(body.timeoutMs).toBe(MAX_TIMEOUT_MS);
    // The socket must never be the shorter of the two, or aiGeek's own
    // `{ ok: false, reason: 'timeout' }` never makes it back to us.
    expect(config.timeout).toBeGreaterThanOrEqual(body.timeoutMs);
    expect(config.timeout).toBeLessThanOrEqual(MAX_TIMEOUT_MS);

    post.mockClear();
    await aiGeekClient.feature('brief', { user: 'x' }, { timeoutMs: 5 });
    expect(post.mock.calls[0][1].timeoutMs).toBe(1000);
  });
});

describe('the answer it returns', () => {
  test('ok: true hands back data and provenance', async () => {
    post.mockResolvedValue(okEnvelope('a paragraph'));
    const result = await aiGeekClient.feature('brief', { user: 'x' });

    expect(result.ok).toBe(true);
    expect(result.data).toBe('a paragraph');
    expect(result.provenance.provider).toBe('some-provider');
    expect(result.reason).toBeNull();
  });

  test('ok: false is a value with a reason and the friendly sentence', async () => {
    post.mockResolvedValue({
      data: {
        ok: false,
        reason: 'cap',
        provenance: { source: 'none', reason: 'cap', callsToday: 50, cap: 50, hints: [] }
      }
    });

    const result = await aiGeekClient.feature('coaching', { user: 'x' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('cap');
    expect(result.message).toBe(UNAVAILABLE_MESSAGE);
    expect(result.provenance.cap).toBe(50);
  });

  test('an envelope error is a soft failure, not a throw', async () => {
    post.mockRejectedValue(httpError(503, 'upstream_unavailable'));

    const result = await aiGeekClient.feature('coaching', { user: 'x' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unavailable');
    expect(result.message).toBe(UNAVAILABLE_MESSAGE);
    expect(result.provenance.source).toBe('none');
  });

  test('a 504 and an aborted socket both read as a timeout', async () => {
    post.mockRejectedValue(httpError(504, 'upstream_timeout'));
    expect((await aiGeekClient.feature('chat', { user: 'x' })).reason).toBe('timeout');

    const aborted = new Error('timeout of 45000ms exceeded');
    aborted.code = 'ECONNABORTED';
    post.mockRejectedValue(aborted);
    expect((await aiGeekClient.feature('chat', { user: 'x' })).reason).toBe('timeout');
  });

  test('a 401 on the service key is still a soft failure to the caller', async () => {
    // A revoked or mis-minted key is an operations problem, and the user's
    // coach card should say "not right now", not 500.
    post.mockRejectedValue(httpError(401, 'invalid_api_key'));
    const result = await aiGeekClient.feature('coaching', { user: 'x' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unavailable');
  });

  test('no API key configured means no call at all, and no throw', async () => {
    aiGeekClient.apiKey = '';
    const result = await aiGeekClient.feature('brief', { user: 'x' });

    expect(post).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unavailable');
    expect(result.message).toBe(UNAVAILABLE_MESSAGE);
  });

  test('a missing feature name is a programming error and does throw', async () => {
    await expect(aiGeekClient.feature()).rejects.toThrow(TypeError);
  });
});

describe('modelsAlive', () => {
  test('returns the rows, and an empty list rather than an error', async () => {
    const rows = [{ provider: 'groq', modelId: 'llama-3.3-70b', fitness: 0.9, paid: false, lastSuccessAt: 'now' }];
    aiGeekClient.http = { post, get: jest.fn().mockResolvedValue({ data: rows }) };
    expect(await aiGeekClient.modelsAlive()).toEqual(rows);

    aiGeekClient.http = { post, get: jest.fn().mockRejectedValue(httpError(403, 'forbidden')) };
    expect(await aiGeekClient.modelsAlive()).toEqual([]);
  });
});

describe('getStatus', () => {
  test('reports configuration and routing, and never a model id', async () => {
    const status = aiGeekClient.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.routing).toContain('auto');
    expect(status.model).toBeUndefined();
  });
});
