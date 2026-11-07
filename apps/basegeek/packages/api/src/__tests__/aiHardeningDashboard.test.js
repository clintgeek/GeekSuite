/**
 * aiHardeningDashboard.test.js — the status page and traffic ledger say what
 * they measure, admin writes drop the status memo, and a config save that
 * omits `enabled` keeps the stored value (audit #13 follow-ups, Track D).
 *
 * `buildStatus` is driven with fake collections (the aiStatus.test.js
 * pattern); the admin write paths run for real against the in-memory Mongo.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { User, userGeekConn } = await import('../models/user.js');
const { default: AIConfig } = await import('../models/AIConfig.js');
const { default: AIAppConfig } = await import('../models/AIAppConfig.js');
const { default: aiRoutes } = await import('../routes/aiRoutes.js');
const { resolvers } = await import('../graphql/basegeek/resolvers.js');
const { buildTraffic } = await import('../graphql/basegeek/aiTraffic.js');
const { encrypt } = await import('@geeksuite/crypto-vault');
const { default: logger } = await import('../lib/logger.js');
const { default: aiService } = await import('../services/aiService.js');
const {
  buildStatus,
  cachedStatus,
  invalidateStatusCache,
  isCleanRun,
} = await import('../services/aiStatusService.js');

/* ─────────────────────────────── fixtures ──────────────────────────────── */

const NOW = new Date('2026-09-08T12:00:00.000Z');
const hoursAgo = (n) => new Date(NOW.getTime() - n * 60 * 60 * 1000);
const TODAY = '2026-09-08';

/** Minimal fake collection: find/findOne/findById with the chains buildStatus uses. */
function fakeCollection(rows = []) {
  const matches = (row, query) => Object.entries(query || {}).every(([field, want]) => {
    const value = field.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), row);
    if (want !== null && typeof want === 'object' && !(want instanceof Date)) {
      if ('$gte' in want) {
        if (value == null) return false;
        return want.$gte instanceof Date ? new Date(value) >= want.$gte : String(value) >= String(want.$gte);
      }
      return false;
    }
    if (want === null) return value === null || value === undefined;
    return value === want;
  });
  const chain = (list) => ({
    lean: async () => list,
    select: () => chain(list),
    sort: (spec) => {
      const [field, dir] = Object.entries(spec)[0];
      return chain([...list].sort((a, b) => {
        const av = new Date(a[field] ?? 0).getTime();
        const bv = new Date(b[field] ?? 0).getTime();
        return dir < 0 ? bv - av : av - bv;
      }));
    },
  });
  return {
    find: (query) => chain(rows.filter((row) => matches(row, query))),
    findOne: (query) => {
      const list = rows.filter((row) => matches(row, query));
      return {
        sort: (spec) => ({ lean: async () => (await chain(list).sort(spec).lean())[0] ?? null }),
        lean: async () => list[0] ?? null,
      };
    },
    findById: (id) => ({ lean: async () => rows.find((r) => r._id === id) ?? null }),
  };
}

const cleanDiscovery = (at, extra = {}) => ({
  kind: 'discovery',
  startedAt: at,
  finishedAt: at,
  perProvider: { groq: { alive: 1, dead: 0, unknown: 0, error: null } },
  counts: { listedError: null, probeError: null, deactivateError: null },
  error: null,
  ...extra,
});

function deps(overrides = {}) {
  return {
    catalogRun: fakeCollection([cleanDiscovery(hoursAgo(1))]),
    freeTier: fakeCollection([]),
    stickyPick: fakeCollection([]),
    spend: fakeCollection([]),
    spendBudget: fakeCollection([]),
    appConfig: fakeCollection([]),
    model: fakeCollection([]),
    apiKey: fakeCollection([]),
    aiConfig: fakeCollection([]),
    providerIds: ['groq'],
    labels: { groq: 'Groq' },
    providers: () => ({}),
    getFreeTierHealth: () => ({}),
    isCooling: () => false,
    caps: () => ({ perDayUsd: 0.5, perCallUsd: 0.05 }),
    job: () => ({ enabled: true, ticking: false }),
    isEncrypted: () => true,
    normalizeApp: (a) => (a ? String(a).toLowerCase() : null),
    ...overrides,
  };
}

const kinds = (status) => status.attention.map((i) => i.kind);

/* ─────────────────────── item 5: catalog run hygiene ───────────────────── */

