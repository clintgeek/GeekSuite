/**
 * dailySummaryGatewayFixes.test.js
 *
 * Pre-work fixes from `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md` §5, PRE-1 and
 * PRE-2, verified on the gateway's own models (not through the resolvers —
 * `fitnessgeekFoodLogWrites.test.js` already covers the mutation surface).
 *
 *   PRE-1 — `totals.net_carbs_grams` was missing from the gateway's
 *   `DailySummary` schema. Both apps write the whole `totals` sub-document
 *   through `findOneAndUpdate`, so Mongoose strict mode silently dropped the
 *   field on every gateway write. Fixed by adding the field (matching
 *   fitnessgeek's declaration exactly) and the accumulation line in
 *   `updateFromLogs`. Verified here by reading the persisted document back
 *   with `.lean()` — not the value `updateFromLogs` returns in memory — so
 *   strict-mode stripping is actually exercised.
 *
 *   PRE-2 — `DailySummary.js` and `FoodLog.js` each had a hand-rolled
 *   `toUtcDate` that treated an ISO instant as `NaN` (`Number('05T14:...')`)
 *   and landed on the wrong calendar day. Replaced with `@geeksuite/utils`'s
 *   `toUtcMidnight`. Verified here for a `YYYY-MM-DD` string, a `Date`, and
 *   an ISO-instant string, across both models.
 */

import mongoose from 'mongoose';

const { default: FoodItem } = await import('../graphql/fitnessgeek/models/FoodItem.js');
const { default: FoodLog } = await import('../graphql/fitnessgeek/models/FoodLog.js');
const { default: DailySummary } = await import('../graphql/fitnessgeek/models/DailySummary.js');
const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');

const ALICE = String(new mongoose.Types.ObjectId());

const nutrition = (overrides = {}) => ({
  calories_per_serving: 100,
  protein_grams: 5,
  carbs_grams: 20,
  fat_grams: 2,
  fiber_grams: 4,
  sugar_grams: 3,
  sodium_mg: 10,
  ...overrides,
});

const makeFood = (overrides = {}) =>
  FoodItem.create({
    name: 'test food',
    nutrition: nutrition(),
    serving: { size: 100, unit: 'g' },
    source: 'custom',
    user_id: ALICE,
    ...overrides,
  });

beforeAll(async () => {
  await DailySummary.db.asPromise();
}, 60000);

afterEach(async () => {
  await Promise.all([
    FoodItem.deleteMany({}),
    FoodLog.deleteMany({}),
    DailySummary.deleteMany({}),
    UserSettings.deleteMany({}),
  ]);
});

