/**
 * gamegeekInstallFlag.test.js — Playing follows Playnite's isInstalled, the
 * gateway's side (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md §Installed → Playing).
 *
 * Pinned here:
 *   - GameCopy.installed: Playnite's isInstalled, null for a non-Playnite copy
 *     and for one imported before the field was stored;
 *   - GameMyState.installFlag / installFlagAt;
 *   - resolveInstallFlag: finished | on-hold | abandoned move and clear;
 *     still-playing stays, clears and records the dismissal; undo puts the
 *     flag back but only on a game the import itself would flag (never a
 *     manual-only or mixed Playnite + Switch game); the caller's row only,
 *     household-scoped, validated, hours and ratings untouched;
 *   - leaving Playing through setGameState clears the flag; a copy edit that
 *     makes it moot clears every member's flag on that game (household only);
 *   - filter.needsDecision and the needsDecision facet are the caller's, and
 *     the facet excludes its own filter.
 */

import mongoose from 'mongoose';

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { GameProfile } = await import('../graphql/gamegeek/models/profile.js');
const { resolvers } = await import('../graphql/gamegeek/resolvers.js');

const { Query, Mutation } = resolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (id = ALICE) => ({ user: { id } });
const FLAGGED_AT = new Date('2026-09-20T00:00:00Z');

const pn = (playniteId, isInstalled) => ({
  playniteId,
  providerGameId: `prov-${playniteId}`,
  sourceName: 'Epic',
  playtimeSeconds: 3600,
  lastActivity: null,
  hidden: false,
  ...(isInstalled === undefined ? {} : { isInstalled }),
});
const pcCopy = (id, isInstalled) => ({ platform: 'pc', format: 'digital', storefront: 'epic', playnite: pn(id, isInstalled) });
const switchCopy = () => ({ platform: 'switch', format: 'physical', storefront: 'nintendo' });

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

async function flaggedGame({ copies = [pcCopy('pid-1', false)], title = 'Hades', householdId = 'default' } = {}) {
  const game = await Game.create({ householdId, title, source: 'playnite-import', copies });
  await GamePlayer.create({
    userId: ALICE,
    householdId,
    gameId: game._id,
    shelf: 'playing',
    rating: 4.5,
    hoursPlayed: 12,
    hoursSource: 'playnite',
    installFlag: 'uninstalled',
    installFlagAt: FLAGGED_AT,
  });
  return game;
}
const rowOf = (game, userId = ALICE) => GamePlayer.findOne({ userId, gameId: game._id }).lean();
const resolve = (game, action, who = ALICE) => Mutation.resolveInstallFlag(null, { gameId: String(game._id), action }, ctx(who));

describe('read side', () => {
  test('GameCopy.installed: true / false from Playnite; null for a manual copy and an unknown one', async () => {
    const game = await Game.create({
      householdId: 'default',
      title: 'Mixed',
      copies: [pcCopy('a', true), pcCopy('b', false), pcCopy('c', undefined), switchCopy()],
    });
    const g = await Query.game(null, { id: String(game._id) }, ctx());
    expect(resolvers.Game.copies(g).map((c) => resolvers.GameCopy.installed(c))).toEqual([true, false, null, null]);
  });

  test('GameMyState.installFlag / installFlagAt', async () => {
    const game = await flaggedGame();
    const g = await Query.game(null, { id: String(game._id) }, ctx());
    expect(resolvers.GameMyState.installFlag(g.__me)).toBe('uninstalled');
    expect(resolvers.GameMyState.installFlagAt(g.__me).toISOString()).toBe(FLAGGED_AT.toISOString());
    expect(resolvers.GameMyState.installFlag({ shelf: 'playing' })).toBeNull();
    expect(resolvers.GameMyState.installFlagAt({ installFlagAt: FLAGGED_AT })).toBeNull(); // no flag, no date
  });
});

