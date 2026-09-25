import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSteamImportPlan, shelfForPlaytimeMinutes, round1 } from '../src/steam/importPlanner.js';

describe('shelfForPlaytimeMinutes', () => {
  test('0 minutes -> backlog, >0 -> on-hold', () => {
    assert.equal(shelfForPlaytimeMinutes(0), 'backlog');
    assert.equal(shelfForPlaytimeMinutes(1), 'on-hold');
    assert.equal(shelfForPlaytimeMinutes(6000), 'on-hold');
  });
});

describe('round1', () => {
  test('rounds to one decimal', () => {
    assert.equal(round1(1.234), 1.2);
    assert.equal(round1(1.25), 1.3);
    assert.equal(round1(0), 0);
  });
});

describe('buildSteamImportPlan', () => {
  test('a game with no household match at all lands in toCreate', () => {
    const plan = buildSteamImportPlan({
      ownedGames: [{ appid: 1145360, name: 'Hades', playtime_forever: 600 }],
      existingGamesByAppId: new Map(),
      existingPlayersByGameId: new Map(),
    });
    assert.equal(plan.total, 1);
    assert.deepEqual(plan.toCreate, [{ steamAppId: '1145360', title: 'Hades', hours: 10, minutes: 600 }]);
    assert.deepEqual(plan.toUpdateHours, []);
    assert.equal(plan.unchanged, 0);
  });

  test('a household game with no GamePlayer row for this caller still needs one created', () => {
    const gameId = 'g1';
    const plan = buildSteamImportPlan({
      ownedGames: [{ appid: 1145360, name: 'Hades', playtime_forever: 120 }],
      existingGamesByAppId: new Map([['1145360', { _id: gameId, title: 'Hades' }]]),
      existingPlayersByGameId: new Map(), // no row for this caller
    });
    assert.deepEqual(plan.toCreate, [{ steamAppId: '1145360', gameId, title: 'Hades', hours: 2, minutes: 120 }]);
    assert.equal(plan.toUpdateHours.length, 0);
  });

  test('an existing steam-sourced player row with changed hours goes to toUpdateHours', () => {
    const gameId = 'g1';
    const plan = buildSteamImportPlan({
      ownedGames: [{ appid: 1145360, name: 'Hades', playtime_forever: 1200 }], // 20.0h
      existingGamesByAppId: new Map([['1145360', { _id: gameId, title: 'Hades' }]]),
      existingPlayersByGameId: new Map([[gameId, { hoursSource: 'steam', hoursPlayed: 10 }]]),
    });
    assert.deepEqual(plan.toCreate, []);
    assert.deepEqual(plan.toUpdateHours, [{ gameId, title: 'Hades', hours: 20 }]);
    assert.equal(plan.unchanged, 0);
  });

  test('never overwrites manual hours — a manual-hoursSource row is left unchanged', () => {
    const gameId = 'g1';
    const plan = buildSteamImportPlan({
      ownedGames: [{ appid: 1145360, name: 'Hades', playtime_forever: 1200 }], // Steam says 20h
      existingGamesByAppId: new Map([['1145360', { _id: gameId, title: 'Hades' }]]),
      existingPlayersByGameId: new Map([[gameId, { hoursSource: 'manual', hoursPlayed: 500 }]]),
    });
    assert.deepEqual(plan.toCreate, []);
    assert.deepEqual(plan.toUpdateHours, [], 'a manual row must never appear in toUpdateHours');
    assert.equal(plan.unchanged, 1);
  });

  test('an unchanged steam-sourced hour count is left alone (idempotent re-run of an update)', () => {
    const gameId = 'g1';
    const plan = buildSteamImportPlan({
      ownedGames: [{ appid: 1145360, name: 'Hades', playtime_forever: 1200 }], // 20.0h
      existingGamesByAppId: new Map([['1145360', { _id: gameId, title: 'Hades' }]]),
      existingPlayersByGameId: new Map([[gameId, { hoursSource: 'steam', hoursPlayed: 20 }]]),
    });
    assert.deepEqual(plan.toCreate, []);
    assert.deepEqual(plan.toUpdateHours, []);
    assert.equal(plan.unchanged, 1);
  });

  test('idempotent re-run: once a game+player exist, importing the same library again creates zero duplicates', () => {
    const first = buildSteamImportPlan({
      ownedGames: [{ appid: 1145360, name: 'Hades', playtime_forever: 600 }],
      existingGamesByAppId: new Map(),
      existingPlayersByGameId: new Map(),
    });
    assert.equal(first.toCreate.length, 1);

    // Simulate the commit: the game + player row now exist.
    const gameId = 'g1';
    const second = buildSteamImportPlan({
      ownedGames: [{ appid: 1145360, name: 'Hades', playtime_forever: 600 }],
      existingGamesByAppId: new Map([['1145360', { _id: gameId, title: 'Hades' }]]),
      existingPlayersByGameId: new Map([[gameId, { hoursSource: 'steam', hoursPlayed: 10 }]]),
    });
    assert.equal(second.toCreate.length, 0, 're-running must not re-create the game or player row');
    assert.equal(second.toUpdateHours.length, 0, 'hours have not changed since the first run');
    assert.equal(second.unchanged, 1);
  });

  test('a mixed library sorts each game into exactly one bucket', () => {
    const plan = buildSteamImportPlan({
      ownedGames: [
        { appid: 1, name: 'New Game', playtime_forever: 0 },
        { appid: 2, name: 'Needs Hour Update', playtime_forever: 3000 },
        { appid: 3, name: 'Manually Tracked', playtime_forever: 9999 },
        { appid: 4, name: 'Already Synced', playtime_forever: 60 },
      ],
      existingGamesByAppId: new Map([
        ['2', { _id: 'g2', title: 'Needs Hour Update' }],
        ['3', { _id: 'g3', title: 'Manually Tracked' }],
        ['4', { _id: 'g4', title: 'Already Synced' }],
      ]),
      existingPlayersByGameId: new Map([
        ['g2', { hoursSource: 'steam', hoursPlayed: 1 }],
        ['g3', { hoursSource: 'manual', hoursPlayed: 42 }],
        ['g4', { hoursSource: 'steam', hoursPlayed: 1 }],
      ]),
    });

    assert.equal(plan.total, 4);
    assert.deepEqual(plan.toCreate.map((g) => g.title), ['New Game']);
    assert.deepEqual(plan.toUpdateHours.map((g) => g.title), ['Needs Hour Update']);
    assert.equal(plan.unchanged, 2); // Manually Tracked (never overwritten) + Already Synced (hours already match)
  });
});
