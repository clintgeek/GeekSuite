/**
 * What StoryGeek does when a model cannot serve — re-pointed to the aiGeek
 * feature door (Phase 2, apps/basegeek/DOCS/AIGEEK_FRONT_DOOR.md §4).
 *
 * This file used to pin the 2026-09-05 fix to `resolveGMModel()`:
 * `STORYGEEK_FREE_ONLY` defaulted on, so every turn asked aiGeek's director
 * (`GET /api/ai/director/models`) whether the pinned model was free. That call
 * needs the `ai:director` permission, and when a key was minted without it —
 * or basegeek blinked — the rejection propagated out of `generateStoryResponse`
 * as "Failed to generate story response". One missing permission on one key
 * was a total outage with no fallback path.
 *
 * Phase 2 removes the question rather than answering it better. StoryGeek no
 * longer knows or asks which models are free: it sends `feature: 'gm'` with
 * the story's `conversationId` and aiGeek walks its own health-ranked free
 * rows behind the door. The concern this file exists for — *a turn must never
 * fail silently or generically* — is unchanged, so the cases moved with it:
 *
 *   - the door is asked for the documented request shape, with no provider or
 *     model unless the player pinned one;
 *   - `ok: false` and envelope errors become an `AIUnavailableError` carrying
 *     aiGeek's own words and reason, never a swallowed generic;
 *   - a pin aiGeek could not honour is a **notice**, not a failed turn — which
 *     is the direct replacement for the old "dead pin errors forever";
 *   - the aux and summary paths shrug rather than end a turn.
 *
 * The HTTP layer is stubbed. Nothing here reaches a network.
 */

import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';

import aiService, { AIUnavailableError, PIN_UNAVAILABLE_NOTICE } from '../services/aiService.js';

const realPost = axios.post;
const realGet = axios.get;
const realServiceKey = aiService.serviceKey;

/** Calls captured by the axios stub: `[url, body, config]` per entry. */
let calls = [];

const stubPost = (responder) => {
  axios.post = async (url, body, config) => {
    calls.push([url, body, config]);
    return responder(url, body, config);
  };
};

const okResponse = (data, provenance = {}) => ({
  data: {
    ok: true,
    data,
    provenance: {
      source: 'model',
      reason: null,
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      cached: false,
      callsToday: 4,
      cap: null,
      costUsd: 0,
      hints: [],
      ...provenance
    }
  }
});

const declinedResponse = (reason) => ({
  data: {
    ok: false,
    reason,
    provenance: { source: 'none', reason, provider: null, model: null, hints: [] }
  }
});

/** An aiGeek failure envelope, as `aiFailureEnvelope.js` renders it. */
const envelopeError = (status, code, message) => {
  const error = new Error(`Request failed with status code ${status}`);
  error.response = {
    status,
    data: { success: false, error: { message, type: 'server_error', code } }
  };
  return error;
};

const story = { _id: 'story-abc', title: 'Test Tale', genre: 'Fantasy', worldState: {}, events: [] };

beforeEach(() => {
  calls = [];
  aiService.serviceKey = 'bg_test_key';
});

afterEach(() => {
  axios.post = realPost;
  axios.get = realGet;
  aiService.serviceKey = realServiceKey;
});

