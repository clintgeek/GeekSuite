/**
 * Playing follows Playnite's isInstalled (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md
 * §Installed → Playing; DOCS/SUITE_TODO.md, Chef's caveat 2026-09-25).
 *
 * Pinned here, rule by rule:
 *   1  copy.playnite.isInstalled is stored on every import, filled on existing
 *      copies; an install flip stamps installedChangedAt (the first fill doesn't)
 *   2a installed → Playing only from backlog / on-hold / unshelved — never from
 *      finished, abandoned, wishlist or a custom shelf
 *   2b on Playing and every Playnite copy known uninstalled → Backlog
 *      (Chef, 2026-10-09; replaced the "not installed anymore" flag-and-ask)
 *   2c a game with NO Playnite copy is never moved
 *   2d a non-Playnite copy (Android, Switch) does NOT keep it on Playing
 *   2e Playing set by hand (or "Still playing") sticks until the game is
 *      installed and uninstalled again; a leftover old flag is cleared
 *   2f re-running the same export changes nothing the second time
 *   2g the writes are guarded, tenant-scoped, and never touch hours or ratings
 *   2h (first-import inference lives in playnite.planner.test.js)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { planPlayniteImport, installDecision } from '../src/playnite/importPlanner.js';
import { commitPlayniteImport } from '../src/playnite/commit.js';

const USER = 'user-1';
const HOUSEHOLD = 'default';
const T0 = new Date('2026-09-01T00:00:00Z');
const T1 = new Date('2026-09-10T00:00:00Z');
const T2 = new Date('2026-09-20T00:00:00Z');
const T3 = new Date('2026-09-25T00:00:00Z');

const entry = (over = {}) => ({
  playniteId: 'pid-1',
  name: 'Hades',
  sourceName: 'Epic',
  steamAppIdConfidence: 'none',
  hidden: false,
  favorite: false,
  platforms: ['PC (Windows)'],
  genres: ['Action'],
  categories: [],
  tags: [],
  playtimeSeconds: 3600,
  isInstalled: false,
  ...over,
});

/** A Playnite copy as a previous import stored it. */
const pcCopy = (playniteId, isInstalled, installedChangedAt = null) => ({
  platform: 'pc',
  storefront: 'epic',
  playnite: {
    playniteId,
    providerGameId: `prov-${playniteId}`,
    sourceName: 'Epic',
    playtimeSeconds: 3600,
    lastActivity: null,
    hidden: false,
    ...(isInstalled === undefined ? {} : { isInstalled }),
    installedChangedAt,
  },
});
const switchCopy = () => ({ platform: 'switch', storefront: 'nintendo', format: 'physical' });

const game = (_id, copies, title = _id) => ({
  _id,
  title,
  genres: ['Action'],
  releaseDate: new Date('2020-01-01T00:00:00Z'),
  platformsAvailable: ['pc', 'switch'],
  externalIds: {},
  copies,
});
const row = (gameId, shelf, over = {}) => ({
  gameId,
  shelf,
  hoursPlayed: 1,
  hoursSource: 'playnite',
  rating: 4,
  lastPlayedAt: null,
  installFlag: null,
  installFlagAt: null,
  installFlagDismissedAt: null,
  ...over,
});

const plan = ({ entries, games = [], players = [], now = T1 }) =>
  planPlayniteImport({ entries, existingGames: games, existingPlayers: players, userId: USER, now });

/**
 * In-memory commit: the same writes commit.js sends, with the same guards,
 * so a chain of imports can be run against state.
 */
