/**
 * aiStatusService.js — one read that answers "is anything wrong, and what did
 * it cost". Phase 3 of DOCS/AIGEEK_ELEVATION_PLAN.md; the shape is §1 of
 * apps/basegeek/DOCS/AIGEEK_STATUS_PAGE.md.
 *
 * The `/aigeek` console used to answer that question with five tabs, ~88 fixed
 * controls and a Configuration tab whose Enable + Test + Save ritual proved a
 * credential authenticated and nothing else. Everything those controls edited
 * is now observed — by the catalog job (Phase 1) and by the router's own health
 * writes and ledger (Phase 2) — so the page's job shrank to *reporting*, and a
 * report is one query.
 *
 * Three rules shape what is in here:
 *
 *   1. **No vendor calls, ever.** Every number comes out of Mongo. A status
 *      page that probes providers costs free-tier quota to tell you about free
 *      tiers, and would take as long as the slowest vendor to load.
 *   2. **Cheap indexed reads.** `AISpend` is read once over an indexed `day`
 *      range and sliced in memory rather than aggregated four times;
 *      `AICatalogRun` reads hit `{kind, startedAt}`; `AIStickyPick` is
 *      prefiltered on its TTL index (see `repinnedItems`); `APIKey` and
 *      `AIConfig` are single-digit-row collections.
 *   3. **Everything is injected.** `buildStatus({ now, deps })` takes its
 *      clock, its collections and its three service views as parameters, so
 *      every attention rule is testable against fake collections with no
 *      database, no network and no wait.
 *
 * A read that fails is *not* caught here. A status page reporting zero
 * refusals because the ledger was unreadable is the same class of mistake the
 * governor's `paid_ledger_unreadable` exists to refuse: silence dressed as
 * good news. The route turns a rejection into a 500 with a request id, and the
 * log line says which read it was.
 *
 * `plaintext_keys` reports a **count**. Not a provider, not a hint, not a
 * document id — the whole point of the item is that those values are sitting
 * unencrypted, and naming them in an HTTP response would be the second copy.
 */

import { isEncrypted } from '@geeksuite/crypto-vault';

import AICatalogRun from '../models/AICatalogRun.js';
import AIFreeTier, { isFreeTierCooling } from '../models/AIFreeTier.js';
import AIStickyPick from '../models/AIStickyPick.js';
import AISpend, { spendDay } from '../models/AISpend.js';
import AIAppConfig from '../models/AIAppConfig.js';
import APIKey from '../models/APIKey.js';
import AIConfig from '../models/AIConfig.js';
import { PROVIDER_IDS, AI_PROVIDERS } from '../config/aiProviders.js';
import { normalizeAppId } from './callerIdentity.js';
import { paidCaps } from './aiRoute.js';
import aiService from './aiService.js';
import { getInstance as catalogJobInstance } from './aiCatalogJob.js';

/* ───────────────────────────── the thresholds ───────────────────────────── */

/** How long the built status is served from memory. §1. */
export const STATUS_CACHE_MS = 60 * 1000;

/**
 * A catalog older than this needs a human. The job's own interval is 24 h, so
 * 36 h is "a whole run was missed and the retry did not land either" rather
 * than "the hourly tick is a few minutes late".
 */
export const DISCOVERY_STALE_MS = 36 * 60 * 60 * 1000;

/** "…this week", for repins and for what counts as an app that is calling. */
export const REPIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const TRAFFIC_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Long enough to rotate a key without a fire drill. */
export const KEY_EXPIRY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** id → human label, for the attention text. `aiProviders.js` is the one list. */
export const PROVIDER_LABELS = Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, p.label]));

/* ────────────────────────────── small helpers ───────────────────────────── */

/**
 * Money, with the float noise filed off. Summing a column of doubles produces
 * `0.030000000000000002`; six decimals keeps a tenth of a cent, which is finer
 * than anything this ledger books, and reads like a number.
 */
const usd = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : 0;
};

const int = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

