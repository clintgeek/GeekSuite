/**
 * aiStatus.test.js — the status page's one read, and the button beside it.
 *
 * `GET /api/ai/status` (DOCS/AIGEEK_STATUS_PAGE.md §1) is the whole of Phase 3's
 * API half: one document that says what the catalog last found, what needs a
 * human, what the month cost, and how each app is routed. The page it feeds is
 * meant to be opened once a month and closed again when the first panel is
 * empty — which makes an attention rule that fires when nothing is wrong worse
 * than no rule at all. So every case here is asserted from **both** sides: the
 * condition produces the item, and the neighbouring state produces an empty
 * array. A test that only proved the item can appear would pass against a rule
 * that always fires.
 *
 * `buildStatus` takes its clock, its nine collections and its three service
 * views as parameters, so all of that is asserted against fakes: no database,
 * no network, no wait, and a fixed `now` so "36 hours" and "this week" mean the
 * same thing in every run. The two HTTP cases at the bottom use the real
 * router, because a permission and a 202 are only true over the wire.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import pinoHttp from 'pino-http';

const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { User, userGeekConn } = await import('../models/user.js');
const { default: logger } = await import('../lib/logger.js');
const { default: APIKey } = await import('../models/APIKey.js');
const { default: aiRoutes } = await import('../routes/aiRoutes.js');
const {
  buildStatus,
  cachedStatus,
  invalidateStatusCache,
  agoText,
  isCleanRun,
  monthStartDay,
  STATUS_CACHE_MS,
  DISCOVERY_STALE_MS,
} = await import('../services/aiStatusService.js');
const { AICatalogJob } = await import('../services/aiCatalogJob.js');
const { getInstance: catalogJobInstance } = await import('../services/aiCatalogJob.js');
const { recordRefusal } = await import('../models/AISpend.js');
const { default: AISpend } = await import('../models/AISpend.js');

/* ─────────────────────────────── the fixtures ───────────────────────────── */

/** A fixed clock. Everything relative in the shape is relative to this. */
const NOW = new Date('2026-09-08T12:00:00.000Z');
const hoursAgo = (n) => new Date(NOW.getTime() - n * 60 * 60 * 1000);
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const dayKey = (d) => d.toISOString().slice(0, 10);

/**
 * A fake Mongoose collection over an array. Only the four call shapes
 * `buildStatus` actually uses are implemented — `find().lean()`,
 * `find().select().lean()`, `findOne().sort().lean()` — which is the honest
 * amount of Mongo to fake: anything more and the fake starts having opinions
 * the real driver does not.
 */
function fakeCollection(rows = []) {
  const matches = (row, query) => Object.entries(query || {}).every(([field, want]) => {
    const value = field.includes('.')
      ? field.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), row)
      : row[field];
    if (want !== null && typeof want === 'object' && !(want instanceof Date) && !Array.isArray(want)) {
      if ('$gte' in want) return value != null && new Date(value) >= new Date(want.$gte);
      if ('$ne' in want) return value !== want.$ne;
      return false;
    }
    // `{ error: null }` must also match a document that has no `error` field —
    // the same thing Mongo means by it, and the whole point of the clean-run
    // query.
    if (want === null) return value === null || value === undefined;
    return value === want;
  });

  const chain = (list) => ({
    lean: async () => list,
    select: () => chain(list),
    sort: (spec) => {
      const [field, dir] = Object.entries(spec)[0];
      const sorted = [...list].sort((a, b) => {
        const av = new Date(a[field] ?? 0).getTime();
        const bv = new Date(b[field] ?? 0).getTime();
        return dir < 0 ? bv - av : av - bv;
      });
      return chain(sorted);
    },
  });

  return {
    rows,
    find: (query) => chain(rows.filter((row) => matches(row, query))),
    findOne: (query) => {
      const list = rows.filter((row) => matches(row, query));
      return {
        ...chain(list),
        sort: (spec) => {
          const sorted = chain(list).sort(spec);
          return { lean: async () => (await sorted.lean())[0] ?? null, select: () => sorted };
        },
        lean: async () => list[0] ?? null,
      };
    },
  };
}

/**
 * Deps for a suite in which **nothing is wrong**: one provider with a key, one
 * alive structured row on it, a clean discovery an hour ago, no spend, no keys
 * expiring, no repins, no plaintext credentials, the job on.
 *
 * Every case below starts from this and breaks exactly one thing, which is
 * what makes "and only then" assertable.
 */
