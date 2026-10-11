/**
 * src/cluster/evaluate.js — the threshold sweep on a tiny labelled fixture:
 * precision / recall / F0.5 with and without the guard, the band weights,
 * the recommendation rule (best F0.5 with precision ≥ 0.97, ties to the
 * higher threshold), and the guard's evidence rules.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, guardEvidence, properWords, thresholdGrid, parseJsonl } from '../src/cluster/evaluate.js';

const pair = (id, cosine, label, a, b, extra = {}) => ({
  pairId: id, cosine, label, a: { title: a, excerpt: '' }, b: { title: b, excerpt: '' }, sharedPlaces: [], weight: 1, ...extra,
});

// same: p1 p3 p5 p6; different: p2 p4; p7 unlabelled.
const FIXTURE = [
  pair('p1', 0.92, 'same', 'Fire destroys Arkadelphia home', 'Crews battle Arkadelphia house fire'), // guard: term
  pair('p2', 0.91, 'different', 'Police investigate shooting', 'Police investigate stabbing'), // no guard
  pair('p3', 0.85, 'same', 'Man killed overnight', 'Homicide investigation underway', { sharedPlaces: ['little-rock'] }), // guard: place
  pair('p4', 0.80, 'different', 'Senators react to Trump tariff plan', 'Governor praises Trump visit'), // guard: term (wrong)
  pair('p5', 0.75, 'same', 'Crash closes I-30 near exit 98', 'Wreck on I-30 at exit 98 snarls traffic'), // guard: number
  pair('p6', 0.65, 'same', 'A grim night downtown', 'Neighbors mourn victims'), // no guard
  pair('p7', 0.99, null, 'x', 'y'),
];

const row = (table, t) => table.find((r) => Math.abs(r.threshold - t) < 1e-9);

describe('evaluate', () => {
  const report = evaluate(FIXTURE);

  test('counts labelled pairs and skips the unlabelled', () => {
    assert.equal(report.labelled, 6);
    assert.equal(report.same, 4);
    assert.equal(report.different, 2);
    assert.equal(report.skipped, 1);
    assert.equal(report.withGuard.length, 36);
  });

  test('without the guard, cosine alone', () => {
    assert.deepEqual(row(report.withoutGuard, 0.90), { threshold: 0.90, precision: 0.5, recall: 0.25, f05: 0.4167, counts: { tp: 1, fp: 1, fn: 3 } });
    assert.deepEqual(row(report.withoutGuard, 0.92).counts, { tp: 1, fp: 0, fn: 3 });
    assert.equal(row(report.withoutGuard, 0.95).precision, null);
    assert.equal(row(report.withoutGuard, 0.60).recall, 1);
    assert.equal(row(report.withoutGuard, 0.60).precision, 0.6667);
  });

  test('with the guard, a high cosine without a shared term does not join', () => {
    assert.deepEqual(row(report.withGuard, 0.90), { threshold: 0.90, precision: 1, recall: 0.25, f05: 0.625, counts: { tp: 1, fp: 0, fn: 3 } });
    assert.deepEqual(row(report.withGuard, 0.85), { threshold: 0.85, precision: 1, recall: 0.5, f05: 0.8333, counts: { tp: 2, fp: 0, fn: 2 } });
    assert.equal(row(report.withGuard, 0.80).precision, 0.6667);
    assert.equal(row(report.withGuard, 0.60).recall, 0.75); // p6 has no guard evidence
  });

  test('recommends the best F0.5 with precision ≥ 0.97, ties to the higher threshold', () => {
    assert.equal(report.recommendation.withGuard.threshold, 0.85);
    assert.equal(report.recommendation.withoutGuard.threshold, 0.92);
  });

  test('no threshold reaches the precision floor → no recommendation', () => {
    const r = evaluate([pair('a', 0.9, 'different', 'x', 'y'), pair('b', 0.8, 'same', 'x', 'y')]);
    assert.equal(r.recommendation.withoutGuard, null);
  });

  test('band weights turn the stratified sample back into population precision', () => {
    const heavy = FIXTURE.map((p) => (p.pairId === 'p2' ? { ...p, weight: 9 } : p));
    assert.equal(row(evaluate(heavy).withoutGuard, 0.90).precision, 0.1);
    assert.equal(row(evaluate(heavy, { weighted: false }).withoutGuard, 0.90).precision, 0.5);
  });
});

describe('guardEvidence', () => {
  test('a shared proper-noun-ish word, a shared place, a shared number', () => {
    assert.deepEqual(guardEvidence(FIXTURE[0]), { kind: 'term', value: 'arkadelphia' });
    assert.deepEqual(guardEvidence(FIXTURE[2]), { kind: 'place', value: 'little-rock' });
    assert.deepEqual(guardEvidence(FIXTURE[4]), { kind: 'number', value: '30' });
  });

  test('no evidence: shared common words, sentence-initial capitals, STOP words, years', () => {
    assert.equal(guardEvidence(FIXTURE[1]), null);
    assert.equal(guardEvidence(pair('y', 0.9, null, 'Budget passes in 2026', 'Schools plan for 2026')), null);
    assert.equal(guardEvidence(pair('d', 0.9, null, 'Storm damage reported across the region on Monday', 'City council meets again Monday evening')), null);
  });

  test('Title Cased headlines prove nothing by their capitals; a sentence-case excerpt can', () => {
    const tc = pair('t', 0.9, null, 'Man Killed In Overnight Shooting', 'Overnight Shooting Leaves One Dead');
    assert.equal(guardEvidence(tc), null);
    const withExcerpt = { ...tc, a: { ...tc.a, excerpt: 'Police said the Overnight Shooting task force responded.' } };
    assert.deepEqual(guardEvidence(withExcerpt), { kind: 'term', value: 'overnight' });
  });

  test('properWords drops sentence-initial words and short ones', () => {
    assert.deepEqual([...properWords('Rain soaks Hot Springs. Then Arkadelphia gets hail')].sort(), ['arkadelphia', 'springs']);
  });
});

describe('helpers', () => {
  test('thresholdGrid is 0.60…0.95 in exact hundredths', () => {
    const g = thresholdGrid();
    assert.equal(g.length, 36);
    assert.equal(g[0], 0.6);
    assert.equal(g[35], 0.95);
    assert.equal(g[17], 0.77);
  });
  test('parseJsonl skips blank lines and names a bad line', () => {
    assert.equal(parseJsonl('{"a":1}\n\n{"a":2}\n').length, 2);
    assert.throws(() => parseJsonl('{"a":1}\nnope'), /line 2/);
  });
});
