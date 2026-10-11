/**
 * `node scripts/clean-excerpts.js [--apply]` — re-applies the excerpt
 * cleaner to stored excerpts (src/maintenance/cleanExcerpts.js). A dry run
 * unless `--apply`. Writes only `excerpt`, only where it changes. Safe to run
 * twice.
 *
 *   docker exec newsgeek node scripts/clean-excerpts.js
 *   docker exec newsgeek node scripts/clean-excerpts.js --apply
 *
 * Prints counts and a few before/after tails; never the connection string.
 */
import { runScript } from './lib/runScript.js';

const apply = process.argv.includes('--apply');

await runScript('clean-excerpts', async () => {
  const { cleanExcerpts } = await import('../src/maintenance/cleanExcerpts.js');
  const { default: Article } = await import('../src/models/Article.js');
  const r = await cleanExcerpts({ Article, apply });
  for (const e of r.examples) console.log(`  …${e.before}\n→ …${e.after}`);
  console.log(`${r.scanned} candidates, ${r.changed} to clean${apply ? `, ${r.written} written` : ' (dry run: run with --apply)'}`);
});