function applyPlan(p, { games, players }) {
  const out = structuredClone({ games, players });
  const byId = (id) => out.games.find((g) => String(g._id) === String(id));
  for (const u of p.ops.gameUpdates) byId(u.gameId).copies.push(...structuredClone(u.pushCopies));
  for (const u of p.ops.copyUpdates) {
    const copy = byId(u.gameId).copies.find((c) => c.playnite?.playniteId === u.playniteId);
    Object.assign(copy.playnite, structuredClone(u.set));
  }
  for (const u of p.ops.installUpdates) {
    const r = out.players.find((x) => String(x.gameId) === String(u.gameId));
    if (u.moveToPlaying && ['backlog', 'on-hold', null, ''].includes(r.shelf ?? null)) {
      Object.assign(r, { shelf: 'playing', installFlag: null, installFlagAt: null });
    }
    if (u.moveToBacklog && r.shelf === 'playing') {
      const kept = r.installFlagDismissedAt && !(u.lastChange && u.lastChange > r.installFlagDismissedAt);
      if (!kept) Object.assign(r, { shelf: 'backlog', installFlag: null, installFlagAt: null });
    }
    if (u.flag === 'clear' && r.installFlag === 'uninstalled') Object.assign(r, { installFlag: null, installFlagAt: null });
  }
  return out;
}

const opFor = (p, gameId) => p.ops.installUpdates.find((u) => u.gameId === gameId);

// ── Rule 1 ────────────────────────────────────────────────────────────────────

describe('rule 1 — isInstalled is stored per copy', () => {
  test('a new copy carries isInstalled, with no transition stamp', () => {
    const p = plan({ entries: [entry({ isInstalled: true })] });
    const copy = p.ops.creates[0].doc.copies[0];
    assert.equal(copy.playnite.isInstalled, true);
    assert.equal(copy.playnite.installedChangedAt, null);
  });

  test('an existing copy imported before the field existed is filled — and the fill is not a transition', () => {
    const games = [game('g1', [pcCopy('pid-1', undefined)])];
    const p = plan({ entries: [entry({ isInstalled: false })], games, players: [row('g1', 'finished')] });
    assert.equal(p.ops.copyUpdates.length, 1);
    assert.equal(p.ops.copyUpdates[0].set.isInstalled, false);
    assert.equal(p.ops.copyUpdates[0].set.installedChangedAt, null);
  });

  test('a flip stamps installedChangedAt with the import time; no flip keeps the old stamp', () => {
    const games = [game('g1', [pcCopy('pid-1', false, T0)])];
    const flip = plan({ entries: [entry({ isInstalled: true })], games, players: [row('g1', 'finished')], now: T1 });
    assert.equal(flip.ops.copyUpdates[0].set.installedChangedAt.toISOString(), T1.toISOString());
    const same = plan({ entries: [entry({ isInstalled: false, playtimeSeconds: 7200 })], games, players: [row('g1', 'finished')] });
    assert.equal(same.ops.copyUpdates[0].set.installedChangedAt.toISOString(), T0.toISOString());
  });
});

// ── Rule 2a ───────────────────────────────────────────────────────────────────

describe('rule 2a — installed → Playing, from backlog / on-hold / unshelved only', () => {
  for (const shelf of ['backlog', 'on-hold', null]) {
    test(`${shelf ?? 'unshelved'} + installed → playing`, () => {
      const games = [game('g1', [pcCopy('pid-1', false)])];
      const p = plan({ entries: [entry({ isInstalled: true })], games, players: [row('g1', shelf)] });
      assert.deepEqual(opFor(p, 'g1'), { gameId: 'g1', moveToPlaying: true });
      assert.equal(p.counts.movedToPlaying, 1);
      assert.deepEqual(p.samples.movedToPlaying, [{ title: 'g1', shelfBefore: shelf }]);
    });
  }

  for (const shelf of ['finished', 'abandoned', 'wishlist', 'custom-couch']) {
    test(`${shelf} + installed is never moved (reinstalling is not a claim he's back in it)`, () => {
      const games = [game('g1', [pcCopy('pid-1', false)])];
      const p = plan({ entries: [entry({ isInstalled: true })], games, players: [row('g1', shelf)] });
      assert.equal(opFor(p, 'g1'), undefined);
      assert.equal(p.counts.movedToPlaying, 0);
    });
  }

  test('already playing + installed: nothing to do', () => {
    const games = [game('g1', [pcCopy('pid-1', true)])];
    const p = plan({ entries: [entry({ isInstalled: true })], games, players: [row('g1', 'playing')] });
    assert.equal(p.ops.installUpdates.length, 0);
  });

  test('any ONE installed copy is enough (Epic installed, GOG not)', () => {
    const games = [game('g1', [pcCopy('pid-1', false), pcCopy('pid-2', false)])];
    const p = plan({
      entries: [entry({ isInstalled: false }), entry({ playniteId: 'pid-2', sourceName: 'GOG', isInstalled: true })],
      games,
      players: [row('g1', 'backlog')],
    });
    assert.equal(opFor(p, 'g1').moveToPlaying, true);
  });
});

