/**
 * planPlayniteImport — matching, per-user rules, re-import
 * (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md §Matching, §Per-user state,
 * §Catalog fields on re-import, §Hidden, removed, invalid).
 *
 * `applyPlan` below is an in-memory stand-in for commit.js, so "re-importing
 * the same file is a no-op" is measured against the plan's own output.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExport } from '../src/playnite/parse.js';
import { planPlayniteImport, inferShelf, mayOverwriteHours, SAMPLE_CAP } from '../src/playnite/importPlanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'playnite-library.sample.json');
const file = parseExport(JSON.parse(fs.readFileSync(FIXTURE, 'utf8')));

const USER = 'user-1';
const NOW = new Date('2026-08-15T00:00:00Z'); // ANYU was last played 2026-07-31

const entry = (over = {}) => ({
  playniteId: 'pid-1',
  name: 'Hades',
  sourceName: 'Epic',
  steamAppIdConfidence: 'none',
  hidden: false,
  favorite: false,
  platforms: ['PC (Windows)'],
  genres: [],
  categories: [],
  tags: [],
  playtimeSeconds: 0,
  ...over,
});

function plan({ entries = file.entries, games = [], players = [], includeHidden = false, now = NOW, ...rest } = {}) {
  return planPlayniteImport({ entries, existingGames: games, existingPlayers: players, userId: USER, includeHidden, now, ...rest });
}

/** Apply a plan to plain arrays the way commit.js applies it to Mongo. */
function applyPlan(p, { games = [], players = [] } = {}) {
  const out = structuredClone({ games, players });
  let n = 0;
  const idByKey = new Map();
  for (const c of p.ops.creates) {
    const _id = `g${n++}`;
    idByKey.set(c.key, _id);
    out.games.push({ ...structuredClone(c.doc), _id });
  }
  const byId = (id) => out.games.find((g) => String(g._id) === String(id));
  for (const u of p.ops.gameUpdates) {
    const g = byId(u.gameId);
    g.copies.push(...structuredClone(u.pushCopies));
    for (const [k, v] of Object.entries(u.set)) {
      if (k === 'externalIds.steamAppId') g.externalIds = { ...g.externalIds, steamAppId: v };
      else g[k] = v;
    }
    g.platformsAvailable = [...new Set([...(g.platformsAvailable ?? []), ...u.addPlatforms])];
  }
  for (const u of p.ops.copyUpdates) {
    const copy = byId(u.gameId).copies.find((c) => c.playnite?.playniteId === u.playniteId);
    Object.assign(copy.playnite, u.set);
  }
  for (const pc of p.ops.playerCreates) {
    const gameId = pc.key ? idByKey.get(pc.key) : pc.gameId;
    if (!out.players.some((r) => String(r.gameId) === String(gameId))) out.players.push({ gameId, ...pc.doc });
  }
  for (const u of p.ops.playerUpdates) {
    const r = out.players.find((row) => String(row.gameId) === String(u.gameId));
    if (u.hoursPlayed !== undefined) Object.assign(r, { hoursPlayed: u.hoursPlayed, hoursSource: 'playnite' });
    if (u.lastPlayedAt && (!r.lastPlayedAt || u.lastPlayedAt > r.lastPlayedAt)) r.lastPlayedAt = u.lastPlayedAt;
  }
  // structuredClone keeps Dates; re-hydrate nothing else.
  return out;
}

const bucketSum = (c) => c.create + c.addCopy + c.update + c.unchanged + c.skippedHidden + c.invalid;
const createFor = (p, title) => p.ops.creates.find((c) => c.doc.title === title);
const playerFor = (p, title) => {
  const c = createFor(p, title);
  return p.ops.playerCreates.find((pc) => pc.key === c.key)?.doc;
};

