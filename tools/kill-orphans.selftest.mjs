#!/usr/bin/env node
// tools/kill-orphans.selftest.mjs
//
// Unit coverage for tools/kill-orphans.mjs. There is no test runner for standalone tools/
// scripts (same shape as tools/syntax-check.mjs, tools/gql-arg-audit.mjs, tools/boot-smoke.mjs —
// none of them have a jest/vitest suite either), so this follows the precedent already in the
// tree: tools/mobile-harness/selftest.mjs, a small standalone script that asserts and exits
// non-zero on any mismatch.
//
// Covers the pure logic only (category matching, never-kill guard, formatting) — findCandidates()
// itself is exercised read-only against the live box at the bottom, asserting only that it runs
// without throwing and returns an array (its actual contents are environment-dependent).
//
//   node tools/kill-orphans.selftest.mjs

import {
  classify,
  isNeverKill,
  fmtAge,
  truncate,
  findCandidates,
} from './kill-orphans.mjs';

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`FAIL — ${msg}`);
};
const check = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`${ok ? 'ok  ' : 'FAIL'} — ${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
  if (!ok) failures += 1;
};

console.log('── classify() — positive matches ────────────────────────');
check(
  'vite dev server',
  classify('node /app/node_modules/.bin/vite', ['node', '/app/node_modules/.bin/vite']),
  'vite-dev'
);
check(
  'vite preview',
  classify('node /app/node_modules/vite/bin/vite.js preview --port 4173', [
    'node',
    '/app/node_modules/vite/bin/vite.js',
    'preview',
    '--port',
    '4173',
  ]),
  'vite-preview'
);
check(
  'vitest worker',
  classify('node /app/node_modules/vitest/dist/worker.js', ['node', '/app/node_modules/vitest/dist/worker.js']),
  'vitest'
);
check(
  'jest worker',
  classify('node /app/node_modules/jest-worker/build/workers/processChild.js', [
    'node',
    '/app/node_modules/jest-worker/build/workers/processChild.js',
  ]),
  'jest-worker'
);
check(
  'playwright chromium headless shell',
  classify(
    '/home/user/.cache/ms-playwright/chromium-1234/chrome-linux/headless_shell --headless',
    ['/home/user/.cache/ms-playwright/chromium-1234/chrome-linux/headless_shell', '--headless']
  ),
  'playwright/chromium'
);
check(
  'serve via node_modules/.bin',
  classify('node /app/node_modules/.bin/serve -s dist', ['node', '/app/node_modules/.bin/serve', '-s', 'dist']),
  'serve'
);
check(
  'serve resolved from PATH',
  classify('serve -s dist -l 5000', ['serve', '-s', 'dist', '-l', '5000']),
  'serve'
);

console.log('\n── classify() — must NOT match (false-positive guards) ──');
check('ollama serve (unrelated daemon)', classify('/usr/local/bin/ollama serve', ['/usr/local/bin/ollama', 'serve']), null);
check(
  'docker registry serve (unrelated daemon)',
  classify('registry serve /etc/docker/registry/config.yml', ['registry', 'serve', '/etc/docker/registry/config.yml']),
  null
);
check('plain nodemon', classify('node node_modules/.bin/nodemon server.js', ['node', 'node_modules/.bin/nodemon', 'server.js']), null);
check('unrelated node server', classify('node server/dist/index.js', ['node', 'server/dist/index.js']), null);

console.log('\n── isNeverKill() ─────────────────────────────────────────');
check('claude cli', isNeverKill('node /home/user/.claude/bin/claude'), true);
check('docker cli', isNeverKill('docker compose up -d'), true);
check('watchtower', isNeverKill('/watchtower'), true);
check('ordinary vite', isNeverKill('node node_modules/.bin/vite'), false);

console.log('\n── fmtAge() ──────────────────────────────────────────────');
check('seconds only', fmtAge(45), '45s');
check('minutes + seconds', fmtAge(125), '2m5s');
check('hours + minutes', fmtAge(3725), '1h2m');
check('negative (clock skew guard)', fmtAge(-5), '0s');

console.log('\n── truncate() ────────────────────────────────────────────');
check('short string unchanged', truncate('abc', 10), 'abc');
check('long string truncated with ellipsis', truncate('abcdefghij', 5), 'abcd…');

console.log('\n── findCandidates() — smoke test against the live box (read-only) ──');
try {
  const candidates = findCandidates({ olderThanMin: 30 });
  if (Array.isArray(candidates)) {
    console.log(`ok   — returned an array (${candidates.length} candidates found on this box right now)`);
  } else {
    fail('findCandidates() did not return an array');
  }
} catch (err) {
  fail(`findCandidates() threw: ${err.message}`);
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
