/**
 * aiCatalogJob.js — the steward, as a job.
 *
 * Before this, the AI catalog was only as current as the last time Chef ran
 * `docker exec basegeek … discover-free-models.js --sync`, and the numbers the
 * router relied on in between were ~3,100 lines of hand-typed claims about
 * vendors who change their minds monthly. Live state on 2026-09-07: Cerebras
 * 4/4 rows cooling, Ollama Cloud 7/7 cooling, OpenRouter 4/5 cooling, Together
 * 0 proven in a week; only Cloudflare fully alive. Nothing was scheduled to
 * notice.
 *
 * Shape and wiring are modelled on `oauthRefreshJobService.js` — a class with
 * `start()` / `stop()`, `setInterval`-driven, started after `listen` in
 * server.js and stopped in the shutdown path. Every tick:
 *
 *   1. **Discovery** when the last one is older than `AI_CATALOG_DISCOVERY_HOURS`
 *      (24). Per configured provider: list → candidates → probe each → write.
 *   2. **Re-probe** when the last one is older than `AI_CATALOG_PROBE_HOURS`
 *      (6). Every free row with a configured provider gets one probe; alive
 *      rows are revived, dead rows cooled 30 days.
 *   3. **Prune** catalog rows whose provider has left the roster. `AIConfig` —
 *      the encrypted keys — is never touched by this job.
 *
 * The first tick waits `bootDelayMs` (60 s) so `aiService` has loaded the
 * provider keys out of Mongo; a tick with no keys would mark every row dead.
 *
 * Every run writes one `AICatalogRun` document **even when it fails halfway**:
 * a run that vanished is indistinguishable from a job that never started, and
 * the status page's whole job is to tell those apart. One provider's failure
 * never stops the others — `discover()` catches per provider, `probeRow`
 * catches per row, and `syncResults` catches per write.
 *
 * `AI_CATALOG_JOB=off` disables the whole thing (tests, local dev with no
 * keys). That is also the Phase 1 rollback: set it, redeploy, and the manual
 * scripts still work.
 *
 * The clock and every dependency are injectable, so the scheduling decisions
 * are unit-testable without a network, a database or a wait.
 */

import logger from '../lib/logger.js';
import aiService from './aiService.js';
import * as discovery from './aiCatalogDiscovery.js';
import AICatalogRun from '../models/AICatalogRun.js';
import AIFreeTier from '../models/AIFreeTier.js';
import AIModel from '../models/AIModel.js';
import AIPricing from '../models/AIPricing.js';
import { PROVIDER_IDS } from '../config/aiProviders.js';

export const DEFAULT_TICK_MS = 60 * 60 * 1000;
export const DEFAULT_DISCOVERY_HOURS = 24;
export const DEFAULT_PROBE_HOURS = 6;
export const DEFAULT_BOOT_DELAY_MS = 60 * 1000;

/** Read a positive number from the environment, else the default. */
function envHours(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(`[CatalogJob] ignoring invalid ${name}="${raw}" — using ${fallback}`);
    return fallback;
  }
  return parsed;
}

export class AICatalogJob {
  /**
   * @param {object} [opts]
   * @param {number} [opts.intervalMs]      tick period (default 1 h)
   * @param {number} [opts.discoveryHours]  age at which discovery re-runs
   * @param {number} [opts.probeHours]      age at which the re-probe re-runs
   * @param {number} [opts.bootDelayMs]     delay before the first tick
   * @param {() => number} [opts.now]       injectable clock
   * @param {object} [opts.deps]            { ai, discovery, catalogRun, freeTier, model, pricing, providers, log }
   */
  constructor(opts = {}) {
    const {
      intervalMs = DEFAULT_TICK_MS,
      discoveryHours = envHours('AI_CATALOG_DISCOVERY_HOURS', DEFAULT_DISCOVERY_HOURS),
      probeHours = envHours('AI_CATALOG_PROBE_HOURS', DEFAULT_PROBE_HOURS),
      bootDelayMs = DEFAULT_BOOT_DELAY_MS,
      now = () => Date.now(),
      deps = {}
    } = opts;

    this.intervalMs = intervalMs;
    this.discoveryMs = discoveryHours * 60 * 60 * 1000;
    this.probeMs = probeHours * 60 * 60 * 1000;
    this.bootDelayMs = bootDelayMs;
    this.now = now;

    this.ai = deps.ai || aiService;
    this.discovery = deps.discovery || discovery;
    this.catalogRun = deps.catalogRun || AICatalogRun;
    this.freeTier = deps.freeTier || AIFreeTier;
    this.model = deps.model || AIModel;
    this.pricing = deps.pricing || AIPricing;
    this.providerIds = deps.providers || PROVIDER_IDS;
    this.log = deps.log || logger;

    this.jobInterval = null;
    this.bootTimer = null;
    this.isRunning = false;
    /** One tick at a time: a discovery run can outlive the interval. */
    this.ticking = false;
  }

