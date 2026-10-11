/**
 * `node scripts/purge-path-excluded.js [--apply]` — deletes stored articles
 * whose URL path matches THEIR OWN source's `pathExclude`
 * (src/maintenance/purgePathExcluded.js). A dry run unless `--apply`.
 * Run set-path-rules.js first. Safe to run twice.
 *
 *   docker exec newsgeek node scripts/purge-path-excluded.js
 *   docker exec newsgeek node scripts/purge-path-excluded.js --apply
 *
 * Prints per-source counts; never the connection string.
 */
import { runScript } from './lib/runScript.js';

const apply = process.argv.includes('--apply');

await runScript('purge-path-excluded', async () => {
  const { purgePathExcluded } = await import('../src/maintenance/purgePathExcluded.js');
  const { default: Source } = await import('../src/models/Source.js');
  const { default: Article } = await import('../src/models/Article.js');
  const rows = await purgePathExcluded({ Source, Article, apply });
  let total = 0;
  for (const r of rows) {
    total += apply ? r.deleted : r.matched;
    console.log(`${r.slug}: ${r.rules} rules, ${r.scanned} stored, ${r.matched} match${apply ? `, ${r.deleted} deleted` : ''}`);
  }
  console.log(apply ? `deleted ${total}` : `dry run: ${total} would be deleted (run with --apply)`);
});
