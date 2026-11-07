/**
 * aiHardeningUsageCounters.test.js — AIUsage increments are atomic (Track D).
 *
 * `aiUsageService.trackUsage` read the day's row, added one in memory and
 * `save()`d it: a `$set` of the computed value. N concurrent calls all read
 * the same count and all wrote count + 1, so a burst of free-tier calls
 * booked as one — and the free-tier ceiling the row exists to watch could be
 * sailed past. Mongo is the shared in-memory instance.
 */

const { default: aiUsageService } = await import('../services/aiUsageService.js');
const { default: AIUsage } = await import('../models/AIUsage.js');

const USER = 'usage-counter-user';

beforeAll(async () => {
  await AIUsage.init();
}, 60000);

beforeEach(async () => {
  await AIUsage.deleteMany({ userId: USER });
});

afterAll(async () => {
  await AIUsage.deleteMany({ userId: USER });
});

describe('N parallel usage updates count N', () => {
  test('from a cold start (no row yet today)', async () => {
    const N = 20;
    const results = await Promise.all(Array.from({ length: N }, () =>
      aiUsageService.trackUsage('groq', 'atomic-model', USER, { inputTokens: 3, outputTokens: 2, requests: 1 })));
    for (const r of results) expect(r.success).toBe(true);

    const rows = await AIUsage.find({ provider: 'groq', modelId: 'atomic-model', userId: USER }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].currentDay.requests).toBe(N);
    expect(rows[0].currentDay.tokens).toBe(N * 5);
  });

  test('against an existing row', async () => {
    await aiUsageService.trackUsage('groq', 'atomic-model', USER, { inputTokens: 1, outputTokens: 0, requests: 1 });
    const N = 15;
    await Promise.all(Array.from({ length: N }, () =>
      aiUsageService.trackUsage('groq', 'atomic-model', USER, { inputTokens: 1, outputTokens: 0, requests: 1 })));
    const row = await AIUsage.findOne({ provider: 'groq', modelId: 'atomic-model', userId: USER }).lean();
    expect(row.currentDay.requests).toBe(N + 1);
    expect(row.currentDay.tokens).toBe(N + 1);
  });

  test('the returned view and the percentages still reflect the count', async () => {
    const r = await aiUsageService.trackUsage('groq', 'atomic-model', USER, { inputTokens: 4, outputTokens: 6, requests: 1 });
    expect(r.success).toBe(true);
    expect(r.usage.current.day.requests).toBe(1);
    expect(r.usage.current.day.tokens).toBe(10);
    expect(r.usage.current.minute.requests).toBe(1);
    expect(typeof r.usage.percentages.requestsPerDay).toBe('number');
  });
});
