/**
 * gamegeekWhatNext.test.js — "what should I play next?" (WHAT_NEXT_SPEC).
 *
 *   1. The candidate set is COMPUTED: owned, unplayed, this household only.
 *      The model only ranks the shortlist; an invented id settles on the
 *      fallback.
 *   2. The switch is respected server-side: opt-in off → no model call.
 *   3. Payload is X6 only — no descriptions, reviews, notes or sessions.
 *   4. No vectors/seeds → the pre-vector answer (newest owned-unplayed).
 *   5. The fallback is the shortlist's own order with its "because" reasons.
 *
 * aiService is mocked; embeddings fetch is stubbed. Mongoose models are real
 * against in-memory Mongo, like the other gateway suites.
 */

import { jest, describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';

const callAI = jest.fn();
const aiServiceMock = { callAI, lastProviderInfo: { provider: 'groq', model: 'llama-test' } };
jest.unstable_mockModule('../services/aiService.js', () => ({ default: aiServiceMock }));

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { GameVector } = await import('../graphql/catalog/models/GameVector.js');
const { User } = await import('../models/user.js');
const { resolvers } = await import('../graphql/gamegeek/resolvers.js');
const library = await import('../graphql/gamegeek/library.js');
const { _resetCounters } = await import('../services/aiFeatureRunner.js');
const catalogSemantic = await import('../graphql/catalog/catalogSemantic.js');
const semantic = await import('../graphql/notegeek/semantic.js');
const { embeddingsConfig } = await import('../graphql/notegeek/embeddings.js');

const Q = resolvers.Query;
const ALICE = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : { user: null });
const TEST_URL = 'http://embeddings.test:11434';

const realFetch = globalThis.fetch;
beforeAll(async () => {
  await Promise.all([Game.db.asPromise(), User.db.asPromise(), GameVector.init()]);
  await User.create({ _id: ALICE, username: 'alice-whatnext', passwordHash: 'x'.repeat(20) });
}, 60000);

beforeEach(() => {
  process.env.EMBEDDINGS_URL = TEST_URL;
  callAI.mockReset();
  aiServiceMock.lastProviderInfo = { provider: 'groq', model: 'llama-test' };
  _resetCounters();
  semantic._resetSemanticState();
  catalogSemantic._resetCatalogState();
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true, status: 200,
      // 1024 dims — the mxbai dim check; the first three axes carry the mood.
      json: async () => ({ embeddings: [Object.assign(new Array(1024).fill(0), { 0: 0.5, 1: 0.5, 2: 0.5 })] }),
      text: async () => '',
    }),
  );
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  delete process.env.EMBEDDINGS_URL;
  await Promise.all([Game.deleteMany({}), GamePlayer.deleteMany({}), GameVector.deleteMany({})]);
});

afterAll(async () => {
  await User.deleteMany({ username: 'alice-whatnext' });
  await Promise.all([Game.db.close(), User.db.close()]);
});

async function setOptIn(value) {
  await User.updateOne({ _id: ALICE }, { $set: { appPreferences: { gamegeek: { playAssistant: value } } } });
}

const mkGame = (fields = {}) =>
  Game.create({ householdId: 'default', title: 'Untitled', owned: true, copies: [{ platform: 'pc' }], ...fields });
const mkPlayer = (fields = {}) =>
  GamePlayer.create({ householdId: 'default', userId: String(ALICE), ...fields });
const mkVec = (itemId, vector, householdId = 'default') =>
  GameVector.create({ itemId, householdId, model: embeddingsConfig().model, hash: 'h', vector, indexedAt: new Date() });
/** Stored vectors are the model's real 1024 dims; the first three axes carry the test ranking. */
const vec = (a, b, c) => Object.assign(new Array(1024).fill(0), { 0: a, 1: b, 2: c });

/** One seed + two candidates with planted vectors. */
async function plant() {
  const seed = await mkGame({ title: 'Loved Game', description: 'never sent' });
  const c1 = await mkGame({ title: 'Candidate One', description: 'never sent' });
  const c2 = await mkGame({ title: 'Candidate Two' });
  await Promise.all([mkVec(seed._id, vec(1, 0, 0)), mkVec(c1._id, vec(0.9, 0.1, 0)), mkVec(c2._id, vec(0.2, 0.9, 0))]);
  await mkPlayer({ gameId: seed._id, favorite: true, rating: 5, hoursPlayed: 40 });
  return { seed, c1, c2 };
}
const sentPayload = () => JSON.parse(callAI.mock.calls[0][1].messages[1].content);