function healthyDeps(overrides = {}) {
  const deps = {
    catalogRun: fakeCollection([
      {
        kind: 'discovery',
        startedAt: hoursAgo(1),
        finishedAt: hoursAgo(1),
        perProvider: { groq: { listed: 12, candidates: 2, alive: 2, dead: 0, unknown: 0, structured: 1, error: null } },
        counts: { listedError: null, probeError: null },
        error: null,
      },
      {
        kind: 'probe',
        startedAt: hoursAgo(2),
        finishedAt: hoursAgo(2),
        perProvider: { groq: { alive: 2, dead: 0, unknown: 0 } },
        counts: { listedError: null, probeError: null },
        error: null,
      },
    ]),
    freeTier: fakeCollection([
      { provider: 'groq', modelId: 'llama-3.3-70b-versatile', isFree: true, fitness: 'structured', health: { lastSuccessAt: hoursAgo(1), coolingUntil: null } },
    ]),
    stickyPick: fakeCollection([]),
    spend: fakeCollection([]),
    appConfig: fakeCollection([
      { appName: 'storygeek', tier: 'auto', sticky: 'per-conversation', allowPaid: false, dailyCap: null, lastSeen: hoursAgo(3) },
    ]),
    apiKey: fakeCollection([
      { appName: 'storygeek', name: 'storygeek backend', expiresAt: null, isActive: true },
    ]),
    aiConfig: fakeCollection([{ provider: 'groq', apiKey: 'enc:v1:ciphertext' }]),
    providerIds: ['groq', 'gemini'],
    labels: { groq: 'Groq', gemini: 'Google Gemini' },
    providers: () => ({
      groq: { apiKey: 'test-key-not-a-credential', enabled: true },
      gemini: { apiKey: '', enabled: true },
    }),
    getFreeTierHealth: (_provider, _modelId, stored) => stored || {},
    isCooling: (health, now) => {
      const until = health?.coolingUntil;
      return Boolean(until) && new Date(until).getTime() > now;
    },
    caps: () => ({ perDayUsd: 0.05, perCallUsd: 0.01 }),
    job: () => ({ enabled: true, ticking: false }),
    isEncrypted: (value) => String(value).startsWith('enc:'),
    normalizeApp: (value) => String(value || '').toLowerCase().split(':')[0].trim(),
  };
  return { ...deps, ...overrides };
}

const status = (overrides = {}) => buildStatus({ now: NOW, deps: healthyDeps(overrides) });
const kinds = (result) => result.attention.map((item) => item.kind);
const only = (result, kind) => result.attention.filter((item) => item.kind === kind);

/* ──────────────────────────── the clean baseline ────────────────────────── */

describe('a clean catalog needs nobody', () => {
  it('returns an empty attention array', async () => {
    const result = await status();
    expect(result.attention).toEqual([]);
  });

  it('still reports everything the panels render', async () => {
    const result = await status();

    expect(result.generatedAt).toEqual(NOW);
    expect(result.catalog).toMatchObject({
      lastDiscovery: { at: hoursAgo(1), ok: true, alive: 2, dead: 0, unknown: 0, error: null },
      lastProbe: { at: hoursAgo(2), ok: true, alive: 2, dead: 0 },
      aliveFree: 1,
      structuredFree: 1,
      running: false,
    });
    // Every roster provider gets a row, keyed or not: panel 3 shows one line
    // per provider and the chip is what says "no key".
    expect(result.catalog.byProvider).toEqual({
      groq: { alive: 1, cooling: 0, structured: 1 },
      gemini: { alive: 0, cooling: 0, structured: 0 },
    });
    expect(result.spend).toEqual({
      monthUsd: 0, todayUsd: 0, capPerDayUsd: 0.05, capPerCallUsd: 0.01,
      paidCallsMonth: 0, byApp: [],
    });
    expect(result.apps).toEqual([{
      app: 'storygeek', tier: 'auto', sticky: 'per-conversation', allowPaid: false,
      dailyCap: null, seenInTraffic: false, hasRow: true, keys: 1, lastCallAt: hoursAgo(3),
    }]);
  });

  it('does not count a live row on a provider we hold no key for', async () => {
    // `aliveFree` is what the empty state promises ("{aliveFree} free models
    // alive"). A row nothing can reach is not one of them.
    const result = await status({
      freeTier: fakeCollection([
        { provider: 'groq', modelId: 'a', isFree: true, fitness: 'structured', health: { coolingUntil: null } },
        { provider: 'gemini', modelId: 'b', isFree: true, fitness: 'structured', health: { coolingUntil: null } },
      ]),
    });

    expect(result.catalog.aliveFree).toBe(1);
    expect(result.catalog.structuredFree).toBe(1);
    // The per-provider chip still counts it — the catalog knows the row is
    // alive; what it lacks is a credential, which is panel 3's business.
    expect(result.catalog.byProvider.gemini).toEqual({ alive: 1, cooling: 0, structured: 1 });
  });

  it('counts a cooling row as cooling and not as alive', async () => {
    const result = await status({
      freeTier: fakeCollection([
        { provider: 'groq', modelId: 'a', isFree: true, fitness: 'structured', health: { coolingUntil: hoursAgo(-2) } },
        { provider: 'groq', modelId: 'b', isFree: true, fitness: 'basic', health: { coolingUntil: null } },
      ]),
    });

    expect(result.catalog.byProvider.groq).toEqual({ alive: 1, cooling: 1, structured: 0 });
    expect(result.catalog.aliveFree).toBe(1);
    expect(result.catalog.structuredFree).toBe(0);
  });
});

/* ───────────────────────────── provider_dead ───────────────────────────── */

describe('provider_dead', () => {
  it('fires when a provider has a key and not one model answers', async () => {
    const result = await status({
      freeTier: fakeCollection([
        { provider: 'groq', modelId: 'a', isFree: true, fitness: 'basic', health: { coolingUntil: hoursAgo(-6), lastSuccessAt: daysAgo(3) } },
      ]),
    });

    const items = only(result, 'provider_dead');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      severity: 'warn',
      provider: 'groq',
      text: 'Groq: key is set but no model answers (last listing: ok)',
      since: daysAgo(3),
    });
  });

  it('names the listing error when there was one', async () => {
    const result = await status({
      catalogRun: fakeCollection([{
        kind: 'discovery', startedAt: hoursAgo(1), finishedAt: hoursAgo(1),
        perProvider: { groq: { alive: 0, dead: 0, unknown: 0, error: 'http_401' } },
        counts: { listedError: null, probeError: null }, error: null,
      }]),
      freeTier: fakeCollection([]),
    });

    expect(only(result, 'provider_dead')[0].text)
      .toBe('Groq: key is set but no model answers (last listing: http_401)');
  });

  it('says nothing about a provider we hold no key for', async () => {
    // Gemini has zero alive rows in every fixture in this file. Reporting it
    // would put a permanent warning on the page for a provider nobody has
    // configured, which is how a "needs attention" panel becomes wallpaper.
    const result = await status();
    expect(kinds(result)).not.toContain('provider_dead');
  });

  it('says nothing about a provider whose key is set but disabled', async () => {
    const result = await status({
      providers: () => ({
        groq: { apiKey: 'test-key-not-a-credential', enabled: false },
        gemini: { apiKey: '', enabled: true },
      }),
      freeTier: fakeCollection([]),
    });
    expect(kinds(result)).not.toContain('provider_dead');
  });
});

