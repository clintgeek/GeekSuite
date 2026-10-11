/**
 * src/cluster/candidates.js — golden-set candidate pairs on a tiny synthetic
 * set with fixed vectors: which pairs are eligible (different outlets,
 * ≤ 72 h, not exact titleKey), the record shape, stratified sampling with
 * weights, the comparison bound.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCandidates, allocate, outletKey, DEFAULT_BANDS } from '../src/cluster/candidates.js';

const T0 = new Date('2026-10-10T00:00:00Z').getTime();
const H = 3_600_000;
/** A 2-d unit vector whose cosine with [1, 0] is c. */
const at = (c) => [c, Math.sqrt(1 - c * c)];

function art(id, { outlet, hours = 0, vector = [1, 0], title = `Title ${id}`, titleKey = `key ${id}`, ...rest } = {}) {
  return {
    id, sourceId: `src-${outlet}`, source: `src-${outlet}`, publisher: outlet, publisherDomain: outlet,
    title, titleKey, excerpt: `Excerpt of ${id}`, publishedAt: new Date(T0 + hours * H), url: `https://${outlet}/${id}`,
    vector, placeSlugs: [], ...rest,
  };
}

const ids = (pairs) => pairs.map((p) => p.pairId).sort();

describe('eligible pairs', () => {
  const set = [
    art('a1', { outlet: 'katv.com', hours: 0, vector: [1, 0], title: 'Little Rock homicide', titleKey: 'little rock homicide', placeSlugs: ['little-rock', 'pulaski-county'] }),
    art('a2', { outlet: 'thv11.com', hours: 2, vector: at(0.95), placeSlugs: ['little-rock'] }),
    art('a3', { outlet: 'katv.com', hours: 3, vector: [1, 0] }), // same outlet as a1
    art('a4', { outlet: 'other.com', hours: 100, vector: [1, 0] }), // > 72 h from everything
    art('a5', { outlet: 'gnews.com', hours: 1, vector: [1, 0], titleKey: 'little rock homicide' }), // exact titleKey of a1
    art('a6', { outlet: 'far.com', hours: 1, vector: [0, 1] }), // cosine ~0 with a1/a3/a5: below every band
  ];

  test('different outlets, within 72 h, exact titleKey skipped, below-band dropped', () => {
    const { pairs, stats } = generateCandidates(set, { total: 50 });
    // a1–a2 (0.95), a2–a3 (0.95), a2–a5 (0.95), a3–a5 (1.0). Not a1–a3 (same outlet), not a1–a5 (exact),
    // not a4 (too far), not a6 (cosine below 0.60, except with a2 at 0.31 — also below).
    assert.deepEqual(ids(pairs), ['a1:a2', 'a2:a3', 'a2:a5', 'a3:a5']);
    assert.equal(stats.skippedSameOutlet, 1);
    assert.equal(stats.skippedExact, 1);
    assert.equal(stats.truncated, false);
  });

  test('--include-exact keeps the exact-title pair', () => {
    const { pairs } = generateCandidates(set, { total: 50, includeExact: true });
    assert.ok(ids(pairs).includes('a1:a5'));
  });

  test('a record carries both sides, cosine, hours apart, shared places, band, weight and label: null', () => {
    const long = art('b2', { outlet: 'thv11.com', hours: 2.25, vector: at(0.95), placeSlugs: ['little-rock'], excerpt: 'x'.repeat(500) });
    const { pairs } = generateCandidates([set[0], long], { total: 5 });
    assert.equal(pairs.length, 1);
    const p = pairs[0];
    assert.equal(p.pairId, 'a1:b2');
    assert.equal(p.a.id, 'a1');
    assert.equal(p.a.source, 'src-katv.com');
    assert.equal(p.a.publisher, 'katv.com');
    assert.equal(p.a.title, 'Little Rock homicide');
    assert.equal(p.a.publishedAt, new Date(T0).toISOString());
    assert.equal(p.a.url, 'https://katv.com/a1');
    assert.equal(p.b.excerpt.length, 200);
    assert.equal(p.cosine, 0.95);
    assert.equal(p.hoursApart, 2.3);
    assert.deepEqual(p.sharedPlaces, ['little-rock']);
    assert.equal(p.band, '>=0.90');
    assert.equal(p.weight, 1);
    assert.equal(p.label, null);
  });

  test('outletKey: publisher domain, else publisher, else source', () => {
    assert.equal(outletKey({ publisherDomain: 'APnews.com', publisher: 'AP', sourceId: 's' }), 'apnews.com');
    assert.equal(outletKey({ publisher: 'Reuters', sourceId: 's' }), 'reuters');
    assert.equal(outletKey({ sourceId: 's9' }), 's9');
  });
});