describe('resolveInstallFlag', () => {
  for (const action of ['finished', 'on-hold', 'abandoned']) {
    test(`${action}: moves the shelf there and clears the flag; hours and rating untouched`, async () => {
      const game = await flaggedGame();
      const g = await resolve(game, action);
      expect(g.__me).toMatchObject({ shelf: action, installFlag: null, installFlagAt: null });
      expect(await rowOf(game)).toMatchObject({ shelf: action, installFlag: null, rating: 4.5, hoursPlayed: 12, hoursSource: 'playnite', installFlagDismissedAt: null });
    });
  }

  test('still-playing: stays on Playing, clears the flag, records the dismissal', async () => {
    const game = await flaggedGame();
    const before = Date.now();
    await resolve(game, 'still-playing');
    const row = await rowOf(game);
    expect(row).toMatchObject({ shelf: 'playing', installFlag: null, installFlagAt: null, rating: 4.5, hoursPlayed: 12 });
    expect(row.installFlagDismissedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  test('undo: puts the flag back on Playing and forgets the dismissal', async () => {
    const game = await flaggedGame();
    await resolve(game, 'abandoned');
    await resolve(game, 'undo');
    expect(await rowOf(game)).toMatchObject({ shelf: 'playing', installFlag: 'uninstalled', installFlagDismissedAt: null, rating: 4.5 });
    await resolve(game, 'still-playing');
    await resolve(game, 'undo');
    expect(await rowOf(game)).toMatchObject({ shelf: 'playing', installFlag: 'uninstalled', installFlagDismissedAt: null });
  });

  test('undo is refused on a game with any non-Playnite copy (mixed Playnite + Switch)', async () => {
    const game = await flaggedGame({ copies: [pcCopy('pid-1', false), switchCopy()] });
    await resolve(game, 'finished');
    await expect(resolve(game, 'undo')).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect((await rowOf(game)).installFlag).toBeNull();
  });

  test('undo is refused on a game with no Playnite copy (a manual Switch game)', async () => {
    const game = await flaggedGame({ copies: [switchCopy()] });
    await resolve(game, 'on-hold');
    await expect(resolve(game, 'undo')).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  test('undo is refused while a copy is installed, or its state is unknown', async () => {
    const installed = await flaggedGame({ copies: [pcCopy('pid-1', true)], title: 'A' });
    await expect(resolve(installed, 'undo')).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    const unknown = await flaggedGame({ copies: [pcCopy('pid-2', undefined)], title: 'B' });
    await expect(resolve(unknown, 'undo')).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  test("the caller's row only: Bob's answer never touches Alice's flag", async () => {
    const game = await flaggedGame();
    await GamePlayer.create({ userId: BOB, householdId: 'default', gameId: game._id, shelf: 'backlog' });
    await resolve(game, 'finished', BOB);
    expect((await rowOf(game)).installFlag).toBe('uninstalled');
    expect((await rowOf(game, BOB)).shelf).toBe('finished');
  });

  test('a game outside the household is NOT_FOUND; so is a game the caller has no row for', async () => {
    const foreign = await flaggedGame({ householdId: 'other-household' });
    await expect(resolve(foreign, 'finished')).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    expect((await rowOf(foreign)).installFlag).toBe('uninstalled');

    const game = await Game.create({ householdId: 'default', title: 'No row', copies: [pcCopy('x', false)] });
    await expect(resolve(game, 'finished')).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
    expect(await GamePlayer.countDocuments({ gameId: game._id })).toBe(0); // never upserts a row
  });

  test('validated: an unknown action or a smuggled tenant key is BAD_USER_INPUT; anonymous is Unauthorized', async () => {
    const game = await flaggedGame();
    await expect(resolve(game, 'wishlist')).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    await expect(
      Mutation.resolveInstallFlag(null, { gameId: String(game._id), action: 'finished', householdId: 'x' }, ctx())
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    await expect(Mutation.resolveInstallFlag(null, { gameId: String(game._id), action: 'finished' }, {})).rejects.toMatchObject({
      extensions: { code: 'UNAUTHORIZED' },
    });
    expect((await rowOf(game)).installFlag).toBe('uninstalled');
  });
});

describe('the flag clears when it is moot', () => {
  test('setGameState moving off Playing clears it; a rating change or Playing again does not', async () => {
    const game = await flaggedGame();
    const id = String(game._id);
    await Mutation.setGameState(null, { gameId: id, input: { rating: 3 } }, ctx());
    expect((await rowOf(game)).installFlag).toBe('uninstalled');
    await Mutation.setGameState(null, { gameId: id, input: { shelf: 'playing' } }, ctx());
    expect((await rowOf(game)).installFlag).toBe('uninstalled');
    await GameProfile.create({ userId: ALICE, householdId: 'default', customShelves: [{ id: 'custom-couch', label: 'Couch' }] });
    await Mutation.setGameState(null, { gameId: id, input: { shelf: 'custom-couch' } }, ctx());
    expect(await rowOf(game)).toMatchObject({ shelf: 'custom-couch', installFlag: null, installFlagAt: null });
  });

  test("adding a Switch copy clears every member's flag on that game — within the household only", async () => {
    const game = await flaggedGame();
    await GamePlayer.create({ userId: BOB, householdId: 'default', gameId: game._id, shelf: 'playing', installFlag: 'uninstalled' });
    // A tenant-crossing row on the same gameId must not be touched.
    const leak = await GamePlayer.collection.insertOne({ userId: 'carol', householdId: 'other-household', gameId: game._id, shelf: 'playing', installFlag: 'uninstalled' });
    const [pc] = game.copies;
    await Mutation.updateGame(
      null,
      { id: String(game._id), input: { copies: [{ id: String(pc._id), platform: 'pc', storefront: 'epic' }, { platform: 'switch', storefront: 'nintendo' }] } },
      ctx()
    );
    expect((await rowOf(game)).installFlag).toBeNull();
    expect((await rowOf(game, BOB)).installFlag).toBeNull();
    expect((await GamePlayer.collection.findOne({ _id: leak.insertedId })).installFlag).toBe('uninstalled');
  });

  test('a copy edit that keeps it Playnite-only and uninstalled keeps the flag', async () => {
    const game = await flaggedGame();
    const [pc] = game.copies;
    await Mutation.updateGame(
      null,
      { id: String(game._id), input: { copies: [{ id: String(pc._id), platform: 'steam-deck', storefront: 'epic', notes: 'deck' }] } },
      ctx()
    );
    expect((await rowOf(game)).installFlag).toBe('uninstalled');
  });
});

describe('filter.needsDecision and the needsDecision facet', () => {
  async function seed() {
    const a = await flaggedGame({ title: 'Flagged A' });
    const b = await flaggedGame({ title: 'Flagged B', copies: [pcCopy('pid-2', false)] });
    await GamePlayer.updateOne({ userId: ALICE, gameId: b._id }, { $set: { favorite: true } });
    const plain = await Game.create({ householdId: 'default', title: 'Plain', copies: [pcCopy('pid-3', true)] });
    await GamePlayer.create({ userId: ALICE, householdId: 'default', gameId: plain._id, shelf: 'playing' });
    // Bob's flag is Bob's.
    const bobs = await Game.create({ householdId: 'default', title: 'Bobs', copies: [pcCopy('pid-4', false)] });
    await GamePlayer.create({ userId: BOB, householdId: 'default', gameId: bobs._id, shelf: 'playing', installFlag: 'uninstalled' });
    // Alice's row carrying another household on a 'default' game must not count.
    await GamePlayer.collection.insertOne({ userId: ALICE, householdId: 'other-household', gameId: bobs._id, shelf: 'playing', installFlag: 'uninstalled' });
    return { a, b, plain, bobs };
  }
  const titles = async (filter, who = ALICE) =>
    (await Query.games(null, { limit: 100, filter }, ctx(who))).games.map((g) => g.title).sort();
  const facets = (filter, who = ALICE) => Query.gameFacets(null, { filter }, ctx(who));

  test("needsDecision: true → the caller's flagged games only; false → the rest", async () => {
    await seed();
    expect(await titles({ needsDecision: true })).toEqual(['Flagged A', 'Flagged B']);
    expect(await titles({ needsDecision: false })).toEqual(['Bobs', 'Plain']);
    expect(await titles({ needsDecision: true }, BOB)).toEqual(['Bobs']);
    expect(await titles({ needsDecision: true, favorite: true })).toEqual(['Flagged B']);
  });

  test('the facet counts the caller’s flags, household-scoped, and ignores its own filter', async () => {
    await seed();
    expect((await facets({})).needsDecision).toBe(2);
    expect((await facets({}, BOB)).needsDecision).toBe(1);
    // Its own filter is excluded: even filtered to NOT flagged, the count still says 2.
    const own = await facets({ needsDecision: false });
    expect(own.total).toBe(2);
    expect(own.needsDecision).toBe(2);
    // Every OTHER active filter applies.
    expect((await facets({ favorite: true })).needsDecision).toBe(1);
    // …and needsDecision applies to the other facets.
    expect((await facets({ needsDecision: true })).favorites).toBe(1);
  });

  test('validation: needsDecision must be a boolean', async () => {
    await expect(Query.games(null, { filter: { needsDecision: 'yes' } }, ctx())).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });
});
