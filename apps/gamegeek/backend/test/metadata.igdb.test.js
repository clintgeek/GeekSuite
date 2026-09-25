import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  normalizeIgdbGame,
  normalizeIgdbSearchResults,
  unixSecondsToUtcMidnightIso,
} from '../src/metadata/igdb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'igdb-search.json'), 'utf8'));

describe('unixSecondsToUtcMidnightIso', () => {
  test('converts to a UTC-midnight ISO date', () => {
    // 2020-12-25T22:00:00Z would be Dec 26 in some local TZs — must stay UTC.
    assert.equal(unixSecondsToUtcMidnightIso(1608940800), '2020-12-26T00:00:00.000Z');
  });

  test('null/undefined/non-finite -> null', () => {
    assert.equal(unixSecondsToUtcMidnightIso(null), null);
    assert.equal(unixSecondsToUtcMidnightIso(undefined), null);
    assert.equal(unixSecondsToUtcMidnightIso(NaN), null);
  });
});

describe('normalizeIgdbGame (fixture: Hades)', () => {
  const [hades] = fixture;
  const candidate = normalizeIgdbGame(hades);

  test('shape', () => {
    assert.equal(candidate.provider, 'igdb');
    assert.equal(candidate.providerId, '113112');
    assert.equal(candidate.title, 'Hades');
    assert.equal(candidate.releaseDate, '2020-12-26T00:00:00.000Z');
  });

  test('developers and publishers come from involved_companies roles', () => {
    assert.deepEqual(candidate.developers, ['Supergiant Games']);
    assert.deepEqual(candidate.publishers, ['Supergiant Games']);
  });

  test('genres pass through as-is (free vocabulary)', () => {
    assert.deepEqual(candidate.genres, ['Role-playing (RPG)', "Hack and slash/Beat 'em up"]);
  });

  test('platforms are mapped to our vocabulary and an unknown one is dropped', () => {
    assert.deepEqual(candidate.platforms, ['pc', 'switch', 'mac']);
  });

  test('modes are mapped to our vocabulary', () => {
    assert.deepEqual(candidate.modes, ['single']);
  });

  test('cover URL is built from the image_id at t_cover_big', () => {
    assert.equal(candidate.coverUrl, 'https://images.igdb.com/igdb/image/upload/t_cover_big/co39hs.jpg');
  });

  test('external_games category 1 (Steam) becomes externalIds.steamAppId', () => {
    assert.deepEqual(candidate.externalIds, { igdb: '113112', steamAppId: '1145360' });
  });
});

describe('normalizeIgdbGame handles a thin/missing-field record', () => {
  const [, thin] = fixture;
  const candidate = normalizeIgdbGame(thin);

  test('no cover, no companies, no platforms -> safe defaults, not a throw', () => {
    assert.equal(candidate.coverUrl, null);
    assert.deepEqual(candidate.developers, []);
    assert.deepEqual(candidate.publishers, []);
    assert.deepEqual(candidate.platforms, []);
    assert.equal(candidate.releaseDate, null);
    assert.deepEqual(candidate.externalIds, { igdb: '999' });
  });
});

describe('normalizeIgdbSearchResults', () => {
  test('maps every element and tolerates a non-array input', () => {
    assert.equal(normalizeIgdbSearchResults(fixture).length, 2);
    assert.deepEqual(normalizeIgdbSearchResults(null), []);
    assert.deepEqual(normalizeIgdbSearchResults(undefined), []);
  });
});