describe('the request StoryGeek sends the feature door', () => {
  test('a GM turn is feature gm, the story id as conversation, 45s, and no pin', async () => {
    stubPost(() => okResponse('The gate creaks open.'));

    await aiService.generateStoryResponse(story, 'I open the gate', null, 'tok', {});

    const [url, body, config] = calls[0];
    assert.equal(url.endsWith('/api/ai/feature'), true, 'must not use /api/ai/call');
    assert.equal(body.feature, 'gm');
    assert.equal(body.conversationId, 'story-abc');
    assert.equal(body.timeoutMs, 45000);
    assert.deepEqual(body.messages, [{ role: 'user', content: aiService.buildContext(story, 'I open the gate') }]);
    assert.equal(body.temperature, 0.9);
    assert.equal(body.maxTokens, 2400);
    // Automatic: no pin at all. StoryGeek names no provider and no model.
    assert.equal('provider' in body, false);
    assert.equal('model' in body, false);
    // The service key, not the player's token, when the app has one.
    assert.equal(config.headers.Authorization, 'Bearer bg_test_key');
    // Nothing in the body claims an app or a user; the credential says both.
    assert.equal('appName' in body, false);
    assert.equal('config' in body, false);
  });

  test("quotaKey is the story's owner — the per-user cap bucket", async () => {
    // StoryGeek authenticates with a service key, so without this every turn
    // of every player shares one app-wide counter. `userId` is what
    // models/Story.js calls the owner. Opaque bucket selector, never auth.
    stubPost(() => okResponse('narration'));

    await aiService.generateStoryResponse(
      { ...story, userId: 'player-42' }, 'go north', null, 'tok', {}
    );
    assert.equal(calls[0][1].quotaKey, 'player-42');

    // No story yet (the setup questions) means the app-wide bucket, which is
    // the honest answer for a call made on nobody's behalf yet.
    calls = [];
    await aiService.generateStoryResponse({ title: 'Test', genre: 'Fantasy' }, 'x', null, 'tok', {});
    assert.equal('quotaKey' in calls[0][1], false);
  });

  test("a player's pick rides as provider + model", async () => {
    stubPost(() => okResponse('narration'));

    await aiService.generateStoryResponse(story, 'go north', null, 'tok', {
      provider: 'gemini',
      model: 'gemini-flash-latest'
    });

    const [, body] = calls[0];
    assert.equal(body.provider, 'gemini');
    assert.equal(body.model, 'gemini-flash-latest');
  });

  test('half a pin is not a pin', async () => {
    stubPost(() => okResponse('narration'));
    await aiService.generateStoryResponse(story, 'go north', null, 'tok', { provider: 'gemini' });
    const [, body] = calls[0];
    assert.equal('provider' in body, false);
    assert.equal('model' in body, false);
  });

  test('aux work is feature aux, low temperature, and never pinned', async () => {
    stubPost(() => okResponse('{}'));

    await aiService.callAuxAI('extract this', { maxTokens: 1500, temperature: 0.1, conversationId: 'story-abc' }, 'tok');

    const [, body] = calls[0];
    assert.equal(body.feature, 'aux');
    assert.equal(body.temperature, 0.1);
    assert.equal(body.conversationId, 'story-abc');
    assert.equal('provider' in body, false);
  });

  test('the player JWT is forwarded when the app has no service key', async () => {
    aiService.serviceKey = '';
    stubPost(() => okResponse('narration'));
    await aiService.callAuxAI('x', {}, 'player-jwt');
    assert.equal(calls[0][2].headers.Authorization, 'Bearer player-jwt');
  });

  test('no credential at all is a soft failure, not a throw', async () => {
    aiService.serviceKey = '';
    aiService.jwtToken = '';
    stubPost(() => okResponse('never'));

    const result = await aiService.callAuxAI('x', {}, null);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unavailable');
    assert.equal(calls.length, 0, 'must not attempt a call with no credential');
  });
});

describe('a turn that cannot be served says why', () => {
  test('ok: false throws AIUnavailableError with the reason', async () => {
    stubPost(() => declinedResponse('cap'));

    await assert.rejects(
      () => aiService.generateStoryResponse(story, 'go north', null, 'tok', {}),
      (error) => {
        assert.equal(error instanceof AIUnavailableError, true);
        assert.equal(error.code, 'AI_UNAVAILABLE');
        assert.equal(error.reason, 'cap');
        // The old behaviour, and the whole point of this file.
        assert.notEqual(error.message, 'Failed to generate story response');
        assert.match(error.message, /today/i);
        return true;
      }
    );
  });

  test("an envelope error surfaces aiGeek's own words", async () => {
    stubPost(() => {
      throw envelopeError(503, 'upstream_unavailable',
        'No upstream model provider was able to serve this request. (request id: abc123)');
    });

    await assert.rejects(
      () => aiService.generateStoryResponse(story, 'go north', null, 'tok', {}),
      (error) => {
        assert.equal(error.code, 'AI_UNAVAILABLE');
        assert.equal(error.reason, 'unavailable');
        // Including the request id, which is the key to the log line that
        // holds what actually happened.
        assert.match(error.message, /request id: abc123/);
        return true;
      }
    );
  });

  test('a 504 reads as a timeout', async () => {
    stubPost(() => { throw envelopeError(504, 'upstream_timeout', 'The upstream model provider did not respond in time.'); });

    await assert.rejects(
      () => aiService.generateStoryResponse(story, 'go north', null, 'tok', {}),
      (error) => {
        assert.equal(error.reason, 'timeout');
        return true;
      }
    );
  });

  test('every documented reason produces a sentence of its own', async () => {
    for (const reason of ['cap', 'unavailable', 'timeout', 'empty', 'unparseable', 'paid_budget']) {
      calls = [];
      stubPost(() => declinedResponse(reason));
      await assert.rejects(
        () => aiService.generateStoryResponse(story, 'x', null, 'tok', {}),
        (error) => {
          assert.equal(error.reason, reason);
          assert.ok(error.message.length > 10, `reason ${reason} needs real words`);
          return true;
        }
      );
    }
  });
});

