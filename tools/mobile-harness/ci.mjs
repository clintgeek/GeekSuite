#!/usr/bin/env node
// The gate. Builds every app, serves its dist, walks its scenes at 390x844 in
// both schemes, and fails on any mobile-grammar violation or page error.
//
//   pnpm --filter @geeksuite/mobile-harness ci
//   node ci.mjs --app bookgeek --app bujogeek      # a subset
//   node ci.mjs --no-build                          # reuse existing dist/
import path from 'node:path';
import { APP_NAMES } from './lib/registry.mjs';
import { runApp, summarize, report, TOOL_ROOT } from './lib/runner.mjs';
import { PHONE_VIEWPORTS, ALL_VIEWPORTS, launch } from './lib/contexts.mjs';
import { buildApp, startPreview } from './lib/serve.mjs';

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const picked = argv.reduce((acc, a, i) => (a === '--app' && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const apps = picked.length ? picked : APP_NAMES;
const label = (() => {
  const i = argv.indexOf('--label');
  return i > -1 && argv[i + 1] ? argv[i + 1] : 'ci';
})();
const viewports = has('desktop') ? ALL_VIEWPORTS : PHONE_VIEWPORTS;

const browser = await launch();
const runs = [];
const failures = [];

for (const app of apps) {
  console.log(`\n=== ${app} ===`);
  let preview = null;
  try {
    if (!has('no-build')) await buildApp(app);
    preview = await startPreview(app);
    console.log(`serving ${app} at ${preview.url}`);
    runs.push(
      await runApp({
        app,
        base: preview.url,
        outDir: path.join(TOOL_ROOT, 'out', label, app),
        viewports,
        browser,
      }),
    );
    // A preview that died mid-run turns every later scene into a connection
    // error; say so plainly instead of leaving it to be inferred.
    if (preview.died) failures.push({ app, message: preview.died });
  } catch (err) {
    console.error(`  ${app} failed to build or serve: ${err.message || err}`);
    failures.push({ app, message: String(err.message || err) });
  } finally {
    if (preview) await preview.stop();
  }
}

await browser.close();

const summary = summarize(runs);
report(summary);
if (failures.length) {
  console.log('\n── build/serve failures ────────────────────────────────────');
  for (const f of failures) console.log(`  ${f.app}: ${f.message}`);
}
const ok = summary.ok && failures.length === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'} — screenshots in out/${label}/`);
process.exit(ok ? 0 : 1);
