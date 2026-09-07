#!/usr/bin/env node
/**
 * discover-free-models — the manual override for the catalog job.
 *
 * Ask every configured provider what it offers *today*, keep the free-tier
 * candidates, probe each one live, and (with --sync) make the catalog match.
 *
 *   node scripts/discover-free-models.js               # report only
 *   node scripts/discover-free-models.js --sync        # write the catalog
 *   node scripts/discover-free-models.js --provider groq,cloudflare
 *   node scripts/discover-free-models.js --all         # ignore the deny overrides
 *   node scripts/discover-free-models.js --timeout 6000
 *
 * Run inside the basegeek container (provider keys live in the aiGeek DB, and
 * the Mongo host resolves only on the Docker network):
 *   docker exec basegeek sh -c 'cd /app/apps/basegeek/packages/api && node scripts/discover-free-models.js'
 *
 * **This is no longer the only thing that keeps the catalog current.** Since
 * 2026-09-07 `services/aiCatalogJob.js` runs the same functions in-process,
 * hourly, with discovery at 24 h and a re-probe at 6 h. This script exists for
 * when you want to see the answer now, or after a vendor changes its lineup.
 * All the logic lives in `src/services/aiCatalogDiscovery.js` — this file is
 * argument parsing, a Mongo connection and some printing.
 *
 * Never prints a key, a URL with a key, or more than 80 chars of any error body.
 */
import path from 'node:path';
import {
  PROVIDERS,
  DEFAULT_PROBE_TIMEOUT_MS,
  discover,
  listModels,
  renderReport,
  safeErrorText,
  summarizeByProvider,
  syncResults
} from '../src/services/aiCatalogDiscovery.js';

export function parseArgs(argv) {
  const o = { sync: false, all: false, timeout: DEFAULT_PROBE_TIMEOUT_MS, providers: PROVIDERS, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sync') o.sync = true;
    else if (a === '--all') o.all = true;
    else if (a === '--timeout') o.timeout = Number(argv[++i]);
    else if (a === '--provider') o.providers = String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let closers = [];
  let exitCode = 0;
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log('usage: discover-free-models.js [--sync] [--all] [--provider a,b] [--timeout ms]'); process.exit(0); }
    const here = path.dirname(new URL(import.meta.url).pathname);
    const envPath = path.resolve(here, '../../../.env.production');
    const { default: dotenv } = await import('dotenv');
    const loaded = dotenv.config({ path: envPath });
    if (loaded.error && !(process.env.AIGEEK_MONGODB_URI || process.env.MONGODB_URI)) {
      throw new Error(`Could not read ${envPath} — run on the baseGeek host or inside the basegeek container`);
    }
    const { default: AIFreeTier } = await import('../src/models/AIFreeTier.js');
    const { default: AIModel } = await import('../src/models/AIModel.js');
    const { default: AIPricing } = await import('../src/models/AIPricing.js');
    const { default: aiService } = await import('../src/services/aiService.js');
    const { getAIGeekConnection } = await import('../src/config/database.js');
    const conn = getAIGeekConnection();
    closers = [conn];
    if (conn.readyState === 0) await conn.asPromise();
    let n = 0;
    while (!aiService.initialized && n++ < 100) await new Promise((r) => setTimeout(r, 100));

    const configured = opts.providers.filter((p) => aiService.providers[p]?.apiKey && aiService.providers[p].enabled !== false);
    const skipped = opts.providers.filter((p) => !configured.includes(p));
    if (skipped.length) console.log(`not configured (no key): ${skipped.join(', ')}`);

    const results = await discover({
      providers: configured,
      listProvider: (p) => listModels(p, aiService.providers[p]),
      probeProvider: (provider, prompt, config) => aiService.callProvider(provider, prompt, config),
      timeoutMs: opts.timeout,
      all: opts.all,
    });
    console.log(renderReport(results));

    if (opts.sync) {
      // The same writer the job uses, so the manual override and the scheduled
      // run can never produce different catalogs.
      const counts = await syncResults(results, { freeTier: AIFreeTier, model: AIModel, pricing: AIPricing });
      console.log(
        `sync: ${counts.alive} alive row(s) upserted as free, ${counts.dead} cooled 30d, ` +
        `${counts.listed} catalog row(s) refreshed, ${counts.deactivated} deactivated, ${counts.unknown} left alone`
      );
      console.log(JSON.stringify(summarizeByProvider(results), null, 2));
    } else {
      console.log('Re-run with --sync to write the alive rows into AIFreeTier and cool the dead ones.');
    }
  } catch (err) {
    console.error(`discover-free-models failed: ${safeErrorText(err?.message || String(err), 200)}`);
    exitCode = 1;
  } finally {
    for (const c of closers) { try { await c.close(); } catch { /* ignore */ } }
    process.exit(exitCode);
  }
}
