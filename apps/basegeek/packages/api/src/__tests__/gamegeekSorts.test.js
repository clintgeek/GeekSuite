/**
 * gamegeekSorts.test.js
 *
 * Every sort the `games` query advertises gets an order-asserting test in
 * both directions — BookGeek once advertised four sorts that silently
 * `default`ed to title (bookgeekLibrarySorts.test.js). Rules pinned here:
 *   - rating / lastPlayed / hoursPlayed are the CALLER's GamePlayer values;
 *     another member's numbers never move the caller's order.
 *   - nulls sort LAST in both directions.
 *   - ties break on sortTitle ascending, then _id.
 *   - an unknown sort is a validation error, not a fallback to title.
 *
 * The fixture's orders all differ from alphabetical, so a regression to
 * "sort by title" cannot pass by accident.
 */

import mongoose from 'mongoose';

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { GameProfile } = await import('../graphql/gamegeek/models/profile.js');
const { resolvers } = await import('../graphql/gamegeek/resolvers.js');
const { GAME_SORTS } = await import('../graphql/gamegeek/validation.js');

const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (id) => ({ user: { id } });

const titles = async (sort, sortDir = 'asc', who = ALICE, extra = {}) => {
  const page = await resolvers.Query.games(null, { sort, sortDir, limit: 100, ...extra }, ctx(who));
  return page.games.map((g) => g.title);
};

const day = (s) => new Date(`${s}T00:00:00.000Z`);

beforeAll(async () => {
  await Game.db.asPromise();
  await Promise.all([Game.init(), GamePlayer.init()]);
}, 60000);

afterEach(async () => {
  // All three collections: a profile left here (addGameShelf creates one)
  // leaked into whichever gamegeek suite jest ran next.
  await Promise.all([Game.deleteMany({}), GamePlayer.deleteMany({}), GameProfile.deleteMany({})]);
});

