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
 * `aiService` now remembers a hard failure per row (see `AIFreeTier.health`),
 * so that self-heals within one call. This script is the *deliberate* version
 * of the same question: run it after a vendor changes its lineup, or when the
 * aiGeek page shows models nobody has used in a month, and it tells you which
 * rows are still worth having.
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
 * One 1-token "Reply OK" completion per row, through
 * `aiService.callProvider(provider, prompt, { model, maxTokens: 1 })` — the
 * same adapter a real call takes, so a row that passes here is a row that
 * works. Nothing about the request is user data.
 *
 * What it prints
 * --------------
 * provider, modelId, alive/dead/unknown, and a short classified code
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
 *
 * Everything above the CLI block is pure or dependency-injected so it can be
 * tested without a network — see `src/__tests__/aiFreeTierProbe.test.js`.
 */

import path from 'path';
import { classifyFreeTierFailure } from '../src/models/AIFreeTier.js';

/** How long a `--mark`ed row stays out of selection. */
export const PROBE_MARK_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
/** Per-row wall clock budget. */
export const DEFAULT_PROBE_TIMEOUT_MS = 8000;
/** Hard ceiling on how much provider text may reach a terminal. */
export const ERROR_TEXT_LIMIT = 80;
export const ERROR_TEXT_LIMIT_DETAIL = 200;

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

/* ──────────────────────────── classification ────────────────────────────── */

/**
 * Trim provider text to something safe to print.
 * @param {string} text
 * @param {number} limit
 */