describe('a pin aiGeek could not honour', () => {
  test('pin_unavailable is a notice on a turn that still happened', async () => {
    // The direct replacement for the old failure mode: a pinned model that
    // died used to end every turn until an operator changed an env var.
    stubPost(() => okResponse('The gate creaks open.', {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      hints: ['pin_unavailable']
    }));

    const result = await aiService.generateStoryResponse(story, 'I open the gate', null, 'tok', {
      provider: 'gemini',
      model: 'a-model-that-died'
    });

    assert.equal(result.notice, PIN_UNAVAILABLE_NOTICE);
    assert.match(result.content, /gate creaks/);
    // And it reports the model that ACTUALLY answered, from provenance —
    // not the one this app asked for.
    assert.equal(result.modelUsed, 'groq:llama-3.3-70b-versatile');
  });

  test('no hint, no notice', async () => {
    stubPost(() => okResponse('narration'));
    const result = await aiService.generateStoryResponse(story, 'x', null, 'tok', {});
    assert.equal(result.notice, null);
  });
});

describe('the paths that shrug instead of failing a turn', () => {
  test('the post-roll polish pass keeps the pre-roll draft when it cannot run', async () => {
    let call = 0;
    stubPost(() => {
      call += 1;
      // First call asks for a roll; second (the polish pass) is declined.
      if (call === 1) return okResponse('You reach for the lock.\nROLL: d20 | situation=stealth');
      return declinedResponse('unavailable');
    });

    const result = await aiService.generateStoryResponse(story, 'I pick the lock', null, 'tok', {});

    assert.equal(call, 2, 'the polish pass must be attempted');
    assert.match(result.content, /reach for the lock/);
    assert.ok(result.diceResult, 'the engine still rolled');
    // No mechanics line leaked into the kept draft.
    assert.equal(/ROLL:\s*d20/.test(result.content), false);
  });

  test('a summary reports unavailability rather than throwing', async () => {
    stubPost(() => declinedResponse('cap'));
    const result = await aiService.generateSummaryResponse('summarize', 'tok', { conversationId: 'story-abc' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'cap');
    assert.equal(result.content, null);
  });
});

describe('modelsAlive — what the picker shows', () => {
  test('returns the rows aiGeek reports', async () => {
    const rows = [
      { provider: 'groq', modelId: 'llama-3.3-70b-versatile', fitness: 0.94, paid: false, lastSuccessAt: '2026-09-07T00:00:00Z' },
      { provider: 'openrouter', modelId: 'openrouter/free', fitness: 0.88, paid: false, lastSuccessAt: '2026-09-07T00:00:00Z' }
    ];
    axios.get = async (url, config) => {
      assert.equal(url.endsWith('/api/ai/models/alive'), true);
      assert.equal(config.headers.Authorization, 'Bearer bg_test_key');
      return { data: rows };
    };

    assert.deepEqual(await aiService.modelsAlive('tok'), rows);
  });

  test('an unreachable list is an empty list, not a throw — Automatic still works', async () => {
    axios.get = async () => { throw envelopeError(403, 'forbidden', 'nope'); };
    assert.deepEqual(await aiService.modelsAlive('tok'), []);
  });
});
