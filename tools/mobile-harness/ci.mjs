#!/usr/bin/env node
// The gate. Builds every app, serves its dist, walks its scenes at 390x844 in
// both schemes, and fails on any mobile-grammar violation or page error.
//
// The axe-core a11y pass runs on every scene but is **report-only**: its
// findings are printed and written to out/<label>/SUMMARY.md, and they do not
// touch the exit code unless --enforce-a11y is passed. The flip criterion is
// in DOCS/MOBILE_UI_PLAN.md §2 (0 open across all apps).
//
//   pnpm --filter @geeksuite/mobile-harness run ci
//   node ci.mjs --app bookgeek --app bujogeek      # a subset
//   node ci.mjs --no-build                          # reuse existing dist/
//   node ci.mjs --enforce-a11y                      # a11y counts toward exit
//   node ci.mjs --no-a11y                           # skip the axe pass entirely
import fs from 'node:fs';
import path from 'node:path';
import { APP_NAMES } from './lib/registry.mjs';
import { runApp, summarize, report, summaryMarkdown, TOOL_ROOT } from './lib/runner.mjs';
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
const a11y = !has('no-a11y');
const enforceA11y = has('enforce-a11y');

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
        a11y,
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

const summary = summarize(runs, { enforceA11y });
report(summary);

// SUMMARY.md rides along with the screenshots into the CI artifact, so the
// a11y burn-down numbers survive the log's scrollback.
const outRoot = path.join(TOOL_ROOT, 'out', label);
try {
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, 'SUMMARY.md'), `${summaryMarkdown(summary, { label, apps })}\n`);
  console.log(`\nsummary written to out/${label}/SUMMARY.md`);
} catch (err) {
  console.error(`could not write SUMMARY.md: ${err.message || err}`);
}
if (failures.length) {
  console.log('\n── build/serve failures ────────────────────────────────────');
  for (const f of failures) console.log(`  ${f.app}: ${f.message}`);
}
const ok = summary.ok && failures.length === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'} — screenshots in out/${label}/`);
process.exit(ok ? 0 : 1);
