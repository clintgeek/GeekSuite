/**
 * gamegeekFilters.test.js — GameFilterInput, gameFacets, saved filter JSON
 * and canonical genres on write (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md
 * §A5, §B1).
 *
 * Rules pinned here:
 *   - each facet's counts apply every active filter EXCEPT its own;
 *   - facets and filters are household-scoped: a second household's games
 *     and a GamePlayer row carrying another tenant are never counted;
 *   - played / favorite are the CALLER's (Bob's hours never make a game
 *     "played" for Alice);
 *   - tags match tags ∪ autoTags; tagMatch any|all applies to genres AND tags;
 *   - the old games args keep working; `filter` wins where both are given.
 */

import mongoose from 'mongoose';

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { GameProfile } = await import('../graphql/gamegeek/models/profile.js');
const { resolvers } = await import('../graphql/gamegeek/resolvers.js');

const { Query, Mutation } = resolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const CAROL = String(new mongoose.Types.ObjectId()); // the other household
const ctx = (id) => ({ user: { id } });
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const year = (y) => new Date(Date.UTC(y, 5, 1));

beforeAll(async () => {
  await Game.db.asPromise();
  await Promise.all([Game.init(), GamePlayer.init(), GameProfile.init()]);
}, 60000);

afterEach(async () => {
  await Promise.all([Game.deleteMany({}), GamePlayer.deleteMany({}), GameProfile.deleteMany({})]);
});

