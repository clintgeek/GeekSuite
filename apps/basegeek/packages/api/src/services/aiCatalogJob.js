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
/**
 * How often the golden set runs. Daily, and that number is load-bearing.
 *
 * The tick is hourly. Six questions across `GOLDEN_ROWS_PER_RUN` rows is ~24
 * calls, which is the doc's whole daily budget (§3.2) — so running it on every
 * tick would be 576 calls a day and would trip the very rate limits the probe
 * exists to distinguish from death. It gets its own gate for that reason.
 */
export const DEFAULT_GOLDEN_HOURS = 24;
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
      goldenHours = envHours('AI_CATALOG_GOLDEN_HOURS', DEFAULT_GOLDEN_HOURS),
      bootDelayMs = DEFAULT_BOOT_DELAY_MS,
      now = () => Date.now(),
      deps = {}
    } = opts;

    this.intervalMs = intervalMs;
    this.discoveryMs = discoveryHours * 60 * 60 * 1000;
    this.probeMs = probeHours * 60 * 60 * 1000;
    this.goldenMs = goldenHours * 60 * 60 * 1000;
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

      // The golden set rides the same tick rather than taking a schedule of its
      // own (§5: "do not add a second scheduled job" — the codebase already
      // retired `syncProviderModels` for exactly that reason), but it gets its
      // own due-gate: the tick is hourly and six questions a row is ~24 calls,
      // which is the entire daily budget. Once a day, not twenty-four times.
      let dueGolden = true;
      try {
        const last = await this.lastRunAt('golden');
        dueGolden = last === null || this.now() - last >= this.goldenMs;
      } catch (err) {
        this.log.warn({ err }, '[CatalogJob] could not read the last golden run — running one');
      }
      if (dueGolden) {
        try {
          out.golden = await this.runGoldenSweep();
        } catch (err) {
          this.log.error({ err }, '[CatalogJob] golden set failed');
        }
      }
      return out;
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Run a discovery out of band — the "Run discovery now" action behind
   * `POST /api/ai/catalog/run` (Phase 3, DOCS/AIGEEK_STATUS_PAGE.md §2).
   *
   * **Synchronous by design.** It decides and returns; the run itself is left
   * on the microtask queue. A discovery lists every provider and probes every
   * free candidate sequentially within a provider — minutes, not seconds — and
   * an HTTP request that waits for it holds a socket open past every sane
   * client timeout for a job whose whole report is a database document the
   * next status poll reads anyway.
   *
   * It takes the same `ticking` latch a scheduled tick takes, in both
   * directions: an admin cannot start a second run on top of the hourly one
   * (429s and rate-limit cooldowns are the cost of that mistake), and the
   * hourly tick skips itself while an admin's run is in flight. Refused is a
   * fact, not an error — `{ started: false, reason: 'running' }`.
   *
   * The run records an `AICatalogRun` document like any other, because
   * `runDiscovery` is the same method the schedule calls; a manual run that
   * did not show up in the history would be a manual run nobody could audit.
   *
   * `promise` is returned so a test (and only a test) can await the run
   * instead of guessing at ticks. It never rejects.
   *
   * @returns {{started: boolean, reason?: string, promise?: Promise<object|null>}}
   */
  runDiscoveryNow() {
    if (this.ticking) return { started: false, reason: 'running' };
    this.ticking = true;
    this.log.info('[CatalogJob] out-of-band discovery requested');
    const promise = this.runDiscovery()
      .catch((err) => {
        // `runDiscovery` records its own failures; this is the last resort for
        // one that could not even write its document.
        this.log.error({ err }, '[CatalogJob] out-of-band discovery failed');
        return null;
      })
      .finally(() => { this.ticking = false; });
    return { started: true, promise };
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
      // Rows a human denied are still listed (the AIModel row stays current)
      // but are never probed — a denied row costs no quota and no verdict can
      // revive it (`syncResults` applies the same set at write time).
      const denied = new Set(
        (await this.freeTier.find({ override: 'deny' }).lean())
          .map((row) => `${row.provider}/${row.modelId}`)
      );
      const results = await this.discovery.discover({
        providers,
        listProvider: (provider) => this.discovery.listModels(provider, this.ai.providers[provider]),
        probeProvider: (provider, prompt, config) => this.ai.callProvider(provider, prompt, config),
        timeoutMs: this.discovery.DEFAULT_PROBE_TIMEOUT_MS,
        denied,
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

      // And rows for a provider still in the roster that we hold no key for.
      // Those were never pruned by anything: inert, because selection skips a
      // keyless provider, but read on every status build and wrong in every
      // count the console shows.
      try {
        const stale = await this.discovery.pruneUnconfiguredProviders(
          { configured: this.configuredProviders(), roster: this.providerIds },
          this.writeDeps
        );
        const n = Object.values(stale).reduce((a, b) => a + (b || 0), 0);
        if (n > 0) {
          run.prunedUnconfigured = stale;
          this.log.info({ pruned: stale }, `[CatalogJob] pruned ${n} row(s) for providers with no credential`);
        }
      } catch (err) {
        this.log.warn({ err }, '[CatalogJob] unconfigured prune failed');
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
      // Two kinds of row are not worth a probe call: one whose provider we
      // cannot reach, and one a human denied — no verdict it returns may act.
      const rows = all.filter((row) => configured.has(row.provider) && row.override !== 'deny');
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
        callProvider: this.learningCallProvider(),
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

  /**
   * `callProvider`, wrapped so the call teaches us about our own quota.
   *
   * The provider states its limits in `x-ratelimit-*` on every response, and
   * until 2026-09-16 only the REQUEST path read them — `callAI` records, the
   * probe and the golden set called the adapter directly and threw the headers
   * away. Between them those two make ~90 calls a day, which is most of what
   * this system does to free rows, and none of it was being learned from: one
   * row in the whole catalog had a remaining-quota reading.
   *
   * Recording here means the next run can skip a row the provider has already
   * said is spent, instead of finding out with a 429. Debounced and
   * fire-and-forget inside `recordObservedLimits`, so it cannot slow a sweep.
   *
   * Only groq and together send these headers at all; for the rest this is a
   * no-op and a 429 remains the only signal. That is a limit of what vendors
   * tell us, not of the wiring.
   */
  learningCallProvider() {
    return async (provider, prompt, config) => {
      const result = await this.ai.callProvider(provider, prompt, config);
      try {
        this.ai.recordObservedLimits?.(provider, config?.model, result?.headers);
      } catch (err) {
        // Learning about quota must never cost us the answer we just paid for.
        this.log.debug({ err, provider }, '[CatalogJob] could not record observed limits');
      }
      return result;
    };
  }

  /**
   * Ask a few rows the golden set and record how they did.
   *
   * Six questions is a lot of calls, so this samples rather than sweeps
   * (§3.2). `selectGoldenCandidates` takes the never-scored first and then the
   * stalest, which keeps the rows that carry no signal — the ones that let a
   * bad model win a tie-break — from staying unmeasured.
   *
   * Recorded as its own `AICatalogRun` kind so a quality run shows up in the
   * history like every other, and a bad one can be pinned to a date.
   */
  async runGoldenSweep() {
    const startedAt = new Date(this.now());
    const run = { kind: 'golden', startedAt, perProvider: {}, pruned: {}, error: null };

    try {
      const configured = new Set(this.configuredProviders());
      const all = await this.freeTier.find({ isFree: true }).lean();
      const rows = all.filter((row) => configured.has(row.provider));

      const results = await this.discovery.runGoldenSet({
        rows,
        callProvider: this.learningCallProvider(),
        updateOne: (query, update) => this.freeTier.updateOne(query, update),
        options: { now: this.now(), timeout: this.discovery.DEFAULT_PROBE_TIMEOUT_MS }
      });

      if (results.length === 0) {
        // Not a failure: every structured row may simply be freshly scored.
        // The run is still RECORDED — returning early without writing would
        // leave `lastRunAt('golden')` null and re-run this every hour.
        this.log.debug('[CatalogJob] golden set — nothing due');
        run.counts = { scored: 0, offLanguage: 0 };
        run.finishedAt = new Date(this.now());
        await this.writeRun(run);
        return run;
      }

      run.counts = {
        scored: results.length,
        offLanguage: results.filter((r) => r.offLanguage).length
      };
      this.log.info(
        { scored: results.map((r) => `${r.provider}/${r.modelId}=${r.score}`), ...run.counts },
        '[CatalogJob] golden set complete'
      );
    } catch (err) {
      run.error = this.discovery.safeErrorText(err?.message || 'error', 200);
      this.log.error({ err }, '[CatalogJob] golden set aborted');
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