describe('gameWhatNext — opt-in and fallback', () => {
  test('off: the deterministic shortlist answers with "because" reasons, no model call', async () => {
    await setOptIn(false);
    const { c1 } = await plant();
    const res = await Q.gameWhatNext(null, { limit: 5 }, ctx(ALICE));
    expect(callAI).not.toHaveBeenCalled();
    expect(res.provenance).toMatchObject({ source: 'fallback', reason: 'disabled', model: null });
    expect(res.picks[0]).toMatchObject({ gameId: String(c1._id), why: 'Because you loved Loved Game.' });
    expect(res.picks[0].game.title).toBe('Candidate One');
  });

  test('a mood-only pick falls back with "Fits your mood: …"', async () => {
    await setOptIn(false);
    const { c2 } = await plant();
    // The fetch stub embeds every text as [0.5,0.5,0.5]: dot gives c2 0.55,
    // c1 0.50 — the mood queue claims Candidate Two before any seed queue.
    const res = await Q.gameWhatNext(null, { limit: 5, mood: 'short and chill' }, ctx(ALICE));
    expect(callAI).not.toHaveBeenCalled();
    expect(res.picks[0]).toMatchObject({ gameId: String(c2._id), why: 'Fits your mood: "short and chill".' });
  });

  test('an id the model was never given settles on the fallback', async () => {
    await setOptIn(true);
    await plant();
    callAI.mockResolvedValue(JSON.stringify({ picks: [{ gameId: String(new mongoose.Types.ObjectId()), why: 'invented' }] }));
    const res = await Q.gameWhatNext(null, { limit: 5 }, ctx(ALICE));
    expect(res.provenance).toMatchObject({ source: 'fallback', reason: 'invalid' });
    expect(res.picks[0].why).toMatch(/^Because you loved /);
  });

  test('the model path: picks carry their game; provenance names the model', async () => {
    await setOptIn(true);
    const { c1 } = await plant();
    callAI.mockResolvedValue(JSON.stringify({ picks: [{ gameId: String(c1._id), why: 'Short and brilliant.' }] }));
    const res = await Q.gameWhatNext(null, { limit: 5 }, ctx(ALICE));
    expect(res.provenance).toMatchObject({ source: 'model', model: 'llama-test', provider: 'groq' });
    expect(res.picks[0]).toMatchObject({ gameId: String(c1._id), why: 'Short and brilliant.' });
  });
});

describe('gameWhatNext — prompt and runner options', () => {
  test('the prompt carries the live-testing rules', () => {
    const p = library.GAME_WHAT_NEXT_SYSTEM_PROMPT;
    expect(p).toContain('outranks the seeds');
    expect(p).toContain('stand behind');
    expect(p).toContain('or null when the\n  candidate came from the mood');
  });
});

