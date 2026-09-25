/**
 * gamegeekOwnership.test.js
 *
 * GameGeek is the first app built tenant-aware (DOCS/GameGeekPlan.md §2.1a):
 *   1. Every query and mutation requires a signed-in user.
 *   2. Every Game read/write is scoped by the caller's household. Today
 *      `resolveHouseholdId` always answers 'default', so the "other household"
 *      here is a Game inserted straight into Mongo with householdId
 *      'other-household' — the caller must not be able to see, count, search,
 *      edit, delete or attach state to it.
 *   3. Per-user state is per-user: B never sees A's `me`, but does see A in
 *      `household`.
 *   4. Malformed ids are "not found", never a CastError.
 */

import mongoose from 'mongoose';

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { GameProfile } = await import('../graphql/gamegeek/models/profile.js');
const { resolvers } = await import('../graphql/gamegeek/resolvers.js');
const { User } = await import('../models/user.js');

const { Query, Mutation } = resolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const CAROL = String(new mongoose.Types.ObjectId()); // lives in the other household
const ctx = (userId) => (userId ? { user: { id: userId } } : { user: null });

const create = (userId, input, shelf) => Mutation.createGame(null, { input, shelf }, ctx(userId));

beforeAll(async () => {
  await Game.db.asPromise();
  await Promise.all([Game.init(), GamePlayer.init(), GameProfile.init()]);
}, 60000);

// "Changes nothing" is measured against this test's own starting state, so
// start from empty collections even if another suite left rows behind.
beforeEach(async () => {
  await Promise.all([Game.deleteMany({}), GamePlayer.deleteMany({}), GameProfile.deleteMany({})]);
});

afterEach(async () => {
  await Promise.all([Game.deleteMany({}), GamePlayer.deleteMany({}), GameProfile.deleteMany({})]);
  await User.collection.deleteMany({ _id: { $in: [ALICE, BOB].map((id) => new mongoose.Types.ObjectId(id)) } });
});

