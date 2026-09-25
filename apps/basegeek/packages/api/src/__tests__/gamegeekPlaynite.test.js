/**
 * gamegeekPlaynite.test.js
 *
 * The gateway's side of the Playnite import (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md):
 *   1. updateGame replaces `copies` whole from GameCopyInput, which has no
 *      `playnite` field. An edited copy must keep its `playnite` subdoc, or the
 *      next import can't match it by playniteId and re-adds it as a duplicate.
 *      A copy the user removed is still removed.
 *   2. GameCopy.fromPlaynite / playtimeHours and the GameProfile.playnite*
 *      fields resolve from the stored subdocs.
 *   3. hoursSource 'playnite' (written by the import) is a valid value.
 */

import mongoose from 'mongoose';

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { GameProfile } = await import('../graphql/gamegeek/models/profile.js');
const { resolvers } = await import('../graphql/gamegeek/resolvers.js');

const { Query, Mutation } = resolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const ctx = (id = ALICE) => ({ user: { id } });

const playnite = (playniteId, playtimeSeconds = 0) => ({
  playniteId,
  providerGameId: `prov-${playniteId}`,
  sourceName: 'Epic',
  playtimeSeconds,
  lastActivity: new Date('2026-09-01T12:00:00Z'),
  hidden: false,
});

/** A game as the Playnite import leaves it: two Playnite copies and one manual copy. */
async function importedGame() {
  return Game.create({
    householdId: 'default',
    title: 'Arcade Paradise',
    source: 'playnite-import',
    copies: [
      { platform: 'pc', format: 'digital', storefront: 'epic', playnite: playnite('pid-epic', 5400) },
      { platform: 'pc', format: 'digital', storefront: 'gog', playnite: playnite('pid-gog', 0) },
      { platform: 'switch', format: 'physical', storefront: 'retail' },
    ],
  });
}

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

describe('updateGame keeps each copy’s playnite subdoc', () => {
  test('editing copies preserves playnite on kept copies; a removed copy is removed; a new copy has none', async () => {
    const game = await importedGame();
    const [epic, , retail] = game.copies.map((c) => String(c._id));

    await Mutation.updateGame(
      null,
      {
        id: String(game._id),
        input: {
          copies: [
            { id: epic, platform: 'steam-deck', format: 'digital', storefront: 'epic', notes: 'plays on the Deck' },
            { id: retail, platform: 'switch', format: 'physical', storefront: 'retail' },
            { platform: 'ps5', format: 'physical', storefront: 'retail' }, // new
            // the GOG copy is left out: the user removed it
          ],
        },
      },
      ctx()
    );

    const after = await Game.findById(game._id).lean();
    expect(after.copies).toHaveLength(3);
    const byId = new Map(after.copies.map((c) => [String(c._id), c]));

    const keptEpic = byId.get(epic);
    expect(keptEpic.platform).toBe('steam-deck');
    expect(keptEpic.notes).toBe('plays on the Deck');
    expect(keptEpic.playnite).toMatchObject({
      playniteId: 'pid-epic',
      providerGameId: 'prov-pid-epic',
      sourceName: 'Epic',
      playtimeSeconds: 5400,
      hidden: false,
    });
    expect(keptEpic.playnite.lastActivity.toISOString()).toBe('2026-09-01T12:00:00.000Z');

    expect(byId.get(retail).playnite ?? null).toBeNull();
    const added = after.copies.find((c) => c.platform === 'ps5');
    expect(added.playnite ?? null).toBeNull();
    expect(after.copies.some((c) => c.playnite?.playniteId === 'pid-gog')).toBe(false);
  });

  test('an unknown copy id cannot adopt another copy’s playnite subdoc', async () => {
    const game = await importedGame();
    const bogus = String(new mongoose.Types.ObjectId());
    await Mutation.updateGame(
      null,
      { id: String(game._id), input: { copies: [{ id: bogus, platform: 'pc', storefront: 'epic' }] } },
      ctx()
    );
    const after = await Game.findById(game._id).lean();
    expect(after.copies).toHaveLength(1);
    expect(String(after.copies[0]._id)).not.toBe(bogus);
    expect(after.copies[0].playnite ?? null).toBeNull();
  });

  test('an update that does not send copies leaves them untouched', async () => {
    const game = await importedGame();
    await Mutation.updateGame(null, { id: String(game._id), input: { title: 'Arcade Paradise!' } }, ctx());
    const after = await Game.findById(game._id).lean();
    expect(after.copies.filter((c) => c.playnite?.playniteId).map((c) => c.playnite.playniteId)).toEqual([
      'pid-epic',
      'pid-gog',
    ]);
  });
});

describe('Playnite fields resolve', () => {
  test('GameCopy.fromPlaynite and playtimeHours', async () => {
    const game = await importedGame();
    const g = await Query.game(null, { id: String(game._id) }, ctx());
    const copies = resolvers.Game.copies(g);
    const R = resolvers.GameCopy;
    expect(copies.map((c) => R.fromPlaynite(c))).toEqual([true, true, false]);
    expect(copies.map((c) => R.playtimeHours(c))).toEqual([1.5, 0, null]);
  });

  test('GameProfile.playniteLastImportAt / playniteLastGeneratedAtUtc / playniteLastTotal', async () => {
    const empty = await Query.gameProfile(null, {}, ctx());
    const R = resolvers.GameProfile;
    expect([R.playniteLastImportAt(empty), R.playniteLastGeneratedAtUtc(empty), R.playniteLastTotal(empty)]).toEqual([
      null,
      null,
      null,
    ]);

    const ranAt = new Date('2026-09-25T17:00:00Z');
    const generated = new Date('2026-09-25T16:21:03Z');
    // Exactly what the gamegeek backend's import writes.
    await GameProfile.findOneAndUpdate(
      { userId: ALICE },
      {
        $set: {
          householdId: 'default',
          userId: ALICE,
          'playnite.lastImportAt': ranAt,
          'playnite.lastGeneratedAtUtc': generated,
          'playnite.lastTotal': 931,
        },
      },
      { upsert: true }
    );
    const p = await Query.gameProfile(null, {}, ctx());
    expect(R.playniteLastImportAt(p).toISOString()).toBe(ranAt.toISOString());
    expect(R.playniteLastGeneratedAtUtc(p).toISOString()).toBe(generated.toISOString());
    expect(R.playniteLastTotal(p)).toBe(931);
  });

  test("hoursSource 'playnite' is a valid stored value and reads back through `me`", async () => {
    const game = await importedGame();
    await GamePlayer.create({
      userId: ALICE,
      householdId: 'default',
      gameId: game._id,
      shelf: 'on-hold',
      hoursPlayed: 1.5,
      hoursSource: 'playnite',
    });
    const g = await Query.game(null, { id: String(game._id) }, ctx());
    expect(g.__me).toMatchObject({ hoursPlayed: 1.5, hoursSource: 'playnite' });

    // Editing hours by hand still makes them the user's own.
    await Mutation.setGameState(null, { gameId: String(game._id), input: { hoursPlayed: 4 } }, ctx());
    expect(await GamePlayer.findOne({ userId: ALICE, gameId: game._id }).lean()).toMatchObject({
      hoursPlayed: 4,
      hoursSource: 'manual',
    });
  });
});
