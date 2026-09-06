/**
 * Pins bookify's two guardrails (Night 2 2026-09-06, Q62): a synchronous AI
 * pipeline — one AI call per 6 events, sequentially, up to ~45s each per the
 * going-over note in DOCS/CONTEXT.md — had no bound on story size or total
 * wall-clock time. `services/bookService.js` now rejects an oversized story
 * before making a single AI call (`MAX_BOOKIFY_EVENTS`, a 413-shaped error)
 * and aborts a run that overruns its wall-clock allowance regardless of size
 * (`BOOKIFY_TIME_BUDGET_MS`, a 504-shaped error), rather than holding the
 * request open indefinitely.
 */

import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import Story from '../models/Story.js';
import aiService from '../services/aiService.js';
import bookService, {
  MAX_BOOKIFY_EVENTS,
  BOOKIFY_TIME_BUDGET_MS,
  BookifyTooLargeError,
  BookifyTimeoutError,
} from '../services/bookService.js';

const realFindById = Story.findById;
const realCallBaseGeekAI = aiService.callBaseGeekAI;
const realRecommendProviderModel = aiService.recommendProviderModel;

function storyWithEvents(count) {
  const events = Array.from({ length: count }, (_, i) => ({ description: `Event ${i}` }));
  return { title: 'Test Tale', genre: 'Fantasy', events };
}

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'] });
});

afterEach(() => {
  Story.findById = realFindById;
  aiService.callBaseGeekAI = realCallBaseGeekAI;
  aiService.recommendProviderModel = realRecommendProviderModel;
  mock.timers.reset();
});

describe('bookify — size cap', () => {
  test('rejects a story over MAX_BOOKIFY_EVENTS before calling the AI at all', async () => {
    Story.findById = async () => storyWithEvents(MAX_BOOKIFY_EVENTS + 1);
    let called = false;
    aiService.callBaseGeekAI = async () => { called = true; return 'should not run'; };

    await assert.rejects(
      () => bookService.bookify('story-too-big', 'tok'),
      (err) => {
        assert.ok(err instanceof BookifyTooLargeError);
        assert.equal(err.code, 'BOOKIFY_TOO_LARGE');
        return true;
      }
    );
    assert.equal(called, false, 'an oversized story must not spend a single AI call');
  });

  test('a story at the cap is allowed through to the AI step', async () => {
    Story.findById = async () => storyWithEvents(MAX_BOOKIFY_EVENTS);
    aiService.callBaseGeekAI = async () => 'polished scene';
    aiService.recommendProviderModel = async () => ({ provider: 'gemini', model: 'gemini-flash-latest' });

    const result = await bookService.bookify('story-at-cap', 'tok');
    assert.equal(result.title, 'Test Tale');
    assert.ok(result.content.includes('polished scene'));
  });
});

describe('bookify — time budget', () => {
  test('aborts with a timeout error once the overall budget is exceeded mid-run', async () => {
    // Two scenes' worth of events (chunkSize is 6) so a second AI call is
    // attempted; advancing the fake clock past the budget as a side effect
    // of the first call makes the second scene's budget check trip.
    Story.findById = async () => storyWithEvents(12);
    let calls = 0;
    aiService.callBaseGeekAI = async () => {
      calls += 1;
      if (calls === 1) mock.timers.tick(BOOKIFY_TIME_BUDGET_MS + 1);
      return 'polished scene';
    };

    await assert.rejects(
      () => bookService.bookify('story-slow', 'tok'),
      (err) => {
        assert.ok(err instanceof BookifyTimeoutError);
        assert.equal(err.code, 'BOOKIFY_TIMEOUT');
        return true;
      }
    );
    assert.equal(calls, 1, 'must stop before starting the second scene, not run every scene regardless');
  });

  test('a run that finishes inside the budget is unaffected', async () => {
    Story.findById = async () => storyWithEvents(6);
    aiService.callBaseGeekAI = async () => 'polished scene';
    aiService.recommendProviderModel = async () => ({ provider: 'gemini', model: 'gemini-flash-latest' });

    const result = await bookService.bookify('story-fast', 'tok');
    assert.ok(result.content.includes('polished scene'));
  });
});
