/**
 * src/cluster/stories.js — the story rule: what joins (cosine to the centroid
 * AND to the seed), what is a syndicated copy, when a story is open, that
 * official notices stand alone. Pure: hand-made unit vectors, no Mongo.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignBatch, findStory, newStory, addToStory, isOpen, outletKey, JOIN, SEED_FLOOR, WINDOW_MS, MAX_SPAN_MS, MIN_TEXT_CHARS,
} from '../src/cluster/stories.js';

const H = 60 * 60 * 1000;
const T0 = Date.parse('2026-11-20T12:00:00Z');

/** A unit vector at `deg` degrees in the plane: cosine between two is cos(the angle between them). */
const at = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 0];
const cosDeg = (deg) => Math.cos((deg * Math.PI) / 180);

let seq = 0;
const art = (deg, { hours = 0, publisher = `Outlet ${seq + 1}`, title, titleKey, sourceId = 's1' } = {}) => {
  seq += 1;
  const t = title || `story ${seq}`;
  return { _id: `a${seq}`, vector: at(deg), publishedAt: new Date(T0 + hours * H), title: t, titleKey: titleKey || t.toLowerCase(), publisher, sourceId };
};
const run = (articles, { stories = [], isOfficial, options } = {}) => {
  let n = stories.length;
  const results = assignBatch({ articles, stories, isOfficial, newId: () => `st${++n}`, options });
  return { results, stories };
};

describe('the join rule', () => {
  test('the constants this file was written against', () => {
    // Change JOIN or SEED_FLOOR and these angles must be re-read: 36° is just inside JOIN, 38° just outside.
    assert.equal(JOIN, 0.8);
    assert.equal(SEED_FLOOR, 0.74);
    assert.ok(cosDeg(36) >= JOIN && cosDeg(38) < JOIN);
  });

  test('an article close to an open story joins it; one past JOIN starts its own', () => {
    const { results, stories } = run([art(0), art(36, { hours: 1 }), art(80, { hours: 2 })]);
    assert.deepEqual(results.map((r) => r.joined), [false, true, false]);
    assert.equal(results[1].storyId, results[0].storyId);
    assert.notEqual(results[2].storyId, results[0].storyId);
    assert.equal(stories.length, 2);
    assert.equal(stories[0].articleCount, 2);
    assert.equal(stories[0].outlets.length, 2);
  });

  test('just under JOIN does not join (under-merge)', () => {
    const { results } = run([art(0), art(38, { hours: 1 })]);
    assert.deepEqual(results.map((r) => r.joined), [false, false]);
  });

  test('the best story wins, not the first', () => {
    const { results } = run([art(0), art(50, { hours: 1 }), art(40, { hours: 2 })]);
    // 40° is 40 from the first story (0.77, under JOIN) and 10 from the second.
    assert.equal(results[2].storyId, results[1].storyId);
  });

  test('the seed stops a story drifting: near the centroid but far from the first article stays out', () => {
    // 0°, 30°, 30°, 30°: the centroid sits near 22°. An article at 50° is 28°
    // from it (0.88 ≥ JOIN) but 50° from the seed (0.64 < SEED_FLOOR).
    const articles = [art(0), art(30, { hours: 1 }), art(30, { hours: 2 }), art(30, { hours: 3 }), art(50, { hours: 4 })];
    const { results, stories } = run(articles);
    assert.deepEqual(results.map((r) => r.joined), [false, true, true, true, false]);
    assert.ok(cosDeg(50) < SEED_FLOOR);
    assert.equal(stories[0].articleCount, 4);
  });
});

describe('syndication', () => {
  test('a known title key joins as a COPY and adds no voice', () => {
    const { results, stories } = run([
      art(0, { publisher: 'AP News', title: 'Court rules', titleKey: 'court rules' }),
      art(0, { hours: 1, publisher: 'KARK', title: 'Court rules', titleKey: 'court rules' }),
      art(10, { hours: 2, publisher: 'Reuters', title: 'Judges decide', titleKey: 'judges decide' }),
    ]);
    assert.deepEqual(results.map((r) => r.copy), [false, true, false]);
    assert.equal(stories.length, 1);
    assert.equal(stories[0].articleCount, 3);
    assert.deepEqual(stories[0].outlets, ['apnews', 'reuters']);
  });

  test('a copy joins even when its vector is far away', () => {
    const { results } = run([art(0, { titleKey: 'same words' }), art(90, { hours: 1, titleKey: 'same words' })]);
    assert.equal(results[1].joined, true);
    assert.equal(results[1].copy, true);
  });
});

describe('when a story is open', () => {
  test('within 72 h of its newest article, not after', () => {
    const a = run([art(0), art(0, { hours: 71 })]);
    assert.equal(a.results[1].joined, true);
    const b = run([art(0), art(0, { hours: 73 })]);
    assert.equal(b.results[1].joined, false);
    assert.equal(WINDOW_MS, 72 * H);
  });

  test('a story kept alive by follow-ups still closes 7 days after its first article', () => {
    const story = newStory('st1', art(0));
    for (let h = 48; h <= 144; h += 48) addToStory(story, art(0, { hours: h }));
    assert.equal(isOpen(story, T0 + 167 * H), true);
    assert.equal(isOpen(story, T0 + 169 * H), false);
    assert.equal(MAX_SPAN_MS, 168 * H);
  });

  test('an article fetched late (older than the story) can still join it', () => {
    const { results } = run([art(0, { hours: 10 }), art(5, { hours: 2 })]);
    assert.equal(results[1].joined, true);
  });
});

describe('too little text to compare', () => {
  test('a short text never joins by likeness and is never joined; the same headline still joins as a copy', () => {
    // "Happy Thanksgiving" (a town paper) joined "Tell HN: Happy Thanksgiving" at 0.80 on live data.
    const short = (deg, extra = {}) => ({ ...art(deg, extra), textLength: MIN_TEXT_CHARS - 1 });
    const a = run([art(0), short(0, { hours: 1 }), art(0, { hours: 2 })]);
    assert.deepEqual(a.results.map((r) => r.joined), [false, false, true]);
    assert.equal(a.results[2].storyId, a.results[0].storyId);
    assert.equal(a.stories.find((s) => s.id === a.results[1].storyId).solo, true);
    const b = run([art(0, { titleKey: 'cia hacked' }), short(0, { hours: 1, titleKey: 'cia hacked' })]);
    assert.equal(b.results[1].copy, true);
    // No length given (an older caller): long enough.
    const c = run([art(0), art(0, { hours: 1 })]);
    assert.equal(c.results[1].joined, true);
  });
});

describe('official notices', () => {
  test('never join and are never joined', () => {
    const official = (a) => a.sourceId === 'gov';
    const { results, stories } = run([art(0, { sourceId: 'gov' }), art(0, { hours: 1 }), art(0, { hours: 2, sourceId: 'gov' })], { isOfficial: official });
    assert.deepEqual(results.map((r) => r.joined), [false, false, false]);
    assert.equal(stories.filter((s) => s.solo).length, 2);
    assert.equal(findStory(art(0, { hours: 3 }), stories.filter((s) => s.solo)), null);
  });
});

describe('outletKey', () => {
  test('one outlet however it is written', () => {
    assert.equal(outletKey({ publisher: 'The Arkadelphian' }), outletKey({ publisher: 'Arkadelphian' }));
    assert.equal(outletKey({ publisher: 'FOX16.com' }), 'fox16');
    assert.equal(outletKey({ publisher: '', publisherDomain: 'katv.com' }), 'katv');
    assert.equal(outletKey({ publisher: '', sourceId: 'abc' }), 'source:abc');
  });
});
