/**
 * gamegeekDeleteRestore.test.js — S-D1 (DOCS/SUITE_REVIEW_2026-11.md,
 * decisions 2026-11-15): delete stays household-wide but becomes recoverable.
 *   - deleteGame keeps a DeletedGame snapshot of the catalog row and EVERY
 *     member's GamePlayer row, and links its tombstones to it;
 *   - deletedGames lists snapshots plus the tombstones no snapshot covers
 *     (old deletes, copies removed by hand), household-scoped, newest first;
 *   - restoreDeletedGame puts the game back with the same id, its Playnite
 *     link and every member's state, and clears the tombstones; for a
 *     tombstone with no snapshot it only clears the tombstone.
 */

import mongoose from 'mongoose';

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { PlayniteTombstone, DeletedGame } = await import('../graphql/gamegeek/models/playniteTombstone.js');
const { resolvers } = await import('../graphql/gamegeek/resolvers.js');

const { Mutation, Query } = resolvers;
const CHEF = String(new mongoose.Types.ObjectId());
const HEATHER = String(new mongoose.Types.ObjectId());
const ctx = (id = CHEF) => ({ user: { id } });
const HH = 'default';

const pn = (playniteId, isInstalled = true) => ({
  playniteId, providerGameId: `prov-${playniteId}`, sourceName: 'Steam', playtimeSeconds: 0, hidden: false, isInstalled,
});
const pcCopy = (id) => ({ platform: 'pc', format: 'digital', storefront: 'steam', playnite: pn(id) });
const switchCopy = () => ({ platform: 'switch', format: 'physical', storefront: 'nintendo' });

beforeAll(async () => {
  await Game.db.asPromise();
  await Promise.all([Game.init(), GamePlayer.init(), PlayniteTombstone.init(), DeletedGame.init()]);
}, 60000);

afterEach(async () => {
  await Promise.all([
    Game.deleteMany({}),
    GamePlayer.deleteMany({}),
    PlayniteTombstone.deleteMany({ householdId: { $in: [HH, 'elsewhere'] } }),
    DeletedGame.deleteMany({}),
  ]);
});