const asDate = (value) => {
  if (!value) return null;
  const at = value instanceof Date ? value : new Date(value);
  return Number.isFinite(at.getTime()) ? at : null;
};

/** The first day of `now`'s UTC month, in `AISpend`'s `YYYY-MM-DD` spelling. */
export function monthStartDay(now = new Date()) {
  return `${spendDay(now).slice(0, 7)}-01`;
}

/**
 * "2 days ago" — the `{ago}` of the `discovery_stale` text and of the empty
 * state's "Last catalog refresh {ago}".
 *
 * Deliberately coarse and deliberately server-side: the page's own reading of
 * the timestamp would drift from the sentence the API already wrote, and the
 * only question this phrase answers is "should I care".
 */
export function agoText(at, now = new Date()) {
  const then = asDate(at);
  if (!then) return 'never';
  const ms = new Date(now).getTime() - then.getTime();
  if (ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Did this run actually leave the catalog current?
 *
 * The same predicate `aiCatalogJob.lastRunAt` schedules on, and for the same
 * reason: on 2026-09-07 every `AIModel` upsert in the first live run threw on
 * a `name` path conflict and the run still "completed". A run that wrote
 * nothing is a run that did not happen, however cleanly it finished.
 */
export function isCleanRun(doc) {
  if (!doc) return false;
  return !doc.error && !doc.counts?.listedError && !doc.counts?.probeError;
}

/** `{ alive, dead, unknown }` totalled across a run's per-provider counters. */
function runTotals(doc) {
  const out = { alive: 0, dead: 0, unknown: 0 };
  const perProvider = doc?.perProvider || {};
  for (const counts of Object.values(perProvider)) {
    out.alive += int(counts?.alive);
    out.dead += int(counts?.dead);
    out.unknown += int(counts?.unknown);
  }
  return out;
}

/* ──────────────────────────────── the deps ──────────────────────────────── */

/**
 * The live wiring. Every field is overridable, and the tests override all of
 * them — a fake collection needs only the two or three methods the read below
 * actually calls.
 */
export function defaultDeps() {
  return {
    catalogRun: AICatalogRun,
    freeTier: AIFreeTier,
    stickyPick: AIStickyPick,
    spend: AISpend,
    appConfig: AIAppConfig,
    apiKey: APIKey,
    aiConfig: AIConfig,
    providerIds: PROVIDER_IDS,
    labels: PROVIDER_LABELS,
    /** `aiService.providers` — the only thing that knows whether a key is set. */
    providers: () => aiService.providers,
    /**
     * The same health view routing and `/models/alive` use, mirror included,
     * so the status chip and the router cannot disagree about what is alive.
     */
    getFreeTierHealth: (provider, modelId, stored) =>
      aiService.getFreeTierHealth(provider, modelId, stored),
    isCooling: isFreeTierCooling,
    caps: () => paidCaps(),
    job: () => catalogJobInstance(),
    isEncrypted,
    normalizeApp: normalizeAppId,
  };
}

/* ──────────────────────────── attention builders ────────────────────────── */
//
// One function per kind, each taking exactly what it needs and returning an
// array (empty when the condition does not hold). Split this way because §5
// asks for "each attention kind fires on its condition **and only then**", and
// a rule that can be called with a fixture in three lines is a rule that gets
// tested that way.

/**
 * `provider_dead` — we hold a working-looking credential and not one model on
 * that provider answers.
 *
 * This and `provider_listing_failed` are separate items on purpose, and both
 * fire for a provider whose listing 401s (Cerebras, 2026-09-07). They are two
 * different facts: one says the provider is producing nothing, the other says
 * why the catalog thinks so. The first survives a provider that lists fine and
 * whose every model is cooling.
 */
function providerDeadItems({ providerIds, labels, providers, byProvider, lastDiscovery, lastSuccessAt }) {
  const items = [];
  for (const id of providerIds) {
    const providerConfig = providers[id];
    const configured = Boolean(providerConfig?.apiKey) && providerConfig.enabled !== false;
    if (!configured) continue;
    if (int(byProvider[id]?.alive) !== 0) continue;
    const listingError = lastDiscovery?.perProvider?.[id]?.error || null;
    items.push({
      kind: 'provider_dead',
      severity: 'warn',
      provider: id,
      text: `${labels[id] || id}: key is set but no model answers (last listing: ${listingError || 'ok'})`,
      // When it last worked, which is the question an operator asks next.
      since: lastSuccessAt[id] ?? null,
    });
  }
  return items;
}

/**
 * `provider_listing_failed` — the last discovery could not even list this
 * provider's models. `perProvider[id].error` is `aiCatalogDiscovery`'s
 * `listErrorText`, i.e. `http_401` / `timeout` / `network` — a credential-free
 * code, which is why it can be shown.
 */
function providerListingFailedItems({ labels, lastDiscovery }) {
  const items = [];
  const perProvider = lastDiscovery?.perProvider || {};
  const at = asDate(lastDiscovery?.finishedAt) || asDate(lastDiscovery?.startedAt);
  for (const [id, counts] of Object.entries(perProvider)) {
    if (!counts?.error) continue;
    items.push({
      kind: 'provider_listing_failed',
      severity: 'warn',
      provider: id,
      text: `${labels[id] || id}: listing failed (${counts.error}) — check the key`,
      since: at,
    });
  }
  return items;
}

/**
 * `discovery_stale` — one item, not two. A disabled job is *why* the catalog is
 * old, so it is the sentence worth showing; "off" and "36 hours old" together
 * would be the same news twice.
 */
function discoveryStaleItems({ jobEnabled, lastCleanDiscoveryAt, now }) {
  if (!jobEnabled) {
    return [{
      kind: 'discovery_stale',
      severity: 'warn',
      text: 'Catalog job is off (AI_CATALOG_JOB=off)',
      since: lastCleanDiscoveryAt,
    }];
  }
  const at = asDate(lastCleanDiscoveryAt);
  const stale = !at || (new Date(now).getTime() - at.getTime()) >= DISCOVERY_STALE_MS;
  if (!stale) return [];
  return [{
    kind: 'discovery_stale',
    severity: 'warn',
    text: `Catalog last refreshed ${agoText(at, now)}`,
    since: at,
  }];
}

/**
 * `repinned` — a conversation's sticky model died and the walk moved it.
 *
 * `AIStickyPick.previous[].retiredAt` is not indexed, but `pickedAt` is (it
 * carries the 30-day TTL), and a retirement always writes a fresh pick in the
 * same update — `aiService.recordStickyPick` sets `pickedAt: now` alongside the
 * `$push`. So a row whose `pickedAt` predates the window cannot hold a
 * retirement inside it, and the indexed prefilter is exact rather than
 * hopeful. The `retiredAt` test itself is done in memory over what comes back.
 *
 * One item per app, counting conversations rather than retirements: Chef wants
 * to know how many stories hiccuped, not how many models it took.
 */
function repinnedItems({ stickies, cutoff }) {
  const cutoffMs = new Date(cutoff).getTime();
  const perApp = new Map();
  for (const row of stickies) {
    const retirements = Array.isArray(row?.previous) ? row.previous : [];
    let earliest = null;
    for (const entry of retirements) {
      const at = asDate(entry?.retiredAt);
      if (!at || at.getTime() < cutoffMs) continue;
      if (!earliest || at.getTime() < earliest.getTime()) earliest = at;
    }
    if (!earliest) continue;
    const app = row.app || 'unknown';
    const bucket = perApp.get(app) || { count: 0, since: earliest };
    bucket.count += 1;
    if (earliest.getTime() < bucket.since.getTime()) bucket.since = earliest;
    perApp.set(app, bucket);
  }
  return [...perApp.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([app, bucket]) => ({
      kind: 'repinned',
      severity: 'info',
      app,
      text: `${app}: ${bucket.count} conversation(s) moved off a dead model this week`,
      since: bucket.since,
    }));
}

/**
 * `unrouted_app` — an app is spending and has no `AIAppConfig` row, so it is
 * running on the walk's defaults with no `allowPaid`, no `sticky` and no cap
 * of its own.
 *
 * The brief names `AIUsage`/`AISpend` as the traffic source; only `AISpend`
 * carries an app dimension (`AIUsage` is keyed provider/model/user), so this
 * reads the ledger. `aiService.routingRowFor` auto-discovers a missing row on
 * the `auto` path, so in practice this catches an app whose row was deleted or
 * one that only ever sends pins — both of which are worth a line.
 */
function unroutedAppItems({ trafficApps, rowsByApp }) {
  return [...trafficApps.entries()]
    .filter(([app]) => !rowsByApp.has(app))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([app, seen]) => ({
      kind: 'unrouted_app',
      severity: 'info',
      app,
      text: `${app} is calling with no routing row (running as auto)`,
      since: seen.firstAt,
    }));
}

/**
 * `key_expiring` — an `APIKey` with a real expiry inside two weeks.
 *
 * The date is rendered `YYYY-MM-DD` in UTC: the same day-boundary convention
 * `AISpend` uses, and no locale for a page that is read in one timezone by one
 * person. Never the key, its prefix or its hash — the name is what the mint
 * flow shows and all the rotate action needs.
 */
function keyExpiringItems({ keys, now, window = KEY_EXPIRY_WINDOW_MS }) {
  const nowMs = new Date(now).getTime();
  return keys
    .map((key) => ({ key, at: asDate(key?.expiresAt) }))
    .filter(({ at }) => at && at.getTime() >= nowMs && at.getTime() - nowMs <= window)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ key, at }) => ({
      kind: 'key_expiring',
      severity: 'info',
      app: key.appName || 'unknown',
      text: `${key.appName || 'unknown'} key '${key.name || 'unnamed'}' expires ${at.toISOString().slice(0, 10)}`,
    }));
}

