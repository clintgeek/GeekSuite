/**
 * gamegeekValidation.test.js
 *
 * The closed vocabularies from @geeksuite/schemas/gamegeek/constants are
 * enforced at the gateway (platform, storefront, copy format, mode,
 * completion, source), bounds come from the same module, shelves must be a
 * built-in or a custom shelf that exists on the caller's profile, and bulk
 * create is capped and deduplicated per household.
 */

import mongoose from 'mongoose';

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { GameProfile } = await import('../graphql/gamegeek/models/profile.js');
const { resolvers } = await import('../graphql/gamegeek/resolvers.js');
const constants = (await import('@geeksuite/schemas/gamegeek/constants')).default;

const { Query, Mutation } = resolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const ctx = { user: { id: ALICE } };

const BAD_INPUT = { extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) };
const rejectsBadInput = (p) => expect(p).rejects.toMatchObject(BAD_INPUT);
const create = (input, shelf) => Mutation.createGame(null, { input, shelf }, ctx);

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

describe('enums', () => {
  test('copy platform, format and storefront are closed sets', async () => {
    await rejectsBadInput(create({ title: 'x', copies: [{ platform: 'dreamcast-9000' }] }));
    await rejectsBadInput(create({ title: 'x', copies: [{ platform: 'pc', format: 'cartridge-ish' }] }));
    await rejectsBadInput(create({ title: 'x', copies: [{ platform: 'pc', storefront: 'bobs-games' }] }));
    const ok = await create({
      title: 'Hades',
      copies: [{ platform: 'switch', format: 'physical', storefront: 'nintendo', acquiredAt: '2021-03-04T15:30:00Z' }],
    });
    expect(ok.owned).toBe(true);
    expect(ok.copies[0].acquiredAt.toISOString()).toBe('2021-03-04T00:00:00.000Z');
    expect(await Game.countDocuments({})).toBe(1);
  });

  test('modes, platformsAvailable and source are closed sets', async () => {
    await rejectsBadInput(create({ title: 'x', modes: ['battle-royale'] }));
    await rejectsBadInput(create({ title: 'x', platformsAvailable: ['toaster'] }));
    await rejectsBadInput(create({ title: 'x', source: 'scraped' }));
    const g = await create({ title: 'Overcooked', modes: ['coop-local', 'single'], source: 'igdb' });
    expect(g.modes).toEqual(['coop-local', 'single']);
    expect(g.source).toBe('igdb');
  });

  test('playthrough completion and session platform are closed sets', async () => {
    const g = await create({ title: 'Celeste' });
    const gameId = String(g._id);
    await rejectsBadInput(Mutation.saveGamePlaythrough(null, { gameId, input: { completion: '110%' } }, ctx));
    await rejectsBadInput(
      Mutation.logGameSession(null, { gameId, input: { playedOn: '2026-09-01', minutes: 10, platform: 'toaster' } }, ctx)
    );
    const ok = await Mutation.saveGamePlaythrough(
      null,
      { gameId, input: { completion: 'complete', startedAt: '1998-05-01', finishedAt: '1998-06-01T22:00:00Z' } },
      ctx
    );
    expect(ok.__me.playthroughs[0].completion).toBe('complete');
    expect(ok.__me.playthroughs[0].finishedAt.toISOString()).toBe('1998-06-01T00:00:00.000Z');
  });

  test('profile platforms and steamId', async () => {
    await rejectsBadInput(Mutation.saveGameProfile(null, { input: { platformsOwned: ['toaster'] } }, ctx));
    await rejectsBadInput(Mutation.saveGameProfile(null, { input: { defaultPlatform: 'toaster' } }, ctx));
    for (const steamId of ['123', 'abcdefghijklmnopq', '7656119800000000012', ' 7656119800000000 ']) {
      await rejectsBadInput(Mutation.saveGameProfile(null, { input: { steamId } }, ctx));
    }
    const p = await Mutation.saveGameProfile(
      null,
      { input: { platformsOwned: ['pc', 'switch', 'pc'], defaultPlatform: 'switch', steamId: '76561198000000001' } },
      ctx
    );
    expect(p).toMatchObject({ platformsOwned: ['pc', 'switch'], defaultPlatform: 'switch', steamId: '76561198000000001' });
    const cleared = await Mutation.saveGameProfile(null, { input: { steamId: '' } }, ctx);
    expect(cleared.steamId).toBeNull();
    expect(cleared.householdId).toBe('default');
  });

  test('gameVocabulary is the constants module', async () => {
    const v = await Query.gameVocabulary(null, {}, ctx);
    expect(v).toEqual({
      shelves: [...constants.BUILT_IN_SHELVES],
      platforms: [...constants.PLATFORMS],
      storefronts: [...constants.STOREFRONTS],
      copyFormats: [...constants.COPY_FORMATS],
      modes: [...constants.GAME_MODES],
      completionLevels: [...constants.COMPLETION_LEVELS],
    });
  });
});

