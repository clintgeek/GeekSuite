/**
 * aiTraffic.test.js — the ledger summary behind the console's chart recorder
 * and traffic gauge (graphql/basegeek/aiTraffic.js).
 *
 * Two halves. The fold (`buildTraffic`) is pure and takes `now`, so every day
 * boundary is asserted against a fixed instant rather than the wall clock. The
 * resolver is asserted from both sides of its gate — a plain user and an API
 * key refused, an admin served — and against a real AISpend collection.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';

const { default: mongoose } = await import('mongoose');
const { User, userGeekConn } = await import('../models/user.js');
const { default: AISpend } = await import('../models/AISpend.js');
const { resolvers } = await import('../graphql/basegeek/resolvers.js');
const {
  buildTraffic,
  clampTrafficDays,
  trafficWindow,
  readTraffic,
} = await import('../graphql/basegeek/aiTraffic.js');

// 2026-09-27 at 23:30 UTC: late enough that a local-time bug would roll over.
const NOW = new Date('2026-09-27T23:30:00.000Z');

describe('aiTraffic — the fold', () => {
  it('clamps the window to 1…31 days and defaults to 7', () => {
    expect(clampTrafficDays(undefined)).toBe(7);
    expect(clampTrafficDays(0)).toBe(7);
    expect(clampTrafficDays(-3)).toBe(7);
    expect(clampTrafficDays('abc')).toBe(7);
    expect(clampTrafficDays(3)).toBe(3);
    expect(clampTrafficDays(400)).toBe(31);
  });

  it('lists the window oldest first, ending on the UTC day of `now`', () => {
    expect(trafficWindow({ now: NOW, days: 3 })).toEqual(['2026-09-25', '2026-09-26', '2026-09-27']);
  });

  it('zero-fills quiet days instead of closing the gap', () => {
    const out = buildTraffic([
      { day: '2026-09-25', app: 'storygeek', calls: 4, costUsd: 0 },
    ], { now: NOW, days: 3 });
    expect(out.days.map((d) => d.calls)).toEqual([4, 0, 0]);
    expect(out.today).toBe('2026-09-27');
    expect(out.apps).toEqual([]);
  });

  it('sums every row of a day, free and paid, and keeps refusals apart from calls', () => {
    const out = buildTraffic([
      { day: '2026-09-27', app: 'storygeek', calls: 10, costUsd: 0 },
      { day: '2026-09-27', app: 'storygeek', calls: 2, costUsd: 0.012, refusals: 1 },
      { day: '2026-09-27', app: 'notegeek', calls: 5, costUsd: 0.003 },
    ], { now: NOW, days: 1 });
    expect(out.days).toEqual([{ day: '2026-09-27', calls: 17, costUsd: 0.015, refusals: 1 }]);
  });

  it("breaks today (and only today) down by app, busiest first", () => {
    const out = buildTraffic([
      { day: '2026-09-26', app: 'geekpr', calls: 99 },
      { day: '2026-09-27', app: 'notegeek', calls: 5 },
      { day: '2026-09-27', app: 'storygeek', calls: 12 },
      { day: '2026-09-27', app: 'storygeek', calls: 1 },
      { day: '2026-09-27', calls: 2 },
    ], { now: NOW, days: 2 });
    expect(out.apps).toEqual([
      { app: 'storygeek', calls: 13, costUsd: 0 },
      { app: 'notegeek', calls: 5, costUsd: 0 },
      { app: 'unknown', calls: 2, costUsd: 0 },
    ]);
  });

  it('ignores rows outside the window and junk numbers', () => {
    const out = buildTraffic([
      { day: '2026-08-01', app: 'x', calls: 1000 },
      { day: '2026-09-27', app: 'x', calls: 'lots', costUsd: 'free' },
      null,
    ], { now: NOW, days: 2 });
    expect(out.days.map((d) => d.calls)).toEqual([0, 0]);
  });

  it('asks the model for exactly the window, as one range over `day`', async () => {
    let filter;
    const model = {
      find(f) {
        filter = f;
        return { select: () => ({ lean: async () => [{ day: '2026-09-27', app: 'a', calls: 3 }] }) };
      },
    };
    const out = await readTraffic(model, { now: NOW, days: 7 });
    expect(filter).toEqual({ day: { $gte: '2026-09-21', $lte: '2026-09-27' } });
    expect(out.days).toHaveLength(7);
    expect(out.days[6].calls).toBe(3);
  });
});

describe('aiTraffic — the resolver', () => {
  let seq = 0;
  const makeUser = (overrides = {}) => User.create({
    username: `ai_traffic_${Date.now()}_${seq++}`,
    passwordHash: 'unhashed-placeholder',
    ...overrides,
  });

  beforeAll(async () => {
    if (userGeekConn.readyState === 0) await userGeekConn.asPromise();
    if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
  });

  afterEach(async () => {
    await User.deleteMany({});
    await AISpend.deleteMany({});
  });

  afterAll(async () => {
    await userGeekConn.close();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

  it('is UNAUTHENTICATED with no user', async () => {
    await expect(resolvers.Query.aiTraffic(null, {}, { user: null }))
      .rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('refuses a plain user', async () => {
    const user = await makeUser();
    await expect(resolvers.Query.aiTraffic(null, {}, { user: { id: user._id.toString() } }))
      .rejects.toMatchObject({ extensions: { code: 'ADMIN_REQUIRED' } });
  });

  it('refuses an API key before it looks up a role', async () => {
    await expect(resolvers.Query.aiTraffic(null, {}, {
      user: { id: 'apikey_abc', app: 'testgeek', type: 'api_key' },
    })).rejects.toMatchObject({ extensions: { code: 'ADMIN_REQUIRED' } });
  });

  it('serves an admin the ledger, with nothing outside the window', async () => {
    const admin = await makeUser({ role: 'admin' });
    const today = new Date().toISOString().slice(0, 10);
    await AISpend.create([
      { day: today, provider: 'groq', app: 'storygeek', feature: 'gm', calls: 6, costUsd: 0 },
      { day: today, provider: 'openrouter', app: 'notegeek', feature: 'compose', calls: 2, costUsd: 0.01 },
      { day: '2001-01-01', provider: 'groq', app: 'storygeek', feature: 'gm', calls: 500, costUsd: 0 },
    ]);

    const out = await resolvers.Query.aiTraffic(null, { days: 7 }, { user: { id: admin._id.toString() } });

    expect(out.days).toHaveLength(7);
    // Summed over the window, which the seeded day is inside however the
    // clock turns between the insert and the read.
    expect(out.days.reduce((sum, d) => sum + d.calls, 0)).toBe(8);
    expect(out.days.every((d) => d.day > '2001-01-01')).toBe(true);
  });
});
