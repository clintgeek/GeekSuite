/**
 * whatNextRunnerArgs.test.js — the runner options both what-next calls pass:
 * the 12 s timeout (live calls run 3–6 s; the 6 s default nearly cut a paid
 * mood call), the 350-token budget and the daily cap — asserted on the
 * runAIFeature mock's args.
 *
 * aiFeatureRunner is mocked (this file only); the mongoose models are real
 * against in-memory Mongo, like the other gateway suites.
 */

import { jest, describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';

const runAIFeature = jest.fn();
jest.unstable_mockModule('../services/aiFeatureRunner.js', () => ({ runAIFeature }));

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { Book } = await import('../graphql/bookgeek/models/book.js');
const gameLibrary = await import('../graphql/gamegeek/library.js');
const bookLibrary = await import('../graphql/bookgeek/library.js');
const semantic = await import('../graphql/notegeek/semantic.js');
const catalogSemantic = await import('../graphql/catalog/catalogSemantic.js');

const ALICE = new mongoose.Types.ObjectId();
const realFetch = globalThis.fetch;

beforeAll(async () => {
  await Promise.all([Game.db.asPromise(), Book.db.asPromise()]);
}, 60000);

beforeEach(() => {
  process.env.EMBEDDINGS_URL = 'http://embeddings.test:11434';
  runAIFeature.mockReset();
  runAIFeature.mockImplementation(async () => ({
    data: { picks: [] },
    provenance: { source: 'model', model: 'm', provider: 'p', reason: null },
  }));
  semantic._resetSemanticState();
  catalogSemantic._resetCatalogState();
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ embeddings: [new Array(1024).fill(0.5)] }),
      text: async () => '',
    }),
  );
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  delete process.env.EMBEDDINGS_URL;
  await Promise.all([Game.deleteMany({}), Book.deleteMany({})]);
});

afterAll(async () => {
  await Promise.all([Game.db.close(), Book.db.close()]);
});

describe('the what-next calls pass the overnight runner options', () => {
  test('gameWhatNext: timeoutMs 12000, maxTokens 350, daily cap', async () => {
    await Game.create({ householdId: 'default', title: 'Unplayed', owned: true, copies: [{ platform: 'pc' }] });
    await gameLibrary.gameWhatNext({
      userId: String(ALICE), householdId: 'default', mood: 'chill', limit: 5, enabled: true,
    });
    expect(runAIFeature).toHaveBeenCalledTimes(1);
    expect(runAIFeature.mock.calls[0][0]).toMatchObject({
      app: 'gamegeek', feature: 'whatnext', timeoutMs: 12000, maxTokens: 350, maxCallsPerDay: 20,
    });
  });

  test('bookgeek whatNext: timeoutMs 12000, maxTokens 350, daily cap', async () => {
    await Book.create({ title: 'Unread', owned: true });
    await bookLibrary.whatNext({ userId: String(ALICE), limit: 5, enabled: true, mood: 'cozy' });
    expect(runAIFeature).toHaveBeenCalledTimes(1);
    expect(runAIFeature.mock.calls[0][0]).toMatchObject({
      app: 'bookgeek', feature: 'library', timeoutMs: 12000, maxTokens: 350, maxCallsPerDay: 20,
    });
  });

  test('the prompts carry the live-testing why rules', () => {
    expect(bookLibrary.WHAT_NEXT_SYSTEM_PROMPT).toContain('resemblance is real and\n   specific');
    expect(gameLibrary.GAME_WHAT_NEXT_SYSTEM_PROMPT).toContain('outranks the seeds');
  });
});