/* ──────────────────────── provider_listing_failed ──────────────────────── */

describe('provider_listing_failed', () => {
  it('fires on the last discovery‘s per-provider error — the Cerebras 401', async () => {
    const result = await status({
      catalogRun: fakeCollection([{
        kind: 'discovery', startedAt: hoursAgo(2), finishedAt: hoursAgo(1),
        perProvider: {
          groq: { alive: 2, dead: 0, unknown: 0, error: null },
          gemini: { alive: 0, dead: 0, unknown: 0, error: 'http_401' },
        },
        counts: { listedError: null, probeError: null }, error: null,
      }]),
    });

    const items = only(result, 'provider_listing_failed');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      severity: 'warn',
      provider: 'gemini',
      text: 'Google Gemini: listing failed (http_401) — check the key',
      since: hoursAgo(1),
    });
  });

  it('does not fire when every provider listed cleanly', async () => {
    const result = await status();
    expect(kinds(result)).not.toContain('provider_listing_failed');
  });

  it('reports the code and nothing else — a listing error is not a credential', async () => {
    // `listErrorText` is what writes this field: `http_<status>`, `timeout`,
    // `network`. If a raw provider body ever reaches `perProvider[id].error`,
    // this text is where it would surface, so the shape is asserted rather
    // than assumed.
    const result = await status({
      catalogRun: fakeCollection([{
        kind: 'discovery', startedAt: hoursAgo(1), finishedAt: hoursAgo(1),
        perProvider: { gemini: { alive: 0, error: 'timeout' } },
        counts: { listedError: null, probeError: null }, error: null,
      }]),
    });
    expect(only(result, 'provider_listing_failed')[0].text)
      .toBe('Google Gemini: listing failed (timeout) — check the key');
  });
});

/* ───────────────────────────── discovery_stale ─────────────────────────── */

describe('discovery_stale', () => {
  it('does not fire on a discovery inside 36 hours', async () => {
    const result = await status({
      catalogRun: fakeCollection([{
        kind: 'discovery', startedAt: hoursAgo(35), finishedAt: hoursAgo(35),
        perProvider: { groq: { alive: 2 } }, counts: { listedError: null, probeError: null }, error: null,
      }]),
    });
    expect(kinds(result)).not.toContain('discovery_stale');
  });

  it('fires at 36 hours, with the ago phrase in the text', async () => {
    const result = await status({
      catalogRun: fakeCollection([{
        kind: 'discovery', startedAt: hoursAgo(40), finishedAt: hoursAgo(40),
        perProvider: { groq: { alive: 2 } }, counts: { listedError: null, probeError: null }, error: null,
      }]),
    });

    const items = only(result, 'discovery_stale');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      severity: 'warn',
      // Hours up to two days, then days: 36 h is the threshold, so the first
      // sentence this item ever shows is an hour count.
      text: 'Catalog last refreshed 40 hours ago',
      since: hoursAgo(40),
    });
  });

  it('fires when there has never been a discovery at all', async () => {
    const result = await status({ catalogRun: fakeCollection([]) });
    expect(only(result, 'discovery_stale')[0]).toMatchObject({
      text: 'Catalog last refreshed never',
      since: null,
    });
  });

  it('ignores a run that finished dirty — a run that wrote nothing did not happen', async () => {
    // 2026-09-07: every `AIModel` upsert in the first live run threw on a
    // `name` path conflict and the run still "completed". The scheduler
    // learned to discount those; so does this page, and with the same
    // predicate, so the two cannot disagree about when the catalog was last
    // refreshed.
    const result = await status({
      catalogRun: fakeCollection([{
        kind: 'discovery', startedAt: hoursAgo(1), finishedAt: hoursAgo(1),
        perProvider: { groq: { alive: 2 } },
        counts: { listedError: "would create a conflict at 'name'", probeError: null },
        error: null,
      }]),
    });

    expect(only(result, 'discovery_stale')[0].text).toBe('Catalog last refreshed never');
    // …and the run is still reported, flagged as not ok. Hiding it would hide
    // the bug.
    expect(result.catalog.lastDiscovery).toMatchObject({ at: hoursAgo(1), ok: false });
  });

  it('says the job is off instead, when it is', async () => {
    // One item, not two: "off" is *why* the catalog is old, and saying both
    // would be the same news twice.
    const result = await status({ job: () => ({ enabled: false, ticking: false }) });

    const items = only(result, 'discovery_stale');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      severity: 'warn',
      text: 'Catalog job is off (AI_CATALOG_JOB=off)',
      since: hoursAgo(1),
    });
  });

  it('reports a run in flight so the page can say "running…"', async () => {
    const result = await status({ job: () => ({ enabled: true, ticking: true }) });
    expect(result.catalog.running).toBe(true);
  });
});

