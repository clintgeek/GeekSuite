/**
 * bookgeekLibraryAI.test.js
 *
 * The bookgeek library assistant (AI idea #4, stream R117): `whatNext` and
 * `draftBookMetadata`.
 *
 * What actually has to hold, in order:
 *
 *   1. The candidate set is COMPUTED. The model never decides what is unread —
 *      it is handed a list, and an id it did not receive is rejected.
 *   2. Nothing is written. Both queries are reads; the library is unchanged
 *      after either.
 *   3. The switch is respected server-side. Opt-in off means no model call at
 *      all — and still a useful answer.
 *   4. The fallback is never blank. Cap, outage, garbage output and a failed
 *      validation all settle on the deterministic ranking.
 *   5. Tags stay the library's own, plus at most two coined ones.
 *
 * aiService is mocked — no test here ever reaches a real model. The Mongoose
 * models are real, against the same in-memory Mongo the other gateway suites
 * use.
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const callAI = jest.fn();
const aiServiceMock = { callAI, lastProviderInfo: { provider: 'groq', model: 'llama-test' } };

jest.unstable_mockModule('../services/aiService.js', () => ({ default: aiServiceMock }));

const { Book } = await import('../graphql/bookgeek/models/book.js');
const { User } = await import('../models/user.js');
const { resolvers } = await import('../graphql/bookgeek/resolvers.js');
const library = await import('../graphql/bookgeek/library.js');
const { _resetCounters } = await import('../services/aiFeatureRunner.js');
const { BookVector } = await import('../graphql/catalog/models/BookVector.js');
const catalogSemantic = await import('../graphql/catalog/catalogSemantic.js');
const { salvagePicks } = await import('../graphql/catalog/salvagePicks.js');
const semantic = await import('../graphql/notegeek/semantic.js');
const { embeddingsConfig } = await import('../graphql/notegeek/embeddings.js');

const Q = resolvers.Query;

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : { user: null });

const modelSays = (payload) => callAI.mockResolvedValue(JSON.stringify(payload));

/** A book row with sane defaults; overrides win. */
function bookRow(over = {}) {
  return {
    title: 'Untitled',
    authors: ['Nobody'],
    owned: true,
    shelf: 'unread',
    tags: [],
    dateAdded: new Date('2026-01-01'),
    ...over,
  };
}

async function setOptIn(userId, value) {
  await User.updateOne(
    { _id: userId },
    { $set: { appPreferences: { bookgeek: { defaultShelfFilter: 'all', libraryAssistant: value } } } }
  );
}

const realFetch = globalThis.fetch;
beforeAll(async () => {
  await Book.db.asPromise();
  await User.db.asPromise();
  await BookVector.init();
  await User.create([
    { _id: ALICE, username: 'alice-r117', passwordHash: 'x'.repeat(20) },
    { _id: BOB, username: 'bob-r117', passwordHash: 'x'.repeat(20) },
  ]);
}, 60000);

beforeEach(() => {
  callAI.mockReset();
  aiServiceMock.lastProviderInfo = { provider: 'groq', model: 'llama-test' };
  _resetCounters();
  semantic._resetSemanticState();
  catalogSemantic._resetCatalogState();
  // The mood vector's only fetch (the local query embedder) — a fixed 3-dim
  // answer so it blends with the 3-dim vectors the shortlist tests plant.
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ embeddings: [[0.5, 0.5, 0.5]] }),
      text: async () => '',
    })
  );
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await Book.deleteMany({});
  await BookVector.deleteMany({});
});

