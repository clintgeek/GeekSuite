/**
 * gamegeekPlayniteTombstone.test.js — what the gateway tells the Playnite
 * import (Chef, 2026-10-09; apps/gamegeek/DOCS/PLAYNITE_IMPORT.md §Hidden,
 * removed, deleted):
 *   - deleteGame remembers the game's Playnite copies (PlayniteTombstone), so
 *     the import never brings it back; a manual copy leaves nothing behind;
 *     household-scoped and idempotent;
 *   - updateGame dropping a Playnite copy remembers that copy, and only it;
 *   - putting a game on Playing by hand (setGameState) stamps
 *     installFlagDismissedAt, which keeps the import's move to Backlog off it
 *     until it is installed and uninstalled again.
 */

import mongoose from 'mongoose';

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { PlayniteTombstone } = await import('../graphql/gamegeek/models/playniteTombstone.js');
const { resolvers } = await import('../graphql/gamegeek/resolvers.js');

const { Mutation } = resolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const ctx = (id = ALICE) => ({ user: { id } });

const pn = (playniteId) => ({ playniteId, providerGameId: `prov-${playniteId}`, sourceName: 'Epic', playtimeSeconds: 0, hidden: false, isInstalled: false });
const pcCopy = (id) => ({ platform: 'pc', format: 'digital', storefront: 'epic', playnite: pn(id) });
const switchCopy = () => ({ platform: 'switch', format: 'physical', storefront: 'nintendo' });

beforeAll(async () => {
  await Game.db.asPromise();
  await Promise.all([Game.init(), GamePlayer.init(), PlayniteTombstone.init()]);
}, 60000);

afterEach(async () => {
  await Promise.all([Game.deleteMany({}), GamePlayer.deleteMany({}), PlayniteTombstone.deleteMany({})]);
});

afterAll(async () => {
  await Game.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const tombs = async () =>
  (await PlayniteTombstone.find({}, { _id: 0, householdId: 1, playniteId: 1, title: 1, deletedBy: 1 }).sort({ playniteId: 1 }).lean());

describe('deleteGame remembers the Playnite copies', () => {
  test('every Playnite copy is remembered; the manual copy is not; the game goes', async () => {
    const game = await Game.create({ householdId: 'default', title: 'Hades', copies: [pcCopy('pid-1'), pcCopy('pid-2'), switchCopy()] });
    const res = await Mutation.deleteGame(null, { id: String(game._id) }, ctx());
    expect(res.success).toBe(true);
    expect(await Game.countDocuments({})).toBe(0);
    expect(await tombs()).toEqual([
      { householdId: 'default', playniteId: 'pid-1', title: 'Hades', deletedBy: ALICE },
      { householdId: 'default', playniteId: 'pid-2', title: 'Hades', deletedBy: ALICE },
    ]);
  });

  test('a manual-only game leaves no tombstone', async () => {
    const game = await Game.create({ householdId: 'default', title: 'Zelda', copies: [switchCopy()] });
    await Mutation.deleteGame(null, { id: String(game._id) }, ctx());
    expect(await tombs()).toEqual([]);
  });

  test("a game outside the caller's household is not deleted and leaves no tombstone", async () => {
    const game = await Game.create({ householdId: 'elsewhere', title: 'Hades', copies: [pcCopy('pid-1')] });
    const res = await Mutation.deleteGame(null, { id: String(game._id) }, ctx());
    expect(res.success).toBe(false);
    expect(await Game.countDocuments({})).toBe(1);
    expect(await tombs()).toEqual([]);
  });

  test('idempotent: the same playniteId deleted twice is one row', async () => {
    for (let i = 0; i < 2; i += 1) {
      const game = await Game.create({ householdId: 'default', title: 'Hades', copies: [pcCopy('pid-1')] });
      await Mutation.deleteGame(null, { id: String(game._id) }, ctx());
    }
    expect((await tombs()).length).toBe(1);
  });
});

describe('updateGame dropping a Playnite copy remembers it', () => {
  test('only the dropped Playnite copy is remembered', async () => {
    const game = await Game.create({ householdId: 'default', title: 'Hades', copies: [pcCopy('pid-1'), pcCopy('pid-2'), switchCopy()] });
    const keep = game.copies.filter((c) => c.playnite?.playniteId !== 'pid-1').map((c) => ({ id: String(c._id), platform: c.platform, format: c.format, storefront: c.storefront }));
    await Mutation.updateGame(null, { id: String(game._id), input: { copies: keep } }, ctx());
    expect((await tombs()).map((t) => t.playniteId)).toEqual(['pid-1']);
    const after = await Game.findById(game._id).lean();
    expect(after.copies.map((c) => c.playnite?.playniteId ?? null).sort()).toEqual(['pid-2', null].sort());
  });

  test('an edit that keeps every copy remembers nothing', async () => {
    const game = await Game.create({ householdId: 'default', title: 'Hades', copies: [pcCopy('pid-1')] });
    await Mutation.updateGame(null, { id: String(game._id), input: { title: 'Hades II' } }, ctx());
    expect(await tombs()).toEqual([]);
  });
});

describe('Playing by hand sticks', () => {
  test('setGameState → playing stamps installFlagDismissedAt; another shelf does not', async () => {
    const game = await Game.create({ householdId: 'default', title: 'Hades', copies: [pcCopy('pid-1')] });
    const before = Date.now();
    await Mutation.setGameState(null, { gameId: String(game._id), input: { shelf: 'playing' } }, ctx());
    let row = await GamePlayer.findOne({ userId: ALICE, gameId: game._id }).lean();
    expect(row.installFlagDismissedAt.getTime()).toBeGreaterThanOrEqual(before);

    const other = await Game.create({ householdId: 'default', title: 'Celeste', copies: [pcCopy('pid-2')] });
    await Mutation.setGameState(null, { gameId: String(other._id), input: { shelf: 'backlog' } }, ctx());
    row = await GamePlayer.findOne({ userId: ALICE, gameId: other._id }).lean();
    expect(row.installFlagDismissedAt ?? null).toBeNull();
  });
});