describe('planPlayniteImport — against the fixture', () => {
  test('every entry lands in exactly one bucket', () => {
    for (const includeHidden of [false, true]) {
      const p = plan({ includeHidden });
      assert.equal(p.total, 14);
      assert.equal(bucketSum(p.counts), 14);
    }
  });

  test('hidden entries are skipped unless includeHidden', () => {
    const p = plan();
    assert.equal(p.counts.skippedHidden, 4);
    assert.equal(p.counts.create, 10);
    assert.equal(createFor(p, '3 Count Bout'), undefined);

    const all = plan({ includeHidden: true });
    assert.equal(all.counts.skippedHidden, 0);
    assert.ok(createFor(all, '3 Count Bout'));
  });

  test("the 'Arcade Paradise' Epic + GOG pair is ONE game with two copies", () => {
    const p = plan({ includeHidden: true }); // the GOG copy is hidden in Playnite
    const games = p.ops.creates.filter((c) => c.doc.title === 'Arcade Paradise');
    assert.equal(games.length, 1);
    assert.deepEqual(games[0].doc.copies.map((c) => c.storefront).sort(), ['epic', 'gog']);
    assert.equal(p.counts.addCopy, 1);
    assert.deepEqual(p.samples.addCopy, [{ title: 'Arcade Paradise', storefront: 'gog' }]);

    // Without includeHidden only the visible Epic copy is imported.
    const visible = createFor(plan(), 'Arcade Paradise');
    assert.deepEqual(visible.doc.copies.map((c) => c.storefront), ['epic']);
  });

  test('create docs: storefront/format/platform, steamAppId exact, sortTitle, source', () => {
    const p = plan({ includeHidden: true });
    const albion = createFor(p, 'Albion Online').doc;
    assert.equal(albion.externalIds.steamAppId, '761890');
    assert.equal(albion.source, 'playnite-import');
    assert.equal(albion.createdBy, USER);
    assert.equal(albion.owned, true);
    assert.equal(createFor(p, 'AK-xolotl: Together').doc.releaseDate, null); // no releaseDate in the file
    assert.equal(createFor(p, 'Arcade Paradise').doc.externalIds.steamAppId, null);

    const ds = createFor(p, "DEATH STRANDING DIRECTOR'S CUT").doc;
    assert.deepEqual(ds.copies.map(({ platform, format, storefront }) => ({ platform, format, storefront })), [
      { platform: 'pc', format: 'subscription', storefront: 'xbox' },
    ]);
    assert.equal(ds.releaseDate.toISOString(), '2024-11-07T00:00:00.000Z');

    const ace = createFor(p, 'Ace Attorney Investigations Collection').doc;
    assert.equal(ace.copies[0].platform, 'xbox-series');
    assert.deepEqual(ace.platformsAvailable.sort(), ['pc', 'xbox-one', 'xbox-series']);

    assert.equal(createFor(p, 'Fallout: New Vegas').doc.copies[0].storefront, 'other');
    assert.equal(createFor(p, 'BioShock 2 Remastered').doc.sortTitle, 'bioshock 02 remastered');
    for (const c of p.ops.creates) for (const copy of c.doc.copies) assert.equal('installDirectory' in copy.playnite, false);
  });

  test('favorite is carried on creation', () => {
    const p = plan();
    assert.equal(playerFor(p, 'BioShock 2 Remastered').favorite, true);
    assert.equal(playerFor(p, 'Diablo II: Resurrected').favorite, true);
    assert.equal(playerFor(p, 'Anno 1800').favorite, false);
  });

  test('shelf inference on creation defers to isInstalled: installed → playing; else backlog / on-hold (rule 2h)', () => {
    const p = plan({ includeHidden: true });
    assert.equal(playerFor(p, 'Fallout: New Vegas').shelf, 'playing'); // isInstalled, 0 playtime
    assert.equal(playerFor(p, 'Anno 1800').shelf, 'backlog'); // 0 playtime
    // Played 2026-07-31, 15 days before NOW — recent activity no longer means playing.
    assert.equal(playerFor(p, 'ANYU').shelf, 'on-hold');
    assert.equal(playerFor(p, 'Albion Online').shelf, 'on-hold'); // last played 2024
    assert.equal(playerFor(p, 'Ace Attorney Investigations Collection').shelf, 'on-hold');
  });

  test('hours: summed seconds / 3600, rounded to 0.1, source playnite; lastPlayedAt = newest', () => {
    const p = plan({ includeHidden: true });
    assert.deepEqual(
      (({ hoursPlayed, hoursSource }) => ({ hoursPlayed, hoursSource }))(playerFor(p, 'Albion Online')),
      { hoursPlayed: 0.8, hoursSource: 'playnite' } // 2700 s
    );
    assert.equal(playerFor(p, 'ANYU').hoursPlayed, 0.2); // 698 s
    assert.equal(playerFor(p, 'Ace Attorney Investigations Collection').hoursPlayed, 12.1); // 43680 s
    assert.equal(playerFor(p, 'ANYU').lastPlayedAt.toISOString(), '2026-07-31T03:23:59.000Z');
  });

  test('samples are capped at 20', () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry({ playniteId: `p${i}`, name: `Game ${i}` }));
    const p = plan({ entries });
    assert.equal(p.counts.create, 30);
    assert.equal(p.samples.create.length, SAMPLE_CAP);
  });

  test('a playniteId repeated in one file counts as invalid', () => {
    const p = plan({ entries: [entry(), entry({ name: 'Hades again' })] });
    assert.equal(p.counts.create, 1);
    assert.equal(p.counts.invalid, 1);
  });
});

