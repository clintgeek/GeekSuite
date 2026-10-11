/**
 * `node scripts/export-cluster-candidates.js [options]` — the golden-set
 * candidate pairs for N1 clustering (src/cluster/candidates.js; runbook in
 * apps/newsgeek/DOCS/CLUSTERING.md). Read-only: it writes nothing to Mongo.
 *
 *   docker exec newsgeek node scripts/export-cluster-candidates.js --out /tmp/pairs.jsonl
 *   docker cp newsgeek:/tmp/pairs.jsonl ./pairs.jsonl
 *
 * Options:
 *   --days <n>             window of publishedAt, ending now (default 7)
 *   --total <n>            pairs to sample (default 200)
 *   --window-hours <n>     max hours between the two articles (default 72)
 *   --include-exact        keep pairs whose titleKey is identical
 *   --seed <n>             sampling seed (default 1; same data + seed = same file)
 *   --max-comparisons <n>  hard stop on cosine computations (default 25,000,000)
 *   --out <path>           write JSONL there (default stdout)
 *
 * JSONL goes to stdout (or --out); the summary goes to stderr. Never prints
 * the connection string.
 */
import fs from 'node:fs';
import { runScript } from './lib/runScript.js';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
const num = (name, fallback) => {
  const v = Number(arg(name, fallback));
  if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be a positive number`);
  return v;
};

const days = num('--days', 7);
const total = Math.floor(num('--total', 200));
const windowHours = num('--window-hours', 72);
const seed = Math.floor(num('--seed', 1));
const maxComparisons = Math.floor(num('--max-comparisons', 25_000_000));
const includeExact = process.argv.includes('--include-exact');
const out = arg('--out', null);

await runScript('export-cluster-candidates', async () => {
  const { generateCandidates, loadCandidateArticles } = await import('../src/cluster/candidates.js');
  const { embeddingsConfig } = await import('../src/cluster/embeddings.js');
  const { buildPlaceMatcher } = await import('../src/ingest/places.js');
  const { default: Article } = await import('../src/models/Article.js');
  const { default: Source } = await import('../src/models/Source.js');
  const { default: Place } = await import('../src/models/Place.js');

  const { model } = embeddingsConfig();
  const until = new Date();
  const since = new Date(until.getTime() - days * 86_400_000);
  const started = Date.now();
  const articles = await loadCandidateArticles({ Article, Source, Place, model, since, until, buildPlaceMatcher });
  const { pairs, stats } = generateCandidates(articles, { total, windowHours, seed, maxComparisons, includeExact });

  const jsonl = pairs.map((p) => JSON.stringify(p)).join('\n') + (pairs.length ? '\n' : '');
  if (out) fs.writeFileSync(out, jsonl);
  else process.stdout.write(jsonl);

  console.error(`model ${model}; ${stats.articles} articles with vectors in ${days} d; ${stats.comparisons} comparisons`
    + `${stats.truncated ? ' (TRUNCATED at --max-comparisons)' : ''}; ${stats.skippedExact} exact-title pairs skipped; ${Date.now() - started} ms`);
  for (const b of stats.bands) console.error(`  ${b.band.padEnd(10)} ${String(b.population).padStart(9)} pairs, ${b.sampled} sampled`);
  console.error(`${pairs.length} pairs written${out ? ` to ${out}` : ''}`);
});