describe('bounds and shape', () => {
  test('title: required, trimmed, bounded, never nullable on update', async () => {
    await rejectsBadInput(create({ title: '   ' }));
    await rejectsBadInput(create({ title: 'x'.repeat(constants.bounds.title.maxlength + 1) }));
    const g = await create({ title: '  The Legend of Zelda  ' });
    expect(g.title).toBe('The Legend of Zelda');
    expect(g.sortTitle).toBe('legend of zelda, the');
    await rejectsBadInput(Mutation.updateGame(null, { id: String(g._id), input: { title: null } }, ctx));
    const renamed = await Mutation.updateGame(null, { id: String(g._id), input: { title: 'A Link to the Past' } }, ctx);
    expect(renamed.sortTitle).toBe('link to the past, a');
  });

  test('lists are capped at bounds.listMax and items are trimmed', async () => {
    const tooMany = Array.from({ length: constants.bounds.listMax.max + 1 }, (_, i) => `t${i}`);
    await rejectsBadInput(create({ title: 'x', tags: tooMany }));
    await rejectsBadInput(create({ title: 'x', tags: ['x'.repeat(constants.bounds.tag.maxlength + 1)] }));
    const g = await create({ title: 'x', tags: ['  cozy ', 'Cozy', 'short'] });
    expect(g.tags).toEqual(['cozy', 'short']);
  });

  test('state bounds: rating 0..5 in halves, progress 0..100, hours ≥ 0', async () => {
    const gameId = String((await create({ title: 'x' }))._id);
    for (const input of [{ rating: 6 }, { rating: -1 }, { rating: 4.3 }, { progress: 101 }, { hoursPlayed: -1 }]) {
      await rejectsBadInput(Mutation.setGameState(null, { gameId, input }, ctx));
    }
    const ok = await Mutation.setGameState(null, { gameId, input: { rating: 4.5, progress: 100, hoursPlayed: 0 } }, ctx);
    expect(ok.__me).toMatchObject({ rating: 4.5, progress: 100, hoursPlayed: 0, hoursSource: 'manual' });
  });

  test('session minutes 1..1440, playedOn required and normalised to UTC midnight', async () => {
    const gameId = String((await create({ title: 'x' }))._id);
    for (const input of [
      { playedOn: '2026-09-01', minutes: 0 },
      { playedOn: '2026-09-01', minutes: 1441 },
      { playedOn: '2026-09-01', minutes: 1.5 },
      { playedOn: 'not a date', minutes: 30 },
      { minutes: 30 },
    ]) {
      await rejectsBadInput(Mutation.logGameSession(null, { gameId, input }, ctx));
    }
    const ok = await Mutation.logGameSession(null, { gameId, input: { playedOn: '2026-09-01T23:30:00Z', minutes: 30 } }, ctx);
    expect(ok.__me.sessions[0].playedOn.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  test('releaseDate is a historical calendar day', async () => {
    const g = await create({ title: 'Super Mario Bros.', releaseDate: '1985-09-13T12:00:00Z' });
    expect(g.releaseDate.toISOString()).toBe('1985-09-13T00:00:00.000Z');
    expect(resolvers.Game.releaseYear(g)).toBe(1985);
    await rejectsBadInput(create({ title: 'x', releaseDate: '0999-01-01' }));
  });

  test('parentId must be a game in the household; a game cannot be its own parent', async () => {
    const base = await create({ title: 'Hollow Knight' });
    await rejectsBadInput(create({ title: 'DLC', parentId: 'not-an-id' }));
    await rejectsBadInput(create({ title: 'DLC', parentId: String(new mongoose.Types.ObjectId()) }));
    const dlc = await create({ title: 'Godmaster', parentId: String(base._id) });
    expect(resolvers.Game.parentId(dlc)).toBe(String(base._id));
    await rejectsBadInput(Mutation.updateGame(null, { id: String(base._id), input: { parentId: String(base._id) } }, ctx));
  });

  test('update merges nested objects and replaces copies, keeping known copy ids', async () => {
    const g = await create({
      title: 'Hades',
      externalIds: { igdb: '1', steamAppId: '1145360' },
      copies: [{ platform: 'pc', storefront: 'steam' }],
    });
    const copyId = String(g.copies[0]._id);
    const u = await Mutation.updateGame(
      null,
      {
        id: String(g._id),
        input: {
          externalIds: { igdb: '2' },
          copies: [{ id: copyId, platform: 'pc', storefront: 'gog' }, { platform: 'switch' }],
        },
      },
      ctx
    );
    expect(u.externalIds).toMatchObject({ igdb: '2', steamAppId: '1145360' });
    expect(u.copies).toHaveLength(2);
    expect(String(u.copies[0]._id)).toBe(copyId);
    expect(u.copies[0].storefront).toBe('gog');
    const none = await Mutation.updateGame(null, { id: String(g._id), input: { copies: [] } }, ctx);
    expect(none.owned).toBe(false);
  });

  test('unknown keys are rejected everywhere (strict)', async () => {
    await rejectsBadInput(create({ title: 'x', coverPath: '/etc/passwd' }));
    await rejectsBadInput(create({ title: 'x', createdBy: 'someone' }));
    await rejectsBadInput(Query.games(null, { householdId: 'other' }, ctx));
  });
});

describe('shelves', () => {
  test('a shelf must be built-in or custom-<slug> on MY profile', async () => {
    await rejectsBadInput(create({ title: 'x' }, 'nonsense'));
    await rejectsBadInput(create({ title: 'x' }, 'custom-nope'));
    await rejectsBadInput(create({ title: 'x' }, 'Custom-Bad Slug'));
    const g = await create({ title: 'x' });
    await rejectsBadInput(Mutation.setGameState(null, { gameId: String(g._id), input: { shelf: 'custom-nope' } }, ctx));
    expect(g.__me.shelf).toBe('backlog');
    expect(await Game.countDocuments({})).toBe(1);
  });

  test('custom shelf lifecycle: add, use, count, remove clears my rows', async () => {
    const p = await Mutation.addGameShelf(null, { label: '  Couch   Co-op! ' }, ctx);
    expect(p.customShelves).toEqual([{ id: 'custom-couch-co-op', label: 'Couch Co-op!' }]);
    await expect(Mutation.addGameShelf(null, { label: 'couch co-op' }, ctx)).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: 'CONFLICT' }),
    });
    await rejectsBadInput(Mutation.addGameShelf(null, { label: '!!!' }, ctx));
    await rejectsBadInput(Mutation.addGameShelf(null, { label: 'x'.repeat(41) }, ctx));

    const g = await create({ title: 'Overcooked' }, 'custom-couch-co-op');
    const stats = await Query.gameShelves(null, {}, ctx);
    const counts = Object.fromEntries(stats.shelves.map((s) => [s.shelf, s.count]));
    expect(counts['custom-couch-co-op']).toBe(1);
    expect(stats.shelves.slice(0, constants.BUILT_IN_SHELVES.length).map((s) => s.shelf)).toEqual([
      ...constants.BUILT_IN_SHELVES,
    ]);

    await rejectsBadInput(Mutation.removeGameShelf(null, { id: 'backlog' }, ctx));
    const res = await Mutation.removeGameShelf(null, { id: 'custom-couch-co-op' }, ctx);
    expect(res).toEqual({ success: true, clearedGames: 1 });
    expect((await GamePlayer.findOne({ gameId: g._id })).shelf).toBeNull();
    expect((await Query.gameProfile(null, {}, ctx)).customShelves).toEqual([]);
    const after = await Query.gameShelves(null, {}, ctx);
    expect(after.unshelved).toBe(1);
  });

  test('shelf filter shape: built-in, custom, "unshelved"; anything else rejected', async () => {
    await rejectsBadInput(Query.games(null, { shelf: 'nonsense' }, ctx));
    await rejectsBadInput(Query.games(null, { platform: 'toaster' }, ctx));
    await rejectsBadInput(Query.games(null, { owned: 'maybe' }, ctx));
    expect((await Query.games(null, { shelf: 'custom-anything' }, ctx)).total).toBe(0);
  });
});

