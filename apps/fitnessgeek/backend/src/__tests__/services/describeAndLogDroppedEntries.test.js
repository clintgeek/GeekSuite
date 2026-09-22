/**
 * Dishes that vanish, pinned.
 *
 * `resolveEntries` ends in `resolved.filter(Boolean)`. Anything it could not
 * identify — history miss, catalog miss, then an AI estimate that declined or
 * timed out — was simply absent from the result, and `logDescription` only
 * ever pushed to `logged` or `skipped` for resolutions that existed. A dropped
 * entry appeared in NEITHER, the route answered 200 `{success: true}`, and the
 * response carried no original-entry count, so the frontend could not have
 * noticed even in principle.
 *
 * `estimateDishes` returns a clean `{ok: false}` on timeout, refusal or
 * unparseable JSON rather than throwing, so this is the ordinary "model
 * declined" path on the app's PRIMARY logging flow — not a rare crash.
 */
import { jest } from '@jest/globals';

const estimateDishes = jest.fn();

// jest resolves an `unstable_mockModule` specifier against the SETUP file
// rather than this one, so relative mock targets are made absolute first —
// the idiom this suite already uses (see routes/weightValidation.test.js).
const mod = (p) => new URL(p, import.meta.url).pathname;

jest.unstable_mockModule(mod('../../services/aiFoodService.js'), () => ({
  __esModule: true,
  default: { estimateDishes },
  estimateDishes,
}));

// The data layer is mocked to nothing-found so every entry falls through to
// the estimate path, which is the one under test. Without this each entry
// issues a real Mongo query that hangs for seconds against no database — the
// suite times out rather than failing on its assertions, which would tell us
// nothing about the drop behaviour.
const emptyQuery = () => ({
  sort: () => ({ limit: () => ({ lean: async () => [] }), lean: async () => [] }),
  limit: () => ({ lean: async () => [] }),
  lean: async () => [],
});
jest.unstable_mockModule(mod('../../models/FoodLog.js'), () => ({
  __esModule: true,
  default: { find: emptyQuery, findOne: async () => null, aggregate: async () => [] },
}));
jest.unstable_mockModule(mod('../../models/FoodItem.js'), () => ({
  __esModule: true,
  default: { find: emptyQuery, findOne: async () => null, findById: async () => null },
}));
// No saved meals: every entry must reach the estimate path under test.
jest.unstable_mockModule(mod('../../models/Meal.js'), () => ({
  __esModule: true,
  default: { find: () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) }) },
}));
jest.unstable_mockModule(mod('../../models/DailySummary.js'), () => ({
  __esModule: true,
  default: { updateFromLogs: async () => null },
}));
jest.unstable_mockModule(mod('../../services/unifiedFoodService.js'), () => ({
  __esModule: true,
  default: { search: async () => [], getByBarcode: async () => null },
}));

const { resolveEntries, logDescription } = await import('../../services/describeAndLogService.js');

const entry = (description, servings = 1) => ({ description, servings, unit: null, mealType: 'lunch' });

describe('resolveEntries drops what it cannot identify', () => {
  beforeEach(() => {
    estimateDishes.mockReset();
  });

  test('a declined estimate yields no resolution for that entry', async () => {
    // The precondition for the whole bug: the model declining is not an
    // exception, so nothing upstream can catch it.
    estimateDishes.mockResolvedValue({ ok: false, reason: 'timeout' });

    const entries = [entry('kombucha')];
    const resolved = await resolveEntries(entries, { userId: 'u1' });

    expect(resolved).toHaveLength(0);
    // And critically: no error was thrown, so a caller that only guards
    // against exceptions sees a clean success.
    expect(estimateDishes).toHaveBeenCalled();
  });

  test('every resolution carries its source entry BY REFERENCE', async () => {
    // This is what makes the recovery-by-difference in logDescription sound.
    // If resolutions ever carried a copy instead, the Set lookup would report
    // every entry as dropped and skip everything.
    estimateDishes.mockResolvedValue({
      ok: true,
      provenance: { model: 'test' },
      dishes: [{
        index: 0,
        name: 'Kombucha',
        nutrition: { calories: 30, protein_grams: 0, carbs_grams: 7, fat_grams: 0 },
        servingDescription: 'bottle',
        lowCalories: null,
        highCalories: null,
      }],
    });

    const entries = [entry('kombucha')];
    const resolved = await resolveEntries(entries, { userId: 'u1' });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].entry).toBe(entries[0]);
  });

  test('a partial failure resolves only the entries the model returned', async () => {
    // Two dishes need estimating, the model answers for one. The other is the
    // one that used to disappear without trace.
    estimateDishes.mockResolvedValue({
      ok: true,
      provenance: { model: 'test' },
      dishes: [{
        index: 0,
        name: 'Kombucha',
        nutrition: { calories: 30 },
        servingDescription: 'bottle',
      }],
    });

    const entries = [entry('kombucha'), entry('some obscure dish')];
    const resolved = await resolveEntries(entries, { userId: 'u1' });

    expect(resolved).toHaveLength(1);
    expect(resolved.map((r) => r.entry)).not.toContain(entries[1]);

    // The difference the service takes: exactly the entry that was lost.
    const resolvedSet = new Set(resolved.map((r) => r.entry));
    const dropped = entries.filter((e) => !resolvedSet.has(e));
    expect(dropped).toEqual([entries[1]]);
  });
});

describe('logDescription accounts for every entry the user described', () => {
  beforeEach(() => {
    estimateDishes.mockReset();
  });

  test('a dish the model could not identify is REPORTED, not silently dropped', async () => {
    // The headline case. Before the fix this returned logged: [], skipped: [],
    // and the route answered 200 {success: true} — the user was told their
    // food was logged when none of it was.
    estimateDishes.mockResolvedValue({ ok: false, reason: 'timeout' });

    const result = await logDescription('kombucha and a diet coke', {
      userId: 'u1',
      date: new Date('2026-09-20T00:00:00.000Z'),
      skipReview: true,
    });

    expect(result.logged).toHaveLength(0);
    expect(result.skipped.length).toBeGreaterThan(0);
    for (const s of result.skipped) {
      expect(s.reason).toBe('could-not-identify');
      expect(s.name).toBeTruthy();
    }
  });

  test('every described entry is accounted for: logged + skipped === requested', async () => {
    // The invariant that makes the loss detectable at all. The response used
    // to carry no original-entry count, so a partial drop was undetectable by
    // the frontend even in principle.
    estimateDishes.mockResolvedValue({ ok: false, reason: 'declined' });

    const result = await logDescription('kombucha and a diet coke', {
      userId: 'u1',
      date: new Date('2026-09-20T00:00:00.000Z'),
      skipReview: true,
    });

    expect(result.requested).toBe(result.parsed.entries.length);
    expect(result.logged.length + result.skipped.length).toBe(result.requested);
  });

  test('text with no food in it still reports nothing requested', async () => {
    // The route's 422 "I couldn't find any food in that" depends on BOTH
    // lists being empty, so a genuine parse failure must not start reporting
    // phantom skipped items.
    const result = await logDescription('   ', {
      userId: 'u1',
      date: new Date('2026-09-20T00:00:00.000Z'),
      skipReview: true,
    });

    expect(result.requested).toBe(0);
    expect(result.logged).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });
});