afterAll(async () => {
  await Game.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const copy = (platform, format, storefront) => ({ _id: new mongoose.Types.ObjectId(), platform, format, storefront });

/**
 * Household 'default' (Alice, Bob):
 *   title          genres               tags / autoTags                     copies (store)             year  ttb  enrichment  cover
 *   Hades          Action, RPG          Game Pass / Roguelike, Fantasy      pc epic                    2020  22   matched     yes
 *   Celeste        Platformer           — / Difficult, Pixel Art            pc gog, switch nintendo     2018  8    matched     yes
 *   Outer Wilds    Adventure, Puzzle    — / Open World, Sci-fi, Exploration pc epic, xbox subscription  2019  17   matched     no
 *   Hollow Knight  Action, Platformer   Metroidvania / Metroidvania, Diff.  pc gog                     2017  27   (null)      no
 *   Stardew Valley RPG, Simulation      — / Farming, Cozy, Pixel Art        pc steam                   2016  53   no-match    yes
 *   Untitled       —                    —                                   —                          —     —    ambiguous   no
 *   A Short Hike   Adventure            — / Cozy, Exploration               pc epic                    2019  2    matched     no
 * Household 'other-household': Hades II (epic, Action/RPG, Roguelike, 2024).
 *
 * Alice: Hades backlog 30h 3d ago ★ · Celeste finished 10h 60d ago · Outer Wilds playing 0h ·
 *        Stardew backlog 0h 10d ago ★ · Untitled wishlist · (no row: Hollow Knight, A Short Hike)
 * Bob:   Outer Wilds 100h 1d ago ★ · Hollow Knight 5h
 * Tenant leaks that must not count: Alice's row carrying the other household on Hollow
 * Knight (500h, ★, finished, 1d ago) and on Hades II; Carol's other-household rows.
 */
async function seed() {
  const hh = 'default';
  const base = { householdId: hh, developers: [], publishers: [], tags: [], autoTags: [], modes: ['single'], copies: [], createdAt: new Date(), updatedAt: new Date() };
  const rows = [
    { title: 'Hades', genres: ['Action', 'RPG'], tags: ['Game Pass'], autoTags: ['Roguelike', 'Fantasy'], copies: [copy('pc', 'digital', 'epic')], releaseDate: year(2020), timeToBeat: { main: 22 }, enrichment: { status: 'matched' }, coverPath: 'a.jpg' },
    { title: 'Celeste', genres: ['Platformer'], autoTags: ['Difficult', 'Pixel Art'], copies: [copy('pc', 'digital', 'gog'), copy('switch', 'physical', 'nintendo')], releaseDate: year(2018), timeToBeat: { main: 8 }, enrichment: { status: 'matched' }, coverPath: 'b.jpg' },
    { title: 'Outer Wilds', genres: ['Adventure', 'Puzzle'], autoTags: ['Open World', 'Sci-fi', 'Exploration'], copies: [copy('pc', 'digital', 'epic'), copy('xbox-series', 'subscription', 'xbox')], releaseDate: year(2019), timeToBeat: { main: 17 }, enrichment: { status: 'matched' }, coverPath: null },
    { title: 'Hollow Knight', genres: ['Action', 'Platformer'], tags: ['Metroidvania'], autoTags: ['Metroidvania', 'Difficult'], copies: [copy('pc', 'digital', 'gog')], releaseDate: year(2017), timeToBeat: { main: 27 }, enrichment: null },
    { title: 'Stardew Valley', genres: ['RPG', 'Simulation'], autoTags: ['Farming', 'Cozy', 'Pixel Art'], modes: ['single', 'coop-online'], copies: [copy('pc', 'digital', 'steam')], releaseDate: year(2016), timeToBeat: { main: 53 }, enrichment: { status: 'no-match' }, coverPath: 'c.jpg' },
    { title: 'Untitled', genres: [], modes: [], enrichment: { status: 'ambiguous' } },
    { title: 'A Short Hike', genres: ['Adventure'], autoTags: ['Cozy', 'Exploration'], copies: [copy('pc', 'digital', 'epic')], releaseDate: year(2019), timeToBeat: { main: 2 }, enrichment: { status: 'matched' } },
  ].map((r) => ({ ...base, sortTitle: r.title.toLowerCase(), owned: (r.copies ?? []).length > 0, ...r }));
  const { insertedIds } = await Game.collection.insertMany(rows);
  const id = Object.fromEntries(rows.map((r, i) => [r.title, insertedIds[i]]));

  const foreign = await Game.collection.insertOne({
    ...base,
    householdId: 'other-household',
    title: 'Hades II',
    sortTitle: 'hades ii',
    genres: ['Action', 'RPG'],
    tags: ['Roguelike'],
    autoTags: ['Roguelike'],
    copies: [copy('pc', 'digital', 'epic')],
    releaseDate: year(2024),
    timeToBeat: { main: 3 },
    enrichment: { status: 'matched' },
    coverPath: 'd.jpg',
  });

  const p = (userId, title, s, householdId = hh) => ({ householdId, userId, gameId: id[title] ?? title, hoursPlayed: 0, favorite: false, lastPlayedAt: null, shelf: null, ...s });
  await GamePlayer.collection.insertMany([
    p(ALICE, 'Hades', { shelf: 'backlog', hoursPlayed: 30, lastPlayedAt: daysAgo(3), favorite: true }),
    p(ALICE, 'Celeste', { shelf: 'finished', hoursPlayed: 10, lastPlayedAt: daysAgo(60) }),
    p(ALICE, 'Outer Wilds', { shelf: 'playing' }),
    p(ALICE, 'Stardew Valley', { shelf: 'backlog', lastPlayedAt: daysAgo(10), favorite: true }),
    p(ALICE, 'Untitled', { shelf: 'wishlist' }),
    p(BOB, 'Outer Wilds', { hoursPlayed: 100, lastPlayedAt: daysAgo(1), favorite: true }),
    p(BOB, 'Hollow Knight', { hoursPlayed: 5 }),
    // Tenant leaks: none of these may count for anyone in 'default'.
    p(ALICE, 'Hollow Knight', { hoursPlayed: 500, lastPlayedAt: daysAgo(1), favorite: true, shelf: 'finished' }, 'other-household'),
    { ...p(ALICE, 'x', { hoursPlayed: 99, favorite: true, shelf: 'playing' }, 'other-household'), gameId: foreign.insertedId },
    { ...p(CAROL, 'x', { hoursPlayed: 9, favorite: true, shelf: 'playing' }, 'other-household'), gameId: foreign.insertedId },
    p(CAROL, 'Hades', { hoursPlayed: 9, favorite: true, shelf: 'finished', lastPlayedAt: daysAgo(1) }, 'other-household'),
  ]);
  return id;
}

const facets = (filter, who = ALICE) => Query.gameFacets(null, filter === undefined ? {} : { filter }, ctx(who));
const counts = (list) => Object.fromEntries(list.map((v) => [v.value, v.count]));
const titles = async (args, who = ALICE) => {
  const page = await Query.games(null, { limit: 100, ...args }, ctx(who));
  return page.games.map((g) => g.title).sort();
};

describe('gameFacets — every facet, no filter', () => {
  beforeEach(seed);

  test('counts per facet, household-scoped, caller’s own played/favorite/shelves', async () => {
    const f = await facets();
    expect(f.total).toBe(7);
    expect(counts(f.storefronts)).toEqual({ epic: 3, gog: 2, nintendo: 1, xbox: 1, steam: 1 });
    expect(f.storefronts[0]).toEqual({ value: 'epic', count: 3 }); // count desc
    expect(counts(f.platforms)).toEqual({ pc: 6, switch: 1, 'xbox-series': 1 });
    expect(counts(f.formats)).toEqual({ digital: 6, physical: 1, subscription: 1 });
    expect(counts(f.genres)).toEqual({ Action: 2, RPG: 2, Platformer: 2, Adventure: 2, Puzzle: 1, Simulation: 1 });
    expect(counts(f.tags)).toEqual({
      'Game Pass': 1,
      Roguelike: 1,
      Fantasy: 1,
      Difficult: 2,
      'Pixel Art': 2,
      'Open World': 1,
      'Sci-fi': 1,
      Exploration: 2,
      Metroidvania: 1, // user tag + autoTag on one game counts once
      Farming: 1,
      Cozy: 2,
    });
    expect(counts(f.modes)).toEqual({ single: 6, 'coop-online': 1 });
    expect(f.played).toEqual([
      { value: 'never', count: 4 },
      { value: 'played', count: 3 },
      { value: 'recent', count: 2 },
    ]);
    expect(f.lengths).toEqual([
      { value: 'short', count: 1 },
      { value: 'medium', count: 1 },
      { value: 'long', count: 3 },
      { value: 'epic', count: 1 },
      { value: 'unknown', count: 1 },
    ]);
    expect(counts(f.metadata)).toEqual({ pending: 1, matched: 4, 'no-match': 1, ambiguous: 1, error: 0, unlinked: 0 });
    expect(f.releaseYears).toEqual([
      { year: 2016, count: 1 },
      { year: 2017, count: 1 },
      { year: 2018, count: 1 },
      { year: 2019, count: 2 },
      { year: 2020, count: 1 },
    ]);
    expect(f.favorites).toBe(2);
    expect(counts(f.shelves)).toEqual({ backlog: 2, finished: 1, playing: 1, wishlist: 1, unshelved: 2 });
  });

  test('household isolation: the other household’s game and tenant-crossing rows never count', async () => {
    const f = await facets();
    expect(f.releaseYears.map((y) => y.year)).not.toContain(2024);
    expect(counts(f.tags).Roguelike).toBe(1);
    expect(counts(f.storefronts).epic).toBe(3);
    // Alice's other-household row says Hollow Knight is a 500h finished favorite: not here.
    expect(counts(f.shelves).finished).toBe(1);
    expect(f.favorites).toBe(2);
    expect(await titles({ filter: { played: 'played' } })).toEqual(['Celeste', 'Hades', 'Stardew Valley']);
    expect(await titles({ filter: { favorite: true } })).toEqual(['Hades', 'Stardew Valley']);
    expect(await titles({ filter: { storefronts: ['epic'] } })).toEqual(['A Short Hike', 'Hades', 'Outer Wilds']);
    expect(counts(f.shelves).unshelved).toBe(2);
    expect(await titles({ filter: { played: 'never' } })).toContain('Hollow Knight');
    // Carol's rows all carry the other household; resolveHouseholdId answers
    // 'default' for every caller today, so she sees the 7 games and none of her state.
    const c = await facets({}, CAROL);
    expect(c.total).toBe(7);
    expect(c.favorites).toBe(0);
    expect(counts(c.shelves)).toEqual({ unshelved: 7 });
  });
});

describe('gameFacets — each facet excludes its own filter', () => {
  beforeEach(seed);

  test('storefront=epic: the store facet still lists every store; genres count only epic games', async () => {
    const f = await facets({ storefronts: ['epic'] });
    expect(f.total).toBe(3);
    expect(counts(f.storefronts)).toEqual({ epic: 3, gog: 2, nintendo: 1, xbox: 1, steam: 1 });
    expect(counts(f.genres)).toEqual({ Action: 1, RPG: 1, Adventure: 2, Puzzle: 1 });
    expect(counts(f.platforms)).toEqual({ pc: 3, 'xbox-series': 1 });
    expect(counts(f.tags)).toEqual({ 'Game Pass': 1, Roguelike: 1, Fantasy: 1, 'Open World': 1, 'Sci-fi': 1, Exploration: 2, Cozy: 1 });
    expect(f.favorites).toBe(1);
  });

  test('two filters: each facet drops only its own', async () => {
    const f = await facets({ storefronts: ['gog'], genres: ['Platformer'] });
    expect(f.total).toBe(2);
    // storefronts: filtered by genre only → the Platformer games' stores.
    expect(counts(f.storefronts)).toEqual({ gog: 2, nintendo: 1 });
    // genres: filtered by store only → the gog games' genres.
    expect(counts(f.genres)).toEqual({ Platformer: 2, Action: 1 });
  });

  test('played, lengths, years, metadata, shelves, favorites keep their own counts when selected', async () => {
    const none = await facets();
    const cases = [
      [{ played: 'recent' }, 'played', 2],
      [{ lengths: ['short', 'epic'] }, 'lengths', 2],
      [{ releaseYearMin: 2018, releaseYearMax: 2019 }, 'releaseYears', 3],
      [{ metadata: ['no-match', 'ambiguous'] }, 'metadata', 2],
      [{ shelves: ['unshelved', 'finished'] }, 'shelves', 3],
      [{ favorite: true }, 'favorites', 2],
    ];
    for (const [filter, facet, total] of cases) {
      const f = await facets(filter);
      expect(f.total).toBe(total);
      if (facet === 'shelves') expect(counts(f.shelves)).toEqual(counts(none.shelves));
      else expect(f[facet]).toEqual(none[facet]);
    }
  });

  test('a selected value with no games still appears, with 0', async () => {
    const f = await facets({ storefronts: ['luna'], tags: ['Cyberpunk'] });
    expect(f.total).toBe(0);
    expect(counts(f.storefronts).luna).toBe(0);
    expect(counts(f.tags).Cyberpunk).toBe(0);
  });
});

describe('filters on the games query', () => {
  beforeEach(seed);

  test('tagMatch any vs all over tags ∪ autoTags', async () => {
    expect(await titles({ filter: { tags: ['Difficult', 'Pixel Art'] } })).toEqual(['Celeste', 'Hollow Knight', 'Stardew Valley']);
    expect(await titles({ filter: { tags: ['Difficult', 'Pixel Art'], tagMatch: 'all' } })).toEqual(['Celeste']);
    expect(await titles({ filter: { tags: ['Game Pass'] } })).toEqual(['Hades']); // a user tag
    expect(await titles({ filter: { tags: ['Metroidvania'] } })).toEqual(['Hollow Knight']);
  });

  test('tagMatch applies to genres too', async () => {
    expect(await titles({ filter: { genres: ['Action', 'Platformer'] } })).toEqual(['Celeste', 'Hades', 'Hollow Knight']);
    expect(await titles({ filter: { genres: ['Action', 'Platformer'], tagMatch: 'all' } })).toEqual(['Hollow Knight']);
    expect(await titles({ filter: { genres: ['Platformer'], tags: ['Difficult', 'Metroidvania'], tagMatch: 'all' } })).toEqual(['Hollow Knight']);
  });

  test('played / favorite are per caller: Bob’s hours don’t make a game played for Alice', async () => {
    expect(await titles({ filter: { played: 'never' } })).toEqual(['A Short Hike', 'Hollow Knight', 'Outer Wilds', 'Untitled']);
    expect(await titles({ filter: { played: 'recent' } })).toEqual(['Hades', 'Stardew Valley']);
    expect(await titles({ filter: { played: 'played' } }, BOB)).toEqual(['Hollow Knight', 'Outer Wilds']);
    expect(await titles({ filter: { played: 'recent' } }, BOB)).toEqual(['Outer Wilds']);
    expect(await titles({ filter: { favorite: true } }, BOB)).toEqual(['Outer Wilds']);
    expect((await titles({ filter: { favorite: false } })).length).toBe(5);
    const bob = await facets(undefined, BOB);
    expect(bob.played).toEqual([
      { value: 'never', count: 5 },
      { value: 'played', count: 2 },
      { value: 'recent', count: 1 },
    ]);
    expect(bob.favorites).toBe(1);
    expect(counts(bob.shelves)).toEqual({ unshelved: 7 });
  });

  test('lengths buckets from timeToBeat.main', async () => {
    expect(await titles({ filter: { lengths: ['short'] } })).toEqual(['A Short Hike']);
    expect(await titles({ filter: { lengths: ['medium'] } })).toEqual(['Celeste']);
    expect(await titles({ filter: { lengths: ['long'] } })).toEqual(['Hades', 'Hollow Knight', 'Outer Wilds']);
    expect(await titles({ filter: { lengths: ['epic', 'unknown'] } })).toEqual(['Stardew Valley', 'Untitled']);
  });

  test('release year range, metadata (null enrichment is pending), hasCover, formats, modes, shelves', async () => {
    expect(await titles({ filter: { releaseYearMin: 2019 } })).toEqual(['A Short Hike', 'Hades', 'Outer Wilds']);
    expect(await titles({ filter: { releaseYearMax: 2017 } })).toEqual(['Hollow Knight', 'Stardew Valley']);
    expect(await titles({ filter: { metadata: ['pending'] } })).toEqual(['Hollow Knight']);
    expect(await titles({ filter: { hasCover: true } })).toEqual(['Celeste', 'Hades', 'Stardew Valley']);
    expect((await titles({ filter: { hasCover: false } })).length).toBe(4);
    expect(await titles({ filter: { formats: ['subscription'] } })).toEqual(['Outer Wilds']);
    expect(await titles({ filter: { modes: ['coop-online'] } })).toEqual(['Stardew Valley']);
    expect(await titles({ filter: { shelves: ['unshelved', 'finished'] } })).toEqual(['A Short Hike', 'Celeste', 'Hollow Knight']);
  });

  test('q searches autoTags too, and is a literal (regex characters escaped)', async () => {
    expect(await titles({ filter: { q: 'farming' } })).toEqual(['Stardew Valley']);
    expect(await titles({ filter: { q: '(.*' } })).toEqual([]);
    expect(await titles({ q: 'hike' })).toEqual(['A Short Hike']);
  });

  test('games.total agrees with gameFacets.total for the same filter', async () => {
    const filter = { storefronts: ['epic', 'gog'], played: 'never', tags: ['Difficult', 'Exploration'] };
    const page = await Query.games(null, { filter }, ctx(ALICE));
    expect(page.total).toBe((await facets(filter)).total);
    expect(page.total).toBe(3);
  });

  test('old args keep working; filter wins where both are given', async () => {
    expect(await titles({ platform: 'switch' })).toEqual(['Celeste']);
    expect(await titles({ shelf: 'backlog' })).toEqual(['Hades', 'Stardew Valley']);
    expect(await titles({ shelf: 'unshelved' })).toEqual(['A Short Hike', 'Hollow Knight']);
    expect(await titles({ owned: 'false' })).toEqual(['Untitled']);
    expect(await titles({ shelf: 'backlog', filter: { shelves: ['finished'] } })).toEqual(['Celeste']);
    expect(await titles({ platform: 'switch', filter: { platforms: ['xbox-series'] } })).toEqual(['Outer Wilds']);
    expect(await titles({ q: 'celeste', filter: {} })).toEqual(['Celeste']); // filter without q: q applies
    expect(await titles({ q: 'celeste', filter: { q: 'hades' } })).toEqual(['Hades']);
    expect(await titles({ owned: 'true', filter: { storefronts: ['epic'] } })).toEqual(['A Short Hike', 'Hades', 'Outer Wilds']);
  });

  test('Game.autoTags is exposed', async () => {
    const page = await Query.games(null, { filter: { q: 'Hades' } }, ctx(ALICE));
    expect(resolvers.Game.autoTags(page.games[0])).toEqual(['Roguelike', 'Fantasy']);
    expect(resolvers.Game.autoTags({})).toEqual([]);
  });
});

describe('filter validation', () => {
  const bad = async (filter) =>
    expect(Query.games(null, { filter }, ctx(ALICE))).rejects.toMatchObject({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });

  test('closed vocabularies, bounds, strictness', async () => {
    await bad({ played: 'sometimes' });
    await bad({ tagMatch: 'most' });
    await bad({ storefronts: ['nope'] });
    await bad({ platforms: ['amiga'] });
    await bad({ lengths: ['forever'] });
    await bad({ metadata: ['done'] });
    await bad({ shelves: ['not a shelf'] });
    await bad({ tags: ['x'.repeat(61)] });
    await bad({ tags: Array.from({ length: 51 }, (_, i) => `t${i}`) });
    await bad({ releaseYearMin: 2020, releaseYearMax: 2010 });
    await bad({ householdId: 'other-household' });
    await expect(Query.gameFacets(null, { filter: { formats: ['cartridge'] } }, ctx(ALICE))).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }),
    });
  });

  test('custom shelves, any tag string, and seed are accepted', async () => {
    await expect(Query.games(null, { filter: { shelves: ['custom-couch', 'unshelved'], tags: ['my very own tag'] }, seed: 5 }, ctx(ALICE))).resolves.toMatchObject({ total: 0 });
  });
});