// ── Rule 2b / 2c / 2d ─────────────────────────────────────────────────────────

describe('rule 2b — a Playing game that is no longer installed moves to Backlog', () => {
  test('playing + every Playnite copy uninstalled → backlog', () => {
    const games = [game('g1', [pcCopy('pid-1', true), pcCopy('pid-2', false)])];
    const p = plan({
      entries: [entry({ isInstalled: false }), entry({ playniteId: 'pid-2', sourceName: 'GOG', isInstalled: false })],
      games,
      players: [row('g1', 'playing')],
      now: T2,
    });
    const op = opFor(p, 'g1');
    assert.equal(op.moveToBacklog, true);
    assert.equal(op.lastChange.toISOString(), T2.toISOString());
    assert.equal(p.counts.movedToBacklog, 1);
    assert.deepEqual(p.samples.movedToBacklog, [{ title: 'g1' }]);
    const after = applyPlan(p, { games, players: [row('g1', 'playing')] });
    assert.equal(after.players[0].shelf, 'backlog');
  });

  test('a game uninstalled before this rule existed (no transition stamp) moves too', () => {
    const games = [game('g1', [pcCopy('pid-1', false)])];
    const p = plan({ entries: [entry({ isInstalled: false })], games, players: [row('g1', 'playing')] });
    assert.equal(opFor(p, 'g1').moveToBacklog, true);
  });

  test('one copy still installed keeps it on Playing', () => {
    const games = [game('g1', [pcCopy('pid-1', true), pcCopy('pid-2', true)])];
    const p = plan({
      entries: [entry({ isInstalled: false }), entry({ playniteId: 'pid-2', sourceName: 'GOG', isInstalled: true })],
      games,
      players: [row('g1', 'playing')],
    });
    assert.equal(opFor(p, 'g1'), undefined);
  });

  for (const shelf of ['backlog', 'on-hold', 'finished', 'abandoned', 'custom-couch', null]) {
    test(`not on playing (${shelf ?? 'unshelved'}) → never moved`, () => {
      const games = [game('g1', [pcCopy('pid-1', true)])];
      const p = plan({ entries: [entry({ isInstalled: false })], games, players: [row('g1', shelf)] });
      assert.equal(opFor(p, 'g1'), undefined);
    });
  }

  test('a copy whose install state is not yet known (never filled, not in this file) is never read as uninstalled', () => {
    const games = [game('g1', [pcCopy('pid-1', true), pcCopy('pid-old', undefined)])];
    const p = plan({ entries: [entry({ isInstalled: false })], games, players: [row('g1', 'playing')] });
    assert.equal(opFor(p, 'g1'), undefined);
  });
});

describe("rule 2c — a game with NO Playnite copy is never moved (Playnite knows nothing about it)", () => {
  for (const shelf of ['playing', 'backlog', 'on-hold', null]) {
    test(`manual-only game on ${shelf ?? 'unshelved'} is untouched by an import`, () => {
      const games = [game('manual', [switchCopy()], 'Tears of the Kingdom'), game('g1', [pcCopy('pid-1', true)])];
      const players = [row('manual', shelf), row('g1', 'finished')];
      const p = plan({ entries: [entry({ isInstalled: false })], games, players });
      assert.equal(opFor(p, 'manual'), undefined);
      const after = applyPlan(p, { games, players });
      assert.deepEqual(after.players.find((r) => r.gameId === 'manual'), row('manual', shelf));
    });
  }

  test('a game with no copies at all is never moved', () => {
    const p = plan({ entries: [entry()], games: [game('empty', [])], players: [row('empty', 'playing')] });
    assert.equal(opFor(p, 'empty'), undefined);
  });

  test('installDecision with no Playnite copy: no move either way', () => {
    for (const shelf of ['playing', 'backlog', null]) {
      assert.deepEqual(installDecision({ playniteCopies: [], player: row('x', shelf) }), {
        moveToPlaying: false,
        moveToBacklog: false,
        flag: null,
        lastChange: null,
      });
    }
  });
});

