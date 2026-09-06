/**
 * notegeekSuggest.test.js
 *
 * The `suggestForNote` query end to end, against the in-memory Mongo, with
 * aiService faked. What is pinned here is everything that would be a *product*
 * failure rather than a ranking one:
 *
 *   - the strip is owner-scoped: another user's notes and tags never appear;
 *   - locked and encrypted notes are neither suggested nor used as evidence,
 *     and never reach the model;
 *   - the model is not called at all unless the user has opted in
 *     (`User.appPreferences.notegeek.suggestOnSave`), which is off by default;
 *   - when it is called it sees titles and the current note's excerpt, and
 *     nothing else;
 *   - a model that fails, stalls, or answers with ids it was not given leaves
 *     the local ranking exactly as it was;
 *   - an over-long excerpt is truncated, never rejected;
 *   - anonymous callers get an empty answer, not an error.
 */

import { jest, describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';

const callAI = jest.fn();
const aiServiceMock = { callAI, lastProviderInfo: null };

jest.unstable_mockModule('../services/aiService.js', () => ({
  default: aiServiceMock,
}));

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { User, userGeekConn } = await import('../models/user.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');
const { _resetCounters } = await import('../services/aiFeatureRunner.js');
const { SUGGEST_DAILY_CAP, EXCERPT_MAX } = await import('../graphql/notegeek/suggest.js');

const { Query } = resolvers;
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

let ALICE;
let BOB;

const makeNote = (overrides = {}) =>
  Note.create({ content: 'body', userId: ALICE, tags: [], ...overrides });

async function optIn(userId, value) {
  await User.findByIdAndUpdate(userId, {
    $set: { 'appPreferences.notegeek': { suggestOnSave: value } },
  });
}

beforeAll(async () => {
  await Note.db.asPromise();
  if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
}, 60000);

beforeEach(async () => {
  _resetCounters();
  callAI.mockReset();
  aiServiceMock.lastProviderInfo = { provider: 'groq', model: 'llama-3.1-8b' };
  const alice = await User.create({ username: `suggest_alice_${ Date.now() }_${ Math.random() }`, passwordHash: 'x' });
  const bob = await User.create({ username: `suggest_bob_${ Date.now() }_${ Math.random() }`, passwordHash: 'x' });
  ALICE = alice._id;
  BOB = bob._id;
});

afterEach(async () => {
  await Note.deleteMany({});
  await User.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
  await userGeekConn.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('the local half', () => {
  test('suggests the user\'s own tags and notes, and nobody else\'s', async () => {
    await makeNote({ title: 'nginx layout', tags: ['homelab'] });
    await Note.create({ content: 'b', userId: BOB, title: 'nginx secrets', tags: ['bobs-tag'] });

    const out = await Query.suggestForNote(
      null,
      { title: 'nginx reverse proxy', excerpt: '', tags: [] },
      ctx(ALICE)
    );

    expect(out.tags.map((t) => t.tag)).toEqual(['homelab']);
    expect(out.related.map((r) => r.title)).toEqual(['nginx layout']);
    expect(out.provenance).toMatchObject({ source: 'fallback', reason: 'opt-out', cap: SUGGEST_DAILY_CAP });
    expect(callAI).not.toHaveBeenCalled();
  });

  test('locked and encrypted notes are invisible to the strip', async () => {
    await makeNote({ title: 'nginx locked', tags: ['secret-tag'], isLocked: true });
    await makeNote({ title: 'nginx encrypted', tags: ['secret-tag'], isEncrypted: true });
    await makeNote({ title: 'nginx open', tags: ['homelab'] });

    const out = await Query.suggestForNote(null, { title: 'nginx', excerpt: '', tags: [] }, ctx(ALICE));

    expect(out.related.map((r) => r.title)).toEqual(['nginx open']);
    expect(out.tags.map((t) => t.tag)).not.toContain('secret-tag');
  });

  test('an over-long excerpt is truncated, not rejected', async () => {
    await makeNote({ title: 'sourdough starter', tags: ['baking'] });
    const out = await Query.suggestForNote(
      null,
      { title: '', excerpt: 'sourdough '.repeat(5000), tags: [] },
      ctx(ALICE)
    );
    expect(out.related.map((r) => r.title)).toEqual(['sourdough starter']);
    expect('sourdough '.repeat(5000).length).toBeGreaterThan(EXCERPT_MAX);
  });

  test('a bad argument list is still rejected in the shared shape', async () => {
    await expect(
      Query.suggestForNote(null, { title: 'x', excerpt: '', tags: [], bogus: 1 }, ctx(ALICE))
    ).rejects.toThrow('Invalid input');
  });

  test('an anonymous caller gets an empty answer rather than an error', async () => {
    const out = await Query.suggestForNote(null, { title: 'nginx', excerpt: '', tags: [] }, ctx(null));
    expect(out).toMatchObject({ tags: [], related: [] });
    expect(out.provenance).toMatchObject({ source: 'fallback', reason: 'unauthenticated' });
  });
});

describe('the model half, behind the opt-in', () => {
  const seed = async () => {
    // Both titles share the query term, so both are genuinely local
    // candidates — the point of these tests is the ORDER the model imposes on
    // them, not whether the local half found them.
    const a = await makeNote({ title: 'nginx watchtower digest', tags: ['homelab'] });
    const b = await makeNote({ title: 'nginx layout', tags: ['homelab'] });
    return { a, b };
  };

  test('opted out (the default) never reaches the model', async () => {
    await seed();
    const out = await Query.suggestForNote(null, { title: 'nginx', excerpt: '', tags: [] }, ctx(ALICE));
    expect(callAI).not.toHaveBeenCalled();
    expect(out.provenance.source).toBe('fallback');
  });

  test('opted in: the model reorders candidates and only sees titles', async () => {
    const { a, b } = await seed();
    await optIn(ALICE, true);
    callAI.mockResolvedValue(JSON.stringify({
      related: [{ id: String(a._id), why: 'both about watchtower digests' }],
    }));

    const out = await Query.suggestForNote(
      null,
      { title: 'nginx proxy', excerpt: 'the reverse proxy config', tags: [] },
      ctx(ALICE)
    );

    expect(callAI).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(callAI.mock.calls[0][0]);
    expect(sent.writing).toEqual({ title: 'nginx proxy', excerpt: 'the reverse proxy config' });
    expect(sent.candidates.map((c) => c.title).sort()).toEqual(['nginx layout', 'nginx watchtower digest']);
    // Only ids and titles — no bodies, no tags, no timestamps.
    for (const candidate of sent.candidates) expect(Object.keys(candidate).sort()).toEqual(['id', 'title']);

    expect(out.related.map((r) => r.id)).toEqual([String(a._id), String(b._id)]);
    expect(out.related[0].why).toBe('both about watchtower digests');
    expect(out.provenance).toMatchObject({ source: 'model', model: 'llama-3.1-8b', provider: 'groq', callsToday: 1 });

    // The tag half is never the model's business.
    expect(out.tags.map((t) => t.tag)).toEqual(['homelab']);
  });

  test('routing goes through the notegeek app row with a feature tag', async () => {
    await seed();
    await optIn(ALICE, true);
    callAI.mockResolvedValue('{"related":[]}');
    await Query.suggestForNote(null, { title: 'nginx', excerpt: '', tags: [] }, ctx(ALICE));
    expect(callAI.mock.calls[0][1]).toMatchObject({
      useAppConfig: true,
      appName: 'notegeek',
      feature: 'suggest',
    });
  });

  test('an id the model was not given is thrown away, local ranking stands', async () => {
    const { a, b } = await seed();
    await optIn(ALICE, true);
    callAI.mockResolvedValue(JSON.stringify({
      related: [{ id: String(new mongoose.Types.ObjectId()), why: 'invented' }],
    }));

    const out = await Query.suggestForNote(null, { title: 'nginx', excerpt: '', tags: [] }, ctx(ALICE));

    expect(out.provenance).toMatchObject({ source: 'fallback', reason: 'invalid' });
    expect(out.related.map((r) => r.id).sort()).toEqual([String(a._id), String(b._id)].sort());
    for (const row of out.related) expect(row.why).toBeNull();
  });

  test('a model that is down leaves the local ranking untouched', async () => {
    await seed();
    await optIn(ALICE, true);
    callAI.mockRejectedValue(new Error('ECONNREFUSED'));
    const out = await Query.suggestForNote(null, { title: 'nginx', excerpt: '', tags: [] }, ctx(ALICE));
    expect(out.provenance).toMatchObject({ source: 'fallback', reason: 'unavailable' });
    expect(out.related.length).toBeGreaterThan(0);
  });

  test('the daily cap stops the model and the strip keeps working', async () => {
    await seed();
    await optIn(ALICE, true);
    callAI.mockResolvedValue('{"related":[]}');
    const args = { title: 'nginx', excerpt: '', tags: [] };
    for (let i = 0; i < SUGGEST_DAILY_CAP; i += 1) {
      await Query.suggestForNote(null, args, ctx(ALICE));
    }
    expect(callAI).toHaveBeenCalledTimes(SUGGEST_DAILY_CAP);
    const capped = await Query.suggestForNote(null, args, ctx(ALICE));
    expect(callAI).toHaveBeenCalledTimes(SUGGEST_DAILY_CAP);
    expect(capped.provenance).toMatchObject({ source: 'fallback', reason: 'cap', cap: SUGGEST_DAILY_CAP });
    expect(capped.related.length).toBeGreaterThan(0);
  });

  test('opted in with nothing to rank does not spend a call', async () => {
    await optIn(ALICE, true);
    const out = await Query.suggestForNote(null, { title: 'nginx', excerpt: '', tags: [] }, ctx(ALICE));
    expect(callAI).not.toHaveBeenCalled();
    expect(out.provenance).toMatchObject({ source: 'fallback', reason: 'no-candidates' });
  });
});
