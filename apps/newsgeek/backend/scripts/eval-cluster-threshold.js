/**
 * `node scripts/eval-cluster-threshold.js <labelled.jsonl> [--json] [--unweighted]`
 * — precision / recall / F0.5 for JOIN thresholds 0.60–0.95, with and
 * without the guard, and the recommended threshold (best F0.5 with
 * precision ≥ 0.97). Logic: src/cluster/evaluate.js. Runbook:
 * apps/newsgeek/DOCS/CLUSTERING.md. Needs no database; runs anywhere.
 *
 *   node scripts/eval-cluster-threshold.js ~/pairs.labelled.jsonl
 */
import fs from 'node:fs';
import { evaluate, parseJsonl } from '../src/cluster/evaluate.js';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node scripts/eval-cluster-threshold.js <labelled.jsonl> [--json] [--unweighted]');
  process.exit(2);
}
const report = evaluate(parseJsonl(fs.readFileSync(file, 'utf8')), { weighted: !process.argv.includes('--unweighted') });

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const fmt = (x) => (x == null ? '  —  ' : x.toFixed(3));
  console.log(`${report.labelled} labelled (${report.same} same, ${report.different} different), ${report.skipped} unlabelled skipped; ${report.weighted ? 'band-weighted' : 'UNWEIGHTED'}`);
  console.log('thresh | no guard: P     R     F0.5  | guard: P     R     F0.5');
  report.withoutGuard.forEach((r, i) => {
    const g = report.withGuard[i];
    console.log(`${r.threshold.toFixed(2)}   |          ${fmt(r.precision)} ${fmt(r.recall)} ${fmt(r.f05)} |        ${fmt(g.precision)} ${fmt(g.recall)} ${fmt(g.f05)}`);
  });
  const rec = (r) => (r ? `JOIN = ${r.threshold.toFixed(2)} (P ${fmt(r.precision)}, R ${fmt(r.recall)}, F0.5 ${fmt(r.f05)})` : `none reaches precision ≥ ${report.minPrecision}`);
  console.log(`\nRecommended, with the guard (what phase 2 ships): ${rec(report.recommendation.withGuard)}`);
  console.log(`Recommended, without the guard (for comparison):  ${rec(report.recommendation.withoutGuard)}`);
}