describe('stratified sample', () => {
  // One anchor (outlet y) and many others from ONE outlet (x), so only anchor–other pairs exist.
  function banded(counts) {
    const out = [art('anchor', { outlet: 'y.com', hours: 0, vector: [1, 0] })];
    let n = 0;
    for (const [c, k] of counts) for (let i = 0; i < k; i += 1) { n += 1; out.push(art(`o${String(n).padStart(3, '0')}`, { outlet: 'x.com', hours: 1, vector: at(c) })); }
    return out;
  }

  test('even split across bands, the shortfall of a thin band goes to the others, weights restore the population', () => {
    const { pairs, stats } = generateCandidates(banded([[0.95, 10], [0.87, 10], [0.82, 1]]), { total: 12 });
    const byBand = Object.fromEntries(stats.bands.map((b) => [b.band, b]));
    assert.deepEqual([byBand['>=0.90'].population, byBand['0.85-0.90'].population, byBand['0.80-0.85'].population], [10, 10, 1]);
    assert.equal(pairs.length, 12);
    const sampled = (band) => pairs.filter((p) => p.band === band);
    assert.equal(sampled('>=0.90').length, 6);
    assert.equal(sampled('0.85-0.90').length, 5);
    assert.equal(sampled('0.80-0.85').length, 1);
    assert.equal(sampled('>=0.90')[0].weight, Math.round((10 / 6) * 1000) / 1000);
    assert.equal(sampled('0.85-0.90')[0].weight, 2);
    assert.equal(sampled('0.80-0.85')[0].weight, 1);
    assert.equal(new Set(pairs.map((p) => p.pairId)).size, 12, 'no pair twice');
  });

  test('every band label in the default set is reachable', () => {
    const { stats } = generateCandidates(banded([[0.95, 1], [0.87, 1], [0.82, 1], [0.77, 1], [0.72, 1], [0.65, 1], [0.5, 1]]), { total: 50 });
    assert.deepEqual(stats.bands.map((b) => b.population), [1, 1, 1, 1, 1, 1]);
    assert.equal(DEFAULT_BANDS.length, 6);
  });

  test('the same data and seed give the same file; another seed samples differently', () => {
    const data = banded([[0.95, 40]]);
    const a = generateCandidates(data, { total: 10, seed: 7 }).pairs.map((p) => p.pairId);
    const b = generateCandidates(data, { total: 10, seed: 7 }).pairs.map((p) => p.pairId);
    const c = generateCandidates(data, { total: 10, seed: 8 }).pairs.map((p) => p.pairId);
    assert.deepEqual(a, b);
    assert.notDeepEqual([...a].sort(), [...c].sort());
  });

  test('a sample from a band that never filled is not just its oldest pairs', () => {
    // Two bands of 15 pairs each, 20 wanted: each reservoir holds all 15 in
    // time order and gives 10. Those 10 must not simply be the 10 oldest.
    const data = [art('anchor', { outlet: 'y.com', hours: 50, vector: [1, 0] })];
    for (let i = 0; i < 30; i += 1) data.push(art(`o${String(i).padStart(2, '0')}`, { outlet: 'x.com', hours: i, vector: at(i < 15 ? 0.95 : 0.87) }));
    const { pairs } = generateCandidates(data, { total: 20, seed: 3 });
    const top = pairs.filter((p) => p.band === '>=0.90').map((p) => p.pairId.replace('anchor', '').replace(':', '')).sort();
    assert.equal(top.length, 10);
    assert.notDeepEqual(top, ['o00', 'o01', 'o02', 'o03', 'o04', 'o05', 'o06', 'o07', 'o08', 'o09']);
  });

  test('allocate: equal shares, capped by what each band has', () => {
    assert.deepEqual(allocate(12, [10, 10, 1, 0, 0, 0]), [6, 5, 1, 0, 0, 0]);
    assert.deepEqual(allocate(6, [5, 5, 5]), [2, 2, 2]);
    assert.deepEqual(allocate(100, [3, 2]), [3, 2]);
  });
});

describe('cost bound', () => {
  test('articles further apart than the window are never compared (not n²)', () => {
    const spread = Array.from({ length: 20 }, (_, i) => art(`s${i}`, { outlet: `o${i}.com`, hours: i * 80 }));
    assert.equal(generateCandidates(spread).stats.comparisons, 0);
  });

  test('maxComparisons stops the scan and says so', () => {
    const dense = Array.from({ length: 20 }, (_, i) => art(`d${i}`, { outlet: `o${i}.com`, hours: 0 }));
    const full = generateCandidates(dense).stats;
    assert.equal(full.comparisons, 190);
    const capped = generateCandidates(dense, { maxComparisons: 25 }).stats;
    assert.equal(capped.comparisons, 25);
    assert.equal(capped.truncated, true);
  });
});