describe('planPlayniteImport — re-import', () => {
  test('re-importing its own committed output is a no-op: 0 create, 0 addCopy, all unchanged', () => {
    for (const includeHidden of [false, true]) {
      const first = plan({ includeHidden });
      const state = applyPlan(first);
      const again = plan({ includeHidden, games: state.games, players: state.players });
      assert.equal(again.counts.create, 0);
      assert.equal(again.counts.addCopy, 0);
      assert.equal(again.counts.update, 0);
      assert.equal(again.counts.unchanged, first.counts.create + first.counts.addCopy);
      assert.equal(again.counts.skippedHidden, first.counts.skippedHidden);
      assert.equal(again.ops.creates.length + again.ops.gameUpdates.length + again.ops.copyUpdates.length, 0);
      assert.equal(again.ops.playerCreates.length + again.ops.playerUpdates.length, 0);
      assert.equal(again.ops.installUpdates.length, 0);
    }
  });

  test('a previously skipped hidden entry is added on a later includeHidden run, as a copy', () => {
    const state = applyPlan(plan());
    const p = plan({ includeHidden: true, games: state.games, players: state.players });
    assert.equal(p.counts.create, 3); // the three hidden games with no visible sibling
    assert.equal(p.counts.addCopy, 1); // Arcade Paradise's GOG copy onto the Epic game
    assert.equal(p.ops.gameUpdates.find((u) => u.pushCopies.length).pushCopies[0].storefront, 'gog');
  });

  test('an already-imported copy that is now hidden still gets its hidden flag and playtime updated', () => {
    const state = applyPlan(plan({ entries: [entry({ playtimeSeconds: 3600 })] }));
    const p = plan({ entries: [entry({ hidden: true, playtimeSeconds: 7200 })], games: state.games, players: state.players });
    assert.equal(p.counts.skippedHidden, 0);
    assert.equal(p.counts.update, 1);
    assert.deepEqual(p.ops.copyUpdates[0].set.hidden, true);
    assert.equal(p.ops.copyUpdates[0].set.playtimeSeconds, 7200);
    assert.equal(p.ops.playerUpdates[0].hoursPlayed, 2);
    assert.deepEqual(p.samples.update, [{ title: 'Hades', hoursBefore: 1, hoursAfter: 2 }]);
  });

  test('never changes shelf or favorite after creation', () => {
    const state = applyPlan(plan({ entries: [entry({ favorite: true })] }));
    state.players[0].shelf = 'finished';
    state.players[0].favorite = false;
    const p = plan({ entries: [entry({ favorite: true, playtimeSeconds: 99999 })], games: state.games, players: state.players });
    assert.equal(p.ops.playerCreates.length, 0);
    for (const u of p.ops.playerUpdates) {
      assert.equal('shelf' in u, false);
      assert.equal('favorite' in u, false);
    }
  });
});

