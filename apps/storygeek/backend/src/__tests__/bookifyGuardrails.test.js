/**
 * Pins bookify's two guardrails (Night 2 2026-09-06, Q62): a synchronous AI
 * pipeline — one AI call per 6 events, sequentially, up to ~45s each per the
 * going-over note in DOCS/CONTEXT.md — had no bound on story size or total
 * wall-clock time. `services/bookService.js` now rejects an oversized story
 * before making a single AI call (`MAX_BOOKIFY_EVENTS`, a 413-shaped error)
 * and aborts a run that overruns its wall-clock allowance regardless of size
 * (`BOOKIFY_TIME_BUDGET_MS`, a 504-shaped error), rather than holding the
 * request open indefinitely.
 *
 * Re-pointed for Phase 2: the passes run on aiGeek's `aux` feature via
 * `callAuxAI`, which answers `{ ok, content }` instead of throwing, and the
 * per-export `aiDirectorService.recommendProvider` round trip is gone — the
 * consistency pass is `auto` like everything else. The third case below is
 * new: an export that cannot run because no model would serve says so (503)
 * rather than coming back quietly short.
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
  BookifyUnavailableError,
} from '../services/bookService.js';

const realFindById = Story.findById;
const realCallAuxAI = aiService.callAuxAI;

function storyWithEvents(count) {
  const events = Array.from({ length: count }, (_, i) => ({ description: `Event ${i}` }));
  return { title: 'Test Tale', genre: 'Fantasy', events };
}

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'] });
});

afterEach(() => {
  Story.findById = realFindById;
  aiService.callAuxAI = realCallAuxAI;
  mock.timers.reset();
});

/** The `{ ok, content }` envelope `callAuxAI` answers with. */
const served = (content) => async () => ({ ok: true, content, reason: null, provenance: { provider: 'groq', model: 'llama', hints: [] } });
const declined = (reason) => async () => ({ ok: false, content: null, reason, message: 'The narrator is not answering right now.' });

describe('bookify — size cap', () => {
  test('rejects a story over MAX_BOOKIFY_EVENTS before calling the AI at all', async () => {
    Story.findById = async () => storyWithEvents(MAX_BOOKIFY_EVENTS + 1);
    let called = false;
    aiService.callAuxAI = async () => { called = true; return { ok: true, content: 'should not run' }; };

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
    aiService.callAuxAI = served('polished scene');

    const result = await bookService.bookify('story-at-cap', 'tok');
    assert.equal(result.title, 'Test Tale');
    assert.ok(result.content.includes('polished scene'));
  });
});

describe('bookify — an unavailable model', () => {
  test('refuses the export rather than returning a short book', async () => {
    Story.findById = async () => storyWithEvents(12);
    aiService.callAuxAI = declined('cap');

    await assert.rejects(
      () => bookService.bookify('story-no-model', 'tok'),
      (err) => {
        assert.ok(err instanceof BookifyUnavailableError);
        assert.equal(err.code, 'BOOKIFY_UNAVAILABLE');
        assert.equal(err.reason, 'cap');
        return true;
      }
    );
  });

  test('never asks a director which model to use — the pass is auto', async () => {
    Story.findById = async () => storyWithEvents(6);
    const seen = [];
    aiService.callAuxAI = async (prompt, config) => {
      seen.push(config);
      return { ok: true, content: 'polished scene', reason: null, provenance: { hints: [] } };
    };

    await bookService.bookify('story-auto', 'tok');

    assert.ok(seen.length >= 1);
    for (const config of seen) {
      assert.equal(config.provider, undefined, 'bookify must name no provider');
      assert.equal(config.model, undefined, 'bookify must name no model');
      assert.equal(config.conversationId, 'story-auto');
    }
  });
});

describe('bookify — time budget', () => {
  test('aborts with a timeout error once the overall budget is exceeded mid-run', async () => {
    // Two scenes' worth of events (chunkSize is 6) so a second AI call is
    // attempted; advancing the fake clock past the budget as a side effect
    // of the first call makes the second scene's budget check trip.
    Story.findById = async () => storyWithEvents(12);
    let calls = 0;
    aiService.callAuxAI = async () => {
      calls += 1;
      if (calls === 1) mock.timers.tick(BOOKIFY_TIME_BUDGET_MS + 1);
      return { ok: true, content: 'polished scene', reason: null, provenance: { hints: [] } };
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
    aiService.callAuxAI = served('polished scene');

    const result = await bookService.bookify('story-fast', 'tok');
    assert.ok(result.content.includes('polished scene'));
  });
});