afterAll(async () => {
  await Game.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

async function hadesWithTwoPlayers() {
  const game = await Game.create({ householdId: HH, title: 'Hades', tags: ['roguelike'], copies: [pcCopy('pid-1'), switchCopy()] });
  await GamePlayer.create({
    householdId: HH, userId: CHEF, gameId: game._id, shelf: 'finished', rating: 5, notes: 'chef notes', review: 'great',
    sessions: [{ playedOn: new Date('2026-01-02T00:00:00Z'), minutes: 60 }],
  });
  await GamePlayer.create({ householdId: HH, userId: HEATHER, gameId: game._id, shelf: 'custom-cozy', rating: 3, notes: 'heather notes' });
  return game;
}

describe('deleteGame keeps a snapshot', () => {
  test('the catalog row and every member’s state are kept; the tombstone links to the snapshot', async () => {
    const game = await hadesWithTwoPlayers();
    const res = await Mutation.deleteGame(null, { id: String(game._id) }, ctx(HEATHER));
    expect(res.success).toBe(true);
    expect(await Game.countDocuments({ _id: game._id })).toBe(0);
    expect(await GamePlayer.countDocuments({ gameId: game._id })).toBe(0);

    const snap = await DeletedGame.findOne({ householdId: HH, gameId: game._id }).lean();
    expect(snap).toBeTruthy();
    expect(snap.title).toBe('Hades');
    expect(snap.deletedBy).toBe(HEATHER);
    expect(snap.playniteIds).toEqual(['pid-1']);
    expect(snap.game.copies).toHaveLength(2);
    expect(snap.players.map((p) => p.userId).sort()).toEqual([CHEF, HEATHER].sort());
    expect(snap.players.find((p) => p.userId === CHEF).sessions).toHaveLength(1);

    const tomb = await PlayniteTombstone.findOne({ householdId: HH, playniteId: 'pid-1' }).lean();
    expect(tomb.reason).toBe('game-deleted');
    expect(String(tomb.deletedGameId)).toBe(String(snap._id));
  });

  test("a game outside the caller's household leaves no snapshot", async () => {
    const game = await Game.create({ householdId: 'elsewhere', title: 'Hades', copies: [pcCopy('pid-1')] });
    const res = await Mutation.deleteGame(null, { id: String(game._id) }, ctx());
    expect(res.success).toBe(false);
    expect(await DeletedGame.countDocuments({})).toBe(0);
  });
});

describe('deletedGames', () => {
  test('lists snapshots and uncovered tombstones, newest first, with who deleted it', async () => {
    // An old delete from before snapshots: a bare tombstone.
    await PlayniteTombstone.create({ householdId: HH, playniteId: 'old-1', title: 'Old Game', deletedBy: CHEF, deletedAt: new Date('2026-10-01T00:00:00Z') });
    const game = await hadesWithTwoPlayers();
    await Mutation.deleteGame(null, { id: String(game._id) }, ctx());

    const list = await Query.deletedGames(null, {}, ctx(HEATHER));
    expect(list.map((e) => [e.title, e.hasSnapshot])).toEqual([
      ['Hades', true],
      ['Old Game', false],
    ]);
    expect(list[0]).toMatchObject({ reason: 'game-deleted', playniteCopies: 1, members: 2, deletedBy: CHEF });
    expect(list[1]).toMatchObject({ reason: null, playniteCopies: 1, members: 0 });
  });

  test('a manual-only game is listed too (no tombstone, still restorable)', async () => {
    const game = await Game.create({ householdId: HH, title: 'Zelda', copies: [switchCopy()] });
    await Mutation.deleteGame(null, { id: String(game._id) }, ctx());
    const list = await Query.deletedGames(null, {}, ctx());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Zelda', hasSnapshot: true, playniteCopies: 0 });
  });

  test('another household’s deletes are not listed', async () => {
    await PlayniteTombstone.create({ householdId: 'elsewhere', playniteId: 'x-1', title: 'Theirs' });
    await DeletedGame.create({ householdId: 'elsewhere', gameId: new mongoose.Types.ObjectId(), title: 'Theirs too', game: { title: 'x' } });
    expect(await Query.deletedGames(null, {}, ctx())).toEqual([]);
  });

  test('anonymous callers are refused', async () => {
    await expect(Query.deletedGames(null, {}, {})).rejects.toThrow('Unauthorized');
  });
});

describe('restoreDeletedGame', () => {
  test('brings the game back with its id, Playnite link and every member’s state, and clears the tombstone', async () => {
    const game = await hadesWithTwoPlayers();
    await Mutation.deleteGame(null, { id: String(game._id) }, ctx());
    const [entry] = await Query.deletedGames(null, {}, ctx(HEATHER));

    const res = await Mutation.restoreDeletedGame(null, { id: entry.id }, ctx(HEATHER));
    expect(res).toMatchObject({ success: true, waitsForImport: false });
    expect(String(res.game._id)).toBe(String(game._id));
    expect(res.game.__me).toMatchObject({ shelf: 'custom-cozy', rating: 3, notes: 'heather notes' });

    const back = await Game.findById(game._id).lean();
    expect(back.title).toBe('Hades');
    expect(back.tags).toEqual(['roguelike']);
    expect(back.copies.find((c) => c.platform === 'pc').playnite.playniteId).toBe('pid-1');
    const chef = await GamePlayer.findOne({ userId: CHEF, gameId: game._id }).lean();
    expect(chef).toMatchObject({ shelf: 'finished', rating: 5, notes: 'chef notes', review: 'great' });
    expect(chef.sessions).toHaveLength(1);
    const heather = await GamePlayer.findOne({ userId: HEATHER, gameId: game._id }).lean();
    expect(heather).toMatchObject({ shelf: 'custom-cozy', rating: 3 });

    expect(await PlayniteTombstone.countDocuments({ householdId: HH, playniteId: 'pid-1' })).toBe(0);
    expect(await DeletedGame.countDocuments({})).toBe(0);
    expect(await Query.deletedGames(null, {}, ctx())).toEqual([]);
  });

  test('restored games can be deleted and restored again', async () => {
    const game = await hadesWithTwoPlayers();
    await Mutation.deleteGame(null, { id: String(game._id) }, ctx());
    let [entry] = await Query.deletedGames(null, {}, ctx());
    await Mutation.restoreDeletedGame(null, { id: entry.id }, ctx());
    await Mutation.deleteGame(null, { id: String(game._id) }, ctx());
    [entry] = await Query.deletedGames(null, {}, ctx());
    expect(entry.hasSnapshot).toBe(true);
    const res = await Mutation.restoreDeletedGame(null, { id: entry.id }, ctx());
    expect(res.success).toBe(true);
    expect(await GamePlayer.countDocuments({ gameId: game._id })).toBe(2);
  });

  test('an old tombstone with no snapshot is only cleared — the next import brings it back', async () => {
    const tomb = await PlayniteTombstone.create({ householdId: HH, playniteId: 'old-1', title: 'Old Game', deletedBy: CHEF });
    const res = await Mutation.restoreDeletedGame(null, { id: String(tomb._id) }, ctx());
    expect(res).toMatchObject({ success: true, waitsForImport: true, game: null });
    expect(await PlayniteTombstone.countDocuments({ _id: tomb._id })).toBe(0);
    expect(await Game.countDocuments({})).toBe(0);
  });

  test("another household's entry is not found and is left alone", async () => {
    const tomb = await PlayniteTombstone.create({ householdId: 'elsewhere', playniteId: 'x-1', title: 'Theirs' });
    const snap = await DeletedGame.create({ householdId: 'elsewhere', gameId: new mongoose.Types.ObjectId(), title: 'Theirs', game: { title: 'Theirs' } });
    await expect(Mutation.restoreDeletedGame(null, { id: String(tomb._id) }, ctx())).rejects.toThrow('not found');
    await expect(Mutation.restoreDeletedGame(null, { id: String(snap._id) }, ctx())).rejects.toThrow('not found');
    expect(await PlayniteTombstone.countDocuments({ _id: tomb._id })).toBe(1);
    expect(await DeletedGame.countDocuments({ _id: snap._id })).toBe(1);
  });

  test('refuses when the Playnite copy is already back in the library, and changes nothing', async () => {
    const game = await hadesWithTwoPlayers();
    await Mutation.deleteGame(null, { id: String(game._id) }, ctx());
    const [entry] = await Query.deletedGames(null, {}, ctx());
    await Game.create({ householdId: HH, title: 'Hades (again)', copies: [pcCopy('pid-1')] });
    await expect(Mutation.restoreDeletedGame(null, { id: entry.id }, ctx())).rejects.toThrow('already holds');
    expect(await Game.countDocuments({ _id: game._id })).toBe(0);
    expect(await DeletedGame.countDocuments({})).toBe(1);
  });

  test('a malformed id is not found', async () => {
    await expect(Mutation.restoreDeletedGame(null, { id: 'nope' }, ctx())).rejects.toThrow('not found');
  });
});

describe('updateGame dropping a Playnite copy', () => {
  test('marks the tombstone copy-removed, and deletedGames lists it with no snapshot', async () => {
    const game = await Game.create({ householdId: HH, title: 'Hades', copies: [pcCopy('pid-1'), switchCopy()] });
    const keep = game.copies.filter((c) => !c.playnite?.playniteId).map((c) => ({ id: String(c._id), platform: c.platform, format: c.format, storefront: c.storefront }));
    await Mutation.updateGame(null, { id: String(game._id), input: { copies: keep } }, ctx());
    const list = await Query.deletedGames(null, {}, ctx());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Hades', hasSnapshot: false, reason: 'copy-removed' });
  });
});
