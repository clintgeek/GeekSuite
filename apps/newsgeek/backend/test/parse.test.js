/**
 * src/ingest/parse.js — RSS 2.0, Atom, Google News, NWS, malformed.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, FeedParseError } from '../src/ingest/parse.js';
import { fixture } from './helpers/fetch.js';

describe('RSS 2.0', () => {
  const out = parseFeed(fixture('rss.xml'), 'rss');
  test('items with guid, link, title, summary, content, author, date', () => {
    assert.equal(out.kind, 'rss');
    assert.equal(out.items.length, 4);
    const [a] = out.items;
    assert.equal(a.guid, 'https://arkadelphian.com/?p=1001');
    assert.match(a.link, /^https:\/\/arkadelphian\.com\/2026\/10\/09\/board-approves-budget\/\?utm_source=rss&utm_medium=rss/);
    assert.equal(a.author, 'Joel Phelps');
    assert.equal(a.date, 'Fri, 09 Oct 2026 14:00:00 +0000');
    assert.match(a.summary, /^<p>The board met/);
    assert.match(a.content, /FULL ARTICLE BODY/);
  });
});

describe('Atom', () => {
  const out = parseFeed(fixture('atom.xml'), 'atom');
  test('entries: alternate link, id, author name, published (else updated)', () => {
    assert.equal(out.kind, 'atom');
    assert.equal(out.items.length, 2);
    const [a, b] = out.items;
    assert.equal(a.link, 'https://www.theverge.com/tech/1/apple-thing');
    assert.equal(a.guid, 'https://www.theverge.com/tech/1');
    assert.equal(a.author, 'Nilay Patel');
    assert.equal(a.date, '2026-10-10T11:00:00Z');
    assert.equal(a.title, 'Apple&#8217;s new thing & you');
    assert.equal(b.link, 'https://www.theverge.com/tech/2/only-updated');
    assert.equal(b.date, '2026-10-09T08:00:00Z');
    assert.equal(b.summary, '');
    assert.match(b.content, /Content only/);
  });

  test('declared rss but the document is Atom: sniffed', () => {
    assert.equal(parseFeed(fixture('atom.xml'), 'rss').kind, 'atom');
  });
});

describe('Google News search feed', () => {
  test('<source> text and url are carried', () => {
    const out = parseFeed(fixture('gnews.xml'), 'rss');
    assert.equal(out.items.length, 5);
    assert.equal(out.items[0].sourceName, 'Arkansas Business');
    assert.equal(out.items[0].sourceUrl, 'https://www.arkansasbusiness.com');
    assert.equal(out.items[1].sourceUrl, 'https://www.legacy.com');
  });
});

describe('NWS alerts', () => {
  test('each feature → an item; @id link, headline (else event), ends wins over expires', () => {
    const out = parseFeed(fixture('nws.json'), 'nws');
    assert.equal(out.kind, 'nws');
    assert.equal(out.items.length, 2);
    const [a, b] = out.items;
    assert.equal(a.guid, 'urn:oid:2.49.0.1.840.0.aaa.001.1');
    assert.equal(a.link, 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.aaa.001.1');
    assert.match(a.title, /^Flood Watch issued/);
    assert.equal(a.expires, '2026-10-10T19:00:00-05:00');
    assert.equal(b.title, 'Dense Fog Advisory');
    assert.equal(b.expires, '2026-10-09T12:00:00-05:00');
  });
});

describe('malformed', () => {
  test('broken XML, empty bodies, HTML pages and bad JSON throw FeedParseError', () => {
    assert.throws(() => parseFeed(fixture('malformed.xml'), 'rss'), FeedParseError);
    assert.throws(() => parseFeed('', 'rss'), FeedParseError);
    assert.throws(() => parseFeed('<html><body>Hi</body></html>', 'rss'), FeedParseError);
    assert.throws(() => parseFeed('{not json', 'nws'), FeedParseError);
    assert.throws(() => parseFeed('{"type":"x"}', 'nws'), FeedParseError);
  });
});