afterAll(async () => {
  await Game.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

/**
 *                 sortTitle        created  released    Alice: rating lastPlayed hours   Bob: rating lastPlayed hours
 * Celeste         celeste          3rd      2018-01-25         4      09-02      10           1     09-20      1
 * Hades           hades            1st      2020-09-17         5      09-04      50           2     09-19      2
 * Outer Wilds     outer wilds      5th      2019-05-28         null   null       0            4     09-17      4
 * A Short Hike    short hike, a    2nd      2019-07-30         (no row)                       3     09-18      3
 * The Witness     witness, the     4th      2016-01-26         3      09-01      30           5     09-16      5
 */
async function seed() {
  const hh = 'default';
  const base = { householdId: hh, developers: [], publishers: [], genres: [], tags: [], modes: [], copies: [], owned: false };
  const rows = [
    { title: 'Celeste', sortTitle: 'celeste', createdAt: day('2026-01-03'), releaseDate: day('2018-01-25') },
    { title: 'Hades', sortTitle: 'hades', createdAt: day('2026-01-01'), releaseDate: day('2020-09-17') },
    { title: 'Outer Wilds', sortTitle: 'outer wilds', createdAt: day('2026-01-05'), releaseDate: day('2019-05-28') },
    { title: 'A Short Hike', sortTitle: 'short hike, a', createdAt: day('2026-01-02'), releaseDate: day('2019-07-30') },
    { title: 'The Witness', sortTitle: 'witness, the', createdAt: day('2026-01-04'), releaseDate: day('2016-01-26') },
  ];
  const { insertedIds } = await Game.collection.insertMany(rows.map((r) => ({ ...base, ...r, updatedAt: r.createdAt })));
  const id = Object.fromEntries(rows.map((r, i) => [r.title, insertedIds[i]]));
  const player = (userId, title, s) => ({ householdId: hh, userId, gameId: id[title], shelf: 'backlog', ...s });
  await GamePlayer.collection.insertMany([
    player(ALICE, 'Celeste', { rating: 4, lastPlayedAt: new Date('2026-09-02T20:00:00Z'), hoursPlayed: 10 }),
    player(ALICE, 'Hades', { rating: 5, lastPlayedAt: new Date('2026-09-04T20:00:00Z'), hoursPlayed: 50 }),
    player(ALICE, 'Outer Wilds', { rating: null, lastPlayedAt: null, hoursPlayed: 0 }),
    player(ALICE, 'The Witness', { rating: 3, lastPlayedAt: new Date('2026-09-01T20:00:00Z'), hoursPlayed: 30 }),
    player(BOB, 'Celeste', { rating: 1, lastPlayedAt: new Date('2026-09-20T20:00:00Z'), hoursPlayed: 1 }),
    player(BOB, 'Hades', { rating: 2, lastPlayedAt: new Date('2026-09-19T20:00:00Z'), hoursPlayed: 2 }),
    player(BOB, 'A Short Hike', { rating: 3, lastPlayedAt: new Date('2026-09-18T20:00:00Z'), hoursPlayed: 3 }),
    player(BOB, 'Outer Wilds', { rating: 4, lastPlayedAt: new Date('2026-09-17T20:00:00Z'), hoursPlayed: 4 }),
    player(BOB, 'The Witness', { rating: 5, lastPlayedAt: new Date('2026-09-16T20:00:00Z'), hoursPlayed: 5 }),
  ]);
  return id;
}

describe('every advertised sort orders for real', () => {
  beforeEach(seed);

  test('the advertised list is exactly the eight sorts tested in this file', () => {
    expect([...GAME_SORTS].sort()).toEqual([
      'dateAdded',
      'hoursPlayed',
      'lastPlayed',
      'random',
      'rating',
      'releaseDate',
      'timeToBeat',
      'title',
    ]);
  });

  test('title sorts by sortTitle (leading article moved), both directions', async () => {
    const asc = ['Celeste', 'Hades', 'Outer Wilds', 'A Short Hike', 'The Witness'];
    expect(await titles('title')).toEqual(asc);
    expect(await titles('title', 'desc')).toEqual([...asc].reverse());
  });

  test('dateAdded sorts by createdAt, both directions', async () => {
    const asc = ['Hades', 'A Short Hike', 'Celeste', 'The Witness', 'Outer Wilds'];
    expect(await titles('dateAdded')).toEqual(asc);
    expect(await titles('dateAdded', 'desc')).toEqual([...asc].reverse());
  });

  test('releaseDate sorts by release, both directions', async () => {
    const asc = ['The Witness', 'Celeste', 'Outer Wilds', 'A Short Hike', 'Hades'];
    expect(await titles('releaseDate')).toEqual(asc);
    expect(await titles('releaseDate', 'desc')).toEqual([...asc].reverse());
  });

  test('rating is the caller’s rating, nulls last both ways', async () => {
    expect(await titles('rating')).toEqual(['The Witness', 'Celeste', 'Hades', 'Outer Wilds', 'A Short Hike']);
    expect(await titles('rating', 'desc')).toEqual(['Hades', 'Celeste', 'The Witness', 'Outer Wilds', 'A Short Hike']);
    // Bob's ratings are a different order entirely — same data, his view.
    expect(await titles('rating', 'asc', BOB)).toEqual(['Celeste', 'Hades', 'A Short Hike', 'Outer Wilds', 'The Witness']);
    expect(await titles('rating', 'desc', BOB)).toEqual(['The Witness', 'Outer Wilds', 'A Short Hike', 'Hades', 'Celeste']);
  });

  test('lastPlayed is the caller’s lastPlayedAt, nulls last both ways', async () => {
    expect(await titles('lastPlayed')).toEqual(['The Witness', 'Celeste', 'Hades', 'Outer Wilds', 'A Short Hike']);
    expect(await titles('lastPlayed', 'desc')).toEqual(['Hades', 'Celeste', 'The Witness', 'Outer Wilds', 'A Short Hike']);
    expect(await titles('lastPlayed', 'desc', BOB)).toEqual(['Celeste', 'Hades', 'A Short Hike', 'Outer Wilds', 'The Witness']);
  });

  test('hoursPlayed is the caller’s hours; 0 is a value, no row is null (last)', async () => {
    expect(await titles('hoursPlayed')).toEqual(['Outer Wilds', 'Celeste', 'The Witness', 'Hades', 'A Short Hike']);
    expect(await titles('hoursPlayed', 'desc')).toEqual(['Hades', 'The Witness', 'Celeste', 'Outer Wilds', 'A Short Hike']);
    expect(await titles('hoursPlayed', 'asc', BOB)).toEqual(['Celeste', 'Hades', 'A Short Hike', 'Outer Wilds', 'The Witness']);
  });

  test('sortDir is case-insensitive', async () => {
    expect(await titles('releaseDate', 'DESC')).toEqual(await titles('releaseDate', 'desc'));
  });

  test('a user with no state at all: caller sorts are all-null, so title order both ways', async () => {
    const CAROL = String(new mongoose.Types.ObjectId());
    const alpha = ['Celeste', 'Hades', 'Outer Wilds', 'A Short Hike', 'The Witness'];
    for (const sort of ['rating', 'lastPlayed', 'hoursPlayed']) {
      expect(await titles(sort, 'asc', CAROL)).toEqual(alpha);
      expect(await titles(sort, 'desc', CAROL)).toEqual(alpha);
    }
  });

  test('pagination walks the sorted order', async () => {
    const p1 = await resolvers.Query.games(null, { sort: 'releaseDate', limit: 2, page: 1 }, ctx(ALICE));
    const p3 = await resolvers.Query.games(null, { sort: 'releaseDate', limit: 2, page: 3 }, ctx(ALICE));
    expect(p1.games.map((g) => g.title)).toEqual(['The Witness', 'Celeste']);
    expect(p3.games.map((g) => g.title)).toEqual(['Hades']);
    expect(p1).toMatchObject({ total: 5, page: 1, pages: 3 });
  });

  test('sort composes with a shelf filter', async () => {
    expect(await titles('hoursPlayed', 'desc', ALICE, { shelf: 'backlog' })).toEqual([
      'Hades',
      'The Witness',
      'Celeste',
      'Outer Wilds',
    ]);
    expect(await titles('title', 'asc', ALICE, { shelf: 'unshelved' })).toEqual(['A Short Hike']);
  });
});

describe('timeToBeat and random (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §B1)', () => {
  /** 12 games; timeToBeat.main in a non-alphabetical order, two with none. */
  async function seedMany() {
    const hh = 'default';
    const mains = [30, null, 2, 12, 50, 7, null, 1, 18, 4, 9, 25];
    const rows = mains.map((main, i) => ({
      householdId: hh,
      title: `Game ${String.fromCharCode(65 + i)}`,
      sortTitle: `game ${String.fromCharCode(97 + i)}`,
      copies: [],
      timeToBeat: { main, extra: null, complete: null },
      createdAt: new Date(),
    }));
    await Game.collection.insertMany(rows);
    return rows;
  }

  test('timeToBeat sorts by main hours, nulls last in both directions', async () => {
    const rows = await seedMany();
    const known = rows.filter((r) => r.timeToBeat.main != null);
    const byMain = [...known].sort((a, b) => a.timeToBeat.main - b.timeToBeat.main).map((r) => r.title);
    const nulls = ['Game B', 'Game G'];
    expect(await titles('timeToBeat')).toEqual([...byMain, ...nulls]);
    expect(await titles('timeToBeat', 'desc')).toEqual([...[...byMain].reverse(), ...nulls]);
  });

  test('random: same seed → the same order on every page; another seed → another order', async () => {
    await seedMany();
    const walk = async (seed) => {
      const out = [];
      for (let page = 1; page <= 3; page += 1) {
        const p = await resolvers.Query.games(null, { sort: 'random', seed, limit: 5, page }, ctx(ALICE));
        out.push(...p.games.map((g) => g.title));
      }
      return out;
    };
    const a = await walk(42);
    expect(a).toHaveLength(12);
    expect(new Set(a).size).toBe(12); // every game exactly once across the pages
    expect(await walk(42)).toEqual(a); // stable
    const alpha = (await titles('title')).slice();
    expect(a).not.toEqual(alpha);
    const b = await walk(7);
    expect(b).not.toEqual(a);
    expect([...b].sort()).toEqual([...a].sort());
    // No seed is seed 0: still deterministic.
    expect(await titles('random')).toEqual(await titles('random'));
  });
});

describe('ties and unknown sorts', () => {
  test('equal ratings break on sortTitle ascending in both directions', async () => {
    const hh = 'default';
    const { insertedIds } = await Game.collection.insertMany(
      ['Zelda', 'Metroid', 'Axiom Verge'].map((title) => ({
        householdId: hh,
        title,
        sortTitle: title.toLowerCase(),
        copies: [],
        createdAt: new Date(),
      }))
    );
    await GamePlayer.collection.insertMany(
      Object.values(insertedIds).map((gameId) => ({ householdId: hh, userId: ALICE, gameId, rating: 4 }))
    );
    expect(await titles('rating', 'asc')).toEqual(['Axiom Verge', 'Metroid', 'Zelda']);
    expect(await titles('rating', 'desc')).toEqual(['Axiom Verge', 'Metroid', 'Zelda']);
  });

  test('an unknown sort or direction is BAD_USER_INPUT, not a silent fallback', async () => {
    for (const args of [{ sort: 'pageCount' }, { sort: 'TITLE' }, { sortDir: 'sideways' }]) {
      await expect(resolvers.Query.games(null, args, ctx(ALICE))).rejects.toMatchObject({
        extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }),
      });
    }
  });

  test('limit clamps to 1..100', async () => {
    await seed();
    expect((await resolvers.Query.games(null, { limit: 0 }, ctx(ALICE))).games).toHaveLength(1);
    expect((await resolvers.Query.games(null, { limit: 1000 }, ctx(ALICE))).games).toHaveLength(5);
  });
});