/**
 * `paid_budget_hit` — the governor refused a paid attempt on n days this
 * month, counted by `AISpend.refusals`.
 *
 * A day, not a call: the question is "did the cap bite", and one refusal on a
 * day is the whole of that answer. `since` is the first day it happened.
 */
function paidBudgetItems({ monthRows }) {
  const days = new Set();
  for (const row of monthRows) {
    if (int(row?.refusals) > 0) days.add(row.day);
  }
  if (days.size === 0) return [];
  const first = [...days].sort()[0];
  return [{
    kind: 'paid_budget_hit',
    severity: 'warn',
    text: `Paid budget was hit on ${days.size} day(s) this month`,
    since: new Date(`${first}T00:00:00.000Z`),
  }];
}

/**
 * `plaintext_keys` — how many `AIConfig` rows still hold an unencrypted
 * credential. The condition is `AIConfig.getDecryptedKey`'s own: not
 * `isEncrypted(stored)`, which is what makes it log the boot warning.
 *
 * A **count**, and nothing else. No provider id, no key hint, no document id:
 * the item exists because those values are lying around in the clear, and an
 * HTTP response naming them would make a second copy of the problem it is
 * reporting.
 */
function plaintextKeyItems({ configs, isEncryptedFn }) {
  let n = 0;
  for (const row of configs) {
    if (!row?.apiKey) continue;
    if (!isEncryptedFn(row.apiKey)) n += 1;
  }
  if (n === 0) return [];
  return [{
    kind: 'plaintext_keys',
    severity: 'info',
    text: `${n} provider keys are stored unencrypted — run the encrypt-keys migration`,
  }];
}