describe('a run with a deactivation error is not clean', () => {
  it('isCleanRun counts deactivateError (the job\'s own definition)', () => {
    expect(isCleanRun(cleanDiscovery(NOW))).toBe(true);
    expect(isCleanRun(cleanDiscovery(NOW, { counts: { deactivateError: 2 } }))).toBe(false);
  });

  it('the last-clean-discovery read skips it, so the stale alert can fire', async () => {
    const status = await buildStatus({
      now: NOW,
      deps: deps({
        catalogRun: fakeCollection([
          cleanDiscovery(hoursAgo(1), { counts: { listedError: null, probeError: null, deactivateError: 3 } }),
          cleanDiscovery(hoursAgo(40)),
        ]),
      }),
    });
    expect(status.catalog.lastDiscovery.ok).toBe(false);
    expect(kinds(status)).toContain('discovery_stale');
  });
});

describe('key audit alerts from the latest discovery', () => {
  it('keyUnreadable is an error, first in the list, and names the vault', async () => {
    const status = await buildStatus({
      now: NOW,
      deps: deps({
        catalogRun: fakeCollection([cleanDiscovery(hoursAgo(1), { keyUnreadable: ['groq', 'gemini'] })]),
        // a warn-level item alongside, to prove the ordering
        appConfig: fakeCollection([{ appName: 'x', provider: 'groq', model: 'gone' }]),
      }),
    });
    const item = status.attention.find((i) => i.kind === 'key_unreadable');
    expect(item).toMatchObject({ kind: 'key_unreadable', severity: 'error' });
    expect(item.text).toMatch(/KEY_VAULT_SECRET/);
    expect(item.text).toMatch(/groq/i);
    expect(status.attention[0].kind).toBe('key_unreadable');
  });

  it('keyNotLoaded is a warning', async () => {
    const status = await buildStatus({
      now: NOW,
      deps: deps({ catalogRun: fakeCollection([cleanDiscovery(hoursAgo(1), { keyNotLoaded: ['together'] })]) }),
    });
    expect(status.attention.find((i) => i.kind === 'key_not_loaded')).toMatchObject({ severity: 'warn' });
  });

  it('parked, unparked and a truncated listing are information', async () => {
    const status = await buildStatus({
      now: NOW,
      deps: deps({
        catalogRun: fakeCollection([cleanDiscovery(hoursAgo(1), {
          parked: { AIModel: 4, AIFreeTier: 2 },
          unparked: { AIModel: 1 },
          counts: { listedError: null, probeError: null, deactivateError: null, truncatedListing: ['openrouter'] },
        })]),
      }),
    });
    for (const kind of ['providers_parked', 'providers_unparked', 'listing_truncated']) {
      expect(status.attention.find((i) => i.kind === kind)).toMatchObject({ severity: 'info' });
    }
  });

  it('a clean run raises none of them', async () => {
    const status = await buildStatus({ now: NOW, deps: deps() });
    expect(kinds(status)).not.toEqual(expect.arrayContaining(['key_unreadable']));
    for (const kind of ['key_unreadable', 'key_not_loaded', 'providers_parked', 'providers_unparked', 'listing_truncated']) {
      expect(kinds(status)).not.toContain(kind);
    }
  });
});

/* ───────────────────── item 3: unknown cost is not free ────────────────── */

describe('an unknown cost is surfaced, never counted as free', () => {
  const ledger = [
    { day: TODAY, provider: 'openrouter', app: 'notegeek', feature: 'compose', calls: 3, costUsd: 0, costUnknown: 3 },
    { day: TODAY, provider: 'groq', app: 'notegeek', feature: 'suggest', calls: 10, costUsd: 0 },
    { day: '2026-09-02', provider: 'openrouter', app: 'fitnessgeek', feature: 'chat', calls: 2, costUsd: 0.02 },
  ];

  it('status: costUnknown is counted, the calls are not free, and an item says spend is a floor', async () => {
    const status = await buildStatus({ now: NOW, deps: deps({ spend: fakeCollection(ledger) }) });
    expect(status.spend.costUnknownMonth).toBe(3);
    expect(status.spend.costUnknownToday).toBe(3);
    // 2 priced paid calls + 3 whose price nobody knows; the 10 free ones are not paid.
    expect(status.spend.paidCallsMonth).toBe(5);
    const row = status.spend.byApp.find((r) => r.app === 'notegeek' && r.feature === 'compose');
    expect(row.costUnknown).toBe(3);
    expect(status.attention.find((i) => i.kind === 'cost_unknown')).toMatchObject({ severity: 'warn' });
  });

  it('status: no unknown cost, no item', async () => {
    const status = await buildStatus({ now: NOW, deps: deps({ spend: fakeCollection(ledger.slice(1)) }) });
    expect(status.spend.costUnknownMonth).toBe(0);
    expect(kinds(status)).not.toContain('cost_unknown');
  });

  it('aiTraffic: days and apps carry costUnknown', () => {
    const traffic = buildTraffic(ledger, { now: NOW, days: 7 });
    const today = traffic.days.find((d) => d.day === TODAY);
    expect(today.costUnknown).toBe(3);
    expect(traffic.apps.find((a) => a.app === 'notegeek').costUnknown).toBe(3);
    expect(traffic.days.find((d) => d.day === '2026-09-02').costUnknown).toBe(0);
  });
});