afterAll(async () => {
  await User.deleteMany({ username: { $in: ['alice-r117', 'bob-r117'] } });
  await Book.db.close();
  await User.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ---------------------------------------------------------------------------

describe('bookgeek library assistant — authentication', () => {
  test('both queries reject an unauthenticated caller before anything else', async () => {
    await expect(Q.whatNext(null, { limit: 5 }, ctx(null))).rejects.toThrow('Unauthorized');
    await expect(Q.draftBookMetadata(null, { bookId: 'x' }, ctx(null))).rejects.toThrow('Unauthorized');
    await expect(Q.whatNext(null, { limit: 5 }, {})).rejects.toThrow('Unauthorized');
    expect(callAI).not.toHaveBeenCalled();
  });
});

describe('whatNext — the candidate set is computed, not asked', () => {
  test('only in-the-library, not-finished books are offered to the model', async () => {
    await setOptIn(ALICE, true);
    const [unread, reading, finished, abandoned, ghost, readCounted] = await Book.create([
      bookRow({ title: 'Unread One', dateAdded: new Date('2026-05-01') }), // newest → the "c1" label
      bookRow({ title: 'Reading One', shelf: 'reading' }),
      bookRow({ title: 'Finished One', shelf: 'read', dateFinished: new Date('2026-02-02'), readCount: 1 }),
      bookRow({ title: 'Abandoned One', shelf: 'abandoned' }),
      // Neither owned nor shelved: library noise, not a candidate.
      bookRow({ title: 'Ghost', owned: false, shelf: '' }),
      // Finished without ever being moved off "unread" — readCount is the tell.
      bookRow({ title: 'Secretly Finished', readCount: 2 }),
    ]);

    // The model sees only short labels — "c1" is the first candidate.
    modelSays({ picks: [{ bookId: 'c1', why: 'You have had it waiting a while.' }] });
    const res = await Q.whatNext(null, { limit: 5 }, ctx(ALICE));

    expect(res.provenance.source).toBe('model');
    // The model returned one pick; the shelf tops up to limit from the
    // deterministic ranking — only two candidates exist, so two picks.
    expect(res.picks).toHaveLength(2);
    expect(res.picks[0]).toMatchObject({
      bookId: String(unread._id),
      why: 'You have had it waiting a while.',
    });
    // The pick carries its book so the shelf is one round trip.
    expect(res.picks[0].book.title).toBe('Unread One');
    expect(res.picks[1]).toMatchObject({ bookId: String(reading._id) });

    const sent = JSON.parse(callAI.mock.calls[0][1].messages[1].content);
    expect(sent.candidates.map((c) => c.id)).toEqual(['c1', 'c2']);
    const offered = sent.candidates.map((c) => c.title).sort();
    expect(offered).toEqual(['Reading One', 'Unread One']);
    for (const excluded of [finished, abandoned, ghost, readCounted]) {
      expect(sent.candidates.some((c) => c.id === String(excluded._id))).toBe(false);
    }
    expect(reading).toBeDefined();
  });

  test('the model sees titles, authors, tags, pages, shelf and dates — and nothing else', async () => {
    await setOptIn(ALICE, true);
    await Book.create(
      bookRow({
        title: 'Lock In',
        authors: ['John Scalzi'],
        tags: ['science fiction'],
        pageCount: 336,
        review: 'MY PRIVATE REVIEW',
        readingProgress: 42,
        rating: 4,
      })
    );
    await Book.create(
      bookRow({
        title: 'Old Man War',
        authors: ['John Scalzi'],
        shelf: 'read',
        rating: 5,
        dateFinished: new Date('2026-03-03'),
      })
    );

    modelSays({ picks: [] });
    await Q.whatNext(null, { limit: 5 }, ctx(ALICE));

    const raw = callAI.mock.calls[0][1].messages[1].content;
    expect(raw).not.toContain('MY PRIVATE REVIEW');
    expect(raw).not.toContain('readingProgress');
    const sent = JSON.parse(raw);
    expect(sent.candidates[0]).toEqual({
      id: expect.any(String),
      title: 'Lock In',
      authors: ['John Scalzi'],
      tags: ['science fiction'],
      pages: 336,
      shelf: 'unread',
      added: '2026-01-01',
    });
    expect(sent.recentlyFinished).toEqual([
      { title: 'Old Man War', authors: ['John Scalzi'], rating: 5 },
    ]);
    expect(sent.limit).toBe(5);
  });

  test('the candidate set is capped at 60, most recently added first', async () => {
    await setOptIn(ALICE, true);
    const rows = [];
    for (let i = 0; i < 70; i += 1) {
      rows.push(bookRow({ title: `Book ${ i }`, dateAdded: new Date(2026, 0, 1 + i) }));
    }
    await Book.create(rows);

    modelSays({ picks: [] });
    await Q.whatNext(null, { limit: 5 }, ctx(ALICE));

    const sent = JSON.parse(callAI.mock.calls[0][1].messages[1].content);
    expect(sent.candidates).toHaveLength(library.MAX_CANDIDATES);
    expect(sent.candidates[0].title).toBe('Book 69');
    expect(sent.candidates.some((c) => c.title === 'Book 0')).toBe(false);
  });

  test('an id the model was never given is rejected — the fallback answers instead', async () => {
    await setOptIn(ALICE, true);
    await Book.create(bookRow({ title: 'Real Book' }));

    modelSays({ picks: [{ bookId: String(new mongoose.Types.ObjectId()), why: 'invented' }] });
    const res = await Q.whatNext(null, { limit: 5 }, ctx(ALICE));

    expect(res.provenance).toMatchObject({ source: 'fallback', reason: 'invalid' });
    expect(res.picks).toHaveLength(1);
    expect(res.picks[0].why).toMatch(/recent additions/i);
  });

  test('the salvage keeps what maps and counts what it drops', () => {
    const map = new Map([['c1', 'REAL1'], ['c2', 'REAL2'], ['c3', 'REAL3']]);
    const salv = salvagePicks({
      picks: [
        { bookId: 'c1', why: 'a' },
        { bookId: 'nope', why: 'x' },       // unknown
        { bookId: 'c1', why: 'dup' },       // duplicate
        { bookId: 'c2', why: 42 },          // non-string why → null
        { bookId: 'c3', why: 'b' },         // over the limit of 2
      ],
    }, map, 'bookId', 2);
    expect(salv.picks).toEqual([{ id: 'REAL1', why: 'a' }, { id: 'REAL2', why: null }]);
    expect(salv.stats).toMatchObject({ returned: 5, kept: 2, unknownIds: 1, duplicates: 1, overLimit: 1 });
    // Nothing salvageable → the caller falls back, exactly like before.
    expect(salvagePicks({ picks: [{ bookId: 'zzz', why: 'x' }] }, map, 'bookId', 5).picks).toEqual([]);
    expect(salvagePicks({ picks: 'nope' }, map, 'bookId', 5).picks).toEqual([]);
  });

  test('one bad id among good ones: the good picks survive, the fallback tops up', async () => {
    await setOptIn(ALICE, true);
    const rows = [];
    for (let i = 0; i < 5; i += 1) rows.push(bookRow({ title: `Shelf Book ${ i }` }));
    await Book.create(rows);

    modelSays({ picks: [{ bookId: 'c1', why: 'kept one' }, { bookId: 'bogus', why: 'lost' }, { bookId: 'c2', why: 'kept two' }] });
    const res = await Q.whatNext(null, { limit: 5 }, ctx(ALICE));

    expect(res.provenance.source).toBe('model');
    expect(res.picks).toHaveLength(5);
    expect(res.picks[0].why).toBe('kept one');
    expect(res.picks[1].why).toBe('kept two');
    // The three top-ups are the deterministic ranking's own picks — real
    // ObjectIds, real fallback reasons, never the model's garbage.
    for (const pick of res.picks.slice(2)) {
      expect(pick.bookId).toMatch(/^[0-9a-f]{24}$/);
      expect(pick.why).toBeTruthy();
      expect(pick.book).toBeTruthy();
    }
  });
});

describe('whatNext — the deterministic fallback', () => {
  test('opt-in off: no model call, still a useful shelf', async () => {
    await setOptIn(ALICE, false);
    await Book.create([
      bookRow({ title: 'Dune Messiah', authors: ['Frank Herbert'], dateAdded: new Date('2026-01-01') }),
      bookRow({ title: 'Newest Thing', authors: ['Nobody At All'], dateAdded: new Date('2026-06-01') }),
      bookRow({
        title: 'Dune',
        authors: ['Frank Herbert'],
        shelf: 'read',
        rating: 5,
        dateFinished: new Date('2026-05-05'),
      }),
    ]);

    const res = await Q.whatNext(null, { limit: 5 }, ctx(ALICE));

    expect(callAI).not.toHaveBeenCalled();
    expect(res.provenance).toMatchObject({ source: 'fallback', reason: 'disabled', model: null });
    // Highest-rated author you have not finished first, then most recently added.
    expect(res.picks.map((p) => p.why)).toEqual([
      'You rated Frank Herbert 5 on average.',
      'One of the most recent additions to your library.',
    ]);
  });

  test('a user who never opted in is off — the setting is not inherited', async () => {
    await Book.create(bookRow({ title: 'Anything' }));
    const res = await Q.whatNext(null, { limit: 5 }, ctx(BOB));
    expect(callAI).not.toHaveBeenCalled();
    expect(res.provenance.reason).toBe('disabled');
  });

  test('an unreachable model settles on the same ranking', async () => {
    await setOptIn(ALICE, true);
    await Book.create(bookRow({ title: 'Anything' }));
    callAI.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await Q.whatNext(null, { limit: 5 }, ctx(ALICE));
    expect(res.provenance).toMatchObject({ source: 'fallback', reason: 'unavailable' });
    expect(res.picks).toHaveLength(1);
  });

  test('an empty library is an empty shelf, not a model call', async () => {
    await setOptIn(ALICE, true);
    const res = await Q.whatNext(null, { limit: 5 }, ctx(ALICE));
    expect(callAI).not.toHaveBeenCalled();
    expect(res.picks).toEqual([]);
    expect(res.provenance).toMatchObject({ source: 'fallback', reason: 'no_candidates' });
  });

  test('limit is clamped, never rejected, and never exceeded', async () => {
    await setOptIn(ALICE, false);
    await Book.create([
      bookRow({ title: 'A' }),
      bookRow({ title: 'B' }),
      bookRow({ title: 'C' }),
    ]);
    expect((await Q.whatNext(null, { limit: 2 }, ctx(ALICE))).picks).toHaveLength(2);
    expect((await Q.whatNext(null, { limit: 20 }, ctx(ALICE))).picks).toHaveLength(3);
    await expect(Q.whatNext(null, { limit: 0 }, ctx(ALICE))).rejects.toThrow('Invalid input');
    await expect(Q.whatNext(null, { limit: 5, rogue: true }, ctx(ALICE))).rejects.toThrow('Invalid input');
  });
});

describe('draftBookMetadata', () => {
  test('a missing or malformed id is "Book not found", never a CastError', async () => {
    await expect(Q.draftBookMetadata(null, { bookId: 'not-an-id' }, ctx(ALICE))).rejects.toThrow('Book not found');
    await expect(
      Q.draftBookMetadata(null, { bookId: String(new mongoose.Types.ObjectId()) }, ctx(ALICE))
    ).rejects.toThrow('Book not found');
  });

  test('opt-in off: an empty description and the author\'s own tags', async () => {
    await setOptIn(ALICE, false);
    const [target] = await Book.create([
      bookRow({ title: 'Untagged Scalzi', authors: ['John Scalzi'], tags: [] }),
      bookRow({ title: 'Lock In', authors: ['John Scalzi'], tags: ['science fiction', 'mystery'] }),
      bookRow({ title: 'Redshirts', authors: ['John Scalzi'], tags: ['science fiction'] }),
      bookRow({ title: 'Unrelated', authors: ['Someone Else'], tags: ['history'] }),
    ]);

    const res = await Q.draftBookMetadata(null, { bookId: String(target._id) }, ctx(ALICE));

    expect(callAI).not.toHaveBeenCalled();
    expect(res.description).toBe('');
    expect(res.tags).toEqual(['science fiction', 'mystery']);
    expect(res.provenance).toMatchObject({ source: 'fallback', reason: 'disabled' });
  });

  test('the model sees one book plus the library\'s tag names, and drafts from them', async () => {
    await setOptIn(ALICE, true);
    const [target] = await Book.create([
      bookRow({
        title: 'Lock In',
        authors: ['John Scalzi'],
        publisher: 'Tor Books',
        publishedDate: new Date('2014-08-26'),
        review: 'MY PRIVATE REVIEW',
      }),
      bookRow({ title: 'Other', tags: ['science fiction', 'mystery'] }),
    ]);

    modelSays({ description: 'A near-future thriller about a virus.', tags: ['science fiction', 'near-future'] });
    const res = await Q.draftBookMetadata(null, { bookId: String(target._id) }, ctx(ALICE));

    const raw = callAI.mock.calls[0][1].messages[1].content;
    expect(raw).not.toContain('MY PRIVATE REVIEW');
    expect(JSON.parse(raw)).toEqual({
      title: 'Lock In',
      authors: ['John Scalzi'],
      publisher: 'Tor Books',
      year: '2014',
      libraryTags: ['mystery', 'science fiction'],
    });
    expect(res.description).toBe('A near-future thriller about a virus.');
    expect(res.tags).toEqual(['science fiction', 'near-future']);
    expect(res.provenance).toMatchObject({ source: 'model', model: 'llama-test', provider: 'groq' });
  });

  test('no more than two coined tags — a third settles on the fallback', async () => {
    await setOptIn(ALICE, true);
    const [target] = await Book.create([
      bookRow({ title: 'Lock In', authors: ['John Scalzi'] }),
      bookRow({ title: 'Other Scalzi', authors: ['John Scalzi'], tags: ['science fiction'] }),
    ]);

    modelSays({ description: 'x', tags: ['brand-new-one', 'brand-new-two', 'brand-new-three'] });
    const res = await Q.draftBookMetadata(null, { bookId: String(target._id) }, ctx(ALICE));

    expect(res.provenance).toMatchObject({ source: 'fallback', reason: 'invalid' });
    expect(res.tags).toEqual(['science fiction']);
    expect(res.description).toBe('');
  });

  test('validateMetadataDraft: shape, ceilings and the coined-tag budget', () => {
    const known = new Set(['science fiction', 'mystery']);
    const ok = { description: 'fine', tags: ['science fiction', 'new-a', 'new-b'] };
    expect(library.validateMetadataDraft(ok, known)).toBe(true);
    expect(library.validateMetadataDraft({ ...ok, tags: [...ok.tags, 'new-c'] }, known)).toBe(false);
    expect(library.validateMetadataDraft({ description: 1, tags: [] }, known)).toBe(false);
    expect(library.validateMetadataDraft({ description: '', tags: ['  '] }, known)).toBe(false);
    expect(
      library.validateMetadataDraft({ description: 'x'.repeat(library.MAX_DESCRIPTION_CHARS + 1), tags: [] }, known)
    ).toBe(false);
    expect(library.validateMetadataDraft({ description: '', tags: new Array(9).fill('mystery') }, known)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WHAT_NEXT_SPEC: the vector shortlist path + the mood box
// ---------------------------------------------------------------------------

const mkBVec = (itemId, vector) =>
  BookVector.create({ itemId, model: embeddingsConfig().model, hash: 'h', vector, indexedAt: new Date() });

describe('whatNext — the vector shortlist path (WHAT_NEXT_SPEC)', () => {
  /** One loved finished book + two candidates, with planted 3-dim vectors. */
  async function plant() {
    const [loved, c1, c2] = await Book.create([
      bookRow({ title: 'Loved Space Book', shelf: 'read', rating: 5, readCount: 1, dateFinished: new Date('2026-03-01') }),
      bookRow({ title: 'Unread One', description: 'never sent' }),
      bookRow({ title: 'Unread Two' }),
    ]);
    await Promise.all([
      mkBVec(loved._id, [1, 0, 0]),
      mkBVec(c1._id, [0.9, 0.1, 0]),
      mkBVec(c2._id, [0.2, 0.9, 0]),
    ]);
    return { loved, c1, c2 };
  }

  test('shortlisted candidates carry mood and the loved book they resemble ("because")', async () => {
    await setOptIn(ALICE, true);
    const { c1 } = await plant();
    modelSays({ picks: [{ bookId: 'c1', why: 'A match.' }] });
    const res = await Q.whatNext(null, { limit: 5, mood: 'something cozy' }, ctx(ALICE));

    const sent = JSON.parse(callAI.mock.calls[0][1].messages[1].content);
    expect(sent.mood).toBe('something cozy');
    expect(sent.candidates.length).toBeLessThanOrEqual(20);
    expect(sent.candidates[0]).toMatchObject({ title: 'Unread One', because: 'Loved Space Book' });
    expect(res.picks[0]).toMatchObject({ bookId: String(c1._id), why: 'A match.' });
  });

  test('shortlist disabled → fallback is the shortlist order with "because you loved" reasons', async () => {
    await setOptIn(ALICE, false);
    const { c1 } = await plant();
    const res = await Q.whatNext(null, { limit: 5 }, ctx(ALICE));
    expect(callAI).not.toHaveBeenCalled();
    expect(res.provenance.reason).toBe('disabled');
    expect(res.picks[0]).toMatchObject({ bookId: String(c1._id), why: 'Because you loved Loved Space Book.' });
  });

  test('no vectors → the legacy path: every candidate, no "because" key', async () => {
    await setOptIn(ALICE, true);
    await Book.create(bookRow({ title: 'Plain Unread' }));
    modelSays({ picks: [] });
    await Q.whatNext(null, { limit: 5 }, ctx(ALICE));
    const sent = JSON.parse(callAI.mock.calls[0][1].messages[1].content);
    expect(sent.candidates).toHaveLength(1);
    expect('because' in sent.candidates[0]).toBe(false);
  });
});

describe('the assistant never writes', () => {
  test('a whatNext and a draft leave every book byte-identical', async () => {
    await setOptIn(ALICE, true);
    const [target] = await Book.create([
      bookRow({ title: 'Lock In', authors: ['John Scalzi'] }),
      bookRow({ title: 'Other', tags: ['science fiction'] }),
    ]);
    const before = await Book.find({}).sort({ title: 1 }).lean();

    modelSays({ picks: [] });
    await Q.whatNext(null, { limit: 5 }, ctx(ALICE));
    modelSays({ description: 'A description the server must not save.', tags: ['science fiction'] });
    await Q.draftBookMetadata(null, { bookId: String(target._id) }, ctx(ALICE));

    const after = await Book.find({}).sort({ title: 1 }).lean();
    expect(after).toEqual(before);
  });
});

describe('the daily cap is shared by both queries', () => {
  test('the two features draw on one counter', async () => {
    await setOptIn(ALICE, true);
    const [target] = await Book.create([bookRow({ title: 'Lock In', authors: ['John Scalzi'] })]);

    // Burn the cap with drafts, then prove whatNext is capped too.
    modelSays({ description: 'ok', tags: [] });
    for (let i = 0; i < library.LIBRARY_DAILY_CAP; i += 1) {
      await Q.draftBookMetadata(null, { bookId: String(target._id) }, ctx(ALICE));
    }
    const capped = await Q.whatNext(null, { limit: 5 }, ctx(ALICE));
    expect(capped.provenance).toMatchObject({ source: 'fallback', reason: 'cap', cap: library.LIBRARY_DAILY_CAP });
    expect(capped.picks).toHaveLength(1);
  });
});
