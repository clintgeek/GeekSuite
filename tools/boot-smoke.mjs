#!/usr/bin/env node
// tools/boot-smoke.mjs
//
// BURN_REVIEW #22(a)+(b): nothing tested the two outage classes from
// 2026-09-05 at the *import/boot* level:
//   (a) a module that parses but fails at import time — a missing export, a
//       bad workspace path, a CJS/ESM interop error. (The gql-backtick case
//       was parse-level and is now covered by `tools/syntax-check.mjs` plus
//       `gatewaySchemaLoads`; the remaining gap is import-time, not parse-time.)
//   (b) a missing required env var at boot (e.g. fitnessgeek's
//       `assertKeyVaultSecret`).
//
// This is a cheap, universal gate in the same spirit as syntax-check.mjs: for
// every backend, `await import()` the module that builds the Express app (or
// the closest available substitute) with fake env vars set, and fail loudly
// if the import itself throws. It does NOT connect to a real database and
// does NOT bind a port — it only proves the module graph resolves and
// executes its top-level (module-scope) code cleanly.
//
// Why not import server.js directly for every app: several of these backends
// run their boot sequence (mongoose.connect, app.listen) unconditionally at
// module scope with no test/skip guard — importing server.js would try to
// reach a real Mongo and open a real socket. None of the seven backends has
// a SKIP_LISTEN-style guard today, so per the task this script does not add
// one (that's an app-code change, out of scope here) — instead each target
// below is either:
//   - the app's own app.js (or equivalent) that builds the Express app and
//     is deliberately split out from server.js for exactly this reason
//     (bujogeek, fitnessgeek, storygeek all document this split), or
//   - a documented FALLBACK: the deepest available module that still pulls
//     in real route/import surface, for the four apps that have no such
//     split. Each fallback's coverage gap is written out below and repeated
//     in DOCS/RUNBOOK.md — this script does not paper over what it can't see.
//
// Fake env values below are obviously synthetic and are never read from or
// written to any real secret store. See DOCS/RUNBOOK.md §5 ("Syntax gate").

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');

// Obviously-fake boot-time env. Real prod secrets never touch this file.
const FAKE_ENV = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'test',
  // crypto-vault requires exactly 64 hex chars (32 bytes) — this repeating
  // "deadbeef" pattern satisfies that format while staying obviously fake.
  KEY_VAULT_SECRET: 'deadbeef'.repeat(8),
  DB_URI: 'mongodb://127.0.0.1:1/boot-smoke-fake-db-not-real',
  MONGODB_URI: 'mongodb://127.0.0.1:1/boot-smoke-fake-db-not-real',
  BASEGEEK_MONGODB_URI: 'mongodb://127.0.0.1:1/boot-smoke-fake-db-not-real',
  // basegeek's config/database.js defaults to a real 'mongodb://localhost:27017/aiGeek'
  // when unset — on a box that happens to run a local mongod, that default
  // reaches it for real instead of failing closed. Point it at the same
  // never-listening port as everything else.
  AIGEEK_MONGODB_URI: 'mongodb://127.0.0.1:1/boot-smoke-fake-db-not-real',
  MONGO_BASE_URI: 'mongodb://127.0.0.1:1',
  JWT_SECRET: 'boot-smoke-fake-jwt-secret-not-real',
  CORS_ORIGINS: 'https://boot-smoke.invalid',
};

