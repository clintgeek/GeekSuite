#!/usr/bin/env node
/**
 * probe-free-tier.js — ask every free-tier row whether it is still alive.
 *
 * Why this exists
 * ---------------
 * `AIFreeTier` is a shopping list of models that were free when somebody wrote
 * the row down. Vendors retire model ids without notice: on 2026-09-06 the
 * collection's top-priority row was `groq/llama-3.1-8b-instant` (retired, 404
 * `model_not_found`), Together's default `-Free` Llama had stopped being
 * serverless (400), and OpenRouter's `:free` slug had been recycled (404).
 * StartGeek's Ask — routing row `tier: free` — walked all of them inside a 3 s
 * budget and answered from its search fallback every single time.
 *
 * Three things now answer that question without a human:
 *   - `aiService` remembers a hard failure per row (`AIFreeTier.health`), so a
 *     dead row self-heals within one call (R130);
 *   - `services/aiCatalogJob.js` re-probes every free row every six hours;
 *   - this script, which is the *deliberate* version — run it after a vendor
 *     changes its lineup, or when the aiGeek page shows something odd.
 *
 * Everything it does lives in `src/services/aiCatalogDiscovery.js`. This file
 * is argument parsing, a Mongo connection and some printing.
 *
 * Usage
 * -----
 *   node scripts/probe-free-tier.js              # report only (default)
 *   node scripts/probe-free-tier.js --mark       # cool every dead row for 30d
 *   node scripts/probe-free-tier.js --revive     # clear cooling on live rows
 *   node scripts/probe-free-tier.js --provider groq
 *   node scripts/probe-free-tier.js --timeout 12000
 *
 *   --mark and --revive compose; neither deletes a row. The aiGeek UI lists
 *   this collection, and a row that vanished reads as a config loss, not as a
 *   dead model. A cooled row is still visible, still explains itself
 *   (`health.lastFailureCode`), and comes back the moment it answers.
 *
 * What it sends
 * -------------
 * One structured-extraction probe per row, through
 * `aiService.callProvider(provider, prompt, { model, maxTokens: 48 })` — the
 * same adapter a real call takes, so a row that passes here is a row that
 * works. Nothing about the request is user data (it is a made-up vet
 * appointment). A row that answers with parseable JSON is recorded
 * `fitness: 'structured'` and ranked above one that answers with prose; empty
 * text at HTTP 200 is dead.
 *
 * What it prints
 * --------------
 * provider, modelId, alive/dead/unknown, fitness, and a short classified code
 * (`http_404`, `model_not_found`, `timeout`, …). **Never a key, never a key
 * hint, and never more than 80 characters of a provider's error text** —
 * provider bodies carry org ids, entitlement detail and vendor-redacted key
 * fragments (see services/aiFailureEnvelope.js). The `--detail` flag widens
 * that to 200 characters and is still truncated.
 *
 * Env
 * ---
 * Connection strings and provider keys come from `apps/basegeek/.env.production`
 * via dotenv, the way `scripts/mint-api-key.js` reads them. They are never
 * printed. Run this on the baseGeek host.
 */

import path from 'path';
import {
  DEFAULT_PROBE_TIMEOUT_MS,
  ERROR_TEXT_LIMIT,
  ERROR_TEXT_LIMIT_DETAIL,
  renderTable,
  runProbe
} from '../src/services/aiCatalogDiscovery.js';

/* ───────────────────────────── argument parsing ─────────────────────────── */

const FLAGS = new Set(['--mark', '--revive', '--detail', '--help', '-h']);