describe('saved filters', () => {
  test('save, update by id, delete; sort names are validated', async () => {
    await rejectsBadInput(Mutation.saveGameFilter(null, { input: { name: '   ' } }, ctx));
    await rejectsBadInput(Mutation.saveGameFilter(null, { input: { name: 'x', sortBy: 'pageCount' } }, ctx));
    const p1 = await Mutation.saveGameFilter(
      null,
      { input: { name: 'Couch', sortBy: 'lastPlayed', sortDir: 'desc', platformFilter: 'switch' } },
      ctx
    );
    expect(p1.savedFilters).toHaveLength(1);
    const { id } = p1.savedFilters[0];
    const p2 = await Mutation.saveGameFilter(null, { input: { id, name: 'Couch night', sortBy: 'rating' } }, ctx);
    expect(p2.savedFilters).toHaveLength(1);
    expect(p2.savedFilters[0]).toMatchObject({ id, name: 'Couch night', sortBy: 'rating' });
    const p3 = await Mutation.deleteGameFilter(null, { id }, ctx);
    expect(p3.savedFilters).toEqual([]);
  });
});

describe('createGames: capped at 200, deduplicated per household', () => {
  test('more than 200 is rejected and nothing is written', async () => {
    const inputs = Array.from({ length: 201 }, (_, i) => ({ title: `Game ${i}` }));
    await rejectsBadInput(Mutation.createGames(null, { inputs }, ctx));
    expect(await Game.countDocuments({})).toBe(0);
    const ok = await Mutation.createGames(null, { inputs: inputs.slice(0, 200) }, ctx);
    expect(ok).toHaveLength(200);
  });

  test('skips titles already in the household (case-insensitive, exact) and in-batch duplicates', async () => {
    await create({ title: 'Hades' });
    await Game.collection.insertOne({ householdId: 'other-household', title: 'Celeste', sortTitle: 'celeste' });
    const created = await Mutation.createGames(
      null,
      {
        inputs: [{ title: 'hades' }, { title: 'Hades II' }, { title: 'Celeste' }, { title: 'CELESTE' }, { title: 'H.des' }],
        shelf: 'wishlist',
      },
      ctx
    );
    // 'Celeste' in ANOTHER household does not block this one; 'H.des' is not a regex.
    expect(created.map((g) => g.title)).toEqual(['Hades II', 'Celeste', 'H.des']);
    expect(created.every((g) => g.__me.shelf === 'wishlist')).toBe(true);
    expect(await Game.countDocuments({ householdId: 'default' })).toBe(4);
    const again = await Mutation.createGames(null, { inputs: [{ title: 'HADES II' }] }, ctx);
    expect(again).toEqual([]);
  });

  test('an empty list is rejected', async () => {
    await rejectsBadInput(Mutation.createGames(null, { inputs: [] }, ctx));
  });
});
