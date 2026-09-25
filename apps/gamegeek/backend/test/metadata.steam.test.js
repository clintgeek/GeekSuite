import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  normalizeSteamSearchResults,
  normalizeSteamAppDetails,
  parseSteamReleaseDate,
  steamLibraryCoverUrl,
} from '../src/metadata/steam.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const searchFixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'steam-search.json'), 'utf8'));
const detailsFixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'steam-appdetails.json'), 'utf8'));

describe('parseSteamReleaseDate', () => {
  test('parses "D Mon, YYYY"', () => {
    assert.equal(parseSteamReleaseDate('17 Sep, 2020'), '2020-09-17T00:00:00.000Z');
  });

  test('parses "Mon D, YYYY"', () => {
    assert.equal(parseSteamReleaseDate('Sep 17, 2020'), '2020-09-17T00:00:00.000Z');
  });

  test('parses "Mon YYYY" as the first of the month', () => {
    assert.equal(parseSteamReleaseDate('Sep 2020'), '2020-09-01T00:00:00.000Z');
  });

  test('parses a bare year as Jan 1', () => {
    assert.equal(parseSteamReleaseDate('2020'), '2020-01-01T00:00:00.000Z');
  });

  test('"Coming soon" and other unparseable text -> null, not a guess', () => {
    assert.equal(parseSteamReleaseDate('Coming soon'), null);
    assert.equal(parseSteamReleaseDate(''), null);
    assert.equal(parseSteamReleaseDate(undefined), null);
  });
});

describe('normalizeSteamSearchResults (fixture)', () => {
  const [hades] = normalizeSteamSearchResults(searchFixture);

  test('thin candidate shape from search', () => {
    assert.equal(hades.provider, 'steam-store');
    assert.equal(hades.providerId, '1145360');
    assert.equal(hades.title, 'Hades');
    assert.equal(hades.releaseDate, null);
    assert.deepEqual(hades.platforms, ['pc']);
    assert.deepEqual(hades.genres, []);
    assert.equal(hades.coverUrl, steamLibraryCoverUrl('1145360'));
    assert.deepEqual(hades.externalIds, { steamAppId: '1145360' });
  });

  test('tolerates a missing items array', () => {
    assert.deepEqual(normalizeSteamSearchResults({}), []);
    assert.deepEqual(normalizeSteamSearchResults(null), []);
  });
});

describe('normalizeSteamAppDetails (fixture: Hades)', () => {
  const candidate = normalizeSteamAppDetails('1145360', detailsFixture);

  test('full candidate shape', () => {
    assert.equal(candidate.provider, 'steam-store');
    assert.equal(candidate.title, 'Hades');
    assert.equal(candidate.releaseDate, '2020-09-17T00:00:00.000Z');
    assert.deepEqual(candidate.developers, ['Supergiant Games']);
    assert.deepEqual(candidate.publishers, ['Supergiant Games']);
    assert.deepEqual(candidate.genres, ['Adventure', 'Indie']);
    assert.equal(candidate.description, 'A rogue-like dungeon crawler from the creators of Bastion, Transistor, and Pyre.');
  });

  test('platforms come from the windows/mac/linux booleans', () => {
    assert.deepEqual(candidate.platforms, ['pc', 'mac']);
  });

  test('modes are mapped from categories, unknowns dropped', () => {
    assert.deepEqual(candidate.modes, ['single']);
  });

  test('cover falls back to header_image', () => {
    assert.equal(candidate.coverUrl, 'https://cdn.akamai.steamstatic.com/steam/apps/1145360/header.jpg');
  });

  test('an app Steam reports unsuccessful returns null, not a throw', () => {
    assert.equal(normalizeSteamAppDetails('9999999', detailsFixture), null);
  });

  test('an app id absent from the response returns null', () => {
    assert.equal(normalizeSteamAppDetails('123', detailsFixture), null);
  });
});