describe('rule 2d — an Android or Switch copy does not keep it on Playing (Chef, 2026-10-09)', () => {
  test('Playnite PC copy (uninstalled) + manual copy, on playing → backlog', () => {
    const games = [game('mixed', [pcCopy('pid-1', true), switchCopy()])];
    const p = plan({ entries: [entry({ isInstalled: false })], games, players: [row('mixed', 'playing')] });
    assert.equal(opFor(p, 'mixed').moveToBacklog, true);
  });

  test('the same mixed game, installed and on backlog → still moves to playing (2a applies)', () => {
    const games = [game('mixed', [pcCopy('pid-1', false), switchCopy()])];
    const p = plan({ entries: [entry({ isInstalled: true })], games, players: [row('mixed', 'backlog')] });
    assert.equal(opFor(p, 'mixed').moveToPlaying, true);
  });
});

// ── Rule 2e ───────────────────────────────────────────────────────────────────

describe('rule 2e — Playing set by hand sticks until installed, then uninstalled again', () => {
  test('a leftover flag from the old rule goes with the move', () => {
    const games = [game('g1', [pcCopy('pid-1', false, T0)])];
    const p = plan({ entries: [entry({ isInstalled: false })], games, players: [row('g1', 'playing', { installFlag: 'uninstalled', installFlagAt: T0 })] });
    assert.deepEqual(opFor(p, 'g1'), { gameId: 'g1', moveToBacklog: true, lastChange: T0 });
  });

  test('a leftover flag on a game that is installed again is cleared', () => {
    const games = [game('g1', [pcCopy('pid-1', false, T0)])];
    const p = plan({ entries: [entry({ isInstalled: true })], games, players: [row('g1', 'playing', { installFlag: 'uninstalled' })] });
    assert.deepEqual(opFor(p, 'g1'), { gameId: 'g1', flag: 'clear' });
  });

  test('kept on Playing by hand: not moved by later imports — until installed, then uninstalled again', () => {
    // T0: an import saw it uninstalled; at T1 Chef put it back on Playing by hand.
    let state = {
      games: [game('g1', [pcCopy('pid-1', false, T0)])],
      players: [row('g1', 'playing', { installFlagDismissedAt: T1 })],
    };
    let p = plan({ entries: [entry({ isInstalled: false })], ...state, now: T2 });
    assert.equal(opFor(p, 'g1'), undefined);
    state = applyPlan(p, state);

    // Reinstalled → stays, stamps a transition.
    p = plan({ entries: [entry({ isInstalled: true })], ...state, now: T2 });
    assert.equal(opFor(p, 'g1'), undefined);
    state = applyPlan(p, state);

    // Uninstalled again after the manual move → Backlog.
    p = plan({ entries: [entry({ isInstalled: false })], ...state, now: T3 });
    assert.equal(opFor(p, 'g1').moveToBacklog, true);
    state = applyPlan(p, state);
    assert.equal(state.players[0].shelf, 'backlog');
  });

  test('a transition older than the manual move does not move it', () => {
    const player = row('g1', 'playing', { installFlagDismissedAt: T1 });
    assert.equal(installDecision({ playniteCopies: [{ isInstalled: false, installedChangedAt: T0 }], player }).moveToBacklog, false);
    assert.equal(installDecision({ playniteCopies: [{ isInstalled: false, installedChangedAt: T2 }], player }).moveToBacklog, true);
    assert.equal(installDecision({ playniteCopies: [{ isInstalled: false }], player }).moveToBacklog, false);
  });
});

// ── Rule 2f ───────────────────────────────────────────────────────────────────