/* ──────────────────────────────── repinned ─────────────────────────────── */

describe('repinned', () => {
  it('counts conversations moved off a dead model this week, per app', async () => {
    const result = await status({
      stickyPick: fakeCollection([
        { app: 'storygeek', pickedAt: daysAgo(2), previous: [{ provider: 'groq', modelId: 'gone', retiredAt: daysAgo(2), reason: 'http_404' }] },
        { app: 'storygeek', pickedAt: daysAgo(5), previous: [{ provider: 'groq', modelId: 'gone', retiredAt: daysAgo(5), reason: 'http_404' }] },
        { app: 'notegeek', pickedAt: daysAgo(1), previous: [{ provider: 'groq', modelId: 'gone', retiredAt: daysAgo(1), reason: 'http_404' }] },
      ]),
    });

    const items = only(result, 'repinned');
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.text)).toEqual([
      'notegeek: 1 conversation(s) moved off a dead model this week',
      'storygeek: 2 conversation(s) moved off a dead model this week',
    ]);
    expect(items[1]).toMatchObject({ severity: 'info', app: 'storygeek', since: daysAgo(5) });
  });

  it('does not fire on a pick that never lost a model', async () => {
    const result = await status({
      stickyPick: fakeCollection([{ app: 'storygeek', pickedAt: daysAgo(1), previous: [] }]),
    });
    expect(kinds(result)).not.toContain('repinned');
  });

  it('ignores a retirement older than the week', async () => {
    const result = await status({
      stickyPick: fakeCollection([
        { app: 'storygeek', pickedAt: daysAgo(1), previous: [{ provider: 'groq', modelId: 'gone', retiredAt: daysAgo(9) }] },
      ]),
    });
    expect(kinds(result)).not.toContain('repinned');
  });

  it('reads only rows inside the TTL window, which is where a retirement can be', async () => {
    // The indexed prefilter. `previous[].retiredAt` is not indexed but
    // `pickedAt` is, and `recordStickyPick` sets `pickedAt: now` in the same
    // update as the `$push` — so a row whose pick predates the window cannot
    // hold a retirement inside it. Asserted on the query, because the reason
    // this is exact rather than hopeful lives in another file.
    const stickyPick = fakeCollection([]);
    const spy = jest.spyOn(stickyPick, 'find');
    await status({ stickyPick });

    expect(spy).toHaveBeenCalledWith({ pickedAt: { $gte: daysAgo(7) } });
  });
});

/* ────────────────────────────── unrouted_app ──────────────────────────── */

describe('unrouted_app', () => {
  it('fires for an app in the ledger with no routing row', async () => {
    const result = await status({
      spend: fakeCollection([
        { day: dayKey(daysAgo(2)), provider: 'groq', app: 'flockgeek', feature: '', calls: 4, costUsd: 0, refusals: 0 },
      ]),
    });

    const items = only(result, 'unrouted_app');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      severity: 'info',
      app: 'flockgeek',
      text: 'flockgeek is calling with no routing row (running as auto)',
      since: new Date(`${dayKey(daysAgo(2))}T00:00:00.000Z`),
    });
  });

  it('does not fire for an app that has a row', async () => {
    const result = await status({
      spend: fakeCollection([
        { day: dayKey(daysAgo(1)), provider: 'groq', app: 'storygeek', feature: 'gm', calls: 9, costUsd: 0, refusals: 0 },
      ]),
    });
    expect(kinds(result)).not.toContain('unrouted_app');
  });

  it('matches a legacy row by its normalized id', async () => {
    // An admin pinned `fitnessGeek:mealPlan` by hand years ago; the ledger only
    // ever writes `fitnessgeek`. One app, one row, no warning.
    const result = await status({
      appConfig: fakeCollection([{ appName: 'fitnessGeek:mealPlan', tier: 'specific', provider: 'groq', model: 'x' }]),
      spend: fakeCollection([
        { day: dayKey(daysAgo(1)), provider: 'groq', app: 'fitnessgeek', feature: 'mealplan', calls: 2, costUsd: 0, refusals: 0 },
      ]),
    });

    expect(kinds(result)).not.toContain('unrouted_app');
    expect(result.apps.map((a) => a.app)).toEqual(['fitnessgeek']);
  });

  it('does not fire for an app whose last call was more than a week ago', async () => {
    const result = await status({
      spend: fakeCollection([
        { day: dayKey(daysAgo(12)), provider: 'groq', app: 'flockgeek', feature: '', calls: 1, costUsd: 0, refusals: 0 },
      ]),
    });
    expect(kinds(result)).not.toContain('unrouted_app');
  });
});

/* ────────────────────────────── key_expiring ──────────────────────────── */

