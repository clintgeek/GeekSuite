/**
 * src/ingest/places.js — gazetteer matching over the real seed data.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlaceMatcher } from '../src/ingest/places.js';
import { PLACES } from '../src/seed/data.js';

// The seed's places with ids = slugs, parents wired by slug.
const places = PLACES.map((p) => ({ _id: p.slug, slug: p.slug, name: p.name, kind: p.kind, aliases: p.aliases, parentId: p.parent }));
const { match } = buildPlaceMatcher(places);
const m = (text, sourcePlaces = []) => match(text, sourcePlaces).sort();

describe('whole words, case-insensitive', () => {
  test('names and aliases match as phrases', () => {
    assert.deepEqual(m('ARKADELPHIA school board meets'), ['arkadelphia-ar']);
    assert.deepEqual(m('Deputies in Hot Spring Co. said'), ['hot-spring-county-ar']);
    assert.deepEqual(m('Magnet   Cove fire'), ['magnet-cove-ar']);
  });

  test('no partial-word hits', () => {
    assert.deepEqual(m('Arkadelphians and Gurdonites'), []);
  });
});

describe('Hot Springs (the city) vs Hot Spring County', () => {
  test('the county never tags the city, the city never tags the county', () => {
    assert.deepEqual(m('Hot Spring County deputies', ['arkansas']), ['hot-spring-county-ar']);
    assert.deepEqual(m('Hot Springs police', ['arkansas']), ['hot-springs-ar']);
  });

  test('Hot Springs Village is one match, not also Hot Springs', () => {
    assert.deepEqual(m('Storm near Hot Springs Village', ['arkansas']), ['hot-springs-village-ar']);
  });

  test('both named → both tagged', () => {
    assert.deepEqual(m('From Hot Springs to Hot Spring County', ['arkansas']), ['hot-spring-county-ar', 'hot-springs-ar']);
  });
});

describe('ambiguous names need Arkansas context', () => {
  test('"Malvern" alone from a national source: not tagged', () => {
    assert.deepEqual(m('Malvern, Pa. borough meeting', ['us']), []);
    assert.deepEqual(m('Las Vegas: Clark County schools', ['us']), []);
  });

  test('tagged when the source covers Arkansas…', () => {
    assert.deepEqual(m('Malvern council meets', ['hot-spring-county-ar']), ['malvern-ar']);
  });

  test('…or the text names an unambiguous Arkansas place', () => {
    assert.deepEqual(m('Malvern and Arkadelphia councils meet', ['us']), ['arkadelphia-ar', 'malvern-ar']);
    assert.deepEqual(m('Bismarck, Arkansas', []), ['arkansas', 'bismarck-ar']);
  });
});
