/**
 * Playnite export parsing and field mapping
 * (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md §The file, §Mapping).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExport, parseJsonText, PlayniteFileError, MAX_GAMES } from '../src/playnite/parse.js';
import {
  mapEntry,
  normalizeTitle,
  parseReleaseDate,
  storefrontFor,
  formatFor,
  mapPlatforms,
  copyPlatformFor,
} from '../src/playnite/mapping.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'playnite-library.sample.json');
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

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

describe('parseExport', () => {
  test('the fixture parses: 14 entries, none invalid', () => {
    const p = parseExport(fixture());
    assert.equal(p.schemaVersion, 1);
    assert.equal(p.total, 14);
    assert.equal(p.entries.length, 14);
    assert.equal(p.invalid, 0);
    assert.equal(p.generatedAtUtc, '2026-09-25T16:21:03Z');
  });

  test('an unknown schemaVersion is PLAYNITE_BAD_FILE', () => {
    for (const v of [2, 0, '1', null, undefined]) {
      assert.throws(
        () => parseExport({ schemaVersion: v, games: [] }),
        (err) => err instanceof PlayniteFileError && err.code === 'PLAYNITE_BAD_FILE' && err.status === 400,
        `schemaVersion ${v}`
      );
    }
  });

  test('not an object, or no games array, is PLAYNITE_BAD_FILE', () => {
    for (const bad of [null, [], 'x', 5, { schemaVersion: 1 }, { schemaVersion: 1, games: {} }]) {
      assert.throws(() => parseExport(bad), (err) => err.code === 'PLAYNITE_BAD_FILE');
    }
  });

  test(`more than ${MAX_GAMES} games is PLAYNITE_BAD_FILE`, () => {
    const games = new Array(MAX_GAMES + 1).fill(0);
    assert.throws(() => parseExport({ schemaVersion: 1, games }), (err) => err.code === 'PLAYNITE_BAD_FILE');
  });

  test('invalid entries are counted, not fatal', () => {
    const p = parseExport({
      schemaVersion: 1,
      games: [
        entry(),
        entry({ playniteId: '' }), // empty id
        { name: 'no id' },
        entry({ playniteId: 'pid-3', name: 42 }), // name not a string
        entry({ playniteId: 'pid-4', playtimeSeconds: -5 }),
        null,
        'garbage',
        entry({ playniteId: 'pid-5' }),
      ],
    });
    assert.equal(p.total, 8);
    assert.equal(p.entries.length, 2);
    assert.equal(p.invalid, 6);
    // An invalid entry that still names a playniteId is remembered, so its
    // existing copy isn't reported as missing from the file.
    assert.ok(p.seenPlayniteIds.has('pid-3'));
    assert.ok(p.seenPlayniteIds.has('pid-4'));
  });

  test('installDirectory (and any unknown key) is never kept', () => {
    const p = parseExport({
      schemaVersion: 1,
      games: [entry({ installDirectory: 'C:\\Games\\Hades', somethingNew: 1 })],
    });
    assert.equal('installDirectory' in p.entries[0], false);
    assert.equal('somethingNew' in p.entries[0], false);
    assert.equal(JSON.stringify(p).includes('C:\\\\Games'), false);
  });

  test('parseJsonText tolerates a UTF-8 BOM and rejects non-JSON', () => {
    assert.deepEqual(parseJsonText(Buffer.from('\uFEFF{"a":1}', 'utf8')), { a: 1 });
    assert.throws(() => parseJsonText('{not json'), (err) => err.code === 'PLAYNITE_BAD_FILE');
  });
});

describe('mapping tables', () => {
  test('every storefront in the spec', () => {
    const table = {
      Epic: 'epic',
      GOG: 'gog',
      Amazon: 'amazon',
      Xbox: 'xbox',
      'Ubisoft Connect': 'ubisoft',
      Steam: 'steam',
      'Battle.net': 'battle-net',
      'EA app': 'ea',
      Origin: 'ea',
      'itch.io': 'itch',
      'Xbox Game Pass': 'xbox',
    };
    for (const [source, storefront] of Object.entries(table)) assert.equal(storefrontFor(source), storefront, source);
  });

  test('anything else, or a missing sourceName, is other', () => {
    for (const s of ['Humble', 'Legacy Games', '', null, undefined]) assert.equal(storefrontFor(s), 'other');
    const m = mapEntry(entry({ sourceName: undefined }));
    assert.equal(m.storefront, 'other');
    assert.equal(m.format, 'digital');
    assert.equal(m.playnite.sourceName, null);
  });

  test('Game Pass is a subscription; everything else is digital', () => {
    assert.equal(formatFor('Xbox Game Pass'), 'subscription');
    for (const s of ['Xbox', 'Steam', 'Epic', undefined]) assert.equal(formatFor(s), 'digital');
  });

  test('every platform in the spec; unknown names dropped', () => {
    assert.deepEqual(
      mapPlatforms([
        'PC (Windows)',
        'PC (Linux)',
        'Macintosh',
        'Microsoft Xbox Series',
        'Microsoft Xbox One',
        'Microsoft Xbox 360',
        'Sony PlayStation 5',
        'Sony PlayStation 4',
        'Nintendo Switch',
        'Sega Dreamcast',
        'PC (Windows)',
      ]),
      ['pc', 'linux', 'mac', 'xbox-series', 'xbox-one', 'xbox-360', 'ps5', 'ps4', 'switch']
    );
  });

  test('copy platform: an Xbox console for an Xbox/Game Pass source (Series before One), else pc', () => {
    assert.equal(copyPlatformFor('Xbox', ['xbox-one', 'xbox-series', 'pc']), 'xbox-series');
    assert.equal(copyPlatformFor('Xbox Game Pass', ['xbox-one', 'pc']), 'xbox-one');
    assert.equal(copyPlatformFor('Xbox', ['pc']), 'pc');
    assert.equal(copyPlatformFor('Steam', ['xbox-series', 'pc']), 'pc');
    assert.equal(copyPlatformFor('Epic', ['switch']), 'pc');
  });

  test('release dates: unpadded Y-M-D at UTC midnight; unparseable → null', () => {
    assert.equal(parseReleaseDate('2022-8-11').toISOString(), '2022-08-11T00:00:00.000Z');
    assert.equal(parseReleaseDate('1993-03-25').toISOString(), '1993-03-25T00:00:00.000Z');
    for (const bad of ['2022-2-31', '2022-13-1', '2022', 'soon', '', null, undefined, 20220811]) {
      assert.equal(parseReleaseDate(bad), null, String(bad));
    }
  });

  test('steamAppId only when confidence is exact', () => {
    assert.equal(mapEntry(entry({ steamAppId: 761890, steamAppIdConfidence: 'exact' })).steamAppId, '761890');
    assert.equal(mapEntry(entry({ steamAppId: 761890, steamAppIdConfidence: 'none' })).steamAppId, null);
    assert.equal(mapEntry(entry({ steamAppIdConfidence: 'exact' })).steamAppId, null);
  });

  test('sortingName → lowercased sortTitle; else the computed one', () => {
    assert.equal(mapEntry(entry({ name: 'BioShock 2', sortingName: 'BioShock 02' })).sortTitle, 'bioshock 02');
    assert.equal(mapEntry(entry({ name: 'The Witness' })).sortTitle, 'witness, the');
  });

  test('categories + tags → tags, deduped case-insensitively and capped at 50', () => {
    const m = mapEntry(entry({ categories: ['Couch', 'Backlog'], tags: ['couch', 'Game Pass'] }));
    assert.deepEqual(m.tags, ['Couch', 'Backlog', 'Game Pass']);
    const many = Array.from({ length: 80 }, (_, i) => `t${i}`);
    assert.equal(mapEntry(entry({ tags: many })).tags.length, 50);
  });

  test('the playnite subdoc carries the copy fields', () => {
    const m = mapEntry(
      entry({ providerGameId: 12345, playtimeSeconds: 3600.4, lastActivity: '2026-09-01T10:00:00Z', hidden: true })
    );
    assert.deepEqual(m.playnite, {
      playniteId: 'pid-1',
      providerGameId: '12345',
      sourceName: 'Epic',
      playtimeSeconds: 3600,
      lastActivity: new Date('2026-09-01T10:00:00Z'),
      hidden: true,
      isInstalled: false,
    });
    assert.equal(mapEntry(entry({ isInstalled: true })).playnite.isInstalled, true);
    assert.equal(mapEntry(entry({ isInstalled: null })).playnite.isInstalled, false);
  });
});

describe('normalizeTitle', () => {
  test('lowercase, drop ™®©, & → and, letters and digits only', () => {
    assert.equal(normalizeTitle('DOOM™ Eternal®'), 'doometernal');
    assert.equal(normalizeTitle('Ratchet & Clank'), normalizeTitle('Ratchet and Clank'));
    assert.equal(normalizeTitle('Fallout: New Vegas'), 'falloutnewvegas');
    assert.equal(normalizeTitle('ARCADE PARADISE'), normalizeTitle('Arcade Paradise'));
  });

  test("Director's Cut stays distinct from the base game", () => {
    assert.notEqual(normalizeTitle("DEATH STRANDING DIRECTOR'S CUT"), normalizeTitle('Death Stranding'));
  });

  test('a title of only symbols does not collapse to the empty key', () => {
    assert.notEqual(normalizeTitle('???'), '');
    assert.notEqual(normalizeTitle('???'), normalizeTitle('!!!'));
  });
});