describe('key_expiring', () => {
  it('fires inside fourteen days, naming the app, the key name and the date', async () => {
    const result = await status({
      apiKey: fakeCollection([
        { appName: 'storygeek', name: 'storygeek backend', expiresAt: daysAgo(-10), isActive: true },
      ]),
    });

    const items = only(result, 'key_expiring');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'key_expiring',
      severity: 'info',
      app: 'storygeek',
      text: "storygeek key 'storygeek backend' expires 2026-09-18",
    });
  });

  it('never carries anything but the app, the name and the date', async () => {
    // The rotate action needs those three. A key prefix or hash in a status
    // response would be a credential fragment on a page, which is the one
    // thing this subsystem has spent two phases removing.
    const result = await status({
      apiKey: fakeCollection([{
        appName: 'storygeek', name: 'storygeek backend', expiresAt: daysAgo(-3),
        isActive: true, keyPrefix: 'bg_abc123', keyHash: 'deadbeef'.repeat(8),
      }]),
    });

    const text = JSON.stringify(result);
    expect(text).not.toContain('bg_abc123');
    expect(text).not.toContain('deadbeef');
  });

  it('does not fire on a key with no expiry, or one further out than the window', async () => {
    const result = await status({
      apiKey: fakeCollection([
        { appName: 'storygeek', name: 'never expires', expiresAt: null, isActive: true },
        { appName: 'notegeek', name: 'next year', expiresAt: daysAgo(-300), isActive: true },
      ]),
    });
    expect(kinds(result)).not.toContain('key_expiring');
  });

  it('does not fire on a key that has already expired', async () => {
    // Already-expired is not a warning to rotate before it breaks; it is
    // either already broken and loud, or the key is unused. Either way the
    // fourteen-day heads-up has been and gone.
    const result = await status({
      apiKey: fakeCollection([
        { appName: 'storygeek', name: 'gone', expiresAt: daysAgo(2), isActive: true },
      ]),
    });
    expect(kinds(result)).not.toContain('key_expiring');
  });

  it('counts a revoked key neither as an expiry nor against its app', async () => {
    const apiKey = fakeCollection([]);
    const spy = jest.spyOn(apiKey, 'find');
    await status({ apiKey });
    expect(spy).toHaveBeenCalledWith({ isActive: true });
  });
});

/* ──────────────────────────── paid_budget_hit ─────────────────────────── */

describe('paid_budget_hit', () => {
  it('fires on the days the governor refused, counting days and not refusals', async () => {
    const result = await status({
      spend: fakeCollection([
        { day: '2026-09-02', provider: 'openrouter', app: 'storygeek', feature: 'gm', calls: 0, costUsd: 0, refusals: 3 },
        { day: '2026-09-07', provider: 'openrouter', app: 'storygeek', feature: 'gm', calls: 0, costUsd: 0, refusals: 1 },
      ]),
    });

    const items = only(result, 'paid_budget_hit');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      severity: 'warn',
      text: 'Paid budget was hit on 2 day(s) this month',
      since: new Date('2026-09-02T00:00:00.000Z'),
    });
  });

  it('does not fire on a month with spend but no refusals', async () => {
    const result = await status({
      spend: fakeCollection([
        { day: '2026-09-07', provider: 'openrouter', app: 'storygeek', feature: 'gm', calls: 40, costUsd: 0.004, refusals: 0 },
      ]),
    });
    expect(kinds(result)).not.toContain('paid_budget_hit');
  });

  it('does not carry last month‘s refusals into this month', async () => {
    const result = await status({
      spend: fakeCollection([
        { day: '2026-08-30', provider: 'openrouter', app: 'storygeek', feature: 'gm', calls: 0, costUsd: 0, refusals: 5 },
      ]),
    });
    expect(kinds(result)).not.toContain('paid_budget_hit');
  });
});

/* ──────────────────────────── plaintext_keys ──────────────────────────── */

describe('plaintext_keys', () => {
  it('fires on a legacy plaintext credential, as a count', async () => {
    const result = await status({
      aiConfig: fakeCollection([
        { provider: 'groq', apiKey: 'gsk_plain_text_key_value' },
        { provider: 'gemini', apiKey: 'AIzaPlainTextKeyValue' },
        { provider: 'cohere', apiKey: 'enc:v1:ciphertext' },
      ]),
    });

    const items = only(result, 'plaintext_keys');
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      kind: 'plaintext_keys',
      severity: 'info',
      text: '2 provider keys are stored unencrypted — run the encrypt-keys migration',
    });
  });

  it('names no provider, no hint, no document id — the count is the whole item', async () => {
    // The item exists *because* those values are sitting in the clear. Naming
    // them in an HTTP response would make a second copy of the problem being
    // reported, so the assertion is on the absence.
    const result = await status({
      aiConfig: fakeCollection([
        { _id: 'deadbeefdeadbeefdeadbeef', provider: 'gemini', apiKey: 'AIzaSyLeakyKeyFragmentWxYz' },
      ]),
    });

    const text = JSON.stringify(only(result, 'plaintext_keys'));
    expect(text).not.toContain('AIzaSy');
    expect(text).not.toContain('WxYz');
    expect(text).not.toContain('gemini');
    expect(text).not.toContain('deadbeef');
    expect(only(result, 'plaintext_keys')[0].provider).toBeUndefined();
  });

  it('does not fire when every stored key is encrypted', async () => {
    const result = await status();
    expect(kinds(result)).not.toContain('plaintext_keys');
  });
});

/* ─────────────────────────── ordering and severity ─────────────────────── */

