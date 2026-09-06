/**
 * Pins the going-over 2026-09-05 fix in `services/aiService.js`.
 *
 * `STORYGEEK_FREE_ONLY` defaults to on, so `resolveGMModel()` consulted
 * aiGeek's director (`GET /api/ai/director/models`) on **every turn**. That
 * call needs the `ai:director` permission on `AI_GEEK_API_KEY`; if the key is
 * minted without it — or basegeek is briefly down, or the request times out —
 * the rejection propagated straight up through `generateStoryResponse` as
 * "Failed to generate story response", and every turn of every story failed.
 * One missing permission on one key was a total outage with no fallback path.
 *
 * The fix draws a line between "the free list says nothing is free" (`[]`, an
 * answer — keep the existing last-resort walk) and "the free list is
 * unavailable" (`null`, an outage — fall back to the pinned GM model, which
 * is an operator choice and is the free model in the deployed config). It
 * also negative-caches the failure so a broken director isn't re-dialled once
 * per turn, and prefers a stale-but-cached list over nothing.
 *
 * Deliberately does NOT fall back to the caller's explicit provider/model
 * pick: free-only mode exists to stop unintended spend, and with the list
 * unavailable there is no way to tell whether their pick is free.
 */

import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import aiService from '../services/aiService.js';

const realGetDirectorModels = aiService.getDirectorModels;
const realFreeOnly = aiService.freeOnly;

/** Reset the module singleton's caches between cases. */
function resetCaches() {
  aiService._freeListCache = { list: null, fetchedAt: 0 };
  aiService._freeListFailedAt = 0;
}

const FREE_LIST_RESPONSE = {
  providers: {
    gemini: {
      isEnabled: true,
      hasApiKey: true,
      models: [
        { id: 'gemini-flash-latest', freeTier: { isFree: true } },
        { id: 'gemini-pro-paid', freeTier: { isFree: false } },
      ],
    },
    openai: {
      isEnabled: true,
      hasApiKey: true,
      models: [{ id: 'gpt-expensive', freeTier: { isFree: false } }],
    },
  },
};

beforeEach(() => {
  aiService.freeOnly = true;
  resetCaches();
});

afterEach(() => {
  aiService.getDirectorModels = realGetDirectorModels;
  aiService.freeOnly = realFreeOnly;
  resetCaches();
});

describe('getFreeProviderModels', () => {
  test('returns the free models when the director answers', async () => {
    aiService.getDirectorModels = async () => FREE_LIST_RESPONSE;
    const list = await aiService.getFreeProviderModels('tok');
    assert.deepEqual(list, [{ provider: 'gemini', model: 'gemini-flash-latest' }]);
  });

  test('returns null — not a throw — when the director call fails', async () => {
    aiService.getDirectorModels = async () => {
      const err = new Error('Request failed with status code 403');
      throw err;
    };
    const list = await aiService.getFreeProviderModels('tok');
    assert.equal(list, null);
  });

  test('does not re-dial a failing director on the next turn', async () => {
    let calls = 0;
    aiService.getDirectorModels = async () => {
      calls += 1;
      throw new Error('ECONNREFUSED');
    };
    await aiService.getFreeProviderModels('tok');
    await aiService.getFreeProviderModels('tok');
    await aiService.getFreeProviderModels('tok');
    assert.equal(calls, 1, 'the failure must be negative-cached');
  });

  test('prefers a stale cached list over nothing when the director later fails', async () => {
    aiService.getDirectorModels = async () => FREE_LIST_RESPONSE;
    const fresh = await aiService.getFreeProviderModels('tok');
    assert.equal(fresh.length, 1);

    // Age the cache past its 5-minute window, then break the director.
    aiService._freeListCache.fetchedAt = Date.now() - 400000;
    aiService.getDirectorModels = async () => {
      throw new Error('503');
    };
    const stale = await aiService.getFreeProviderModels('tok');
    assert.deepEqual(stale, [{ provider: 'gemini', model: 'gemini-flash-latest' }]);
  });

  test('an empty free list is an answer, not a failure', async () => {
    aiService.getDirectorModels = async () => ({ providers: {} });
    const list = await aiService.getFreeProviderModels('tok');
    assert.deepEqual(list, []);
  });

  test('skips providers that are disabled or have no key', async () => {
    aiService.getDirectorModels = async () => ({
      providers: {
        gemini: { isEnabled: false, hasApiKey: true, models: [{ id: 'a', freeTier: { isFree: true } }] },
        groq: { isEnabled: true, hasApiKey: false, models: [{ id: 'b', freeTier: { isFree: true } }] },
      },
    });
    assert.deepEqual(await aiService.getFreeProviderModels('tok'), []);
  });
});

describe('resolveGMModel when the free list is unavailable', () => {
  test('falls back to the pinned GM model instead of throwing', async () => {
    aiService.getDirectorModels = async () => {
      throw new Error('Request failed with status code 403');
    };
    const resolved = await aiService.resolveGMModel({}, 'tok');
    assert.deepEqual(resolved, {
      provider: aiService.gmProvider,
      model: aiService.gmModel,
    });
  });

  test('ignores an explicit pick it can no longer verify as free', async () => {
    aiService.getDirectorModels = async () => {
      throw new Error('503');
    };
    const resolved = await aiService.resolveGMModel(
      { provider: 'openai', model: 'gpt-expensive' },
      'tok'
    );
    assert.equal(resolved.provider, aiService.gmProvider);
    assert.equal(resolved.model, aiService.gmModel);
  });

  test('still throws when the director answers and genuinely nothing is free', async () => {
    aiService.getDirectorModels = async () => ({ providers: {} });
    await assert.rejects(
      () => aiService.resolveGMModel({}, 'tok'),
      /No free AI models available/
    );
  });
});

describe('resolveGMModel when the free list is available', () => {
  test('honours an explicit pick that is free', async () => {
    aiService.getDirectorModels = async () => FREE_LIST_RESPONSE;
    const resolved = await aiService.resolveGMModel(
      { provider: 'gemini', model: 'gemini-flash-latest' },
      'tok'
    );
    assert.deepEqual(resolved, { provider: 'gemini', model: 'gemini-flash-latest' });
  });

  test('refuses an explicit pick that is not free and uses the pinned model', async () => {
    aiService.getDirectorModels = async () => FREE_LIST_RESPONSE;
    const resolved = await aiService.resolveGMModel(
      { provider: 'openai', model: 'gpt-expensive' },
      'tok'
    );
    assert.notEqual(resolved.model, 'gpt-expensive');
  });

  test('never consults the director at all when free-only is off', async () => {
    aiService.freeOnly = false;
    let called = false;
    aiService.getDirectorModels = async () => {
      called = true;
      return FREE_LIST_RESPONSE;
    };
    const resolved = await aiService.resolveGMModel(
      { provider: 'openai', model: 'gpt-expensive' },
      'tok'
    );
    assert.equal(called, false);
    assert.deepEqual(resolved, { provider: 'openai', model: 'gpt-expensive' });
  });
});