describe('planPlayniteImport — hours never overwrite what a person typed', () => {
  const game = { _id: 'g1', title: 'Hades', genres: ['Roguelike'], platformsAvailable: ['pc'], externalIds: {}, copies: [] };
  const withHours = (hoursSource, hoursPlayed) =>
    plan({
      entries: [entry({ playtimeSeconds: 36000 })],
      games: [structuredClone(game)],
      players: [{ gameId: 'g1', hoursSource, hoursPlayed }],
    });

  test('manual hours are never overwritten', () => {
    const p = withHours('manual', 3);
    assert.equal(p.ops.playerUpdates.filter((u) => u.hoursPlayed !== undefined).length, 0);
  });

  test('steam or playnite hours are overwritten', () => {
    assert.equal(withHours('steam', 3).ops.playerUpdates[0].hoursPlayed, 10);
    assert.equal(withHours('playnite', 3).ops.playerUpdates[0].hoursPlayed, 10);
  });

  test('0 manual hours are filled', () => {
    assert.equal(withHours('manual', 0).ops.playerUpdates[0].hoursPlayed, 10);
  });

  test('mayOverwriteHours: the rule itself', () => {
    assert.equal(mayOverwriteHours({ hoursSource: 'manual', hoursPlayed: 3 }, 10), false);
    assert.equal(mayOverwriteHours({ hoursSource: 'manual', hoursPlayed: 0 }, 10), true);
    assert.equal(mayOverwriteHours({ hoursSource: 'steam', hoursPlayed: 3 }, 10), true);
    assert.equal(mayOverwriteHours({ hoursSource: 'playnite', hoursPlayed: 10 }, 10), false); // no change
    assert.equal(mayOverwriteHours({ hoursSource: 'steam', hoursPlayed: 5 }, 0), false); // a 0 never erases hours
  });

  test('inferShelf: installed → playing; no playtime → backlog; else on-hold', () => {
    assert.equal(inferShelf({ playtimeSeconds: 0, installed: false }), 'backlog');
    assert.equal(inferShelf({ playtimeSeconds: 60, installed: false }), 'on-hold');
    assert.equal(inferShelf({ playtimeSeconds: 0, installed: true }), 'playing');
    assert.equal(inferShelf({ playtimeSeconds: 99999, installed: true }), 'playing');
  });
});

