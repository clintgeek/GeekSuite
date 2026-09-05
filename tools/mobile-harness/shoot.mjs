#!/usr/bin/env node
// One app, one running server, one label's worth of screenshots.
//
//   node shoot.mjs --app bookgeek --base http://localhost:1801 --label m6
//   node shoot.mjs --app bujogeek --serve --label m6        # build + preview
//   node shoot.mjs --app basegeek --serve --viewports all   # + desktop
import path from 'node:path';
import { appSpec, APP_NAMES } from './lib/registry.mjs';
import { runApp, summarize, report, TOOL_ROOT } from './lib/runner.mjs';
import { PHONE_VIEWPORTS, ALL_VIEWPORTS } from './lib/contexts.mjs';
import { buildApp, startPreview } from './lib/serve.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const has = (name) => argv.includes(`--${name}`);

const app = flag('app');
if (!app || !APP_NAMES.includes(app)) {
  console.error(`usage: node shoot.mjs --app <${APP_NAMES.join('|')}> [--base URL | --serve] [--label NAME] [--viewports phone|desktop|all] [--no-build] [--no-shots]`);
  process.exit(2);
}

const label = flag('label', 'local');
const viewportArg = flag('viewports', 'phone');
const viewports =
  viewportArg === 'all' ? ALL_VIEWPORTS
    : viewportArg === 'desktop' ? ALL_VIEWPORTS.filter((v) => v.startsWith('desktop'))
      : PHONE_VIEWPORTS;

let base = flag('base');
let preview = null;
if (has('serve')) {
  if (has('no-build')) {
    console.log(`reusing the existing ${app} dist/`);
  } else {
    console.log(`building ${app}…`);
    await buildApp(app);
  }
  preview = await startPreview(app);
  base = preview.url;
  console.log(`serving ${app} at ${base}`);
} else if (!base) {
  base = appSpec(app).devBase;
  console.log(`no --base given; using the dev-server default ${base} (pass --serve to build and preview instead)`);
}

const outDir = path.join(TOOL_ROOT, 'out', label, app);
console.log(`shooting ${app} at ${base} → out/${label}/${app}`);

try {
  const run = await runApp({
    app,
    base,
    outDir,
    viewports,
    screenshots: !has('no-shots') && !has('probe-only'),
  });
  const summary = summarize([run]);
  report(summary);
  process.exitCode = summary.ok ? 0 : 1;
} finally {
  if (preview) await preview.stop();
}