describe('the attention list', () => {
  it('puts warnings above the rest and is otherwise in table order', async () => {
    const result = await status({
      catalogRun: fakeCollection([{
        kind: 'discovery', startedAt: hoursAgo(50), finishedAt: hoursAgo(50),
        perProvider: { groq: { alive: 0, error: 'http_401' } },
        counts: { listedError: null, probeError: null }, error: null,
      }]),
      freeTier: fakeCollection([]),
      spend: fakeCollection([
        { day: '2026-09-06', provider: 'openrouter', app: 'flockgeek', feature: '', calls: 0, costUsd: 0, refusals: 2 },
      ]),
      aiConfig: fakeCollection([{ provider: 'groq', apiKey: 'gsk_plain' }]),
      apiKey: fakeCollection([{ appName: 'storygeek', name: 'k', expiresAt: daysAgo(-5), isActive: true }]),
    });

    expect(kinds(result)).toEqual([
      'provider_dead',
      'provider_listing_failed',
      'discovery_stale',
      'paid_budget_hit',
      'unrouted_app',
      'key_expiring',
      'plaintext_keys',
    ]);
    // Severity is the doc's: warn for the first three kinds and for
    // paid_budget_hit, info for everything else.
    expect(result.attention.filter((i) => i.severity === 'warn').map((i) => i.kind))
      .toEqual(['provider_dead', 'provider_listing_failed', 'discovery_stale', 'paid_budget_hit']);
  });

  it('carries only the documented fields', async () => {
    const result = await status({ freeTier: fakeCollection([]) });
    const allowed = new Set(['kind', 'severity', 'provider', 'app', 'modelId', 'text', 'since']);
    for (const item of result.attention) {
      for (const field of Object.keys(item)) expect(allowed).toContain(field);
    }
  });
});

/* ────────────────────────────────── spend ─────────────────────────────── */

describe('spend', () => {
  it('adds up the month, today and the per-app breakdown', async () => {
    const result = await status({
      spend: fakeCollection([
        { day: '2026-09-01', provider: 'openrouter', app: 'storygeek', feature: 'gm', calls: 10, costUsd: 0.01, refusals: 0 },
        { day: '2026-09-08', provider: 'openrouter', app: 'storygeek', feature: 'gm', calls: 5, costUsd: 0.02, refusals: 0 },
        { day: '2026-09-08', provider: 'groq', app: 'notegeek', feature: 'suggest', calls: 40, costUsd: 0, refusals: 0 },
        // Last month: in the read window (the traffic week crosses the
        // boundary) and out of every month figure.
        { day: '2026-08-31', provider: 'openrouter', app: 'storygeek', feature: 'gm', calls: 3, costUsd: 5, refusals: 0 },
      ]),
    });

    expect(result.spend).toMatchObject({
      monthUsd: 0.03,
      todayUsd: 0.02,
      paidCallsMonth: 15,
    });
    expect(result.spend.byApp).toEqual([
      { app: 'storygeek', feature: 'gm', usd: 0.03, calls: 15 },
      { app: 'notegeek', feature: 'suggest', usd: 0, calls: 40 },
    ]);
  });

  it('reads the ledger once, over an indexed day range wide enough for both windows', async () => {
    // The traffic week crosses the month boundary for the first six days of
    // every month, so the range is the earlier of the two — one indexed read
    // sliced in memory, not four aggregations.
    const spend = fakeCollection([]);
    const spy = jest.spyOn(spend, 'find');
    await buildStatus({ now: new Date('2026-09-03T12:00:00.000Z'), deps: healthyDeps({ spend }) });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ day: { $gte: '2026-08-27' } });
  });

  it('reports the governor‘s caps as configured', async () => {
    const result = await status({ caps: () => ({ perDayUsd: 10, perCallUsd: 0.25 }) });
    expect(result.spend.capPerDayUsd).toBe(10);
    expect(result.spend.capPerCallUsd).toBe(0.25);
  });
});

/* ─────────────────────────────────── apps ─────────────────────────────── */

describe('apps', () => {
  it('reports a rowless app honestly rather than claiming it is auto', async () => {
    // `tier: 'auto'` here would make a row's absence indistinguishable from a
    // row that says so, and `hasRow` is what the "Add routing" action keys on.
    const result = await status({
      appConfig: fakeCollection([]),
      spend: fakeCollection([
        { day: dayKey(daysAgo(1)), provider: 'groq', app: 'flockgeek', feature: '', calls: 2, costUsd: 0, refusals: 0 },
      ]),
    });

    expect(result.apps).toEqual([{
      app: 'flockgeek', tier: null, sticky: null, allowPaid: false, dailyCap: null,
      seenInTraffic: true, hasRow: false, keys: 0,
      lastCallAt: new Date(`${dayKey(daysAgo(1))}T00:00:00.000Z`),
    }]);
  });

  it('lists an app that has a row and no traffic, and counts its keys', async () => {
    const result = await status({
      apiKey: fakeCollection([
        { appName: 'storygeek', name: 'a', expiresAt: null, isActive: true },
        { appName: 'StoryGeek', name: 'b', expiresAt: null, isActive: true },
      ]),
    });

    expect(result.apps[0]).toMatchObject({ app: 'storygeek', hasRow: true, seenInTraffic: false, keys: 2 });
  });

  it('carries the four routing fields the page turns into controls', async () => {
    const result = await status({
      appConfig: fakeCollection([
        { appName: 'storygeek', tier: 'specific', sticky: 'per-conversation', allowPaid: true, dailyCap: 25, lastSeen: hoursAgo(1) },
      ]),
    });

    expect(result.apps[0]).toMatchObject({
      tier: 'specific', sticky: 'per-conversation', allowPaid: true, dailyCap: 25,
    });
  });
});

/* ─────────────────────────────── the 60 s cache ───────────────────────── */