describe('planPlayniteImport — matching an existing library', () => {
  test('match order: playniteId, then steamAppId, then normalized title, else create', () => {
    const games = [
      { _id: 'byPid', title: 'Something Else', copies: [{ platform: 'pc', playnite: { playniteId: 'pid-A', playtimeSeconds: 0 } }] },
      { _id: 'bySteam', title: 'Totally Different Name', externalIds: { steamAppId: '761890' }, copies: [] },
      { _id: 'byTitle', title: 'ARCADE PARADISE™', copies: [] },
    ];
    const p = plan({
      entries: [
        entry({ playniteId: 'pid-A', name: 'Arcade Paradise' }), // playniteId wins over title
        entry({ playniteId: 'pid-B', name: 'Albion Online', steamAppId: 761890, steamAppIdConfidence: 'exact' }),
        entry({ playniteId: 'pid-C', name: 'Arcade Paradise', sourceName: 'GOG' }),
        entry({ playniteId: 'pid-D', name: 'New Game' }),
      ],
      games,
    });
    assert.deepEqual(p.counts, { create: 1, addCopy: 2, update: 1, unchanged: 0, skippedHidden: 0, notInFile: 0, invalid: 0, movedToPlaying: 0, flaggedUninstalled: 0 });
    const pushedTo = Object.fromEntries(p.ops.gameUpdates.filter((u) => u.pushCopies.length).map((u) => [u.gameId, u.pushCopies[0].playnite.playniteId]));
    assert.deepEqual(pushedTo, { bySteam: 'pid-B', byTitle: 'pid-C' });
  });

  test('a copy the file no longer mentions is counted as notInFile, never deleted', () => {
    const games = [
      { _id: 'g1', title: 'Gone Game', copies: [{ platform: 'pc', playnite: { playniteId: 'old-1' } }, { platform: 'pc', playnite: { playniteId: 'old-2' } }] },
      { _id: 'g2', title: 'Manual Game', copies: [{ platform: 'switch' }] },
    ];
    const p = plan({ entries: [entry()], games, seenPlayniteIds: ['old-2'] }); // old-2 was in the file but invalid
    assert.equal(p.counts.notInFile, 1);
    assert.deepEqual(p.samples.notInFile, [{ title: 'Gone Game' }]);
    // The plan has no delete of any kind: every op is a create, a push, or a $set.
    assert.deepEqual(Object.keys(p.ops).sort(), ['copyUpdates', 'creates', 'gameUpdates', 'installUpdates', 'playerCreates', 'playerUpdates']);
    for (const u of p.ops.gameUpdates) assert.equal(u.gameId === 'g1', false);
  });

  test('catalog fields: fill only what is empty; never the title', () => {
    const games = [
      {
        _id: 'full',
        title: 'Hades (my edit)',
        genres: ['Mine'],
        releaseDate: new Date('2020-01-01T00:00:00Z'),
        platformsAvailable: ['switch'],
        externalIds: { steamAppId: '1145360' },
        copies: [{ platform: 'switch', playnite: { playniteId: 'pid-1', playtimeSeconds: 0 } }],
      },
      { _id: 'empty', title: 'Celeste', genres: [], releaseDate: null, platformsAvailable: [], externalIds: {}, copies: [] },
    ];
    const p = plan({
      entries: [
        entry({ genres: ['Roguelike'], releaseDate: '2020-9-17', steamAppId: 999, steamAppIdConfidence: 'exact' }),
        entry({ playniteId: 'pid-2', name: 'Celeste', genres: ['Platformer'], releaseDate: '2018-1-25', steamAppId: 504230, steamAppIdConfidence: 'exact' }),
      ],
      games,
    });
    const full = p.ops.gameUpdates.find((u) => u.gameId === 'full');
    assert.deepEqual(full.set, {}); // nothing empty to fill
    assert.deepEqual(full.addPlatforms, ['pc']); // union only adds
    const empty = p.ops.gameUpdates.find((u) => u.gameId === 'empty');
    assert.deepEqual(empty.set, {
      genres: ['Platformer'],
      releaseDate: new Date('2018-01-25T00:00:00Z'),
      'externalIds.steamAppId': '504230',
    });
    for (const u of p.ops.gameUpdates) assert.equal('title' in u.set, false);
  });

  test('a steamAppId another household game already holds is not filled onto a second game', () => {
    const games = [
      { _id: 'a', title: 'Owner', externalIds: { steamAppId: '42' }, copies: [] },
      { _id: 'b', title: 'Celeste', externalIds: {}, copies: [], genres: ['x'], releaseDate: new Date(), platformsAvailable: ['pc'] },
    ];
    // steamAppId matches 'a' first (step 2), so it becomes a copy of 'a' — never a second holder.
    const p = plan({ entries: [entry({ name: 'Celeste', steamAppId: 42, steamAppIdConfidence: 'exact' })], games });
    assert.equal(p.ops.gameUpdates.length, 1);
    assert.equal(p.ops.gameUpdates[0].gameId, 'a');
    assert.equal('externalIds.steamAppId' in p.ops.gameUpdates[0].set, false);
  });

  test('an existing game this user has no row for gets one, with an inferred shelf', () => {
    const games = [{ _id: 'g1', title: 'Hades', copies: [], genres: ['x'], releaseDate: new Date(), platformsAvailable: ['pc'] }];
    const p = plan({ entries: [entry({ playtimeSeconds: 600, lastActivity: '2026-08-10T00:00:00Z' })], games, players: [] });
    assert.deepEqual(p.ops.playerCreates.map((c) => [c.gameId, c.doc.shelf]), [['g1', 'on-hold']]);
    const installed = plan({ entries: [entry({ playtimeSeconds: 600, isInstalled: true })], games, players: [] });
    assert.deepEqual(installed.ops.playerCreates.map((c) => [c.gameId, c.doc.shelf]), [['g1', 'playing']]);
    assert.equal(installed.counts.movedToPlaying, 0); // a new row is not a "move"
  });

  test('lastPlayedAt only moves forward', () => {
    const games = [{ _id: 'g1', title: 'Hades', copies: [{ platform: 'pc', playnite: { playniteId: 'pid-1', playtimeSeconds: 0 } }], genres: ['x'], releaseDate: new Date(), platformsAvailable: ['pc'] }];
    const later = new Date('2026-09-01T00:00:00Z');
    const p = plan({
      entries: [entry({ lastActivity: '2026-08-01T00:00:00Z' })],
      games,
      players: [{ gameId: 'g1', hoursSource: 'manual', hoursPlayed: 0, lastPlayedAt: later }],
    });
    assert.equal(p.ops.playerUpdates.some((u) => u.lastPlayedAt), false);
  });

  test('requires a real `now`', () => {
    assert.throws(() => planPlayniteImport({ entries: [], existingGames: [], existingPlayers: [], userId: USER }), TypeError);
  });
});