describe('rule 2f — idempotent', () => {
  test('the same export twice: the first run moves both ways, the second changes nothing', () => {
    const games = [
      game('toMove', [pcCopy('pid-1', false)]), // known uninstalled → installed: a real flip
      game('toBacklog', [pcCopy('pid-2', undefined)]),
      game('manual', [switchCopy()]),
      game('mixed', [pcCopy('pid-3', undefined), switchCopy()]),
      game('done', [pcCopy('pid-4', undefined)]),
    ];
    const players = [row('toMove', 'backlog'), row('toBacklog', 'playing'), row('manual', 'playing'), row('mixed', 'playing'), row('done', 'finished')];
    const entries = [
      entry({ playniteId: 'pid-1', name: 'toMove', isInstalled: true }),
      entry({ playniteId: 'pid-2', name: 'toBacklog', isInstalled: false }),
      entry({ playniteId: 'pid-3', name: 'mixed', isInstalled: false }),
      entry({ playniteId: 'pid-4', name: 'done', isInstalled: true }),
    ];
    const first = plan({ entries, games, players, now: T1 });
    assert.equal(first.counts.movedToPlaying, 1);
    assert.equal(first.counts.movedToBacklog, 2);
    const state = applyPlan(first, { games, players });
    const shelves = Object.fromEntries(state.players.map((r) => [r.gameId, r.shelf]));
    assert.deepEqual(shelves, { toMove: 'playing', toBacklog: 'backlog', manual: 'playing', mixed: 'backlog', done: 'finished' });

    const again = plan({ entries, ...state, now: T2 });
    assert.equal(again.ops.installUpdates.length, 0);
    assert.equal(again.ops.copyUpdates.length, 0);
    assert.equal(again.counts.movedToPlaying, 0);
    assert.equal(again.counts.movedToBacklog, 0);
    assert.equal(again.counts.update, 0);
  });
});

// ── Rule 2g: the writes ───────────────────────────────────────────────────────

function recorder() {
  const calls = [];
  return { calls, async bulkWrite(ops) { calls.push(...ops); return {}; } };
}

describe('rule 2g — commit writes are guarded, scoped, and touch only shelf + flag', () => {
  async function commitFor(p) {
    const Game = recorder();
    const GamePlayer = recorder();
    let n = 0;
    await commitPlayniteImport({ plan: p, householdId: HOUSEHOLD, userId: USER, Game, GamePlayer, newId: () => `oid-${n++}` });
    return GamePlayer.calls.map((o) => o.updateOne).filter((u) => u && !u.upsert && u.update.$set && ('shelf' in u.update.$set || 'installFlag' in u.update.$set));
  }

  test('a move repeats the from-shelf guard in its filter and sets only shelf + flag fields', async () => {
    const games = [game('g1', [pcCopy('pid-1', false)])];
    const [u] = await commitFor(plan({ entries: [entry({ isInstalled: true })], games, players: [row('g1', 'backlog')] }));
    assert.deepEqual(u.filter, { userId: USER, householdId: HOUSEHOLD, gameId: 'g1', shelf: { $in: ['backlog', 'on-hold', null, ''] } });
    assert.deepEqual(u.update, { $set: { shelf: 'playing', installFlag: null, installFlagAt: null } });
  });

  test('a move to Backlog requires playing and no manual Playing since the last transition', async () => {
    const games = [game('g1', [pcCopy('pid-1', true, T0)])];
    const [u] = await commitFor(plan({ entries: [entry({ isInstalled: false })], games, players: [row('g1', 'playing')], now: T2 }));
    assert.deepEqual(u.filter, {
      userId: USER,
      householdId: HOUSEHOLD,
      gameId: 'g1',
      shelf: 'playing',
      $or: [{ installFlagDismissedAt: null }, { installFlagDismissedAt: { $lt: T2 } }],
    });
    assert.deepEqual(u.update, { $set: { shelf: 'backlog', installFlag: null, installFlagAt: null } });
  });

  test('with no transition stamp, only a row never kept on Playing by hand moves', async () => {
    const games = [game('g1', [pcCopy('pid-1', false)])];
    const [u] = await commitFor(plan({ entries: [entry({ isInstalled: false })], games, players: [row('g1', 'playing')], now: T2 }));
    assert.deepEqual(u.filter, { userId: USER, householdId: HOUSEHOLD, gameId: 'g1', shelf: 'playing', installFlagDismissedAt: null });
  });

  test('a clear only touches a flagged row', async () => {
    const games = [game('g1', [pcCopy('pid-1', false, T0)])];
    const [u] = await commitFor(
      plan({ entries: [entry({ isInstalled: true })], games, players: [row('g1', 'playing', { installFlag: 'uninstalled' })] })
    );
    assert.deepEqual(u.filter, { userId: USER, householdId: HOUSEHOLD, gameId: 'g1', installFlag: 'uninstalled' });
    assert.deepEqual(u.update, { $set: { installFlag: null, installFlagAt: null } });
  });

  test('no install write ever sets hours, rating or favorite', async () => {
    const games = [game('a', [pcCopy('pid-1', false)]), game('b', [pcCopy('pid-2', true)])];
    const writes = await commitFor(
      plan({
        entries: [entry({ playniteId: 'pid-1', name: 'a', isInstalled: true }), entry({ playniteId: 'pid-2', name: 'b', isInstalled: false })],
        games,
        players: [row('a', 'on-hold'), row('b', 'playing')],
      })
    );
    assert.equal(writes.length, 2);
    for (const w of writes) {
      for (const k of Object.keys(w.update.$set)) assert.ok(['shelf', 'installFlag', 'installFlagAt'].includes(k), k);
    }
  });
});

