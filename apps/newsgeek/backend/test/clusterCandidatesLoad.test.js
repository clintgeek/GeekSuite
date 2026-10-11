/**
 * src/cluster/candidates.js loadCandidateArticles — what the export reads
 * from Mongo: only the window, only vectors of the current model, and
 * `placeSlugs` re-matched from the TEXT (source places as context only;
 * state/country places dropped).
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadCandidateArticles, generateCandidates } from '../src/cluster/candidates.js';
import { buildPlaceMatcher } from '../src/ingest/places.js';
import { runSeed } from '../src/seed/seed.js';
import { startMongo, stopMongo } from './helpers/mongo.js';

const NOW = new Date('2026-10-11T12:00:00Z');
const H = 3_600_000;
let models;
before(async () => {
  models = await startMongo();
  await runSeed({ Place: models.Place, Source: models.Source, now: () => NOW });
});
after(stopMongo);

describe('loadCandidateArticles', () => {
  test('window + current model only; places from the text, not inherited, no state', async () => {
    const { Article, Source, Place } = models;
    const katv = await Source.findOne({ slug: 'katv' }).lean();
    const thv = await Source.findOne({ slug: 'thv11' }).lean();
    const base = (src, i, extra) => ({
      sourceId: src._id, feedUrl: 'https://x/feed', guid: `g${i}`, url: `https://x/${i}`, canonicalUrl: `https://x/${i}`,
      titleKey: `k${i}`, publisher: src.name, publisherDomain: new URL(src.homepage).hostname.replace(/^www\./, ''),
      fetchedAt: NOW, places: src.places, ...extra,
    });
    await Article.insertMany([
      base(katv, 1, { title: 'Homicide in Little Rock, police say', excerpt: 'Arkansas police investigate.', publishedAt: new Date(NOW - 2 * H), embedding: { model: 'm', vector: [1, 0] } }),
      base(thv, 2, { title: 'Little Rock police investigate homicide', excerpt: '', publishedAt: new Date(NOW - 3 * H), embedding: { model: 'm', vector: [0.96, 0.28] } }),
      base(thv, 3, { title: 'Old story in Little Rock', excerpt: '', publishedAt: new Date(NOW - 10 * 24 * H), embedding: { model: 'm', vector: [1, 0] } }),
      base(thv, 4, { title: 'Other model in Little Rock', excerpt: '', publishedAt: new Date(NOW - H), embedding: { model: 'old', vector: [1, 0] } }),
      base(thv, 5, { title: 'No vector yet', excerpt: '', publishedAt: new Date(NOW - H) }),
    ]);
    const rows = await loadCandidateArticles({ Article, Source, Place, model: 'm', since: new Date(NOW - 7 * 24 * H), until: NOW, buildPlaceMatcher });
    assert.deepEqual(rows.map((r) => r.title).sort(), ['Homicide in Little Rock, police say', 'Little Rock police investigate homicide']);
    const one = rows.find((r) => r.source === 'katv');
    assert.deepEqual(one.placeSlugs, ['little-rock-ar']); // 'arkansas' is the source's and a state: dropped
    assert.deepEqual(one.vector, [1, 0]);

    const { pairs } = generateCandidates(rows, { total: 5 });
    assert.equal(pairs.length, 1);
    assert.deepEqual(pairs[0].sharedPlaces, ['little-rock-ar']);
    assert.deepEqual([pairs[0].a.source, pairs[0].b.source].sort(), ['katv', 'thv11']);
  });
});