describe('saved filters carry the whole filter', () => {
  test('JSON round-trip, validated with the same schema; old filters read null', async () => {
    const filter = { storefronts: ['epic'], tags: ['Cozy'], tagMatch: 'all', played: 'never', releaseYearMin: 2015, favorite: false };
    const p = await Mutation.saveGameFilter(null, { input: { name: 'Couch', sortBy: 'random', sortDir: 'desc', filter } }, ctx(ALICE));
    const saved = resolvers.GameProfile.savedFilters(p)[0];
    expect(resolvers.GameSavedFilter.filter(saved)).toEqual(filter);
    expect(saved).toMatchObject({ sortBy: 'random', sortDir: 'desc' });
    const fresh = await Query.gameProfile(null, {}, ctx(ALICE));
    expect(fresh.savedFilters[0].filter).toEqual(filter);

    await expect(
      Mutation.saveGameFilter(null, { input: { name: 'Bad', filter: { storefronts: ['nope'] } } }, ctx(ALICE))
    ).rejects.toMatchObject({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });

    const old = await Mutation.saveGameFilter(null, { input: { name: 'Old style', shelfFilter: 'backlog' } }, ctx(ALICE));
    const oldSaved = old.savedFilters.find((f) => f.name === 'Old style');
    expect(resolvers.GameSavedFilter.filter(oldSaved)).toBeNull();
    expect(oldSaved.shelfFilter).toBe('backlog');
  });
});

describe('canonical genres on write', () => {
  test('createGame, createGames and updateGame canonicalize and dedupe', async () => {
    const g = await Mutation.createGame(null, { input: { title: 'Disco', genres: ['Role-playing (RPG)', 'RPG', 'Point-and-click'] } }, ctx(ALICE));
    expect(g.genres).toEqual(['RPG', 'Point & Click']);
    const many = await Mutation.createGames(null, { inputs: [{ title: 'Portal', genres: ['Platform', 'Puzzle'] }] }, ctx(ALICE));
    expect(many[0].genres).toEqual(['Platformer', 'Puzzle']);
    const u = await Mutation.updateGame(null, { id: String(g._id), input: { genres: ['Simulator', 'Simulation', 'Sport'] } }, ctx(ALICE));
    expect(u.genres).toEqual(['Simulation', 'Sports']);
    expect((await Game.findById(g._id).lean()).genres).toEqual(['Simulation', 'Sports']);
  });
});
