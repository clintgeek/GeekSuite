#!/usr/bin/env node
// Folds the per-app CI shards back into one SUMMARY.md.
//
// CI runs the harness as one job per app (.github/workflows/mobile-harness.yml),
// and each shard writes out/ci/summary.json next to its own SUMMARY.md. The
// aggregate job downloads every shard's artifact and runs this over the lot:
//
//   node merge-summaries.mjs <dir> [--expect a,b,c] [--out SUMMARY.md]
//
// <dir> is searched recursively for summary.json. --expect names the apps that
// should have reported; any that did not (a shard that crashed, timed out or
// was cancelled before writing its summary) are listed as missing and make the
// merged result FAIL. The exit code is always 0: the pass/fail decision is the
// aggregate job's (it reads the shards' job results), and this only reports.
//
// Needs nothing installed: runner.mjs's summary helpers are pure, and its
// Playwright import is lazy.
import fs from 'node:fs';
import path from 'node:path';
import { groupA11y, summaryMarkdown } from './lib/runner.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : undefined;
};
const dir = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
if (!dir) {
  console.error('usage: node merge-summaries.mjs <dir> [--expect a,b,c] [--out SUMMARY.md]');
  process.exit(2);
}
const expected = (flag('expect') || '').split(',').map((s) => s.trim()).filter(Boolean);
const outFile = flag('out') || 'SUMMARY.md';

const found = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name === 'summary.json') found.push(p);
  }
})(dir);

const shards = [];
for (const file of found.sort()) {
  try {
    shards.push(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    console.error(`could not read ${file}: ${err.message || err}`);
  }
}

const reported = new Set(shards.flatMap((s) => s.apps || []));
const missing = expected.filter((a) => !reported.has(a));
const apps = [...new Set([...expected, ...reported])];
const failures = shards.flatMap((s) => s.failures || []);

const sum = (key) => shards.reduce((n, s) => n + (s.summary?.[key] || 0), 0);
const cat = (key) => shards.flatMap((s) => s.summary?.[key] || []);
const a11y = cat('a11y');
const merged = {
  scenesRun: sum('scenesRun'),
  waivedCount: sum('waivedCount'),
  a11yWaivedCount: sum('a11yWaivedCount'),
  violations: cat('violations'),
  a11y,
  a11yByRule: groupA11y(a11y),
  enforceA11y: shards.some((s) => s.summary?.enforceA11y),
  errors: cat('errors'),
  ok: shards.length > 0 && shards.every((s) => s.summary?.ok && !(s.failures || []).length) && missing.length === 0,
};

const lines = [summaryMarkdown(merged, { label: 'ci (sharded by app)', apps })];
lines.push('## shards');
lines.push('');
lines.push('| app | scenes | grammar | a11y | page errors | build/serve | result |');
lines.push('|---|--:|--:|--:|--:|---|---|');
for (const app of apps) {
  const s = shards.find((x) => (x.apps || []).includes(app));
  if (!s) {
    lines.push(`| ${app} | · | · | · | · | · | **MISSING** (no summary.json) |`);
    continue;
  }
  const f = (s.failures || []).filter((x) => x.app === app);
  const m = s.summary || {};
  const ok = m.ok && !f.length;
  lines.push(
    `| ${app} | ${m.scenesRun ?? '·'} | ${(m.violations || []).length} | ${(m.a11y || []).length} | ` +
      `${(m.errors || []).length} | ${f.length ? f.map((x) => x.message.replace(/\|/g, '\\|')).join('; ') : 'ok'} | ` +
      `${ok ? 'PASS' : '**FAIL**'} |`,
  );
}
lines.push('');

fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, `${lines.join('\n')}\n`);
console.log(
  `merged ${shards.length} shard(s) into ${outFile}: ${merged.scenesRun} scenes, ` +
    `${merged.violations.length} grammar, ${merged.a11y.length} a11y, ${merged.errors.length} page errors, ` +
    `${failures.length} build/serve failures, ${missing.length} missing — ${merged.ok ? 'PASS' : 'FAIL'}`,
);
if (missing.length) console.log(`missing: ${missing.join(', ')}`);