const TARGETS = [
  {
    app: 'bujogeek',
    modules: ['apps/bujogeek/backend/src/app.js'],
    note: "app.js exports createApp() and is split from server.js precisely so it can be imported without connecting Mongo or listening; its route imports run at module scope, so a plain import already exercises them.",
  },
  {
    app: 'fitnessgeek',
    modules: ['apps/fitnessgeek/backend/src/app.js'],
    note: 'app.js exports the built Express app; server.js owns the boot sequence (KEY_VAULT_SECRET assertion, Mongo/Redis connect, listen) and is intentionally not imported here.',
  },
  {
    app: 'flockgeek',
    modules: ['apps/flockgeek/backend/src/routes/api.js'],
    note: 'FALLBACK — flockgeek has no separable app.js; server.js builds the app and calls its unconditional start() (mongoose.connect + listen) in one file with no guard. routes/api.js is the routes index that pulls in all nine route modules (birds, groups, health records, egg production, pairings, locations, hatch events, meat runs, auth), so it is the deepest safe substitute.',
  },
  {
    app: 'notegeek',
    modules: ['apps/notegeek/backend/routes/auth.js'],
    note: "FALLBACK — notegeek has no separable app.js either; server.js's start() builds the whole app (helmet, rate limiters, CSRF guard, CORS, routes, SPA fallback), connects Mongo, and listens, all inline with no guard. routes/auth.js is the only route module notegeek has split out — the health check, /api/me, and static/SPA handling are inline in server.js and are NOT covered by this smoke test.",
  },
  {
    app: 'storygeek',
    modules: ['apps/storygeek/backend/src/app.js'],
    note: 'app.js exports the built Express app; server.js owns the boot sequence (Mongo connect, listen) and is intentionally not imported here.',
  },
  {
    app: 'bookgeek',
    modules: [
      'apps/bookgeek/api/src/routes/authRoutes.js',
      'apps/bookgeek/api/src/routes/importRoutes.js',
      'apps/bookgeek/api/src/deviceBasket.js',
    ],
    note: "FALLBACK — apps/bookgeek/api/src/server.js is a ~2800-line monolith that mongoose.connect()s and app.listen()s unconditionally with no guard; its own test/csrfGuard.test.js documents this exact problem (\"server.js itself calls start() at import time ... so it cannot be imported here\"). These three router modules are the only route logic bookgeek split into separate files — the bulk of its routes (~2700 lines: books, profile, kindle, enrichment, etc.) live inline in server.js and are NOT covered by this smoke test. Closing that gap means splitting server.js into an app.js, which is app-code work out of this task's scope.",
  },
  {
    app: 'basegeek',
    modules: ['apps/basegeek/packages/api/src/graphql/index.js'],
    note: "FALLBACK — apps/basegeek/packages/api/src/server.js does a top-level `await mongoose.connect(...)` at module scope (not inside any function), so it cannot be imported at all without reaching a real Mongo. graphql/index.js is the closest routes-index equivalent: it merges all nine gateway GraphQL modules (typeDefs + resolvers across every consumer app) and is basegeek's dominant surface — this is the same module `gatewaySchemaLoads` already imports in the jest suite, so this adds a second, dependency-free check of the same import graph, not new coverage of it. It does NOT cover basegeek's REST route modules (routes/mongo.js, routes/auth.js, routes/aiRoutes.js, routes/openaiProxy.js, etc.), which have no aggregator and are only ever imported by server.js itself.",
  },
];

function importOne(modulePath) {
  const absPath = path.resolve(REPO_ROOT, modulePath);
  const fileUrl = pathToFileURL(absPath).href;
  // `process.exit(0)` right after a successful import is deliberate, not
  // decorative: basegeek's graphql/index.js transitively pulls in
  // services/aiService.js, whose singleton (`export default new AIService()`)
  // fires an unawaited `initializeService()` in its constructor — the exact
  // "singleton service's open handle keeps the process alive forever" quirk
  // ci.yml's own test-basegeek job comments about and works around with
  // jest's `--forceExit`. The import itself resolves in well under a second;
  // without an explicit exit, the child would hang on that dangling
  // handle/reconnect loop for as long as the fake Mongo URI takes to keep
  // failing, which is not this gate's concern. A module that fails to import
  // never reaches this line — Node's default top-level-await rejection
  // handling prints the error and exits non-zero on its own.
  const code = `await import(${JSON.stringify(fileUrl)}); process.exit(0);`;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      cwd: REPO_ROOT,
      env: FAKE_ENV,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    // Import-time work here is module evaluation only (no listen, no real
    // network) — 15s is generous headroom, not an expected duration.
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 15_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ modulePath, code, stderr: stderr.trim() });
    });
  });
}

async function checkTarget(target) {
  const results = [];
  for (const modulePath of target.modules) {
    results.push(await importOne(modulePath));
  }
  const failures = results.filter((r) => r.code !== 0);
  return { ...target, results, ok: failures.length === 0, failures };
}

async function main() {
  const start = Date.now();
  console.log(`boot-smoke: checking ${TARGETS.length} backend(s)...\n`);

  const outcomes = [];
  // Sequential on purpose: this box runs many other agents concurrently, and
  // there are only seven cheap imports here — not worth a concurrency knob.
  for (const target of TARGETS) {
    outcomes.push(await checkTarget(target));
  }

  let anyFailed = false;
  for (const outcome of outcomes) {
    const modules = outcome.modules.join(', ');
    if (outcome.ok) {
      console.log(`  OK  ${outcome.app} — ${modules}`);
    } else {
      anyFailed = true;
      console.error(`FAIL  ${outcome.app} — ${modules}`);
      for (const failure of outcome.failures) {
        console.error(`        ${path.relative(REPO_ROOT, failure.modulePath)}:`);
        console.error(
          failure.stderr
            .split('\n')
            .map((l) => `          ${l}`)
            .join('\n')
        );
      }
    }
    if (outcome.note) {
      console.log(`        note: ${outcome.note}`);
    }
  }

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(2);
  if (anyFailed) {
    console.error(`\nboot-smoke: FAILED in ${elapsedSec}s`);
    return 1;
  }
  console.log(`\nboot-smoke: OK — ${TARGETS.length} backend(s) checked in ${elapsedSec}s`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('boot-smoke: internal error');
    console.error(err);
    process.exit(1);
  });
