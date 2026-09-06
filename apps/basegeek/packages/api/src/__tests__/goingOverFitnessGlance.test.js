/**
 * goingOverFitnessGlance.test.js — pinning tests for the fitnessgeek, glance
 * and basegeek gateway modules, 2026-09-05 going-over.
 *
 * The date cases are the important ones. Every row these resolvers read is a
 * CALENDAR DATE stored at UTC midnight, and the windows querying them were
 * built from `new Date()`, which carries a time of day — so the oldest day of
 * every window fell below the floor and was silently dropped.
 */

import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';

const { default: FoodItem } = await import('../graphql/fitnessgeek/models/FoodItem.js');
const { default: FoodLog } = await import('../graphql/fitnessgeek/models/FoodLog.js');
const { resolvers: fitnessResolvers } = await import('../graphql/fitnessgeek/resolvers.js');
const { default: aiService } = await import('../services/aiService.js');
const { resolvers: glanceResolvers } = await import('../graphql/glance/resolvers.js');

const ALICE = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: userId } } : {});

/** A catalog food. `source`, `serving.size` and the calorie count are required. */
const makeFood = (name, overrides = {}) =>
  FoodItem.create({
    name,
    nutrition: { calories_per_serving: 100, protein_grams: 1 },
    serving: { size: 100, unit: 'g' },
    source: 'custom',
    user_id: null,
    ...overrides,
  });

beforeAll(async () => {
  await FoodItem.db.asPromise();
}, 60000);

afterEach(async () => {
  await Promise.all([FoodItem.deleteMany({}), FoodLog.deleteMany({})]);
});