describe('gameWhatNext — what the model sees (X6)', () => {
  test('seeds, mood and X6 candidate fields only — never descriptions or player data', async () => {
    await setOptIn(true);
    const { seed } = await plant();
    expect(seed).toBeDefined();
    callAI.mockResolvedValue(JSON.stringify({ picks: [] }));
    await Q.gameWhatNext(null, { limit: 5, mood: 'short and chill' }, ctx(ALICE));

    const sent = sentPayload();
    expect(sent.mood).toBe('short and chill');
    expect(sent.limit).toBe(5);
    expect(sent.seeds).toEqual([
      { title: 'Loved Game', genres: [], rating: 5, hoursPlayed: 40, why: 'loved' },
    ]);
    expect(sent.candidates).toHaveLength(2);
    for (const c of sent.candidates) {
      expect(Object.keys(c).sort()).toEqual(['because', 'genres', 'hoursToBeat', 'id', 'modes', 'tags', 'title', 'year']);
    }
    // With a mood, the mood queue claims its top hit first (because null);
    // the seed-attributed pick follows.
    expect(sent.candidates[0].because).toBeNull();
    expect(sent.candidates[1].because).toBe('Loved Game');
    const raw = callAI.mock.calls[0][1].messages[1].content;
    for (const never of ['description', 'never sent', 'review', 'notes', 'sessions', 'coverPath']) {
      expect(raw).not.toContain(never);
    }
  });

  test('a foreign household contributes no seeds, no candidates, no vectors', async () => {
    await setOptIn(true);
    const { c1 } = await plant();
    const foreign = await mkGame({ title: 'Foreign Game', householdId: 'other-house' });
    await mkVec(foreign._id, vec(0.95, 0.05, 0), 'other-house');
    // Even a state row pointing at the foreign game must not seed it.
    await mkPlayer({ gameId: foreign._id, favorite: true, rating: 5, hoursPlayed: 99 });
    callAI.mockResolvedValue(JSON.stringify({ picks: [] }));
    await Q.gameWhatNext(null, { limit: 5 }, ctx(ALICE));
    const sent = sentPayload();
    expect(sent.seeds.map((s) => s.title)).toEqual(['Loved Game']);
    expect(sent.candidates.map((c) => c.title)).toEqual(['Candidate One', 'Candidate Two']);
  });

  test('20 realistic candidates + 5 seeds stays under 8 000 chars', async () => {
    await setOptIn(true);
    const seeds = [];
    for (let i = 0; i < 5; i += 1) {
      seeds.push(await mkGame({ title: `The Elder Scrolls ${i}: A Rather Long Subtitle` }));
      await mkVec(seeds[i]._id, vec(1 - i * 0.1, i * 0.1, 0));
      await mkPlayer({ gameId: seeds[i]._id, rating: 5, hoursPlayed: 30 + i });
    }
    for (let i = 0; i < 20; i += 1) {
      const g = await mkGame({
        title: `Candidate With A Fairly Long Title ${i}: The Extended Edition`,
        genres: ['Action', 'RPG'], tags: ['open-world', 'singleplayer', 'story-rich', 'atmospheric'],
        modes: ['single'], timeToBeat: { main: 42 },
        releaseDate: new Date(Date.UTC(2015 + (i % 10), 0, 1)),
      });
      await mkVec(g._id, vec(0.5 + i * 0.01, 0.4, 0.1));
    }
    callAI.mockResolvedValue(JSON.stringify({ picks: [] }));
    await Q.gameWhatNext(null, { limit: 10, mood: 'something short and co-op for tonight' }, ctx(ALICE));
    const raw = callAI.mock.calls[0][1].messages[1].content;
    expect(raw.length).toBeLessThanOrEqual(8000);
    expect(sentPayload().candidates.length).toBeLessThanOrEqual(20);
    expect(sentPayload().seeds).toHaveLength(5);
  });
});

describe('gameWhatNext — pre-vector fallback (W4)', () => {
  test('no vectors at all → newest owned-unplayed, "recent additions" why', async () => {
    await setOptIn(true);
    const older = await mkGame({ title: 'Older Addition', createdAt: new Date('2026-01-01') });
    const newer = await mkGame({ title: 'Newer Addition', createdAt: new Date('2026-02-01') });
    await mkGame({ title: 'Already Played', createdAt: new Date('2026-03-01') });
    const played = await Game.findOne({ title: 'Already Played' }).lean();
    await mkPlayer({ gameId: played._id, shelf: 'playing', hoursPlayed: 3 });
    callAI.mockResolvedValue(JSON.stringify({ picks: [] }));
    const res = await Q.gameWhatNext(null, { limit: 5 }, ctx(ALICE));
    const sent = sentPayload();
    expect(sent.candidates.map((c) => c.title)).toEqual(['Newer Addition', 'Older Addition']);
    expect(sent.candidates[0].because).toBeNull();
    // And the deterministic fallback for the same set says why.
    await setOptIn(false);
    const off = await Q.gameWhatNext(null, { limit: 5 }, ctx(ALICE));
    expect(off.picks[0]).toMatchObject({ gameId: String(newer._id), why: 'One of the most recent additions to your library.' });
    expect(older).toBeDefined();
  });
});