describe('the 60 s cache', () => {
  afterEach(() => invalidateStatusCache());

  it('reads once inside the window and again after it', async () => {
    const deps = healthyDeps();
    const spy = jest.spyOn(deps.freeTier, 'find');
    invalidateStatusCache();

    const first = await cachedStatus({ now: NOW, deps });
    const second = await cachedStatus({ now: new Date(NOW.getTime() + STATUS_CACHE_MS - 1), deps });
    expect(spy).toHaveBeenCalledTimes(1);
    // Not merely equal — the same object, so the page and a glance card
    // reading in the same minute cannot see two different answers.
    expect(second).toBe(first);

    const third = await cachedStatus({ now: new Date(NOW.getTime() + STATUS_CACHE_MS), deps });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(third).not.toBe(first);
  });

  it('is dropped by invalidateStatusCache, which is what /catalog/run calls', async () => {
    const deps = healthyDeps();
    const spy = jest.spyOn(deps.freeTier, 'find');
    invalidateStatusCache();

    await cachedStatus({ now: NOW, deps });
    invalidateStatusCache();
    await cachedStatus({ now: NOW, deps });

    expect(spy).toHaveBeenCalledTimes(2);
  });
});

/* ──────────────────────────── the small helpers ───────────────────────── */

describe('the helpers the text is built from', () => {
  it('agoText is coarse on purpose', () => {
    expect(agoText(null, NOW)).toBe('never');
    expect(agoText(new Date(NOW.getTime() - 30 * 1000), NOW)).toBe('just now');
    expect(agoText(hoursAgo(0.5), NOW)).toBe('30 minutes ago');
    expect(agoText(hoursAgo(1), NOW)).toBe('1 hour ago');
    expect(agoText(hoursAgo(40), NOW)).toBe('40 hours ago');
    expect(agoText(daysAgo(3), NOW)).toBe('3 days ago');
    // A clock that ran backwards is not "in -2 hours".
    expect(agoText(hoursAgo(-2), NOW)).toBe('just now');
  });

  it('isCleanRun is the scheduler‘s predicate, not a looser one', () => {
    expect(isCleanRun(null)).toBe(false);
    expect(isCleanRun({ error: null, counts: { listedError: null, probeError: null } })).toBe(true);
    expect(isCleanRun({ error: 'aborted' })).toBe(false);
    expect(isCleanRun({ error: null, counts: { listedError: 'conflict' } })).toBe(false);
    expect(isCleanRun({ error: null, counts: { probeError: 'boom' } })).toBe(false);
  });

  it('monthStartDay speaks AISpend‘s day spelling', () => {
    expect(monthStartDay(NOW)).toBe('2026-09-01');
    expect(monthStartDay(new Date('2026-01-31T23:59:59.000Z'))).toBe('2026-01-01');
  });

  it('DISCOVERY_STALE_MS is 36 hours, which is a missed run and not a late tick', () => {
    expect(DISCOVERY_STALE_MS).toBe(36 * 60 * 60 * 1000);
  });
});

/* ─────────────────────── the out-of-band discovery run ────────────────── */

describe('AICatalogJob.runDiscoveryNow', () => {
  const build = () => {
    const runs = [];
    const job = new AICatalogJob({
      deps: {
        ai: { providers: { groq: { apiKey: 'k', enabled: true } }, callProvider: async () => ({ content: '{}' }) },
        discovery: {
          discover: async () => [{ kind: 'listing', provider: 'groq', count: 1, candidates: 0 }],
          listModels: async () => ({}),
          summarizeByProvider: () => ({ groq: { listed: 1, candidates: 0, alive: 0, dead: 0, unknown: 0, error: null } }),
          syncResults: async () => ({ alive: 0, dead: 0, listedError: null, probeError: null }),
          pruneUnknownProviders: async () => ({}),
          safeErrorText: (t) => t,
          DEFAULT_PROBE_TIMEOUT_MS: 8000,
        },
        catalogRun: { create: async (run) => { runs.push(run); return run; } },
        providers: ['groq'],
        log: { info() {}, warn() {}, error() {}, debug() {} },
      },
    });
    return { job, runs };
  };

  it('starts a run and returns immediately', async () => {
    const { job, runs } = build();

    const outcome = job.runDiscoveryNow();
    expect(outcome.started).toBe(true);
    // Synchronous by design: a discovery is minutes of vendor calls and an
    // HTTP request must not hold a socket open for it.
    expect(runs).toHaveLength(0);

    await outcome.promise;
    expect(runs).toHaveLength(1);
    // Recorded like any other run — a manual discovery nobody can audit is
    // worse than no history at all.
    expect(runs[0]).toMatchObject({ kind: 'discovery', error: null });
  });

  it('refuses while a tick is running, and says why', () => {
    const { job } = build();
    job.ticking = true;

    expect(job.runDiscoveryNow()).toEqual({ started: false, reason: 'running' });
  });

  it('takes the tick latch, so the schedule skips itself while it runs', async () => {
    const { job } = build();

    const outcome = job.runDiscoveryNow();
    expect(job.ticking).toBe(true);
    // The hourly tick, arriving mid-run, is a skip and not a second discovery.
    await expect(job.tick()).resolves.toEqual({ skipped: true });

    await outcome.promise;
    expect(job.ticking).toBe(false);
  });

  it('releases the latch when the run throws, and never rejects', async () => {
    const { job } = build();
    job.runDiscovery = async () => { throw new Error('vendor exploded'); };

    const outcome = job.runDiscoveryNow();
    await expect(outcome.promise).resolves.toBeNull();
    expect(job.ticking).toBe(false);
    // And a second attempt is possible: a failed run must not wedge the door.
    expect(job.runDiscoveryNow().started).toBe(true);
  });
});

/* ───────────────────────────── over the wire ──────────────────────────── */

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    autoLogging: false,
  });
  app.use((req, res, next) => { httpLogger(req, res); next(); });
  app.use('/api/ai', aiRoutes);
  return app;
}

