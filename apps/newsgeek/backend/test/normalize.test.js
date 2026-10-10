/**
 * src/ingest/normalize.js — excerpts, canonical URLs, title keys, dates.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import constants from '@geeksuite/schemas/newsgeek/constants';
import {
  stripHtml, capOnWord, makeExcerpt, canonicalUrl, titleKey, stripPublisherSuffix,
  resolvePublishedAt, domainMatches, decodeEntities, cleanTitle,
} from '../src/ingest/normalize.js';

const { EXCERPT_MAX } = constants;

describe('excerpts', () => {
  test('tags stripped, scripts dropped, entities decoded (incl. double-escaped), whitespace collapsed', () => {
    const out = stripHtml('<p>The board met &amp;nbsp;Tuesday.</p><script>alert(1)</script>\n<p>Caf&eacute; &#8212; &#x2019;ok&#8217;</p>');
    assert.equal(out, 'The board met Tuesday. Café — ’ok’');
  });

  test('capped at EXCERPT_MAX on a word boundary, with an ellipsis inside the cap', () => {
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
    const out = capOnWord(words);
    assert.ok(out.length <= EXCERPT_MAX, `length ${out.length}`);
    assert.ok(out.endsWith('…'));
    const body = out.slice(0, -1);
    assert.match(body, /word\d+$/, 'cut at the end of a whole word');
    assert.ok(words.startsWith(body));
  });

  test('inline tags join words; block tags separate them', () => {
    assert.equal(stripHtml('It is <em>new</em>. <a href="x">Link</a>s'), 'It is new. Links');
    assert.equal(stripHtml('<p>One</p><p>Two</p>line<br>break'), 'One Two line break');
  });

  test('a short text is left alone', () => {
    assert.equal(capOnWord('  short   text '), 'short text');
  });

  test('summary wins; content is the fallback, sliced; title-only sources store none', () => {
    assert.equal(makeExcerpt({ summary: '<b>sum</b>', content: '<p>body</p>' }), 'sum');
    assert.equal(makeExcerpt({ summary: '', content: '<div><p>Only <b>content</b></p></div>' }), 'Only content');
    assert.equal(makeExcerpt({ summary: 'sum' }, { contentLevel: 'title' }), '');
    const huge = `<p>${'lorem ipsum '.repeat(50_000)}</p>`;
    assert.ok(makeExcerpt({ content: huge }).length <= EXCERPT_MAX);
  });

  test('titles: tags stripped and entities decoded', () => {
    assert.equal(cleanTitle('Board &amp;#8212; <i>Arkadelphia</i>'), 'Board — Arkadelphia');
  });

  test('unknown named entities are left as text', () => {
    assert.equal(decodeEntities('a &bogus; b'), 'a &bogus; b');
  });
});

describe('canonicalUrl', () => {
  test('utm_*, fbclid, gclid and friends stripped; fragment removed; host lowercased', () => {
    assert.equal(
      canonicalUrl('https://WWW.Example.COM/News/Story?id=7&utm_source=rss&utm_medium=x&fbclid=abc&gclid=1&mc_cid=9#comments'),
      'https://www.example.com/News/Story?id=7',
    );
  });

  test('a URL left with no query loses its "?"; meaningful params are kept in order', () => {
    assert.equal(canonicalUrl('https://a.com/x?utm_campaign=y'), 'https://a.com/x');
    assert.equal(canonicalUrl('https://a.com/x?b=2&a=1&ocid=z'), 'https://a.com/x?b=2&a=1');
    assert.equal(canonicalUrl('https://a.com:443/x'), 'https://a.com/x');
  });

  test('a content id named like a tracker family member is kept (cid is not stripped)', () => {
    assert.equal(canonicalUrl('https://a.com/x?cid=123'), 'https://a.com/x?cid=123');
  });

  test('garbage in → trimmed garbage out, never a throw', () => {
    assert.equal(canonicalUrl('  not a url '), 'not a url');
  });
});

describe('titleKey', () => {
  test('lowercased, punctuation stripped, whitespace collapsed, accents folded', () => {
    assert.equal(titleKey('  Café owner’s “BIG” day — in  Malvern!  '), 'cafe owners big day in malvern');
  });

  test('aggregator suffix removed when it names the publisher', () => {
    assert.equal(titleKey('Water plant OK’d - Arkansas Business', { publisher: 'Arkansas Business' }), 'water plant okd');
    assert.equal(stripPublisherSuffix('Water plant - Arkansas Business', 'Arkansas Business'), 'Water plant');
    // A dash that isn't the publisher stays.
    assert.equal(stripPublisherSuffix('Malvern - a town', 'Arkansas Business'), 'Malvern - a town');
  });
});

describe('publishedAt', () => {
  const fetchedAt = new Date('2026-10-10T15:00:00Z');
  test('a parseable past date is used', () => {
    assert.equal(resolvePublishedAt('Fri, 09 Oct 2026 14:00:00 +0000', fetchedAt).toISOString(), '2026-10-09T14:00:00.000Z');
  });
  test('missing, unparseable, or more than an hour ahead → fetchedAt', () => {
    assert.equal(resolvePublishedAt('', fetchedAt), fetchedAt);
    assert.equal(resolvePublishedAt('next tuesday-ish', fetchedAt), fetchedAt);
    assert.equal(resolvePublishedAt('2026-10-10T16:30:00Z', fetchedAt), fetchedAt);
    assert.equal(resolvePublishedAt('2026-10-10T15:30:00Z', fetchedAt).toISOString(), '2026-10-10T15:30:00.000Z');
  });
});

describe('domainMatches', () => {
  test('suffix match on a label boundary only', () => {
    assert.ok(domainMatches('obits.legacy.com', 'legacy.com'));
    assert.ok(domainMatches('www.legacy.com', 'legacy.com'));
    assert.ok(!domainMatches('notlegacy.com', 'legacy.com'));
  });
});