describe("today's paid reservations", () => {
  it('reports reserved and settled dollars from AISpendBudget', async () => {
    const status = await buildStatus({
      now: NOW,
      deps: deps({ spendBudget: fakeCollection([{ _id: TODAY, day: TODAY, reservedUsd: 0.012, settledUsd: 0.2 }]) }),
    });
    expect(status.spend.reservedTodayUsd).toBe(0.012);
    expect(status.spend.settledTodayUsd).toBe(0.2);
  });

  it('a day with no budget document reads as zero', async () => {
    const status = await buildStatus({ now: NOW, deps: deps() });
    expect(status.spend.reservedTodayUsd).toBe(0);
    expect(status.spend.settledTodayUsd).toBe(0);
  });
});

/* ─────────────── item 3: admin writes drop the status memo ─────────────── */

let seq = 0;
async function makeAdmin() {
  const user = await User.create({ username: `trackd_admin_${Date.now()}_${seq++}`, passwordHash: 'x', role: 'admin' });
  const token = jwt.sign({ id: user._id.toString(), app: 'basegeek' }, process.env.JWT_SECRET);
  return { user, ctx: { user: { id: user._id.toString() } }, token };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/ai', aiRoutes);
  return app;
}

const PROVIDER = 'together';
const APP = 'trackdapp';

