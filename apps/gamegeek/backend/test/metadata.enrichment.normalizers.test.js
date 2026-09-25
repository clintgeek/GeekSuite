/**
 * The provider normalizers enrichment depends on, against fixtures:
 *  - steam-appdetails-portal2.json and steam-search-doom.json were RECORDED
 *    live from the Steam store on 2026-09-25 (trimmed to the fields we read).
 *  - rawg-*.json and igdb-detail.json are hand-built to the providers'
 *    documented shapes (no RAWG/IGDB keys existed to record with).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeSteamAppDetails,
  normalizeSteamSearchResults,
  parseSteamReleaseDate,
  steamLibraryCoverUrl,
} from '../src/metadata/steam.js';
import { normalizeRawgSearchResults, normalizeRawgGame, parseRawgDate } from '../src/metadata/rawg.js';
import { normalizeIgdbDetail, normalizeIgdbTimeToBeat, IGDB_DETAIL_FIELDS } from '../src/metadata/igdb.js';
import { COVER_HOSTS } from '../src/metadata/coverHosts.js';
import { isAllowedCoverHost } from '../src/lib/coverFetch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

describe('Steam appdetails (recorded: Portal 2)', () => {
  const raw = fixture('steam-appdetails-portal2.json');

  test('Steam keyed the body by 323180 for a request of 620 — we still find it by steam_appid', () => {
    assert.deepEqual(Object.keys(raw), ['323180']);
    const c = normalizeSteamAppDetails('620', raw);
    assert.ok(c);
    assert.equal(c.title, 'Portal 2');
    assert.deepEqual(c.externalIds, { steamAppId: '620' });
  });

  const c = normalizeSteamAppDetails('620', raw);

  test('entities in short_description are decoded', () => {
    assert.equal(c.description.includes('&quot;'), false);
    assert.match(c.description, /^The "Perpetual Testing Initiative" has been expanded/);
  });

  test('"Apr 18, 2011" → UTC midnight', () => assert.equal(c.releaseDate, '2011-04-18T00:00:00.000Z'));

  test('developers / publishers / genres', () => {
    assert.deepEqual(c.developers, ['Valve']);
    assert.deepEqual(c.publishers, ['Valve']);
    assert.deepEqual(c.genres, ['Action', 'Adventure']);
  });

  test('categories → our modes (Single-player, Multi-player, Co-op, Online Co-op, Shared/Split Screen Co-op)', () => {
    assert.deepEqual(c.modes, ['single', 'pvp-online', 'coop-online', 'coop-local']);
  });

  test('platforms windows/linux → pc/linux', () => assert.deepEqual(c.platforms, ['pc', 'linux']));

  test('cover order: library_600x900 portrait, then header_image', () => {
    assert.equal(c.coverUrls[0], steamLibraryCoverUrl('620'));
    assert.match(c.coverUrls[1], /\/header\.jpg\?t=/);
    for (const u of c.coverUrls) assert.ok(isAllowedCoverHost(u, COVER_HOSTS), u);
  });
});

describe('Steam appdetails — HTML and odd dates', () => {
  const body = (data) => ({ 42: { success: true, data: { name: 'X', ...data } } });

  test('tags stripped, <br> becomes a space, numeric entities decoded', () => {
    const c = normalizeSteamAppDetails('42', body({ short_description: 'Fight<br>and <b>win</b> &#8212; it&#39;s &amp; fun' }));
    assert.equal(c.description, "Fight and win — it's & fun");
  });

  test('a description longer than the schema cap is cut to it', () => {
    const c = normalizeSteamAppDetails('42', body({ short_description: 'word '.repeat(2000) }));
    assert.ok(c.description.length <= 5000);
    assert.ok(c.description.endsWith('…'));
  });

  test('coming_soon → null date even when a date string is present', () => {
    const c = normalizeSteamAppDetails('42', body({ release_date: { coming_soon: true, date: 'Q3 2027' } }));
    assert.equal(c.releaseDate, null);
  });
});

describe('parseSteamReleaseDate — the shapes Steam sends', () => {
  const cases = [
    ['5 Sep, 2022', '2022-09-05T00:00:00.000Z'],
    ['Sep 5, 2022', '2022-09-05T00:00:00.000Z'],
    ['05 Sept, 2022', '2022-09-05T00:00:00.000Z'],
    ['September 5, 2022', '2022-09-05T00:00:00.000Z'],
    ['Sep 2022', '2022-09-01T00:00:00.000Z'],
    ['2022', '2022-01-01T00:00:00.000Z'],
    ['Coming soon', null],
    ['To be announced', null],
    ['Q3 2024', null],
    ['', null],
  ];
  for (const [input, out] of cases) test(JSON.stringify(input), () => assert.equal(parseSteamReleaseDate(input), out));
});

describe('Steam storesearch (recorded: DOOM)', () => {
  const results = normalizeSteamSearchResults(fixture('steam-search-doom.json'));
  test('ten thin candidates, with the item platforms', () => {
    assert.equal(results.length, 10);
    const doom = results.find((r) => r.providerId === '379720');
    assert.equal(doom.title, 'DOOM');
    assert.deepEqual(doom.platforms, ['pc']);
    assert.equal(doom.releaseDate, null);
  });
});

describe('RAWG normalizer (fixtures)', () => {
  test('search results → candidates with a landscape cover', () => {
    const [hades, tba] = normalizeRawgSearchResults(fixture('rawg-search.json'));
    assert.equal(hades.provider, 'rawg');
    assert.equal(hades.providerId, '274755');
    assert.equal(hades.title, 'Hades');
    assert.equal(hades.releaseDate, '2020-09-17T00:00:00.000Z');
    assert.deepEqual(hades.platforms, ['pc', 'switch', 'mac']); // the unknown platform is dropped
    assert.deepEqual(hades.genres, ['Action', 'RPG']);
    assert.equal(hades.coverIsLandscape, true);
    assert.ok(isAllowedCoverHost(hades.coverUrl, COVER_HOSTS), 'media.rawg.io is on the cover allow-list');
    assert.deepEqual(hades.externalIds, { rawg: '274755' });
    assert.equal(tba.releaseDate, null);
    assert.equal(tba.coverUrl, null);
    assert.deepEqual(tba.platforms, []);
  });

  test('detail adds description (plain), developers, publishers, modes from tags', () => {
    const d = normalizeRawgGame(fixture('rawg-detail.json'));
    assert.equal(d.description, 'Defy the god of the dead as you hack and slash out of the Underworld & beyond.');
    assert.deepEqual(d.developers, ['Supergiant Games']);
    assert.deepEqual(d.publishers, ['Supergiant Games']);
    assert.deepEqual(d.modes, ['single']);
    assert.deepEqual(d.platforms, ['pc', 'ps5']);
  });

  test('HTML-only description is stripped', () => {
    const d = normalizeRawgGame({ id: 1, name: 'X', description: '<p>One &amp; two</p><p>three</p>' });
    assert.equal(d.description, 'One & two three');
  });

  test('parseRawgDate', () => {
    assert.equal(parseRawgDate('2020-09-17'), '2020-09-17T00:00:00.000Z');
    assert.equal(parseRawgDate(null), null);
    assert.equal(parseRawgDate('2020'), null);
  });

  test('tolerates an empty body', () => assert.deepEqual(normalizeRawgSearchResults({}), []));
});

describe('IGDB detail normalizer (fixture)', () => {
  const { game, timeToBeat } = fixture('igdb-detail.json');
  const d = normalizeIgdbDetail(game, timeToBeat);

  test('developer/publisher flags, deduped', () => {
    assert.deepEqual(d.developers, ['Valve']);
    assert.deepEqual(d.publishers, ['Electronic Arts', 'Valve']);
  });

  test('summary, release date, genres, platforms', () => {
    assert.match(d.description, /^Sequel to the acclaimed Portal/);
    assert.equal(d.releaseDate, '2011-04-18T00:00:00.000Z');
    assert.deepEqual(d.genres, ['Puzzle', 'Shooter']);
    assert.deepEqual(d.platforms, ['pc', 'ps3', 'xbox-360', 'linux']);
  });

  test('external_game_source 1 (the 2025 field name) → steamAppId', () => {
    assert.deepEqual(d.externalIds, { igdb: '1020', steamAppId: '620' });
  });

  test('the legacy `category` field still works', () => {
    const legacy = normalizeIgdbDetail({ ...game, external_games: [{ category: 1, uid: '620' }] });
    assert.equal(legacy.externalIds.steamAppId, '620');
  });

  test('multiplayer_modes → local/online co-op and max local players', () => {
    assert.deepEqual(d.modes, ['single', 'coop-online', 'coop-local']);
    assert.equal(d.maxLocalPlayers, 2);
  });

  test('time-to-beat seconds → hours (hastily/normally/completely → main/extra/complete)', () => {
    assert.deepEqual(d.timeToBeat, { main: 8.4, extra: 12.6, complete: 22.5 });
    assert.deepEqual(normalizeIgdbTimeToBeat([]), { main: null, extra: null, complete: null });
  });

  test('cover: the 2x portrait first, then cover_big', () => {
    assert.deepEqual(d.coverUrls, [
      'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1rs4.jpg',
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1rs4.jpg',
    ]);
  });

  test('detail query uses wildcards for the renamed sub-objects', () => {
    assert.match(IGDB_DETAIL_FIELDS, /external_games\.\*/);
    assert.match(IGDB_DETAIL_FIELDS, /multiplayer_modes\.\*/);
  });
});