afterAll(async () => {
  await Game.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('gamegeek — authentication required', () => {
  test('every query and every mutation rejects an unauthenticated caller and changes nothing', async () => {
    const g = await create(ALICE, { title: 'Hades' });
    const id = String(g._id);
    const queryCalls = {
      games: () => Query.games(null, {}, ctx(null)),
      game: () => Query.game(null, { id }, ctx(null)),
      gameShelves: () => Query.gameShelves(null, {}, ctx(null)),
      gameFacets: () => Query.gameFacets(null, {}, ctx(null)),
      gameProfile: () => Query.gameProfile(null, {}, ctx(null)),
      gameVocabulary: () => Query.gameVocabulary(null, {}, ctx(null)),
    };
    const mutationCalls = {
      createGame: () => Mutation.createGame(null, { input: { title: 'x' } }, ctx(null)),
      updateGame: () => Mutation.updateGame(null, { id, input: { title: 'pwned' } }, ctx(null)),
      deleteGame: () => Mutation.deleteGame(null, { id }, ctx(null)),
      setGameState: () => Mutation.setGameState(null, { gameId: id, input: { rating: 1 } }, ctx(null)),
      logGameSession: () =>
        Mutation.logGameSession(null, { gameId: id, input: { playedOn: '2026-09-01', minutes: 5 } }, ctx(null)),
      deleteGameSession: () => Mutation.deleteGameSession(null, { gameId: id, sessionId: id }, ctx(null)),
      saveGamePlaythrough: () => Mutation.saveGamePlaythrough(null, { gameId: id, input: {} }, ctx(null)),
      deleteGamePlaythrough: () => Mutation.deleteGamePlaythrough(null, { gameId: id, playthroughId: id }, ctx(null)),
      saveGameProfile: () => Mutation.saveGameProfile(null, { input: { defaultPlatform: null } }, ctx(null)),
      addGameShelf: () => Mutation.addGameShelf(null, { label: 'Couch' }, ctx(null)),
      removeGameShelf: () => Mutation.removeGameShelf(null, { id: 'custom-couch' }, ctx(null)),
      saveGameFilter: () => Mutation.saveGameFilter(null, { input: { name: 'x' } }, ctx(null)),
      deleteGameFilter: () => Mutation.deleteGameFilter(null, { id: 'x' }, ctx(null)),
    };
    // Completeness: a new resolver must be added here.
    expect(Object.keys(queryCalls).sort()).toEqual(Object.keys(Query).sort());
    expect(Object.keys(mutationCalls).sort()).toEqual(Object.keys(Mutation).sort());

    for (const call of [...Object.values(queryCalls), ...Object.values(mutationCalls)]) {
      await expect(call()).rejects.toThrow('Unauthorized');
    }
    // Even a garbage payload says Unauthorized, not BAD_USER_INPUT (auth runs first).
    await expect(Mutation.createGame(null, { input: { nope: 1 } }, {})).rejects.toThrow('Unauthorized');

    expect(await Game.countDocuments({})).toBe(1);
    expect((await Game.findById(id)).title).toBe('Hades');
    expect(await GameProfile.countDocuments({})).toBe(0);
    expect((await GamePlayer.findOne({ gameId: id })).rating).toBeNull();
  });
});

describe('gamegeek — a game in another household is invisible and untouchable', () => {
  let foreignId;
  let mine;

  beforeEach(async () => {
    mine = await create(ALICE, {
      title: 'Hades',
      tags: ['roguelike'],
      developers: ['Supergiant'],
      copies: [{ platform: 'pc', format: 'digital', storefront: 'steam' }],
    });
    const res = await Game.collection.insertOne({
      householdId: 'other-household',
      title: 'Hades II',
      sortTitle: 'hades ii',
      tags: ['roguelike'],
      developers: ['Supergiant'],
      copies: [{ _id: new mongoose.Types.ObjectId(), platform: 'switch', format: 'physical' }],
      owned: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    foreignId = String(res.insertedId);
    // The other household's member has state on BOTH games; neither may leak.
    await GamePlayer.collection.insertMany([
      { householdId: 'other-household', userId: CAROL, gameId: res.insertedId, shelf: 'playing', rating: 5 },
      { householdId: 'other-household', userId: CAROL, gameId: mine._id, shelf: 'finished', rating: 1 },
      // A row for Alice that somehow carries the other tenant must not count as hers.
      { householdId: 'other-household', userId: ALICE, gameId: res.insertedId, shelf: 'wishlist', rating: 2 },
    ]);
  });

  test('games: not listed, not counted, not searchable, not filterable', async () => {
    const all = await Query.games(null, {}, ctx(ALICE));
    expect(all.total).toBe(1);
    expect(all.games.map((g) => g.title)).toEqual(['Hades']);

    for (const args of [{ q: 'Hades' }, { q: 'Supergiant' }, { q: 'roguelike' }]) {
      const page = await Query.games(null, args, ctx(ALICE));
      expect(page.games.map((g) => g.title)).toEqual(['Hades']);
    }
    expect((await Query.games(null, { platform: 'switch' }, ctx(ALICE))).total).toBe(0);
    expect((await Query.games(null, { owned: 'true' }, ctx(ALICE))).games.map((g) => g.title)).toEqual(['Hades']);
    expect((await Query.games(null, { shelf: 'wishlist' }, ctx(ALICE))).total).toBe(0);
    expect((await Query.games(null, { shelf: 'unshelved' }, ctx(BOB))).games.map((g) => g.title)).toEqual(['Hades']);
  });

  test('game(id) is null for the foreign game', async () => {
    expect(await Query.game(null, { id: foreignId }, ctx(ALICE))).toBeNull();
    expect((await Query.game(null, { id: String(mine._id) }, ctx(ALICE))).title).toBe('Hades');
  });

  test('gameShelves counts only this household', async () => {
    const stats = await Query.gameShelves(null, {}, ctx(ALICE));
    expect(stats.total).toBe(1);
    expect(stats.owned).toBe(1);
    expect(stats.unshelved).toBe(0);
    expect(stats.platforms).toEqual([{ shelf: 'pc', count: 1 }]);
    const counts = Object.fromEntries(stats.shelves.map((s) => [s.shelf, s.count]));
    expect(counts.backlog).toBe(1);
    expect(counts.wishlist).toBe(0);
    expect(counts.playing).toBe(0);
  });

  test('updateGame, deleteGame and every state mutation refuse the foreign game and change nothing', async () => {
    const before = await Game.collection.findOne({ _id: new mongoose.Types.ObjectId(foreignId) });
    const notFound = { extensions: expect.objectContaining({ code: 'NOT_FOUND' }) };

    await expect(Mutation.updateGame(null, { id: foreignId, input: { title: 'pwned' } }, ctx(ALICE))).rejects.toMatchObject(
      notFound
    );
    expect(await Mutation.deleteGame(null, { id: foreignId }, ctx(ALICE))).toEqual({
      success: false,
      message: 'Game not found',
    });
    await expect(
      Mutation.setGameState(null, { gameId: foreignId, input: { rating: 4, shelf: 'playing' } }, ctx(BOB))
    ).rejects.toMatchObject(notFound);
    await expect(
      Mutation.logGameSession(null, { gameId: foreignId, input: { playedOn: '2026-09-01', minutes: 60 } }, ctx(BOB))
    ).rejects.toMatchObject(notFound);
    await expect(
      Mutation.saveGamePlaythrough(null, { gameId: foreignId, input: { completion: 'story' } }, ctx(BOB))
    ).rejects.toMatchObject(notFound);
    await expect(
      Mutation.deleteGameSession(null, { gameId: foreignId, sessionId: foreignId }, ctx(BOB))
    ).rejects.toMatchObject(notFound);
    await expect(
      Mutation.deleteGamePlaythrough(null, { gameId: foreignId, playthroughId: foreignId }, ctx(BOB))
    ).rejects.toMatchObject(notFound);

    const after = await Game.collection.findOne({ _id: new mongoose.Types.ObjectId(foreignId) });
    expect(after).toEqual(before);
    expect(await GamePlayer.countDocuments({ userId: BOB })).toBe(0);
    expect(await GamePlayer.countDocuments({ gameId: new mongoose.Types.ObjectId(foreignId) })).toBe(2);
  });

  test('deleting my game leaves the other household’s state rows alone', async () => {
    const res = await Mutation.deleteGame(null, { id: String(mine._id) }, ctx(ALICE));
    expect(res.success).toBe(true);
    expect(await GamePlayer.countDocuments({ gameId: mine._id, householdId: 'default' })).toBe(0);
    expect(await GamePlayer.countDocuments({ gameId: mine._id, householdId: 'other-household' })).toBe(1);
  });

  test('the household block never shows a member of another household', async () => {
    const game = await Query.game(null, { id: String(mine._id) }, ctx(BOB));
    const household = await resolvers.Game.household(game, {}, ctx(BOB));
    expect(household.map((h) => h.userId)).toEqual([ALICE]);
  });

  test('a householdId in the payload is rejected, never honoured', async () => {
    await expect(
      Mutation.createGame(null, { input: { title: 'Smuggled', householdId: 'other-household' } }, ctx(ALICE))
    ).rejects.toMatchObject({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });
    await expect(
      Mutation.setGameState(null, { gameId: String(mine._id), input: { householdId: 'x' } }, ctx(ALICE))
    ).rejects.toMatchObject({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });
    expect(await Game.countDocuments({ title: 'Smuggled' })).toBe(0);
  });
});

describe('gamegeek — per-user state stays per-user', () => {
  test('B does not see A’s `me`, but sees A in `household`', async () => {
    await User.collection.insertOne({
      _id: new mongoose.Types.ObjectId(ALICE),
      username: 'alice',
      profile: { displayName: 'Alice A.' },
    });
    const g = await create(ALICE, { title: 'Celeste' }, 'playing');
    await Mutation.setGameState(null, { gameId: String(g._id), input: { rating: 4.5, hoursPlayed: 12 } }, ctx(ALICE));

    const asBob = await Query.game(null, { id: String(g._id) }, ctx(BOB));
    expect(await resolvers.Game.me(asBob, {}, ctx(BOB))).toBeNull();
    const household = await resolvers.Game.household(asBob, {}, ctx(BOB));
    expect(household).toHaveLength(1);
    expect(household[0]).toMatchObject({ displayName: 'Alice A.', shelf: 'playing', rating: 4.5, hoursPlayed: 12 });
    expect(resolvers.GameHouseholdEntry.userId(household[0])).toBe(ALICE);

    // Bob's list view: `me` is null (from the aggregation, no second lookup).
    const bobPage = await Query.games(null, {}, ctx(BOB));
    expect(bobPage.games[0].__me).toBeNull();

    // Bob finishes it; Alice's row is untouched and Alice's household view sees Bob.
    await Mutation.setGameState(null, { gameId: String(g._id), input: { shelf: 'finished', rating: 2 } }, ctx(BOB));
    const asAlice = await Query.game(null, { id: String(g._id) }, ctx(ALICE));
    const aliceMe = await resolvers.Game.me(asAlice, {}, ctx(ALICE));
    expect(aliceMe).toMatchObject({ shelf: 'playing', rating: 4.5 });
    const aliceHousehold = await resolvers.Game.household(asAlice, {}, ctx(ALICE));
    expect(aliceHousehold.map((h) => [h.userId, h.shelf, h.rating, h.displayName])).toEqual([[BOB, 'finished', 2, null]]);
  });

  test('`me` batches: one request context, many games, correct row per game', async () => {
    const a = await create(ALICE, { title: 'A' }, 'playing');
    const b = await create(ALICE, { title: 'B' }, 'finished');
    const c = await create(BOB, { title: 'C' }, 'wishlist');
    const shared = ctx(ALICE);
    const bare = [a, b, c].map((g) => ({ _id: g._id })); // no __me: forces the loader
    const rows = await Promise.all(bare.map((g) => resolvers.Game.me(g, {}, shared)));
    expect(rows.map((r) => r?.shelf ?? null)).toEqual(['playing', 'finished', null]);
  });

  test('custom shelves and saved filters are the caller’s own', async () => {
    await Mutation.addGameShelf(null, { label: 'Couch Co-op' }, ctx(ALICE));
    const g = await create(ALICE, { title: 'Overcooked' }, 'custom-couch-co-op');
    await expect(create(BOB, { title: 'Overcooked 2' }, 'custom-couch-co-op')).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }),
    });
    await Mutation.saveGameFilter(null, { input: { name: 'Mine' } }, ctx(ALICE));

    const bobProfile = await Query.gameProfile(null, {}, ctx(BOB));
    expect(bobProfile.customShelves).toEqual([]);
    expect(bobProfile.savedFilters).toEqual([]);
    expect(bobProfile.householdId).toBe('default');

    // Bob removing "his" copy of the shelf id clears nothing of Alice's.
    const res = await Mutation.removeGameShelf(null, { id: 'custom-couch-co-op' }, ctx(BOB));
    expect(res).toEqual({ success: false, clearedGames: 0 });
    expect((await GamePlayer.findOne({ userId: ALICE, gameId: g._id })).shelf).toBe('custom-couch-co-op');
  });
});

describe('gamegeek — malformed ids are not found', () => {
  test('reads return null, deletes return success:false, writes say NOT_FOUND', async () => {
    for (const bad of ['nope', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz', '{"$gt":""}']) {
      expect(await Query.game(null, { id: bad }, ctx(ALICE))).toBeNull();
      expect((await Mutation.deleteGame(null, { id: bad }, ctx(ALICE))).success).toBe(false);
      await expect(Mutation.updateGame(null, { id: bad, input: { title: 'x' } }, ctx(ALICE))).rejects.toMatchObject({
        extensions: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
      await expect(Mutation.setGameState(null, { gameId: bad, input: {} }, ctx(ALICE))).rejects.toMatchObject({
        extensions: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    }
  });
});