  /** `false` when `AI_CATALOG_JOB=off`. */
  get enabled() {
    return String(process.env.AI_CATALOG_JOB || '').trim().toLowerCase() !== 'off';
  }

  /** The collections `aiCatalogDiscovery`'s write helpers take. */
  get writeDeps() {
    return { freeTier: this.freeTier, model: this.model, pricing: this.pricing };
  }

  start() {
    if (!this.enabled) {
      this.log.info('[CatalogJob] disabled by AI_CATALOG_JOB=off');
      return;
    }
    if (this.isRunning) {
      this.log.warn('[CatalogJob] already running');
      return;
    }
    this.isRunning = true;
    this.log.info(
      `[CatalogJob] starting (tick ${this.intervalMs}ms, discovery ${this.discoveryMs / 3600000}h, probe ${this.probeMs / 3600000}h, first tick in ${this.bootDelayMs}ms)`
    );

    // The boot tick waits for aiService to load the provider keys out of
    // Mongo. Probing with no key configured would mark every row dead.
    this.bootTimer = setTimeout(() => {
      this.tick().catch((err) => this.log.error({ err }, '[CatalogJob] boot tick failed'));
    }, this.bootDelayMs);
    if (typeof this.bootTimer.unref === 'function') this.bootTimer.unref();

    this.jobInterval = setInterval(() => {
      this.tick().catch((err) => this.log.error({ err }, '[CatalogJob] tick failed'));
    }, this.intervalMs);
    if (typeof this.jobInterval.unref === 'function') this.jobInterval.unref();
  }

  stop() {
    if (this.bootTimer) { clearTimeout(this.bootTimer); this.bootTimer = null; }
    if (this.jobInterval) { clearInterval(this.jobInterval); this.jobInterval = null; }
    if (!this.isRunning) return;
    this.isRunning = false;
    this.log.info('[CatalogJob] stopped');
  }

  /** Providers with a key and not switched off — the only ones worth calling. */
  configuredProviders() {
    return this.providerIds.filter((id) => {
      const pc = this.ai.providers?.[id];
      return Boolean(pc?.apiKey) && pc.enabled !== false;
    });
  }

  /** When a run of this kind last started, or null. */
  async lastRunAt(kind) {
    // Only a clean run counts. A run that aborted, or whose writes failed
    // (2026-09-07: every AIModel upsert threw on a `name` path conflict and
    // the run still "completed"), would otherwise hold the interval for a full
    // day while the catalog stays wrong. Such runs are kept for the status page
    // but do not satisfy the schedule; the next tick retries.
    const doc = await this.catalogRun
      .findOne({ kind, error: null, 'counts.listedError': null, 'counts.probeError': null })
      .sort({ startedAt: -1 })
      .lean();
    const at = doc?.finishedAt || doc?.startedAt;
    return at ? new Date(at).getTime() : null;
  }

