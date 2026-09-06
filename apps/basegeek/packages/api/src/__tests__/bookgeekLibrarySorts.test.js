/**
 * bookgeekLibrarySorts.test.js
 *
 * Q60. `components/librarySort.js` offers eight library sorts; the gateway's
 * `books` resolver had cases for four of them and `default`ed the rest to
 * title — so "Page count ↑" returned an alphabetical list under a toolbar pill
 * that said "Page count ↑". bookgeek's own REST `/api/books` handled all eight
 * all along; the two drifted when the read moved to the gateway.
 *
 * These tests pin the four arms that were missing — dateFinished, pageCount,
 * publishedDate, owned — to the REST implementation's exact semantics
 * (`apps/bookgeek/api/src/server.js`): sort on the field in the requested
 * direction, then `title` ascending as a stable tiebreaker, with mongo's
 * default null placement. Matching REST matters more than a nicer ordering
 * that only one of the two would have.
 */

import mongoose from 'mongoose';

const { Book } = await import('../graphql/bookgeek/models/book.js');
const { resolvers } = await import('../graphql/bookgeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const ctx = { user: { id: String(ALICE) } };
const { Query } = resolvers;

const titlesFor = async (sort, sortDir = 'asc') => {
  const page = await Query.books(null, { sort, sortDir, limit: 100 }, ctx);
  return page.items.map((b) => b.title);
};

beforeAll(async () => {
  await Book.db.asPromise();
}, 60000);

afterEach(async () => {
  await Book.deleteMany({});
});

afterAll(async () => {
  await Book.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

/**
 * Four books whose field orders all differ from alphabetical order, so a
 * regression to `default: title` cannot accidentally pass.
 * Alphabetical: Anathem, Blindsight, Cryptonomicon, Dune.
 */
const seed = () =>
  Book.create([
    {
      title: 'Dune',
      authors: ['Frank Herbert'],
      dateFinished: new Date('2026-01-05'),
      pageCount: 412,
      publishedDate: new Date('1965-08-01'),
      owned: true,
    },
    {
      title: 'Cryptonomicon',
      authors: ['Neal Stephenson'],
      dateFinished: new Date('2026-02-05'),
      pageCount: 918,
      publishedDate: new Date('1999-05-01'),
      owned: false,
    },
    {
      title: 'Anathem',
      authors: ['Neal Stephenson'],
      dateFinished: new Date('2026-03-05'),
      pageCount: 981,
      publishedDate: new Date('2008-09-09'),
      owned: false,
    },
    {
      title: 'Blindsight',
      authors: ['Peter Watts'],
      dateFinished: new Date('2026-04-05'),
      pageCount: 384,
      publishedDate: new Date('2006-10-03'),
      owned: true,
    },
  ]);

describe('the four sorts that used to fall through to title', () => {
  beforeEach(seed);

  test('dateFinished orders by finish date, both directions', async () => {
    expect(await titlesFor('dateFinished')).toEqual([
      'Dune',
      'Cryptonomicon',
      'Anathem',
      'Blindsight',
    ]);
    expect(await titlesFor('dateFinished', 'desc')).toEqual([
      'Blindsight',
      'Anathem',
      'Cryptonomicon',
      'Dune',
    ]);
  });

  test('pageCount orders by length, both directions', async () => {
    expect(await titlesFor('pageCount')).toEqual([
      'Blindsight',
      'Dune',
      'Cryptonomicon',
      'Anathem',
    ]);
    expect(await titlesFor('pageCount', 'desc')).toEqual([
      'Anathem',
      'Cryptonomicon',
      'Dune',
      'Blindsight',
    ]);
  });

  test('publishedDate orders by publication, both directions', async () => {
    expect(await titlesFor('publishedDate')).toEqual([
      'Dune',
      'Cryptonomicon',
      'Blindsight',
      'Anathem',
    ]);
    expect(await titlesFor('publishedDate', 'desc')).toEqual([
      'Anathem',
      'Blindsight',
      'Cryptonomicon',
      'Dune',
    ]);
  });

  test('owned groups by ownership, title ascending inside each group', async () => {
    // `owned` is a boolean, so the tiebreaker is what makes this readable at
    // all — and it is `title: 1` in BOTH directions, exactly as REST has it.
    expect(await titlesFor('owned')).toEqual([
      'Anathem',
      'Cryptonomicon', // not owned
      'Blindsight',
      'Dune', // owned
    ]);
    expect(await titlesFor('owned', 'desc')).toEqual([
      'Blindsight',
      'Dune', // owned
      'Anathem',
      'Cryptonomicon', // not owned
    ]);
  });

  test('the sort key is case-insensitive, the way the REST route reads it', async () => {
    expect(await titlesFor('PAGECOUNT')).toEqual(await titlesFor('pageCount'));
  });

  test('an unknown sort still falls back to title', async () => {
    expect(await titlesFor('nonsense')).toEqual([
      'Anathem',
      'Blindsight',
      'Cryptonomicon',
      'Dune',
    ]);
  });
});

describe('the tiebreaker matches REST', () => {
  test('equal page counts break on title ascending, even sorting descending', async () => {
    await Book.create([
      { title: 'Zebra', pageCount: 300, shelf: 'unread' },
      { title: 'Aardvark', pageCount: 300, shelf: 'unread' },
    ]);
    expect(await titlesFor('pageCount', 'desc')).toEqual(['Aardvark', 'Zebra']);
  });
});
