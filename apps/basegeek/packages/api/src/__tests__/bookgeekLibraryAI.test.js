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

beforeAll(async () => {
  await Book.db.asPromise();
  await User.db.asPromise();
  await User.create([
    { _id: ALICE, username: 'alice-r117', passwordHash: 'x'.repeat(20) },
    { _id: BOB, username: 'bob-r117', passwordHash: 'x'.repeat(20) },
  ]);
}, 60000);

beforeEach(() => {
  callAI.mockReset();
  aiServiceMock.lastProviderInfo = { provider: 'groq', model: 'llama-test' };
  _resetCounters();
});

afterEach(async () => {
  await Book.deleteMany({});
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
      bookRow({ title: 'Unread One' }),
      bookRow({ title: 'Reading One', shelf: 'reading' }),
      bookRow({ title: 'Finished One', shelf: 'read', dateFinished: new Date('2026-02-02'), readCount: 1 }),
      bookRow({ title: 'Abandoned One', shelf: 'abandoned' }),
      // Neither owned nor shelved: library noise, not a candidate.
      bookRow({ title: 'Ghost', owned: false, shelf: '' }),
      // Finished without ever being moved off "unread" — readCount is the tell.
      bookRow({ title: 'Secretly Finished', readCount: 2 }),
    ]);

    modelSays({ picks: [{ bookId: String(unread._id), why: 'You have had it waiting a while.' }] });
    const res = await Q.whatNext(null, { limit: 5 }, ctx(ALICE));

    expect(res.provenance.source).toBe('model');
    expect(res.picks).toHaveLength(1);
    expect(res.picks[0]).toMatchObject({
      bookId: String(unread._id),
      why: 'You have had it waiting a while.',
    });
    // The pick carries its book so the shelf is one round trip.
    expect(res.picks[0].book.title).toBe('Unread One');

    const sent = JSON.parse(callAI.mock.calls[0][1].messages[1].content);
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

  test('duplicate ids and over-long lists are rejected too', async () => {
    await setOptIn(ALICE, true);
    const book = await Book.create(bookRow({ title: 'Real Book' }));
    const id = String(book._id);
    const ids = new Set([id]);
    expect(library.validatePicks({ picks: [{ bookId: id, why: 'a' }, { bookId: id, why: 'b' }] }, ids, 5)).toBe(false);
    expect(library.validatePicks({ picks: [{ bookId: id, why: 'a' }] }, ids, 0)).toBe(false);
    expect(library.validatePicks({ picks: 'nope' }, ids, 5)).toBe(false);
    expect(library.validatePicks({ picks: [{ bookId: id, why: 'a' }] }, ids, 5)).toBe(true);
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
