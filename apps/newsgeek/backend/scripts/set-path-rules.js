/**
 * `node scripts/set-path-rules.js [--dry-run]` — sets `pathExclude` on the
 * sources in PATH_RULES_BY_SLUG (src/seed/pathRules.js) in an existing
 * database. Touches that one field on those slugs and nothing else; safe to
 * run twice.
 *
 * In production, inside the running container (MONGODB_URI from its env):
 *
 *   docker exec newsgeek node scripts/set-path-rules.js --dry-run
 *   docker exec newsgeek node scripts/set-path-rules.js
 *
 * Prints slug: old → new; never the connection string.
 */
import { runScript } from './lib/runScript.js';

const dryRun = process.argv.includes('--dry-run');

await runScript('set-path-rules', async () => {
  const { setPathRules } = await import('../src/seed/setPathRules.js');
  const { default: Source } = await import('../src/models/Source.js');
  const rows = await setPathRules({ Source, dryRun });
  const show = (list) => (list == null ? '(no such source)' : `[${list.join(', ')}]`);
  for (const r of rows) console.log(`${r.slug}: ${show(r.from)} → ${show(r.to)}  [${r.action}]`);
  if (dryRun) console.log('dry run: nothing written');
});