// ── Chef, 2026-09-25: a manual move of an installed game sticks ──────────────
describe('promotion happens only at the moment a copy becomes installed', () => {
  test('an installed game Chef moved to Backlog by hand stays there on the next import', () => {
    const games = [game('g', [pcCopy('pid-1', true)])];
    const players = [row('g', 'backlog')];
    const p = plan({ entries: [entry({ playniteId: 'pid-1', name: 'g', isInstalled: true })], games, players, now: T2 });
    assert.equal(p.counts.movedToPlaying, 0);
    assert.equal(p.ops.installUpdates.length, 0);
  });

  test('...and On hold too', () => {
    const games = [game('g', [pcCopy('pid-1', true)])];
    const p = plan({ entries: [entry({ playniteId: 'pid-1', name: 'g', isInstalled: true })], games, players: [row('g', 'on-hold')], now: T2 });
    assert.equal(p.counts.movedToPlaying, 0);
  });

  test('uninstalled → installed promotes once; moving it back by hand then sticks', () => {
    const games = [game('g', [pcCopy('pid-1', false)])];
    const entries = [entry({ playniteId: 'pid-1', name: 'g', isInstalled: true })];
    const first = plan({ entries, games, players: [row('g', 'backlog')], now: T1 });
    assert.equal(first.counts.movedToPlaying, 1);
    const state = applyPlan(first, { games, players: [row('g', 'backlog')] });
    assert.equal(state.players[0].shelf, 'playing');
    state.players[0].shelf = 'backlog'; // Chef moves it by hand
    const again = plan({ entries, ...state, now: T2 });
    assert.equal(again.counts.movedToPlaying, 0);
    assert.equal(again.ops.installUpdates.length, 0);
  });

  test('a new copy that arrives installed on an existing game promotes', () => {
    const games = [game('g', [pcCopy('pid-1', false)], 'Hades')];
    const entries = [
      entry({ playniteId: 'pid-1', name: 'Hades', isInstalled: false }),
      entry({ playniteId: 'pid-2', name: 'Hades', sourceName: 'GOG', isInstalled: true }),
    ];
    const p = plan({ entries, games, players: [row('g', 'backlog')], now: T2 });
    assert.equal(p.counts.addCopy, 1);
    assert.equal(p.counts.movedToPlaying, 1);
  });

  test('the first recording of an unknown install state is not a transition', () => {
    const games = [game('g', [pcCopy('pid-1', undefined)])];
    const p = plan({ entries: [entry({ playniteId: 'pid-1', name: 'g', isInstalled: true })], games, players: [row('g', 'backlog')], now: T2 });
    assert.equal(p.counts.movedToPlaying, 0);
  });

  test('installDecision defaults to no promotion without a transition', () => {
    const d = installDecision({ playniteCopies: [{ isInstalled: true }], player: { shelf: 'backlog' } });
    assert.equal(d.moveToPlaying, false);
    assert.equal(installDecision({ playniteCopies: [{ isInstalled: true }], player: { shelf: 'backlog' }, becameInstalled: true }).moveToPlaying, true);
  });
});

