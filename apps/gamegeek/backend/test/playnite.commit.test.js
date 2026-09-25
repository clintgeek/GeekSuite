/**
 * commitPlayniteImport with fake models.
 *
 * mongodb-memory-server is not a dependency of this package (it lives in
 * basegeek's api), so the writer is exercised here against recording fakes:
 * what ops it sends, in what batches, and how it re-matches an E11000.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { planPlayniteImport } from '../src/playnite/importPlanner.js';
import { commitPlayniteImport } from '../src/playnite/commit.js';

const HOUSEHOLD = 'default';
const USER = 'user-1';
const NOW = new Date('2026-08-15T00:00:00Z');

const entry = (over = {}) => ({
  playniteId: 'pid-1',
  name: 'Hades',
  sourceName: 'Epic',
  steamAppIdConfidence: 'none',
  platforms: ['PC (Windows)'],
  genres: [],
  categories: [],
  tags: [],
  playtimeSeconds: 0,
  ...over,
});

function fakeModel({ failInsert } = {}) {
  const calls = { bulkWrite: [], updateOne: [], findOne: [] };
  return {
    calls,
    winners: new Map(),
    async bulkWrite(ops, options) {
      calls.bulkWrite.push({ ops, options });
      if (failInsert) {
        const writeErrors = [];
        ops.forEach((op, index) => {
          if (op.insertOne && failInsert(op.insertOne.document)) writeErrors.push({ index, code: 11000 });
        });
        if (writeErrors.length) {
          const err = new Error('E11000 duplicate key');
          err.writeErrors = writeErrors;
          throw err;
        }
      }
      return {};
    },
    async updateOne(filter, update) {
      calls.updateOne.push({ filter, update });
      return {};
    },
    findOne(filter) {
      calls.findOne.push(filter);
      const winner = this.winners.get(filter['externalIds.steamAppId']);
      return { lean: async () => winner ?? null };
    },
  };
}

let idSeq = 0;
const newId = () => `oid-${idSeq++}`;
const allOps = (model) => model.calls.bulkWrite.flatMap((c) => c.ops);

function run(plan, { Game = fakeModel(), GamePlayer = fakeModel(), batchSize } = {}) {
  return commitPlayniteImport({ plan, householdId: HOUSEHOLD, userId: USER, Game, GamePlayer, newId, batchSize }).then(
    (result) => ({ result, Game, GamePlayer })
  );
}

const planFor = (entries, { games = [], players = [] } = {}) =>
  planPlayniteImport({ entries, existingGames: games, existingPlayers: players, userId: USER, now: NOW });

describe('commitPlayniteImport', () => {
  test('creates carry the household and an assigned _id; player rows reference that _id', async () => {
    const { Game, GamePlayer } = await run(planFor([entry(), entry({ playniteId: 'pid-2', name: 'Celeste' })]));
    const inserts = allOps(Game).filter((o) => o.insertOne).map((o) => o.insertOne.document);
    assert.equal(inserts.length, 2);
    for (const d of inserts) {
      assert.equal(d.householdId, HOUSEHOLD);
      assert.ok(d._id);
      for (const c of d.copies) assert.ok(c._id);
    }
    const upserts = allOps(GamePlayer).map((o) => o.updateOne);
    assert.deepEqual(upserts.map((u) => u.filter.gameId).sort(), inserts.map((d) => d._id).sort());
    for (const u of upserts) {
      assert.equal(u.upsert, true);
      assert.equal(u.filter.userId, USER);
      assert.equal(u.filter.householdId, HOUSEHOLD);
      assert.ok(u.update.$setOnInsert, 'creation never $sets over an existing row');
      assert.equal(u.update.$set, undefined);
    }
    for (const call of Game.calls.bulkWrite) assert.equal(call.options.ordered, false);
  });

  test('writes are batched', async () => {
    const entries = Array.from({ length: 7 }, (_, i) => entry({ playniteId: `p${i}`, name: `Game ${i}` }));
    const { Game, GamePlayer } = await run(planFor(entries), { batchSize: 3 });
    assert.deepEqual(Game.calls.bulkWrite.map((c) => c.ops.length), [3, 3, 1]);
    assert.deepEqual(GamePlayer.calls.bulkWrite.map((c) => c.ops.length), [3, 3, 1]);
  });

  test('nothing it sends is a delete', async () => {
    const games = [
      { _id: 'g1', title: 'Hades', genres: [], copies: [{ platform: 'pc', playnite: { playniteId: 'pid-1', playtimeSeconds: 0 } }] },
      { _id: 'g2', title: 'Gone', copies: [{ platform: 'pc', playnite: { playniteId: 'gone' } }] },
    ];
    const players = [{ gameId: 'g1', hoursSource: 'steam', hoursPlayed: 1 }];
    const p = planFor([entry({ playtimeSeconds: 7200, genres: ['Roguelike'] }), entry({ playniteId: 'pid-9', name: 'Hades' })], { games, players });
    assert.equal(p.counts.notInFile, 1);
    const { Game, GamePlayer } = await run(p);
    const ops = [...allOps(Game), ...allOps(GamePlayer)];
    assert.ok(ops.length > 0);
    for (const op of ops) {
      const [kind] = Object.keys(op);
      assert.ok(['insertOne', 'updateOne'].includes(kind), kind);
      for (const verb of Object.keys(op.updateOne?.update ?? {})) {
        assert.ok(['$set', '$setOnInsert', '$push', '$addToSet', '$max'].includes(verb), verb);
      }
    }
    assert.equal(ops.some((op) => op.updateOne?.filter?._id === 'g2'), false);
  });

  test('copy updates touch only the playnite subdoc of the matching copy', async () => {
    const games = [{ _id: 'g1', title: 'Hades', genres: ['x'], releaseDate: new Date(), platformsAvailable: ['pc'], copies: [{ platform: 'switch', storefront: 'nintendo', playnite: { playniteId: 'pid-1', playtimeSeconds: 0 } }] }];
    const { Game } = await run(planFor([entry({ playtimeSeconds: 3600 })], { games, players: [{ gameId: 'g1', hoursSource: 'playnite', hoursPlayed: 0 }] }));
    const upd = allOps(Game).find((o) => o.updateOne?.arrayFilters).updateOne;
    assert.deepEqual(upd.arrayFilters, [{ 'c.playnite.playniteId': 'pid-1' }]);
    assert.deepEqual(Object.keys(upd.update.$set).sort(), [
      'copies.$[c].playnite.hidden',
      'copies.$[c].playnite.lastActivity',
      'copies.$[c].playnite.playtimeSeconds',
      'copies.$[c].playnite.providerGameId',
      'copies.$[c].playnite.sourceName',
    ]);
    assert.equal(upd.filter.householdId, HOUSEHOLD);
  });

  test('an hours write re-checks the manual guard in its filter; lastPlayedAt is a $max', async () => {
    const games = [{ _id: 'g1', title: 'Hades', genres: ['x'], releaseDate: new Date(), platformsAvailable: ['pc'], copies: [] }];
    const players = [{ gameId: 'g1', hoursSource: 'steam', hoursPlayed: 1 }];
    const { GamePlayer } = await run(planFor([entry({ playtimeSeconds: 7200, lastActivity: '2026-08-01T00:00:00Z' })], { games, players }));
    const [hours, last] = allOps(GamePlayer).map((o) => o.updateOne);
    assert.deepEqual(hours.filter.$or, [{ hoursSource: { $in: ['playnite', 'steam'] } }, { hoursPlayed: 0 }]);
    assert.deepEqual(hours.update, { $set: { hoursPlayed: 2, hoursSource: 'playnite' } });
    assert.deepEqual(last.update, { $max: { lastPlayedAt: new Date('2026-08-01T00:00:00Z') } });
  });

  test('pushing copies onto an existing game is guarded against a double push', async () => {
    const games = [{ _id: 'g1', title: 'Hades', genres: ['x'], releaseDate: new Date(), platformsAvailable: ['pc'], copies: [] }];
    const { Game } = await run(planFor([entry()], { games, players: [] }));
    const upd = allOps(Game).find((o) => o.updateOne?.update.$push).updateOne;
    assert.deepEqual(upd.filter['copies.playnite.playniteId'], { $nin: ['pid-1'] });
    assert.equal(upd.update.$set.owned, true);
  });

  test('E11000 on a create re-matches: copies go onto the winning game and the player row follows', async () => {
    const Game = fakeModel({ failInsert: (doc) => doc.externalIds?.steamAppId === '761890' });
    Game.winners.set('761890', { _id: 'winner' });
    const p = planFor([entry({ name: 'Albion Online', steamAppId: 761890, steamAppIdConfidence: 'exact' }), entry({ playniteId: 'pid-2', name: 'Celeste' })]);
    const { result, GamePlayer } = await run(p, { Game });
    assert.equal(result.gamesRematched, 1);
    assert.equal(result.gamesCreated, 1);
    assert.deepEqual(Game.calls.findOne, [{ householdId: HOUSEHOLD, 'externalIds.steamAppId': '761890' }]);
    const push = Game.calls.updateOne[0];
    assert.equal(push.filter._id, 'winner');
    assert.deepEqual(push.filter['copies.playnite.playniteId'], { $ne: 'pid-1' });
    assert.ok(allOps(GamePlayer).some((o) => o.updateOne.filter.gameId === 'winner'));
  });

  test('any other write error is not swallowed', async () => {
    const Game = fakeModel();
    Game.bulkWrite = async () => {
      throw Object.assign(new Error('boom'), { writeErrors: [{ index: 0, code: 121 }] });
    };
    await assert.rejects(run(planFor([entry()]), { Game }), /boom/);
  });
});
