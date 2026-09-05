#!/usr/bin/env node
// tools/syntax-check.mjs
//
// A cheap, universal gate: parse every .js/.mjs/.cjs file under apps/*/** and
// packages/*/** and fail if any of them cannot be parsed by Node. This exists
// because a module that no test suite imports can carry a SyntaxError all the
// way to production and nothing catches it (see 61d3109 — an unescaped
// backtick inside a gql template literal in
// apps/basegeek/packages/api/src/graphql/bujogeek/typeDefs.js crash-looped
// basegeek on 2026-09-05; every jest suite stayed green because none of them
// imported that file).
//
// Why child `node --check` per file, not an in-process parser:
//   - `acorn` is not resolvable from the repo root (it's only a transitive
//     dep of eslint et al, hoisted under individual app node_modules — see
//     `pnpm why acorn`), and this task is not to add a root dependency.
//   - `node --check` resolves CJS vs ESM per file exactly the way Node
//     itself would load it — walking up to the nearest package.json `type`,
//     honoring `.mjs`/`.cjs` overrides — so there is no need to duplicate
//     that resolution logic or pre-group files by type. One `node --check
//     <file>` invocation covers whichever module type applies to that file.
//   - `node --check` only ever parses the *first* positional file argument
//     and silently ignores the rest, so it is one child process per file,
//     not one call across a batch.
//   - `vm.Script` (CJS-only) / `vm.SourceTextModule` (ESM, needs
//     --experimental-vm-modules) would avoid the process-spawn overhead, but
//     SourceTextModule's SyntaxError carries no file/line info at all, which
//     would break the required `path:line: message` output for every ESM
//     file. `node --check` gives correct file:line for both module types for
//     free, so the (small, measured) spawn overhead is worth it.
//
// JSX is out of scope: .jsx files aren't collected, and Vite's build already
// gates JSX parse errors for the frontends that use it.
//
// Concurrency is capped at 2 child processes at a time — this box runs many
// other agents concurrently and a syntax check is not the thing that should
// eat the last free core.

import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');

const EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.vite',
  'out',
]);

const CONCURRENCY = Math.max(
  1,
  Math.min(2, Number(process.env.SYNTAX_CHECK_CONCURRENCY) || 2),
);

// Testing hook: point the checker at a fixture directory instead of the real
// apps/*/packages/* tree, e.g.
//   SYNTAX_CHECK_DIR=/tmp/.../fixture node tools/syntax-check.mjs
const FIXTURE_DIR = process.env.SYNTAX_CHECK_DIR;

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    // Permission-denied or vanished directories (e.g. bind-mounted docker
    // data volumes under apps/*/data) shouldn't crash the gate — skip them.
    if (err.code === 'EACCES' || err.code === 'ENOENT' || err.code === 'EPERM') {
      return;
    }
    throw err;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), out);
    } else if (entry.isFile()) {
      // Skip macOS AppleDouble sidecar files (e.g. "._server.js") — binary
      // Finder metadata that happens to share a real file's name and
      // extension, not JavaScript. At least one has made it into the repo
      // (apps/fitnessgeek/backend/src/._server.js); it's tracked in git but
      // out of scope for this gate to clean up.
      if (entry.name.startsWith('._')) continue;
      const ext = path.extname(entry.name);
      if (EXTENSIONS.has(ext)) {
        out.push(path.join(dir, entry.name));
      }
    }
  }
}

async function findTargets() {
  const out = [];

  if (FIXTURE_DIR) {
    await walk(path.resolve(FIXTURE_DIR), out);
    return out;
  }

  for (const group of ['apps', 'packages']) {
    let topLevel;
    try {
      topLevel = await readdir(path.join(REPO_ROOT, group), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of topLevel) {
      if (!entry.isDirectory()) continue;
      await walk(path.join(REPO_ROOT, group, entry.name), out);
    }
  }

  return out;
}

function checkFile(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', file], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 10_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ file, code, stderr });
    });
  });
}

function parseFailure({ file, stderr }) {
  const relPath = path.relative(REPO_ROOT, file);
  const lines = stderr.split('\n');

  // node --check's happy-path failure output:
  //   /abs/path/file.js:12
  //   <offending line of source>
  //          ^^^^
  //
  //   SyntaxError: <message>
  //       at checkSyntax (...)
  //
  //   Node.js vXX.Y.Z
  let lineNo = null;
  const headMatch = lines[0] && lines[0].match(/:(\d+)$/);
  if (headMatch) lineNo = headMatch[1];

  let message = null;
  for (const line of lines) {
    const m = line.match(/^([A-Za-z]*Error):\s*(.*)$/);
    if (m) {
      message = `${m[1]}: ${m[2]}`;
      break;
    }
  }

  if (!message) {
    // Fall back to whatever Node printed, collapsed to one line.
    message = stderr.trim().split('\n').slice(0, 3).join(' | ') || 'node --check failed with no output';
  }

  return lineNo ? `${relPath}:${lineNo}: ${message}` : `${relPath}: ${message}`;
}

async function runPool(files, worker, concurrency) {
  const results = new Array(files.length);
  let next = 0;

  async function runner() {
    while (next < files.length) {
      const i = next++;
      results[i] = await worker(files[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, runner));
  return results;
}

async function main() {
  const start = Date.now();
  const files = await findTargets();

  if (files.length === 0) {
    console.log('syntax-check: no target files found — nothing to check.');
    return 0;
  }

  const results = await runPool(files, checkFile, CONCURRENCY);
  const failures = results.filter((r) => r.code !== 0);

  const elapsedMs = Date.now() - start;
  const elapsedSec = (elapsedMs / 1000).toFixed(2);

  if (failures.length > 0) {
    console.error(`syntax-check: ${failures.length} of ${files.length} file(s) failed to parse:\n`);
    for (const failure of failures) {
      console.error(parseFailure(failure));
    }
    console.error(`\nsyntax-check: FAILED in ${elapsedSec}s (${files.length} files checked, concurrency=${CONCURRENCY})`);
    return 1;
  }

  console.log(`syntax-check: OK — ${files.length} files parsed cleanly in ${elapsedSec}s (concurrency=${CONCURRENCY})`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('syntax-check: internal error');
    console.error(err);
    process.exit(1);
  });