export function parseArgs(argv) {
  const opts = {
    mark: false,
    revive: false,
    detail: false,
    help: false,
    provider: null,
    timeout: DEFAULT_PROBE_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} requires a value`);
      return v;
    };

    switch (arg) {
      case '--mark': opts.mark = true; break;
      case '--revive': opts.revive = true; break;
      case '--detail': opts.detail = true; break;
      case '--provider': opts.provider = String(next()).trim().toLowerCase(); break;
      case '--timeout': {
        const ms = Number.parseInt(next(), 10);
        if (!Number.isFinite(ms) || ms < 500) {
          throw new Error('--timeout expects milliseconds, at least 500');
        }
        opts.timeout = ms;
        break;
      }
      case '--help':
      case '-h': opts.help = true; break;
      default:
        if (arg.startsWith('-') && !FLAGS.has(arg)) throw new Error(`Unknown option: ${arg}`);
        throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return opts;
}

const HELP = `
probe-free-tier.js — ask every free-tier row whether it is still alive

  node scripts/probe-free-tier.js [options]

  --mark              cool every dead row for 30 days (no row is deleted)
  --revive            clear cooling on every row that answered
  --provider <id>     probe one provider only
  --timeout <ms>      per-row budget (default ${DEFAULT_PROBE_TIMEOUT_MS})
  --detail            allow ${ERROR_TEXT_LIMIT_DETAIL} characters of provider text instead of ${ERROR_TEXT_LIMIT}

Default is report only. The catalog job re-probes every free row every six
hours on its own; this is the manual override. Keys and connection strings come
from apps/basegeek/.env.production and are never printed; provider error text
is always truncated.
`;

/* ─────────────────────────── CLI entrypoint ─────────────────────────────── */

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  let exitCode = 0;
  let closers = [];

  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      console.log(HELP);
      process.exit(0);
    }

    // dotenv first, then anything that reads a URI or a provider key at import
    // time — both connections and aiService's provider table do. This order is
    // load-bearing; see mint-api-key.js, which has the same constraint.
    const here = path.dirname(new URL(import.meta.url).pathname);
    const envPath = path.resolve(here, '../../../.env.production');
    const { default: dotenv } = await import('dotenv');
    const loaded = dotenv.config({ path: envPath });
    // Inside the basegeek container the variables are already in the
    // environment and there is no .env file — that is the normal way to run
    // this (the aiGeek Mongo URI resolves only on the Docker network).
    const alreadyConfigured = Boolean(process.env.AIGEEK_MONGODB_URI || process.env.MONGODB_URI);
    if (loaded.error && !alreadyConfigured) {
      throw new Error(`Could not read ${envPath} — run this on the baseGeek host or inside the basegeek container`);
    }

    const { default: AIFreeTier } = await import('../src/models/AIFreeTier.js');
    const { default: aiService } = await import('../src/services/aiService.js');
    const { getAIGeekConnection } = await import('../src/config/database.js');
    const aiGeekConn = getAIGeekConnection();
    closers = [aiGeekConn];
    if (aiGeekConn.readyState === 0) await aiGeekConn.asPromise();

    const filter = { isFree: true };
    if (opts.provider) filter.provider = opts.provider;
    const allRows = await AIFreeTier.find(filter).lean();

    // Only rows we could actually call: a provider with no key configured is
    // not a dead model, and marking it as one would be a lie in the database.
    const rows = [];
    const skipped = [];
    for (const row of allRows) {
      const pc = aiService.providers[row.provider];
      if (pc && pc.apiKey && pc.enabled !== false) rows.push(row);
      else skipped.push(row);
    }

    if (rows.length === 0) {
      console.log('No free-tier rows with a configured provider key.');
      process.exit(0);
    }

    console.log(
      `probing ${rows.length} free-tier row(s)` +
      (skipped.length ? `, skipping ${skipped.length} with no configured key` : '') +
      (opts.mark || opts.revive ? '' : ' — report only, pass --mark/--revive to write')
    );

    const results = await runProbe({
      rows,
      callProvider: (provider, prompt, config) => aiService.callProvider(provider, prompt, config),
      updateOne: (opts.mark || opts.revive)
        ? (query, update) => AIFreeTier.updateOne(query, update)
        : null,
      options: { mark: opts.mark, revive: opts.revive, timeout: opts.timeout },
    });

    console.log('');
    for (const outLine of renderTable(results, { detail: opts.detail })) console.log(outLine);

    const alive = results.filter(r => r.status === 'alive').length;
    const structured = results.filter(r => r.fitness === 'structured').length;
    const dead = results.filter(r => r.status === 'dead').length;
    const unknown = results.filter(r => r.status === 'unknown').length;
    const written = results.filter(r => r.marked).length;
    console.log('');
    console.log(`${alive} alive (${structured} structured), ${dead} dead, ${unknown} unknown${written ? `, ${written} row(s) updated` : ''}`);
    if (skipped.length) {
      console.log(`not probed (no provider key): ${skipped.map(r => `${r.provider}/${r.modelId}`).join(', ')}`);
    }
    if (dead > 0 && !opts.mark) {
      console.log('Re-run with --mark to keep the dead rows out of free-tier selection for 30 days.');
    }
  } catch (err) {
    console.error(`probe-free-tier failed: ${err.message}`);
    exitCode = 1;
  } finally {
    for (const conn of closers) {
      await conn?.close?.().catch(() => {});
    }
    process.exitCode = exitCode;
  }
}