export function safeErrorText(text, limit = ERROR_TEXT_LIMIT) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1)}…`;
}

/**
 * The probe's verdict on one row.
 *
 * Pure, and the single reason this file is importable: it must agree with
 * `aiService`'s selection path about what "dead" means, or a row the probe
 * buries is dug up by the next call — so it delegates the judgement to
 * `classifyFreeTierFailure` in the model and only names the outcome.
 *
 *   alive   — the provider answered
 *   dead    — a hard failure: the model is gone, the slug was recycled, or the
 *             credential is refused. Retrying tomorrow changes nothing.
 *   unknown — a 429, a 5xx, a timeout, a socket. The row may be perfectly fine
 *             and this is a bad minute; `--mark` leaves these alone.
 *
 * @param {Error|null} error  null when the call returned
 * @returns {{status: 'alive'|'dead'|'unknown', code: string, http: number|null}}
 */
export function classifyProbeOutcome(error) {
  if (!error) return { status: 'alive', code: 'ok', http: null };
  const { hard, code, status } = classifyFreeTierFailure(error);
  return { status: hard ? 'dead' : 'unknown', code, http: status };
}

/* ──────────────────────────────── the probe ─────────────────────────────── */

/**
 * Call one row, with a wall-clock cap the adapters do not provide themselves
 * (the per-provider axios timeouts are 60 s, which is not a probe).
 *
 * @param {{provider: string, modelId: string}} row
 * @param {{callProvider: Function, timeoutMs?: number}} deps
 */
export async function probeRow(row, { callProvider, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS }) {
  const started = Date.now();
  let timer = null;
  try {
    const call = Promise.resolve(
      callProvider(row.provider, 'Reply OK', {
        model: row.modelId,
        maxTokens: 1,
        temperature: 0,
      })
    );
    // Attached BEFORE the race: when the timeout wins, the adapter's own
    // rejection arrives later with nobody listening, and an unhandled rejection
    // in a script probing eight vendors in a row is a crash, not a warning.
    call.catch(() => {});

    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`probe timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    await Promise.race([call, guard]);
    return { ...classifyProbeOutcome(null), ms: Date.now() - started, message: '' };
  } catch (error) {
    return {
      ...classifyProbeOutcome(error),
      ms: Date.now() - started,
      message: String(error?.message || ''),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Render the results as a fixed-width table. Pure — takes rows, returns lines.
 * @param {Array<{provider: string, modelId: string, status: string, code: string, ms: number, message?: string}>} results
 */
export function renderTable(results, { detail = false } = {}) {
  const limit = detail ? ERROR_TEXT_LIMIT_DETAIL : ERROR_TEXT_LIMIT;
  const columns = [
    { key: 'provider', head: 'provider' },
    { key: 'modelId', head: 'model' },
    { key: 'status', head: 'result' },
    { key: 'code', head: 'code' },
    { key: 'ms', head: 'ms' },
  ];
  const cell = (row, key) => String(row[key] ?? '');
  const widths = columns.map(c =>
    Math.max(c.head.length, ...results.map(r => cell(r, c.key).length), 0)
  );

  const line = (values) => values.map((v, i) => String(v).padEnd(widths[i])).join('  ').trimEnd();
  const out = [
    line(columns.map(c => c.head)),
    line(widths.map(w => '-'.repeat(w))),
  ];
  for (const r of results) {
    out.push(line(columns.map(c => cell(r, c.key))));
    if (r.status !== 'alive' && r.message) {
      out.push(`    ${safeErrorText(r.message, limit)}`);
    }
  }
  return out;
}

/**
 * Run the probe across a set of rows and (optionally) write the verdicts back.
 *
 * @param {object} deps
 * @param {Array} deps.rows          AIFreeTier documents (or plain objects)
 * @param {Function} deps.callProvider
 * @param {Function} [deps.updateOne] (filter, update) => Promise — omit for a dry run
 * @param {object} [deps.options]
 */
export async function runProbe({ rows, callProvider, updateOne = null, options = {} }) {
  const { mark = false, revive = false, timeout = DEFAULT_PROBE_TIMEOUT_MS, now = Date.now() } = options;
  const results = [];

  // Sequential on purpose: a parallel fan-out across eight vendors is a good
  // way to trip the very rate limits this is trying to distinguish from death.
  for (const row of rows) {
    const outcome = await probeRow(row, { callProvider, timeoutMs: timeout });
    const result = { provider: row.provider, modelId: row.modelId, ...outcome, marked: null };

    if (updateOne && mark && outcome.status === 'dead') {
      await updateOne(
        { provider: row.provider, modelId: row.modelId },
        {
          $set: {
            'health.lastFailureAt': new Date(now),
            'health.lastFailureCode': outcome.code,
            'health.coolingUntil': new Date(now + PROBE_MARK_COOLDOWN_MS),
          },
        }
      );
      result.marked = 'cooled 30d';
    } else if (updateOne && revive && outcome.status === 'alive') {
      await updateOne(
        { provider: row.provider, modelId: row.modelId },
        {
          $set: {
            'health.consecutiveFailures': 0,
            'health.lastFailureAt': null,
            'health.lastFailureCode': null,
            'health.lastSuccessAt': new Date(now),
            'health.coolingUntil': null,
          },
        }
      );
      result.marked = 'revived';
    }

    results.push(result);
  }

  return results;
}

const HELP = `
probe-free-tier.js — ask every free-tier row whether it is still alive

  node scripts/probe-free-tier.js [options]

  --mark              cool every dead row for 30 days (no row is deleted)
  --revive            clear cooling on every row that answered
  --provider <id>     probe one provider only
  --timeout <ms>      per-row budget (default ${DEFAULT_PROBE_TIMEOUT_MS})
  --detail            allow ${ERROR_TEXT_LIMIT_DETAIL} characters of provider text instead of ${ERROR_TEXT_LIMIT}

Default is report only. Keys and connection strings come from
apps/basegeek/.env.production and are never printed; provider error text is
always truncated.
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
    const dead = results.filter(r => r.status === 'dead').length;
    const unknown = results.filter(r => r.status === 'unknown').length;
    const written = results.filter(r => r.marked).length;
    console.log('');
    console.log(`${alive} alive, ${dead} dead, ${unknown} unknown${written ? `, ${written} row(s) updated` : ''}`);
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