describe('admin writes', () => {
  let app;
  const createdUsers = [];

  beforeAll(async () => {
    if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
    if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
    app = buildApp();
  }, 60000);

  afterEach(async () => {
    invalidateStatusCache();
    await AIConfig.deleteMany({ provider: PROVIDER });
    await AIAppConfig.deleteMany({ appName: APP });
    await User.deleteMany({ _id: { $in: createdUsers.splice(0) } });
  });

  afterAll(async () => {
    await userGeekConn.close();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

  const admin = async () => {
    const a = await makeAdmin();
    createdUsers.push(a.user._id);
    return a;
  };

  /** Prime the memo, run `write`, and report whether the next read rebuilt. */
  async function rebuiltAfter(write) {
    let builds = 0;
    const d = deps({ job: () => { builds += 1; return { enabled: true }; } });
    invalidateStatusCache();
    await cachedStatus({ now: NOW, deps: d });
    await cachedStatus({ now: NOW, deps: d });
    expect(builds).toBe(1);
    await write();
    await cachedStatus({ now: NOW, deps: d });
    return builds === 2;
  }

  describe('drop the status memo', () => {
    it.each([
      ['saveAIConfig', (ctx) => resolvers.Mutation.saveAIConfig(null, { config: { [PROVIDER]: { enabled: true } } }, ctx)],
      ['removeAIProviderKey', (ctx) => resolvers.Mutation.removeAIProviderKey(null, { provider: PROVIDER }, ctx)],
      ['resetAIStats', (ctx) => resolvers.Mutation.resetAIStats(null, {}, ctx)],
      ['deleteModelPricing', (ctx) => resolvers.Mutation.deleteModelPricing(null, { provider: PROVIDER, modelId: 'trackd-none' }, ctx)],
      ['deleteModelFreeTier', (ctx) => resolvers.Mutation.deleteModelFreeTier(null, { provider: PROVIDER, modelId: 'trackd-none' }, ctx)],
      ['saveAIAppConfig', (ctx) => resolvers.Mutation.saveAIAppConfig(null, { appName: APP, config: { tier: 'auto' } }, ctx)],
      ['deleteAIAppConfig', (ctx) => resolvers.Mutation.deleteAIAppConfig(null, { appName: APP }, ctx)],
    ])('GraphQL %s', async (_name, write) => {
      const { ctx } = await admin();
      expect(await rebuiltAfter(() => write(ctx))).toBe(true);
    });

    it.each([
      ['POST /config', (r, t) => r.post('/api/ai/config').set('Authorization', `Bearer ${t}`).send({ [PROVIDER]: { enabled: true } })],
      ['POST /reset-stats', (r, t) => r.post('/api/ai/reset-stats').set('Authorization', `Bearer ${t}`).send({})],
    ])('REST %s', async (_name, write) => {
      const { token } = await admin();
      expect(await rebuiltAfter(async () => {
        const res = await write(request(app), token);
        expect(res.status).toBe(200);
      })).toBe(true);
    });
  });

  /* ──────────────── item 4: omitted `enabled` keeps the stored value ─────── */

  describe('a save that omits `enabled` keeps what is stored', () => {
    const storeKey = (enabled) => AIConfig.findOneAndUpdate(
      { provider: PROVIDER },
      { apiKey: encrypt('trackd-test-key-not-real'), enabled },
      { upsert: true, new: true }
    );

    it('GraphQL saveAIConfig, keyless save of an enabled provider', async () => {
      await storeKey(true);
      const { ctx } = await admin();
      await resolvers.Mutation.saveAIConfig(null, { config: { [PROVIDER]: { apiKey: '' } } }, ctx);
      expect((await AIConfig.findOne({ provider: PROVIDER }).lean()).enabled).toBe(true);
    });

    it('GraphQL saveAIConfig, new key on a disabled provider', async () => {
      await storeKey(false);
      const { ctx } = await admin();
      await resolvers.Mutation.saveAIConfig(null, { config: { [PROVIDER]: { apiKey: 'trackd-rotated-key-not-real' } } }, ctx);
      expect((await AIConfig.findOne({ provider: PROVIDER }).lean()).enabled).toBe(false);
    });

    it('GraphQL saveAIConfig still writes an explicit false', async () => {
      await storeKey(true);
      const { ctx } = await admin();
      await resolvers.Mutation.saveAIConfig(null, { config: { [PROVIDER]: { enabled: false } } }, ctx);
      expect((await AIConfig.findOne({ provider: PROVIDER }).lean()).enabled).toBe(false);
    });

    it('REST POST /config, keyless save of an enabled provider', async () => {
      await storeKey(true);
      const { token } = await admin();
      const res = await request(app).post('/api/ai/config').set('Authorization', `Bearer ${token}`)
        .send({ [PROVIDER]: { accountId: '' } });
      expect(res.status).toBe(200);
      expect((await AIConfig.findOne({ provider: PROVIDER }).lean()).enabled).toBe(true);
    });

    it('REST POST /config still writes an explicit true', async () => {
      await storeKey(false);
      const { token } = await admin();
      await request(app).post('/api/ai/config').set('Authorization', `Bearer ${token}`)
        .send({ [PROVIDER]: { enabled: true } });
      expect((await AIConfig.findOne({ provider: PROVIDER }).lean()).enabled).toBe(true);
    });

    it('GraphQL saveAIAppConfig does not re-enable a disabled routing row by omission', async () => {
      await AIAppConfig.create({ appName: APP, tier: 'auto', enabled: false });
      const { ctx } = await admin();
      await resolvers.Mutation.saveAIAppConfig(null, { appName: APP, config: { tier: 'auto' } }, ctx);
      expect((await AIAppConfig.findOne({ appName: APP }).lean()).enabled).toBe(false);
    });
  });

  /* ─────────── item 5: a key that will not decrypt is logged, by name ────── */

  describe('loadConfigurations', () => {
    afterEach(() => jest.restoreAllMocks());

    it('warns, naming the provider and never the key, when a stored key does not decrypt', async () => {
      const good = encrypt('trackd-test-key-not-real');
      // Flip the last hex digit: the GCM tag check fails, safeDecrypt → null.
      const tampered = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
      await AIConfig.create({ provider: PROVIDER, apiKey: tampered, enabled: true });
      const warn = jest.spyOn(logger, 'warn');

      await aiService.loadConfigurations();

      const hits = warn.mock.calls.filter(([obj, msg]) => obj?.provider === PROVIDER && /did not decrypt/.test(String(msg)));
      expect(hits).toHaveLength(1);
      expect(hits[0][1]).toMatch(/KEY_VAULT_SECRET/);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(tampered);
      expect(aiService.providers[PROVIDER].apiKey).toBe('');
    });
  });
});