describe('the routes', () => {
  let app;
  let seq = 0;
  let originalRunDiscoveryNow;

  const makeUserWithToken = async ({ role } = {}) => {
    const user = await User.create({
      username: `ai_status_${Date.now()}_${seq++}`,
      passwordHash: 'unhashed-placeholder',
      ...(role ? { role } : {}),
    });
    return jwt.sign({ id: user._id.toString(), app: 'basegeek' }, process.env.JWT_SECRET);
  };

  const makeApiKey = async (permissions) => {
    const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();
    await APIKey.create({
      keyHash, keyPrefix, name: `status probe ${seq++}`, appName: 'storygeek',
      permissions, createdBy: new mongoose.Types.ObjectId(),
    });
    return apiKey;
  };

  beforeAll(async () => {
    if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
    if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
    app = buildApp();
    // A real run would list every provider and probe every free candidate,
    // over the network, from a unit test.
    const job = catalogJobInstance();
    originalRunDiscoveryNow = job.runDiscoveryNow;
    job.runDiscoveryNow = () => ({ started: true, promise: Promise.resolve(null) });
  }, 60000);

  afterEach(async () => {
    invalidateStatusCache();
    await User.deleteMany({});
    await APIKey.deleteMany({});
    await AISpend.deleteMany({});
  });

  afterAll(async () => {
    catalogJobInstance().runDiscoveryNow = originalRunDiscoveryNow;
    await userGeekConn.close();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

  it('GET /status refuses a key without ai:stats and answers one with it', async () => {
    const denied = await makeApiKey(['ai:call']);
    const allowed = await makeApiKey(['ai:stats']);

    const no = await request(app).get('/api/ai/status').set('Authorization', `Bearer ${denied}`);
    expect(no.status).toBe(403);
    expect(no.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

    invalidateStatusCache();
    const yes = await request(app).get('/api/ai/status').set('Authorization', `Bearer ${allowed}`);
    expect(yes.status).toBe(200);
    expect(Object.keys(yes.body).sort()).toEqual(['apps', 'attention', 'catalog', 'generatedAt', 'spend']);
  });

  it('GET /status refuses an unauthenticated caller', async () => {
    const res = await request(app).get('/api/ai/status');
    expect(res.status).toBe(401);
  });

  it('POST /catalog/run refuses a plain user and every API key', async () => {
    const user = await makeUserWithToken();
    const key = await makeApiKey(['ai:call', 'ai:models', 'ai:providers', 'ai:stats', 'ai:director', 'ai:usage']);

    const asUser = await request(app).post('/api/ai/catalog/run')
      .set('Authorization', `Bearer ${user}`).send({});
    expect(asUser.status).toBe(403);
    expect(asUser.body.error).toBe('admin_required');

    // Every permission in the enum, and it still does not make a key a person
    // who can be asked why they spent the roster's free-tier quota.
    const asKey = await request(app).post('/api/ai/catalog/run')
      .set('Authorization', `Bearer ${key}`).send({});
    expect(asKey.status).toBe(403);
    expect(asKey.body.code).toBe('ADMIN_REQUIRED');
  });

  it('POST /catalog/run answers 202 to an admin, and 409 when one is in flight', async () => {
    const token = await makeUserWithToken({ role: 'admin' });
    const job = catalogJobInstance();

    const started = await request(app).post('/api/ai/catalog/run')
      .set('Authorization', `Bearer ${token}`).send({});
    expect(started.status).toBe(202);
    expect(started.body).toEqual({ started: true });

    job.runDiscoveryNow = () => ({ started: false, reason: 'running' });
    const refused = await request(app).post('/api/ai/catalog/run')
      .set('Authorization', `Bearer ${token}`).send({});
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ started: false, reason: 'running' });

    job.runDiscoveryNow = () => ({ started: true, promise: Promise.resolve(null) });
  });

  it('POST /catalog/run drops the cache, so the next poll is not a minute stale', async () => {
    const token = await makeUserWithToken({ role: 'admin' });
    const key = await makeApiKey(['ai:stats']);

    const before = await request(app).get('/api/ai/status').set('Authorization', `Bearer ${key}`);
    await request(app).post('/api/ai/catalog/run').set('Authorization', `Bearer ${token}`).send({});
    const after = await request(app).get('/api/ai/status').set('Authorization', `Bearer ${key}`);

    expect(before.status).toBe(200);
    expect(after.status).toBe(200);
    // A fresh build, not the memo: `generatedAt` moves.
    expect(after.body.generatedAt).not.toBe(before.body.generatedAt);
  });

  it('the governor‘s refusal lands in the ledger, and the status counts the day', async () => {
    // The end of the wire the page reads from: `recordRefusal` is what the
    // `paid_budget` branch of the governor calls, and `paid_budget_hit` is
    // what reads it back. One `$inc`, on the day's own bucket, never rejecting.
    await recordRefusal('openrouter', 'storygeek', 'gm', NOW);
    await recordRefusal('openrouter', 'storygeek', 'gm', NOW);

    const row = await AISpend.findOne({ day: '2026-09-08', provider: 'openrouter', app: 'storygeek', feature: 'gm' }).lean();
    expect(row.refusals).toBe(2);
    // Nothing was spent and nothing was called: a refusal is not a call.
    expect(row.calls).toBe(0);
    expect(row.costUsd).toBe(0);

    const result = await buildStatus({
      now: NOW,
      deps: healthyDeps({ spend: AISpend, appConfig: { find: () => ({ lean: async () => [] }) } }),
    });
    expect(only(result, 'paid_budget_hit')[0].text).toBe('Paid budget was hit on 1 day(s) this month');
  });
});