afterAll(async () => {
  await FoodItem.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ───────────────────────────────────────────────────────────────────────────
describe('the food search box accepts the characters food names contain', () => {
  /**
   * `query.name = new RegExp(search, 'i')` on raw client text. The live path is
   * FoodSearch.jsx -> apiService.js -> fitnessFoods(search:). Typing `Oreo (`
   * threw "Invalid regular expression: Unterminated group" out of the resolver
   * and killed the search mid-word; so did `c++`, `50%+` and `*`.
   */
  it('finds a food whose name has an unbalanced parenthesis', async () => {
    await makeFood('Oreo (Double Stuf)');
    await makeFood('Plain biscuit');

    const hits = await fitnessResolvers.Query.fitnessFoods(null, { search: 'Oreo (' }, ctx(ALICE));
    expect(hits.map((f) => f.name)).toEqual(['Oreo (Double Stuf)']);
  });

  it('handles the other characters that used to throw', async () => {
    await makeFood('Vitamin C++ chew');
    await makeFood('50%+ cacao bar');

    for (const [needle, expected] of [['C++', 'Vitamin C++ chew'], ['50%+', '50%+ cacao bar']]) {
      const hits = await fitnessResolvers.Query.fitnessFoods(null, { search: needle }, ctx(ALICE));
      expect(hits.map((f) => f.name)).toEqual([expected]);
    }

    // A bare `*` is "Nothing to repeat" as a regex; as a literal it matches
    // nothing, which is the honest answer.
    const star = await fitnessResolvers.Query.fitnessFoods(null, { search: '*' }, ctx(ALICE));
    expect(star).toEqual([]);
  });

  it('stops treating a metacharacter as a wildcard', async () => {
    await makeFood('Milk');
    await makeFood('Malk');
    // '.' used to match any character; it is a literal dot now.
    const hits = await fitnessResolvers.Query.fitnessFoods(null, { search: 'M.lk' }, ctx(ALICE));
    expect(hits).toEqual([]);
  });

  it('answers a ReDoS-shaped needle promptly', async () => {
    await makeFood('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!');
    const started = Date.now();
    const hits = await fitnessResolvers.Query.fitnessFoods(null, { search: '(a+)+$' }, ctx(ALICE));
    expect(hits).toEqual([]);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the AI-insight window covers whole calendar days', () => {
  /**
   * `buildUserContext` built its window as `new Date()` back to
   * `subDays(new Date(), daysBack)`. `log_date` is stored at UTC MIDNIGHT, so
   * yesterday's row sat below a floor of "this time yesterday" and never
   * matched. `fitnessInsightsMorningBrief` asks for `daysBack: 1` and is
   * prompted "based on yesterday's data" — at 07:00 it was handed nothing.
   */
  const dayAt = (offsetDays) => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d;
  };

  const logOn = async (date, calories) => {
    const item = await makeFood(`probe-${calories}-${Math.random().toString(36).slice(2, 7)}`, {
      nutrition: { calories_per_serving: calories, protein_grams: 1, carbs_grams: 1, fat_grams: 1 },
    });
    return FoodLog.create({
      user_id: ALICE,
      food_item_id: item._id,
      food_name: item.name,
      log_date: date,
      meal_type: 'breakfast',
      servings: 1,
    });
  };

  // The insight resolvers all end in `aiService.chat(prompt)`. Stub it and the
  // prompt IS the assertion: it carries the serialized context whole, so the
  // window the resolver built is directly readable.
  let originalChat;
  let lastPrompt;
  beforeAll(() => {
    originalChat = aiService.chat;
    aiService.chat = async (prompt) => { lastPrompt = prompt; return 'stubbed coaching'; };
  });
  afterAll(() => { aiService.chat = originalChat; });

  const contextFromPrompt = () => JSON.parse(lastPrompt.slice(lastPrompt.indexOf('{'), lastPrompt.lastIndexOf('}') + 1));

  it('a daysBack:1 window starts at yesterday\'s UTC midnight, so yesterday is in it', async () => {
    await logOn(dayAt(-1), 500);

    await fitnessResolvers.Query.fitnessInsightsMorningBrief(null, {}, ctx(ALICE));
    const { dateRange, nutrition } = contextFromPrompt();

    // The floor is a whole day back, not "this time yesterday" — which is what
    // let yesterday's 00:00Z row fall below it.
    expect(dateRange.start).toBe(dayAt(-1).toISOString().slice(0, 10));
    expect(dateRange.days).toBe(1);
    // ...and the row that used to be dropped is present.
    expect(nutrition).not.toBeNull();
    expect(Object.keys(nutrition.dailyTotals || {}))
      .toContain(dayAt(-1).toISOString().slice(0, 10));
  });

  it('is anchored on the date the caller asked about, not the server clock', async () => {
    // `targetDate` used to be interpolated into the prompt but never reach the
    // context builder, so scrolling back to an older day returned the LAST
    // day's food captioned with the older date.
    const twoDaysAgo = dayAt(-2).toISOString().slice(0, 10);
    const insight = await fitnessResolvers.Query.fitnessInsightsDailySummary(
      null, { date: twoDaysAgo }, ctx(ALICE)
    );
    expect(insight.context.date).toBe(twoDaysAgo);

    const { dateRange } = contextFromPrompt();
    expect(dateRange.end).toBe(twoDaysAgo);
    expect(dateRange.start).toBe(dayAt(-3).toISOString().slice(0, 10));
  });

  it('leaves a longer window inclusive at both ends', async () => {
    await fitnessResolvers.Query.fitnessInsightsCorrelations(null, {}, ctx(ALICE));
    const { dateRange } = contextFromPrompt();
    expect(dateRange.days).toBe(30);
    expect(dateRange.start).toBe(dayAt(-30).toISOString().slice(0, 10));
    expect(dateRange.end).toBe(dayAt(0).toISOString().slice(0, 10));
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('calendarEvents will not fetch anything a caller names', () => {
  /**
   * The URLs come straight off `CalendarSourceInput.url` and basegeek then
   * fetches each one server-side — a textbook SSRF hop, with no scheme check,
   * no host check, and no cap on how many.
   */
  const asCtx = ctx(ALICE);

  it('refuses loopback, link-local and non-http schemes without throwing', async () => {
    const hostile = [
      { url: 'http://127.0.0.1:27017/' },
      { url: 'http://localhost:6379/' },
      { url: 'http://169.254.169.254/latest/meta-data/' },
      { url: 'file:///etc/passwd' },
      { url: 'gopher://127.0.0.1:11211/' },
      { url: 'http://[::1]:8080/' },
    ];
    // Each source is logged and skipped; the query still answers.
    const events = await glanceResolvers.Query.calendarEvents(
      null, { sources: hostile, from: null, to: null }, asCtx
    );
    expect(events).toEqual([]);
  });

  it('still answers when a source is simply unreachable', async () => {
    const events = await glanceResolvers.Query.calendarEvents(
      null,
      { sources: [{ url: 'https://calendar.invalid/nope.ics' }], from: null, to: null },
      asCtx
    );
    expect(events).toEqual([]);
  });

  it('caps the fan-out rather than fetching an unbounded list', async () => {
    // 500 sources at a 15s budget each is 2 hours of one request's outbound
    // calls. All of these are blocked hosts, so the cap is what is under test,
    // not the fetch.
    const many = Array.from({ length: 500 }, (_, i) => ({ url: `http://127.0.0.1:${9000 + i}/c.ics` }));
    const started = Date.now();
    const events = await glanceResolvers.Query.calendarEvents(
      null, { sources: many, from: null, to: null }, asCtx
    );
    expect(events).toEqual([]);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('refuses an anonymous caller before any of that', async () => {
    await expect(
      glanceResolvers.Query.calendarEvents(null, { sources: [{ url: 'https://example.com/c.ics' }] }, {})
    ).rejects.toThrow();
  });
});