/** Warnings first, then the table's own order within a severity. */
const KIND_ORDER = [
  'provider_dead',
  'provider_listing_failed',
  'discovery_stale',
  'repinned',
  'unrouted_app',
  'key_expiring',
  'paid_budget_hit',
  'plaintext_keys',
];

function sortAttention(items) {
  const rank = (item) => (item.severity === 'warn' ? 0 : 1);
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) =>
      rank(a.item) - rank(b.item)
      || KIND_ORDER.indexOf(a.item.kind) - KIND_ORDER.indexOf(b.item.kind)
      || a.index - b.index)
    .map(({ item }) => item);
}

/* ──────────────────────────────── the read ──────────────────────────────── */

/**
 * Build the status document of §1.
 *
 * @param {object}   [opts]
 * @param {Date|number} [opts.now]  injectable clock
 * @param {object}   [opts.deps]    overrides for `defaultDeps()`
 * @returns {Promise<object>} the §1 shape
 */
export async function buildStatus({ now = new Date(), deps = {} } = {}) {
  const d = { ...defaultDeps(), ...deps };
  const at = new Date(now);
  const nowMs = at.getTime();

  const todayKey = spendDay(at);
  const monthKey = monthStartDay(at);
  const trafficCutoff = new Date(nowMs - TRAFFIC_WINDOW_MS);
  const trafficKey = spendDay(trafficCutoff);
  const repinCutoff = new Date(nowMs - REPIN_WINDOW_MS);
  // One indexed range over `day`, wide enough for both windows — the traffic
  // week crosses the month boundary for the first six days of every month.
  const ledgerFrom = monthKey < trafficKey ? monthKey : trafficKey;

  const [
    lastDiscovery,
    lastProbe,
    lastCleanDiscovery,
    freeRows,
    ledgerRows,
    appRows,
    keys,
    stickies,
    configs,
  ] = await Promise.all([
    d.catalogRun.findOne({ kind: 'discovery' }).sort({ startedAt: -1 }).lean(),
    d.catalogRun.findOne({ kind: 'probe' }).sort({ startedAt: -1 }).lean(),
    // The scheduler's definition of "a run that counts", so the page and the
    // job agree about when the catalog was last actually refreshed.
    d.catalogRun
      .findOne({ kind: 'discovery', error: null, 'counts.listedError': null, 'counts.probeError': null })
      .sort({ startedAt: -1 })
      .lean(),
    d.freeTier.find({ isFree: true }).lean(),
    d.spend.find({ day: { $gte: ledgerFrom } }).lean(),
    d.appConfig.find({}).lean(),
    d.apiKey.find({ isActive: true }).select('appName name expiresAt').lean(),
    d.stickyPick.find({ pickedAt: { $gte: repinCutoff } }).select('app previous').lean(),
    // Read for a count only; nothing from these documents is returned.
    d.aiConfig.find({}).select('provider apiKey').lean(),
  ]);

  const providers = d.providers() || {};
  const configured = (id) => {
    const providerConfig = providers[id];
    return Boolean(providerConfig?.apiKey) && providerConfig.enabled !== false;
  };

  /* ── catalog ───────────────────────────────────────────────────────────── */

  const byProvider = {};
  for (const id of d.providerIds) byProvider[id] = { alive: 0, cooling: 0, structured: 0 };
  /** Per provider, the newest success we can see — `provider_dead`'s `since`. */
  const lastSuccessAt = {};

  let aliveFree = 0;
  let structuredFree = 0;

  for (const row of freeRows || []) {
    const bucket = byProvider[row.provider];
    // A row whose provider has left the roster; the job prunes these, and
    // until it does they are not part of any answer.
    if (!bucket) continue;
    const health = d.getFreeTierHealth(row.provider, row.modelId, row.health) || {};
    const success = asDate(health.lastSuccessAt);
    if (success && (!lastSuccessAt[row.provider] || success > lastSuccessAt[row.provider])) {
      lastSuccessAt[row.provider] = success;
    }
    if (d.isCooling(health, nowMs)) {
      bucket.cooling += 1;
      continue;
    }
    bucket.alive += 1;
    const structured = row.fitness === 'structured';
    if (structured) bucket.structured += 1;
    // The totals count only what is reachable: a live row on a provider we
    // hold no key for is not a model that answers.
    if (configured(row.provider)) {
      aliveFree += 1;
      if (structured) structuredFree += 1;
    }
  }

  const discoveryTotals = runTotals(lastDiscovery);
  const probeTotals = runTotals(lastProbe);
  const job = d.job() || {};
  const jobEnabled = job.enabled !== false;

  const catalog = {
    lastDiscovery: {
      at: asDate(lastDiscovery?.finishedAt) || asDate(lastDiscovery?.startedAt) || null,
      ok: isCleanRun(lastDiscovery),
      alive: discoveryTotals.alive,
      dead: discoveryTotals.dead,
      unknown: discoveryTotals.unknown,
      error: lastDiscovery?.error ?? null,
    },
    lastProbe: {
      at: asDate(lastProbe?.finishedAt) || asDate(lastProbe?.startedAt) || null,
      ok: isCleanRun(lastProbe),
      alive: probeTotals.alive,
      dead: probeTotals.dead,
    },
    aliveFree,
    structuredFree,
    byProvider,
    /**
     * Additive to §1: whether a run is in flight right now.
     *
     * §2 wants the `discovery_stale` item to read "running…" after the
     * "Run discovery now" action until the next poll, and a discovery takes
     * minutes. Without this the poll that lands mid-run shows the stale item
     * again, and the page has to guess from a timer whether its own POST is
     * still working.
     */
    running: job.ticking === true,
  };

  /* ── spend ─────────────────────────────────────────────────────────────── */

  const monthRows = (ledgerRows || []).filter((row) => row.day >= monthKey);
  const caps = d.caps() || {};

  let monthUsd = 0;
  let todayUsd = 0;
  let paidCallsMonth = 0;
  const byAppKey = new Map();

  for (const row of monthRows) {
    const cost = Number(row.costUsd) || 0;
    const calls = int(row.calls);
    monthUsd += cost;
    if (row.day === todayKey) todayUsd += cost;
    // The ledger buckets free and paid calls of one app/feature/provider/day
    // into one document, so this is the closest honest figure the schema can
    // give: calls from a bucket that cost something. It over-counts a bucket
    // that mixed a paid fallback in with free answers.
    if (cost > 0) paidCallsMonth += calls;

    const key = `${row.app || 'unknown'} ${row.feature || ''}`;
    const bucket = byAppKey.get(key)
      || { app: row.app || 'unknown', feature: row.feature || '', usd: 0, calls: 0 };
    bucket.usd += cost;
    bucket.calls += calls;
    byAppKey.set(key, bucket);
  }

  const spend = {
    monthUsd: usd(monthUsd),
    todayUsd: usd(todayUsd),
    capPerDayUsd: usd(caps.perDayUsd),
    capPerCallUsd: usd(caps.perCallUsd),
    paidCallsMonth,
    byApp: [...byAppKey.values()]
      .map((row) => ({ ...row, usd: usd(row.usd) }))
      .sort((a, b) => b.usd - a.usd || a.app.localeCompare(b.app) || a.feature.localeCompare(b.feature)),
  };

  /* ── apps ──────────────────────────────────────────────────────────────── */

  /**
   * Rows keyed by *normalized* app id, because the legacy `fitnessGeek` and
   * `fitnessGeek:mealPlan` rows an admin pinned by hand are still in there and
   * the ledger only ever writes the resolved id. An exact row wins a collision:
   * it is the one every read path finds first.
   */
  const rowsByApp = new Map();
  for (const row of appRows || []) {
    const app = d.normalizeApp(row.appName);
    if (!app) continue;
    const existing = rowsByApp.get(app);
    if (!existing || row.appName === app) rowsByApp.set(app, row);
  }

  /** app → { firstAt, lastAt } over the traffic week. */
  const trafficApps = new Map();
  for (const row of ledgerRows || []) {
    if (row.day < trafficKey) continue;
    const app = d.normalizeApp(row.app) || 'unknown';
    const seen = trafficApps.get(app) || { firstAt: row.day, lastAt: row.day };
    if (row.day < seen.firstAt) seen.firstAt = row.day;
    if (row.day > seen.lastAt) seen.lastAt = row.day;
    trafficApps.set(app, seen);
  }
  for (const seen of trafficApps.values()) {
    seen.firstAt = new Date(`${seen.firstAt}T00:00:00.000Z`);
    seen.lastAt = new Date(`${seen.lastAt}T00:00:00.000Z`);
  }

  const keysByApp = new Map();
  for (const key of keys || []) {
    const app = d.normalizeApp(key.appName) || 'unknown';
    keysByApp.set(app, (keysByApp.get(app) || 0) + 1);
  }

  const apps = [...new Set([...rowsByApp.keys(), ...trafficApps.keys()])]
    .sort((a, b) => a.localeCompare(b))
    .map((app) => {
      const row = rowsByApp.get(app) || null;
      const seen = trafficApps.get(app) || null;
      return {
        app,
        // `null`, not `'auto'`, when there is no row. An app with no row does
        // run as auto, but saying `tier: 'auto'` here would make a row's
        // absence indistinguishable from a row that says so — and `hasRow`
        // is what the "Add routing" action keys on.
        tier: row?.tier ?? null,
        sticky: row?.sticky ?? null,
        allowPaid: row?.allowPaid === true,
        dailyCap: Number.isFinite(Number(row?.dailyCap)) && Number(row.dailyCap) > 0
          ? Math.floor(Number(row.dailyCap))
          : null,
        seenInTraffic: Boolean(seen),
        hasRow: Boolean(row),
        keys: keysByApp.get(app) || 0,
        // `lastSeen` is touched per call by `routingRowFor`, so it is the
        // precise answer where a row exists. Without one, the ledger's day is
        // all there is — midnight UTC of the last day the app booked anything.
        lastCallAt: asDate(row?.lastSeen) || seen?.lastAt || null,
      };
    });

  /* ── attention ─────────────────────────────────────────────────────────── */

  const attention = sortAttention([
    ...providerDeadItems({
      providerIds: d.providerIds,
      labels: d.labels,
      providers,
      byProvider,
      lastDiscovery,
      lastSuccessAt,
    }),
    ...providerListingFailedItems({ labels: d.labels, lastDiscovery }),
    ...discoveryStaleItems({
      jobEnabled,
      lastCleanDiscoveryAt: asDate(lastCleanDiscovery?.finishedAt)
        || asDate(lastCleanDiscovery?.startedAt)
        || null,
      now: at,
    }),
    ...repinnedItems({ stickies: stickies || [], cutoff: repinCutoff }),
    ...unroutedAppItems({ trafficApps, rowsByApp }),
    ...keyExpiringItems({ keys: keys || [], now: at }),
    ...paidBudgetItems({ monthRows }),
    ...plaintextKeyItems({ configs: configs || [], isEncryptedFn: d.isEncrypted }),
  ]);

  return { generatedAt: at, catalog, attention, spend, apps };
}

/* ───────────────────────────────── the cache ────────────────────────────── */
//
// 60 s (§1). The page polls, a StartGeek glance card will read the same route,
// and every field in here changes on a job tick or a call — nothing changes
// per-second, and nine collections per poll for a page one person opens once a
// month is nine reads too many. `POST /api/ai/catalog/run` clears it, because
// after that button the *next* read must show `running: true` rather than a
// minute-old "off".

let cached = null;

/** `buildStatus`, memoized for `STATUS_CACHE_MS`. */
export async function cachedStatus({ now = new Date(), deps = {}, ttlMs = STATUS_CACHE_MS } = {}) {
  const nowMs = new Date(now).getTime();
  if (cached && nowMs - cached.at < ttlMs && nowMs >= cached.at) return cached.value;
  const value = await buildStatus({ now, deps });
  cached = { at: nowMs, value };
  return value;
}

/** Drop the memo. Called by `POST /catalog/run`, and by tests between cases. */
export function invalidateStatusCache() {
  cached = null;
}

export default { buildStatus, cachedStatus, invalidateStatusCache };