afterAll(async () => {
  await DailySummary.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// PRE-1 — net_carbs_grams survives the gateway write
// ---------------------------------------------------------------------------

describe('PRE-1 — DailySummary.totals.net_carbs_grams', () => {
  test('schema declares the field with the same shape as fitnessgeek', () => {
    const path = DailySummary.schema.path('totals.net_carbs_grams');
    expect(path).toBeDefined();
    expect(path.instance).toBe('Number');
    expect(path.defaultValue).toBe(0);
    expect(path.options.min).toBe(0);
  });

  test('updateFromLogs computes and persists net_carbs_grams through findOneAndUpdate', async () => {
    const foodA = await makeFood({ nutrition: nutrition({ carbs_grams: 20, fiber_grams: 4 }) });
    const foodB = await makeFood({ nutrition: nutrition({ carbs_grams: 10, fiber_grams: 2 }) });

    await FoodLog.create({
      user_id: ALICE,
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      meal_type: 'breakfast',
      food_item_id: foodA._id,
      servings: 1,
      nutrition: nutrition({ carbs_grams: 20, fiber_grams: 4 }),
    });
    await FoodLog.create({
      user_id: ALICE,
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      meal_type: 'lunch',
      food_item_id: foodB._id,
      servings: 2,
      nutrition: nutrition({ carbs_grams: 10, fiber_grams: 2 }),
    });

    await DailySummary.updateFromLogs(ALICE, '2026-09-05');

    // Read back with .lean() from the actual persisted document, not the
    // in-memory value findOneAndUpdate returned — this is what proves
    // strict-mode stripping is really exercised.
    const persisted = await DailySummary.findOne({
      user_id: ALICE,
      date: new Date('2026-09-05T00:00:00.000Z'),
    }).lean();

    expect(persisted).not.toBeNull();
    // (20-4)*1 + (10-2)*2 = 16 + 16 = 32
    expect(persisted.totals.net_carbs_grams).toBe(32);
    expect(persisted.totals.net_carbs_grams).not.toBe(0);
  });

  test('floors at zero when fiber exceeds carbs (never goes negative)', async () => {
    const food = await makeFood({ nutrition: nutrition({ carbs_grams: 2, fiber_grams: 9 }) });
    await FoodLog.create({
      user_id: ALICE,
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      meal_type: 'snack',
      food_item_id: food._id,
      servings: 1,
      nutrition: nutrition({ carbs_grams: 2, fiber_grams: 9 }),
    });

    await DailySummary.updateFromLogs(ALICE, '2026-09-05');
    const persisted = await DailySummary.findOne({ user_id: ALICE }).lean();
    expect(persisted.totals.net_carbs_grams).toBe(0);
  });

  test('a prior write does not erase net_carbs_grams on a later gateway write (regression guard)', async () => {
    const food = await makeFood({ nutrition: nutrition({ carbs_grams: 20, fiber_grams: 4 }) });
    await FoodLog.create({
      user_id: ALICE,
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      meal_type: 'breakfast',
      food_item_id: food._id,
      servings: 1,
      nutrition: nutrition({ carbs_grams: 20, fiber_grams: 4 }),
    });

    await DailySummary.updateFromLogs(ALICE, '2026-09-05');
    // Simulate the dashboard re-reading the day, which re-runs updateFromLogs
    // on the gateway hot path (resolvers.js `dailySummary` query).
    await DailySummary.updateFromLogs(ALICE, '2026-09-05');

    const persisted = await DailySummary.findOne({ user_id: ALICE }).lean();
    expect(persisted.totals.net_carbs_grams).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// PRE-2 — toUtcMidnight replaces the hand-rolled toUtcDate
// ---------------------------------------------------------------------------

describe('PRE-2 — date normalization no longer mangles ISO instants', () => {
  test('DailySummary.getOrCreate: YYYY-MM-DD string lands on that day', async () => {
    const summary = await DailySummary.getOrCreate(ALICE, '2026-09-05');
    expect(summary.date.toISOString()).toBe('2026-09-05T00:00:00.000Z');
  });

  test('DailySummary.getOrCreate: a Date input lands on its own UTC day', async () => {
    const summary = await DailySummary.getOrCreate(ALICE, new Date('2026-09-05T00:00:00.000Z'));
    expect(summary.date.toISOString()).toBe('2026-09-05T00:00:00.000Z');
  });

  test('DailySummary.getOrCreate: an ISO-instant string does NOT roll back to Aug 31', async () => {
    // Number('05T14:00:00Z') is NaN — the bug the old toUtcDate had.
    const summary = await DailySummary.getOrCreate(ALICE, '2026-09-05T14:00:00Z');
    expect(summary.date.toISOString()).toBe('2026-09-05T00:00:00.000Z');
    expect(summary.date.toISOString()).not.toBe('2026-08-31T00:00:00.000Z');
  });

  test('FoodLog.getLogsForDate: YYYY-MM-DD string matches logs on that day', async () => {
    const food = await makeFood();
    await FoodLog.create({
      user_id: ALICE,
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      meal_type: 'breakfast',
      food_item_id: food._id,
      servings: 1,
    });
    const logs = await FoodLog.getLogsForDate(ALICE, '2026-09-05');
    expect(logs).toHaveLength(1);
  });

  test('FoodLog.getLogsForDate: a Date input matches logs on that day', async () => {
    const food = await makeFood();
    await FoodLog.create({
      user_id: ALICE,
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      meal_type: 'breakfast',
      food_item_id: food._id,
      servings: 1,
    });
    const logs = await FoodLog.getLogsForDate(ALICE, new Date('2026-09-05T00:00:00.000Z'));
    expect(logs).toHaveLength(1);
  });

  test('FoodLog.getLogsForDate: an ISO-instant input does not silently search Aug 31', async () => {
    const food = await makeFood();
    await FoodLog.create({
      user_id: ALICE,
      log_date: new Date('2026-09-05T00:00:00.000Z'),
      meal_type: 'breakfast',
      food_item_id: food._id,
      servings: 1,
    });
    const logs = await FoodLog.getLogsForDate(ALICE, '2026-09-05T14:00:00Z');
    expect(logs).toHaveLength(1);

    const wrongDayLogs = await FoodLog.getLogsForDate(ALICE, '2026-08-31T14:00:00Z');
    expect(wrongDayLogs).toHaveLength(0);
  });
});