  /**
   * One pass. Decides what is due and runs it; a failure in one half never
   * stops the other.
   */
  async tick() {
    if (this.ticking) {
      this.log.debug('[CatalogJob] previous tick still running — skipping');
      return { skipped: true };
    }
    this.ticking = true;
    const out = { discovery: null, probe: null };
    try {
      const now = this.now();

      let dueDiscovery = true;
      try {
        const last = await this.lastRunAt('discovery');
        dueDiscovery = last === null || now - last >= this.discoveryMs;
      } catch (err) {
        this.log.warn({ err }, '[CatalogJob] could not read the last discovery run — running one');
      }
      if (dueDiscovery) {
        try {
          out.discovery = await this.runDiscovery();
        } catch (err) {
          this.log.error({ err }, '[CatalogJob] discovery failed');
        }
      }

      let dueProbe = true;
      try {
        const last = await this.lastRunAt('probe');
        dueProbe = last === null || this.now() - last >= this.probeMs;
      } catch (err) {
        this.log.warn({ err }, '[CatalogJob] could not read the last probe run — running one');
      }
      // A discovery run just probed every candidate; re-probing the same rows
      // minutes later spends free quota to learn nothing.
      if (dueProbe && !out.discovery) {
        try {
          out.probe = await this.runProbeSweep();
        } catch (err) {
          this.log.error({ err }, '[CatalogJob] probe sweep failed');
        }
      }
      return out;
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Ask every configured provider what it offers today, probe the free
   * candidates, write the catalog, and retire what is gone.
   */
  async runDiscovery() {
    const startedAt = new Date(this.now());
    const providers = this.configuredProviders();
    const run = { kind: 'discovery', startedAt, perProvider: {}, pruned: {}, error: null };

    if (providers.length === 0) {
      run.error = 'no provider is configured with a key';
      run.finishedAt = new Date(this.now());
      this.log.warn('[CatalogJob] discovery skipped — no provider has a key');
      await this.writeRun(run);
      return run;
    }

    this.log.info({ providers }, `[CatalogJob] discovery starting for ${providers.length} provider(s)`);
    try {
      const results = await this.discovery.discover({
        providers,
        listProvider: (provider) => this.discovery.listModels(provider, this.ai.providers[provider]),
        probeProvider: (provider, prompt, config) => this.ai.callProvider(provider, prompt, config),
        timeoutMs: this.discovery.DEFAULT_PROBE_TIMEOUT_MS,
        now: this.now()
      });

      run.perProvider = this.discovery.summarizeByProvider(results);
      const counts = await this.discovery.syncResults(results, this.writeDeps, { now: this.now() });
      run.counts = counts;

      try {
        run.pruned = await this.discovery.pruneUnknownProviders({ providers: this.providerIds }, this.writeDeps);
        const orphans = Object.values(run.pruned).reduce((a, b) => a + (b || 0), 0);
        if (orphans > 0) this.log.info({ pruned: run.pruned }, `[CatalogJob] pruned ${orphans} row(s) for providers no longer in the roster`);
      } catch (err) {
        this.log.warn({ err }, '[CatalogJob] prune failed');
      }

      this.log.info({ counts, perProvider: run.perProvider }, '[CatalogJob] discovery complete');
    } catch (err) {
      run.error = this.discovery.safeErrorText(err?.message || 'error', 200);
      this.log.error({ err }, '[CatalogJob] discovery aborted');
    }

    run.finishedAt = new Date(this.now());
    await this.writeRun(run);
    return run;
  }

  /**
   * Re-probe every free row of a configured provider — alive or cooling. Alive
   * rows are revived (a vendor that fixed a model gets its row back without a
   * human), dead ones cooled 30 days. This is `runProbe({mark, revive})`.
   */
  async runProbeSweep() {
    const startedAt = new Date(this.now());
    const run = { kind: 'probe', startedAt, perProvider: {}, pruned: {}, error: null };

    try {
      const configured = new Set(this.configuredProviders());
      const all = await this.freeTier.find({ isFree: true }).lean();
      const rows = all.filter((row) => configured.has(row.provider));
      run.skipped = all.length - rows.length;

      if (rows.length === 0) {
        run.error = 'no free row has a configured provider';
        run.finishedAt = new Date(this.now());
        await this.writeRun(run);
        return run;
      }

      this.log.info(`[CatalogJob] re-probing ${rows.length} free row(s)`);
      const results = await this.discovery.runProbe({
        rows,
        callProvider: (provider, prompt, config) => this.ai.callProvider(provider, prompt, config),
        updateOne: (query, update) => this.freeTier.updateOne(query, update),
        options: { mark: true, revive: true, timeout: this.discovery.DEFAULT_PROBE_TIMEOUT_MS, now: this.now() }
      });

      run.perProvider = this.discovery.summarizeByProvider(
        results.map((r) => ({ ...r, kind: 'probe' }))
      );
      this.log.info({ perProvider: run.perProvider }, '[CatalogJob] re-probe complete');
    } catch (err) {
      run.error = this.discovery.safeErrorText(err?.message || 'error', 200);
      this.log.error({ err }, '[CatalogJob] re-probe aborted');
    }

    run.finishedAt = new Date(this.now());
    await this.writeRun(run);
    return run;
  }

  /** Write the run document. A failure here is logged, never thrown at a tick. */
  async writeRun(run) {
    try {
      await this.catalogRun.create(run);
    } catch (err) {
      this.log.warn({ err }, '[CatalogJob] failed to record the run');
    }
    return run;
  }
}

/* ───────────────────────────── the singleton ────────────────────────────── */

let instance = null;

export function getInstance(opts) {
  if (!instance) instance = new AICatalogJob(opts);
  return instance;
}

export function startAICatalogJob(opts) {
  getInstance(opts).start();
}

export function stopAICatalogJob() {
  if (instance) instance.stop();
}

export default { AICatalogJob, getInstance, startAICatalogJob, stopAICatalogJob };
