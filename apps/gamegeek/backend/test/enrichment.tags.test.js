/**
 * The tags pass (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §A2–A4), the IGDB /
 * RAWG tag normalizers against the shapes recorded live on 2026-09-25, the
 * inline run after a new match, unlink, the worker hook, and the genre boot
 * migration (§A5). In-memory Game model and fake sources — no network.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  tagGame,
  runTagsPass,
  tagsSelectionFilter,
  canReplaceAutoTags,
  prefetchBatch,
} from '../src/enrichment/tagsPass.js';
import { enrichGame, applyCandidate, unlinkGame } from '../src/enrichment/enrichGame.js';
import { createWorker } from '../src/enrichment/worker.js';
import { valueHash, planFill } from '../src/enrichment/plan.js';
import { migrateGenres, planGenreMigration } from '../src/migrations/genres.js';
import {
  normalizeIgdbTagRows,
  normalizeIgdbSteamLookup,
  normalizeIgdbDetail,
  igdbTagTerms,
  IGDB_DETAIL_FIELDS,
  IGDB_TAG_FIELDS,
  IGDB_EXTERNAL_GAME_FIELDS,
} from '../src/metadata/igdb.js';
import { fetchIgdbTagsById, fetchIgdbExternalGamesBySteam, resetIgdbTokenCache } from '../src/metadata/igdbClient.js';
import { rawgTagTerms, normalizeRawgGame } from '../src/metadata/rawg.js';
import { mapEntry } from '../src/playnite/mapping.js';
import { createFakeGameModel, matches } from './helpers/fakeGameModel.js';
import { fakeProviderSet, fakeTagSource, detailOf, searchHit } from './helpers/fakeProviders.js';

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const NOW = new Date('2026-09-25T12:00:00Z');

let n = 0;
const nextId = () => `cccccccccccccccccccccc${String(++n).padStart(2, '0')}`;
const matched = (over = {}) => ({
  _id: nextId(),
  householdId: 'default',
  title: `Game ${n}`,
  tags: [],
  autoTags: [],
  genres: [],
  releaseDate: null,
  externalIds: { igdb: null, steamAppId: null, rawg: null },
  enrichment: { status: 'matched', provider: 'igdb', filled: [], filledHashes: {} },
  ...over,
});

function setup(games, sourceOpts = {}, extra = {}) {
  const Game = createFakeGameModel(games, extra.hooks);
  const tags = fakeTagSource(sourceOpts);
  const deps = { Game, providers: { tags, ...(extra.providers ?? {}) }, now: () => NOW };
  return { Game, tags, deps };
}
const ref = (g) => ({ _id: g._id, householdId: g.householdId });

// ── Normalizers (recorded shapes) ────────────────────────────────────────────

describe('IGDB tag normalizers — shapes recorded live 2026-09-25', () => {
  test('the detail fetch asks for themes, keywords and perspectives', () => {
    for (const f of ['themes.name', 'keywords.name', 'player_perspectives.name']) {
      assert.ok(IGDB_DETAIL_FIELDS.split(',').includes(f), f);
      assert.ok(IGDB_TAG_FIELDS.split(',').includes(f), f);
    }
  });

  test('batched /games rows → id → terms (themes, then keywords, then perspectives)', () => {
    const rows = fixture('igdb-tags.json');
    const map = normalizeIgdbTagRows(rows);
    assert.equal(map.size, 10);
    assert.deepEqual(map.get('11737'), ['Action', 'Science fiction', 'Open world', 'Mystery', 'space simulation', 'exploration', 'time travel', 'astronaut', 'First person']);
    assert.deepEqual(map.get('222873'), ['Comedy', 'First person']); // no keywords at all
  });

  test('normalizeIgdbDetail carries tagTerms', () => {
    const outer = fixture('igdb-tags.json').find((r) => r.id === 11737);
    const d = normalizeIgdbDetail(outer, []);
    assert.deepEqual(d.tagTerms, igdbTagTerms(outer));
  });

  test('external_games by Steam uid: field names are game / uid / external_game_source', () => {
    assert.equal(IGDB_EXTERNAL_GAME_FIELDS, 'game,uid,external_game_source');
    const rows = fixture('igdb-external-games-steam-batch.json');
    const map = normalizeIgdbSteamLookup(rows);
    assert.equal(map.size, 10);
    assert.equal(map.get('916440'), '55036'); // Anno 1800
    assert.equal(map.get('203770'), '2918'); // Crusader Kings II
    // The `fields *` shape too (checksum, url, name…).
    assert.equal(normalizeIgdbSteamLookup(fixture('igdb-external-games-steam.json')).get('201870'), '537');
  });

  test('external_games: non-Steam rows, junk uids and ambiguous uids are ignored; legacy `category` still read', () => {
    const map = normalizeIgdbSteamLookup([
      { game: 1, uid: '100', external_game_source: 5 }, // GOG
      { game: 2, uid: 'abc', external_game_source: 1 },
      { game: 3, uid: '300', external_game_source: 1 },
      { game: 4, uid: '300', external_game_source: 1 }, // same Steam id, another game → ambiguous
      { game: 5, uid: '500', category: 1 },
      { game: { id: 6 }, uid: '600', external_game_source: 1 },
      { game: 3, uid: '700', external_game_source: 1 },
      { game: 3, uid: '700', external_game_source: 1 }, // duplicate row, same game: fine
    ]);
    assert.deepEqual([...map.entries()], [
      ['500', '5'],
      ['600', '6'],
      ['700', '3'],
    ]);
  });
});

describe('IGDB tag requests (fake fetch)', () => {
  const env = { IGDB_CLIENT_ID: 'id', IGDB_CLIENT_SECRET: 'secret' };
  function fakeFetch(respond) {
    const bodies = [];
    const impl = async (url, init) => {
      if (String(url).includes('oauth2/token')) return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) };
      bodies.push({ url: String(url), body: init.body });
      return { ok: true, json: async () => respond(String(url), init.body) };
    };
    return { impl, bodies };
  }

  test('fetchIgdbTagsById batches up to 10 ids into one where id = (…)', async () => {
    resetIgdbTokenCache();
    const { impl, bodies } = fakeFetch(() => []);
    await fetchIgdbTagsById(['1', '2', '2', '3'], { fetchImpl: impl, env });
    assert.equal(bodies.length, 1);
    assert.match(bodies[0].url, /\/v4\/games$/);
    assert.match(bodies[0].body, /where id = \(1,2,3\); limit 3;/);
    await assert.rejects(fetchIgdbTagsById(['1', 'x'], { fetchImpl: impl, env }), /digits/);
    await assert.rejects(fetchIgdbTagsById(Array.from({ length: 11 }, (_, i) => String(i + 1)), { fetchImpl: impl, env }), /at most 10/);
  });

  test('fetchIgdbExternalGamesBySteam filters on external_game_source = 1 and quotes the uids', async () => {
    resetIgdbTokenCache();
    const { impl, bodies } = fakeFetch(() => []);
    await fetchIgdbExternalGamesBySteam(['620', '400'], { fetchImpl: impl, env });
    assert.match(bodies[0].url, /\/v4\/external_games$/);
    assert.match(bodies[0].body, /fields game,uid,external_game_source; where external_game_source = 1 & uid = \("620","400"\);/);
    await assert.rejects(fetchIgdbExternalGamesBySteam(['62"0'], { fetchImpl: impl, env }), /digits/);
  });
});

describe('RAWG tags', () => {
  test('English only, name and slug both offered', () => {
    const terms = rawgTagTerms([
      { name: 'Open World', slug: 'open-world', language: 'eng' },
      { name: 'Открытый мир', slug: 'otkrytyi-mir', language: 'rus' },
      { name: 'No language', slug: 'no-language' },
    ]);
    assert.deepEqual(terms, ['Open World', 'open-world']);
  });

  test('normalizeRawgGame carries tagTerms from the recorded detail', () => {
    const [fallout] = fixture('rawg-tags.json');
    const d = normalizeRawgGame(fallout);
    assert.ok(d.tagTerms.includes('Post-apocalyptic'));
    assert.ok(d.tagTerms.includes('turn-based-combat'));
  });
});

// ── The pass ─────────────────────────────────────────────────────────────────

describe('tags pass — selection', () => {
  test('matched with no tagsFetchedAt only', () => {
    const f = tagsSelectionFilter();
    const docs = [
      matched({ title: 'yes' }),
      matched({ title: 'done', enrichment: { status: 'matched', tagsFetchedAt: NOW } }),
      matched({ title: 'unlinked', enrichment: { status: 'unlinked' } }),
      matched({ title: 'no-match', enrichment: { status: 'no-match' } }),
      matched({ title: 'never tried', enrichment: null }),
    ];
    assert.deepEqual(docs.filter((d) => matches(d, f)).map((d) => d.title), ['yes']);
  });
});

describe('tags pass — sources and writes', () => {
  test('IGDB id → IGDB tags; autoTags, tagsFetchedAt, tagSources written; user tags untouched', async () => {
    const g = matched({ tags: ['Game Pass', 'my own'], externalIds: { igdb: '11737', steamAppId: null, rawg: null } });
    const { Game, tags, deps } = setup([g], { igdb: { 11737: ['Science fiction', 'Open world', 'steam', 'First person'] } });
    const res = await tagGame(ref(g), deps);
    assert.equal(res.outcome, 'tagged');
    const after = Game.get(g._id);
    assert.deepEqual(after.autoTags, ['Open World', 'Sci-fi', 'First-person']);
    assert.deepEqual(after.tags, ['Game Pass', 'my own']);
    assert.equal(after.enrichment.tagsFetchedAt.getTime(), NOW.getTime());
    assert.deepEqual(after.enrichment.tagSources, ['igdb']);
    assert.ok(after.enrichment.filled.includes('autoTags'));
    assert.equal(after.enrichment.filledHashes.autoTags, valueHash(after.autoTags));
    assert.deepEqual(tags.calls.igdbTagsByIds, [['11737']]);
    assert.equal(tags.calls.igdbSearch.length, 0);
  });

  test('steamAppId only → external_games lookup stores the IGDB id (guarded) and fetches its tags', async () => {
    const g = matched({ externalIds: { igdb: null, steamAppId: '916440', rawg: null }, enrichment: { status: 'matched', provider: 'steam' } });
    const { Game, tags, deps } = setup([g], { steam: { 916440: '55036' }, igdb: { 55036: ['Business', 'city builder'] } });
    assert.equal((await tagGame(ref(g), deps)).outcome, 'tagged');
    const after = Game.get(g._id);
    assert.equal(after.externalIds.igdb, '55036');
    assert.deepEqual(after.autoTags, ['Management', 'City Builder']);
    assert.ok(after.enrichment.filled.includes('externalIds.igdb'));
    const write = Game.calls.updateOne.at(-1);
    assert.deepEqual(write.filter['externalIds.igdb'], { $in: [null, ''] });
    assert.deepEqual(tags.calls.igdbIdsBySteam, [['916440']]);
  });

  test('an IGDB id already held by another household game is not stored — but its tags still land', async () => {
    const other = matched({ externalIds: { igdb: '55036', steamAppId: null, rawg: null } });
    const g = matched({ externalIds: { igdb: null, steamAppId: '916440', rawg: null } });
    const { Game, deps } = setup([other, g], { steam: { 916440: '55036' }, igdb: { 55036: ['Business'] } });
    await tagGame(ref(g), deps);
    const after = Game.get(g._id);
    assert.equal(after.externalIds.igdb, null);
    assert.deepEqual(after.autoTags, ['Management']);
    assert.ok(!after.enrichment.filled.includes('externalIds.igdb'));
  });

  test('a duplicate-key race on the IGDB id retries without it', async () => {
    const g = matched({ externalIds: { igdb: null, steamAppId: '916440', rawg: null } });
    let raced = false;
    const hooks = {
      async beforeUpdate(filter, update, model) {
        if (!raced && update.$set?.['externalIds.igdb']) {
          raced = true;
          model.docs.push({ ...matched({ externalIds: { igdb: '55036' } }), updatedAt: new Date() });
        }
      },
    };
    const { Game, deps } = setup([g], { steam: { 916440: '55036' }, igdb: { 55036: ['Business'] } }, { hooks });
    assert.equal((await tagGame(ref(g), deps)).outcome, 'tagged');
    const after = Game.get(g._id);
    assert.equal(after.externalIds.igdb, null);
    assert.deepEqual(after.autoTags, ['Management']);
  });

  test('RAWG id → RAWG tags too, merged after IGDB’s and ordered by group', async () => {
    const g = matched({ externalIds: { igdb: '1', steamAppId: null, rawg: '13554' } });
    const { Game, deps } = setup([g], { igdb: { 1: ['First person'] }, rawg: { 13554: ['Post-apocalyptic', 'post-apocalyptic', 'Turn-Based'] } });
    await tagGame(ref(g), deps);
    const after = Game.get(g._id);
    assert.deepEqual(after.autoTags, ['Turn-Based', 'Post-apocalyptic', 'First-person']);
    assert.deepEqual(after.enrichment.tagSources, ['igdb', 'rawg']);
  });

  test('RAWG-only game: RAWG asked, no IGDB title search', async () => {
    const g = matched({ title: 'Fallout', externalIds: { igdb: null, steamAppId: null, rawg: '13554' } });
    const { tags, deps } = setup([g], { rawg: { 13554: ['Open World'] } });
    await tagGame(ref(g), deps);
    assert.deepEqual(tags.calls.rawgTags, ['13554']);
    assert.equal(tags.calls.igdbSearch.length, 0);
  });

  test('no ids at all → strict IGDB title search; an exact match stores the id and fetches its tags', async () => {
    const g = matched({ title: 'Outer Wilds', releaseDate: new Date('2019-05-28T00:00:00Z'), externalIds: { igdb: null, steamAppId: null, rawg: null } });
    const { Game, tags, deps } = setup([g], {
      search: { 'Outer Wilds': [searchHit('igdb', '11737', 'Outer Wilds', '2019-05-28T00:00:00Z'), searchHit('igdb', '999', 'Outer Wilds: Echoes of the Eye', '2021-09-28T00:00:00Z')] },
      igdb: { 11737: ['Science fiction'] },
    });
    await tagGame(ref(g), deps);
    assert.deepEqual(tags.calls.igdbSearch, ['Outer Wilds']);
    const after = Game.get(g._id);
    assert.equal(after.externalIds.igdb, '11737');
    assert.deepEqual(after.autoTags, ['Sci-fi']);
  });

  test('title search that is not exact (ambiguous / wrong year) stores nothing but still marks the game fetched', async () => {
    const g = matched({ title: 'Doom', releaseDate: new Date('1993-12-10T00:00:00Z'), externalIds: { igdb: null, steamAppId: null, rawg: null } });
    const { Game, deps } = setup([g], { search: { Doom: [searchHit('igdb', '7351', 'DOOM', '2016-05-13T00:00:00Z')] } });
    assert.equal((await tagGame(ref(g), deps)).outcome, 'untagged');
    const after = Game.get(g._id);
    assert.equal(after.externalIds.igdb, null);
    assert.deepEqual(after.autoTags, []);
    assert.ok(after.enrichment.tagsFetchedAt);
    assert.deepEqual(after.enrichment.tagSources, []);
  });

  test('a source that throws writes nothing, so the next run retries', async () => {
    const g = matched({ externalIds: { igdb: '1', steamAppId: null, rawg: null } });
    const { Game, deps } = setup([g], { throws: { igdb: Object.assign(new Error('IGDB games failed: 503'), { status: 503 }) } });
    assert.equal((await tagGame(ref(g), deps)).outcome, 'error');
    assert.equal(Game.calls.updateOne.length, 0);
    assert.equal(Game.get(g._id).enrichment.tagsFetchedAt, undefined);
  });

  test('neither provider configured → nothing asked, nothing written', async () => {
    const g = matched({ externalIds: { igdb: '1', steamAppId: null, rawg: '2' } });
    const { Game, deps } = setup([g], { igdbOn: false, rawgOn: false });
    assert.equal((await tagGame(ref(g), deps)).outcome, 'nothing-to-ask');
    assert.equal(Game.calls.updateOne.length, 0);
    assert.deepEqual(await runTagsPass(deps), { processed: 0, tagged: 0, untagged: 0, error: 0, skipped: 0 });
  });

  test('autoTags someone else set (no matching fingerprint) are kept; tagsFetchedAt still set', async () => {
    const g = matched({ autoTags: ['Cozy'], externalIds: { igdb: '1', steamAppId: null, rawg: null } });
    const { Game, deps } = setup([g], { igdb: { 1: ['Horror'] } });
    assert.equal(canReplaceAutoTags(g), false);
    await tagGame(ref(g), deps);
    const after = Game.get(g._id);
    assert.deepEqual(after.autoTags, ['Cozy']);
    assert.ok(after.enrichment.tagsFetchedAt);
    assert.ok(!after.enrichment.filled.includes('autoTags'));
  });

  test('autoTags enrichment wrote earlier (fingerprint matches) are replaced', async () => {
    const g = matched({
      autoTags: ['Cozy'],
      externalIds: { igdb: '1', steamAppId: null, rawg: null },
      enrichment: { status: 'matched', filled: ['autoTags'], filledHashes: { autoTags: valueHash(['Cozy']) } },
    });
    const { Game, deps } = setup([g], { igdb: { 1: ['Horror'] } });
    assert.equal(canReplaceAutoTags(g), true);
    await tagGame(ref(g), deps);
    assert.deepEqual(Game.get(g._id).autoTags, ['Horror']);
  });

  test('a concurrent edit (updatedAt moved) makes the write miss, re-read and retry', async () => {
    const g = matched({ externalIds: { igdb: '1', steamAppId: null, rawg: null } });
    let touched = false;
    const hooks = {
      async beforeUpdate(filter, update, model) {
        if (!touched) {
          touched = true;
          model.touch(g._id, (d) => {
            d.description = 'edited meanwhile';
          });
        }
      },
    };
    const { Game, deps } = setup([g], { igdb: { 1: ['Horror'] } }, { hooks });
    assert.equal((await tagGame(ref(g), deps)).outcome, 'tagged');
    assert.equal(Game.calls.updateOne.length, 2);
    const after = Game.get(g._id);
    assert.equal(after.description, 'edited meanwhile');
    assert.deepEqual(after.autoTags, ['Horror']);
  });

  test('a game unlinked between read and write is left alone', async () => {
    const g = matched({ externalIds: { igdb: '1', steamAppId: null, rawg: null } });
    const hooks = {
      async beforeUpdate(filter, update, model) {
        model.touch(g._id, (d) => {
          d.enrichment = { status: 'unlinked' };
        });
      },
    };
    const { Game, deps } = setup([g], { igdb: { 1: ['Horror'] } }, { hooks });
    assert.equal((await tagGame(ref(g), deps)).outcome, 'conflict');
    assert.deepEqual(Game.get(g._id).autoTags, []);
  });

  test('every read and write is scoped to the game’s household', async () => {
    const g = matched({ householdId: 'hh-a', externalIds: { igdb: '1', steamAppId: null, rawg: null } });
    const { Game, deps } = setup([g], { igdb: { 1: ['Horror'] } });
    assert.equal((await tagGame({ _id: g._id, householdId: 'hh-b' }, deps)).outcome, 'skipped');
    await tagGame(ref(g), deps);
    for (const c of Game.calls.updateOne) assert.equal(c.filter.householdId, 'hh-a');
  });
});

describe('tags pass — the run', () => {
  test('batches IGDB ids and Steam lookups, visits every selectable game once, pacing lives in the source', async () => {
    const games = [
      matched({ externalIds: { igdb: '1', steamAppId: null, rawg: null } }),
      matched({ externalIds: { igdb: '2', steamAppId: null, rawg: null } }),
      matched({ externalIds: { igdb: null, steamAppId: '30', rawg: null } }),
      matched({ externalIds: { igdb: null, steamAppId: null, rawg: '4' } }),
      matched({ externalIds: { igdb: '5', steamAppId: null, rawg: null }, enrichment: { status: 'matched', tagsFetchedAt: NOW } }),
      matched({ externalIds: { igdb: '6', steamAppId: null, rawg: null }, enrichment: { status: 'no-match' } }),
    ];
    const { Game, tags, deps } = setup(games, {
      igdb: { 1: ['Horror'], 2: ['Comedy'], 300: ['Fantasy'] },
      steam: { 30: '300' },
      rawg: { 4: ['Open World'] },
    });
    const tally = await runTagsPass(deps);
    assert.deepEqual(tally, { processed: 4, tagged: 4, untagged: 0, error: 0, skipped: 0 });
    // One steam lookup for the batch, one tag fetch for all IGDB ids (incl. the looked-up one).
    assert.deepEqual(tags.calls.igdbIdsBySteam, [['30']]);
    assert.deepEqual(tags.calls.igdbTagsByIds, [['1', '2', '300']]);
    assert.deepEqual(tags.calls.rawgTags, ['4']);
    assert.deepEqual(Game.get(games[2]._id).autoTags, ['Fantasy']);
    assert.deepEqual(Game.get(games[4]._id).autoTags, []); // already fetched: untouched
    // A second run finds nothing to do.
    assert.equal((await runTagsPass(deps)).processed, 0);
  });

  test('a failed batch prefetch falls back to per-game fetches', async () => {
    const tags = fakeTagSource({ throws: { igdb: new Error('boom') } });
    const cache = await prefetchBatch([{ externalIds: { igdb: '1' } }], tags);
    assert.equal(cache.igdbFetched.size, 0);
  });

  test('the worker runs the tags pass after the enrichment loop', async () => {
    const g = matched({ externalIds: { igdb: '1', steamAppId: null, rawg: null } });
    const providers = fakeProviderSet();
    providers.tags = fakeTagSource({ igdb: { 1: ['Horror'] } });
    const Game = createFakeGameModel([g]);
    const worker = createWorker({ Game, providers, now: () => NOW });
    worker.run({ trigger: 'test' });
    const summary = await worker.whenIdle();
    assert.equal(summary.tags.tagged, 1);
    assert.deepEqual(Game.get(g._id).autoTags, ['Horror']);
    assert.equal((await worker.status('default')).tagsQueued, 0);
  });
});

describe('inline tags on a new match, and unlink', () => {
  const pending = (over = {}) => ({
    _id: nextId(),
    householdId: 'default',
    title: 'Outer Wilds',
    tags: ['mine'],
    autoTags: [],
    copies: [],
    developers: [],
    publishers: [],
    genres: [],
    description: '',
    releaseDate: null,
    modes: [],
    maxLocalPlayers: null,
    platformsAvailable: [],
    timeToBeat: { main: null, extra: null, complete: null },
    externalIds: { igdb: null, steamAppId: null, rawg: null },
    coverPath: null,
    enrichment: null,
    ...over,
  });

  test('an IGDB match is tagged inline from the detail’s own terms — no second IGDB call', async () => {
    const g = pending();
    const providers = fakeProviderSet({
      igdb: {
        configured: true,
        search: { 'Outer Wilds': [searchHit('igdb', '11737', 'Outer Wilds')] },
        details: { 11737: detailOf('igdb', '11737', 'Outer Wilds', { tagTerms: ['Science fiction', 'Open world'] }) },
      },
    });
    providers.tags = fakeTagSource();
    const Game = createFakeGameModel([g]);
    const deps = { Game, providers, fetchCover: async () => null, now: () => NOW };
    const { outcome } = await enrichGame(ref(g), deps);
    assert.equal(outcome, 'matched');
    const after = Game.get(g._id);
    assert.deepEqual(after.autoTags, ['Open World', 'Sci-fi']);
    assert.deepEqual(after.tags, ['mine']);
    assert.deepEqual(after.enrichment.tagSources, ['igdb']);
    assert.equal(providers.tags.calls.igdbTagsByIds.length, 0);
  });

  test('a manual apply is tagged inline too; an inline failure never fails the match', async () => {
    const g = pending();
    const providers = fakeProviderSet({
      rawg: { configured: true, details: { 58764: detailOf('rawg', '58764', 'Outer Wilds', { tagTerms: ['Space'] }) } },
    });
    providers.tags = fakeTagSource({ rawgOn: true });
    const Game = createFakeGameModel([g]);
    const deps = { Game, providers, fetchCover: async () => null, now: () => NOW };
    const res = await applyCandidate(ref(g), { provider: 'rawg', providerId: '58764' }, deps);
    assert.equal(res.enrichment.status, 'matched');
    assert.deepEqual(Game.get(g._id).autoTags, ['Space']);

    const g2 = pending();
    const providers2 = fakeProviderSet({ rawg: { configured: true, details: { 1: detailOf('rawg', '1', 'Outer Wilds') } } });
    providers2.tags = fakeTagSource({ throws: { rawg: new Error('down') } });
    const Game2 = createFakeGameModel([g2]);
    const res2 = await applyCandidate(ref(g2), { provider: 'rawg', providerId: '1' }, { Game: Game2, providers: providers2, fetchCover: async () => null, now: () => NOW });
    assert.equal(res2.enrichment.status, 'matched');
  });

  test('unlink clears autoTags and tagsFetchedAt while they are still enrichment’s', async () => {
    const g = matched({ externalIds: { igdb: '1', steamAppId: null, rawg: null } });
    const { Game, deps } = setup([g], { igdb: { 1: ['Horror'] } });
    await tagGame(ref(g), deps);
    const { cleared } = await unlinkGame(ref(g), deps);
    const after = Game.get(g._id);
    assert.ok(cleared.includes('autoTags'));
    assert.deepEqual(after.autoTags, []);
    assert.equal(after.enrichment.status, 'unlinked');
    assert.equal(after.enrichment.tagsFetchedAt, null);
    assert.deepEqual(after.enrichment.tagSources, []);
  });

  test('unlink keeps autoTags that changed after enrichment wrote them', async () => {
    const g = matched({ externalIds: { igdb: '1', steamAppId: null, rawg: null } });
    const { Game, deps } = setup([g], { igdb: { 1: ['Horror'] } });
    await tagGame(ref(g), deps);
    Game.touch(g._id, (d) => {
      d.autoTags = ['Horror', 'Cozy'];
    });
    const { kept } = await unlinkGame(ref(g), deps);
    assert.ok(kept.includes('autoTags'));
    assert.deepEqual(Game.get(g._id).autoTags, ['Horror', 'Cozy']);
  });
});

// ── Genres ───────────────────────────────────────────────────────────────────

describe('canonical genres on write', () => {
  test('planFill writes canonical genres', () => {
    const plan = planFill({ genres: [] }, { genres: ['Role-playing (RPG)', 'RPG', 'Platform'] });
    assert.deepEqual(plan.set.genres, ['RPG', 'Platformer']);
  });

  test('the Playnite mapping writes canonical genres', () => {
    const m = mapEntry({ playniteId: 'p1', name: 'Hades', genres: ['Role-playing (RPG)', 'Hack and slash/Beat \'em up', 'Indie'] });
    assert.deepEqual(m.genres, ['RPG', 'Hack & Slash', 'Indie']);
  });
});

describe('genre boot migration', () => {
  const g = (householdId, genres, extra = {}) => ({ _id: nextId(), householdId, title: 't', genres, ...extra });

  test('normalizes, dedupes, is idempotent, and logs the count once per run', async () => {
    const games = [
      g('default', ['Role-playing (RPG)', 'RPG', 'Adventure']),
      g('default', ['Simulator']),
      g('default', ['Adventure', 'Indie']), // already canonical
      g('other-household', ['Platform']),
    ];
    const Game = createFakeGameModel(games);
    const logs = [];
    const logger = { info: (obj, msg) => logs.push({ obj, msg }) };
    assert.deepEqual(await migrateGenres({ Game, logger }), { scanned: 4, changed: 3 });
    assert.deepEqual(Game.get(games[0]._id).genres, ['RPG', 'Adventure']);
    assert.deepEqual(Game.get(games[1]._id).genres, ['Simulation']);
    assert.deepEqual(Game.get(games[3]._id).genres, ['Platformer']);
    assert.equal(logs.length, 1);
    assert.match(logs[0].msg, /3 game/);
    // Every op scoped to its own game's household.
    for (const op of Game.calls.bulkWrite[0]) {
      const row = games.find((x) => x._id === op.updateOne.filter._id);
      assert.equal(op.updateOne.filter.householdId, row.householdId);
    }
    assert.deepEqual(await migrateGenres({ Game, logger }), { scanned: 4, changed: 0 });
  });

  test('guarded on the array it read: a concurrent edit is not overwritten', async () => {
    const row = g('default', ['Simulator']);
    const Game = createFakeGameModel([row]);
    const ops = planGenreMigration([{ ...row }]);
    Game.touch(row._id, (d) => {
      d.genres = ['Simulator', 'Racing'];
    });
    await Game.bulkWrite(ops);
    assert.deepEqual(Game.get(row._id).genres, ['Simulator', 'Racing']);
  });

  test('genres enrichment wrote keep their unlink fingerprint', async () => {
    const row = g('default', ['Platform'], { enrichment: { status: 'matched', filled: ['genres'], filledHashes: { genres: valueHash(['Platform']) } } });
    const edited = g('default', ['Platform'], { enrichment: { status: 'matched', filled: ['genres'], filledHashes: { genres: 'someone-edited' } } });
    const Game = createFakeGameModel([row, edited]);
    await migrateGenres({ Game });
    assert.equal(Game.get(row._id).enrichment.filledHashes.genres, valueHash(['Platformer']));
    assert.equal(Game.get(edited._id).enrichment.filledHashes.genres, 'someone-edited');
  });
});
