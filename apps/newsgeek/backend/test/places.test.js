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

describe('the south-Arkansas gazetteer (2026-10-10)', () => {
  test('lower-case words are never places; Title Case and ALL CAPS are', () => {
    assert.deepEqual(m('There is hope for a deal', ['hempstead-county-ar']), []);
    assert.deepEqual(m('Hope council votes', ['hempstead-county-ar']), ['hope-ar']);
    assert.deepEqual(m('HOPE COUNCIL VOTES', ['hempstead-county-ar']), ['hope-ar']);
  });

  test('every town and county needs Arkansas context by default', () => {
    assert.deepEqual(m('Union County jail expansion', ['us']), []);
    assert.deepEqual(m('Conway police chief named', ['us']), []);
    assert.deepEqual(m('Union County jail expansion', ['arkansas']), ['union-county-ar']);
  });

  test('names unique to Arkansas need none', () => {
    assert.deepEqual(m('Pine Bluff schools close', ['us']), ['pine-bluff-ar']);
    assert.deepEqual(m('Gurdon wins', []), ['gurdon-ar']);
  });

  test('Hot Springs, Texarkana and El Dorado are NOT unique', () => {
    assert.deepEqual(m('Hot Springs, S.D. rodeo', ['us']), []);
    assert.deepEqual(m('El Dorado, Kan. refinery', ['us']), []);
  });

  test('common-word places need strong context: Arkansas alone is not enough', () => {
    assert.deepEqual(m('Hope for the holidays drive', ['arkansas']), []);
    assert.deepEqual(m('Stamps mayor resigns', ['pulaski-county-ar']), []);
  });

  test('…the source covering the place or its county is', () => {
    assert.deepEqual(m('Stamps mayor resigns', ['lafayette-county-ar']), ['stamps-ar']);
    assert.deepEqual(m('Hope council votes', ['hope-ar']), ['hope-ar']);
  });

  test('…so is naming the county, or "<Name>, Ark."', () => {
    assert.deepEqual(m('Hope, Hempstead County officials say', ['us']), ['hempstead-county-ar', 'hope-ar']);
    assert.deepEqual(m('A Hope, Ark. man was charged', ['us']), ['hope-ar']);
    assert.deepEqual(m('Magnolia, Arkansas plant to close', ['us']), ['arkansas', 'magnolia-ar']);
  });
});
