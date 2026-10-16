/**
 * fitnessgeekFoodLogEdit.test.js — review 2026-10-16: C3 and the report
 * window (P2).
 *
 *   C3. `updateFoodLog` takes `log_date` (moves the entry) and per-serving
 *       calorie/macro overrides on the log's own snapshot, validated, owner
 *       only. The day's summary follows the snapshot, and a move recomputes
 *       both days.
 *   P2. The food reports take `end` — the caller's local today — so the
 *       window no longer ends on the server's UTC today.
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { default: FoodItem } = await import('../graphql/fitnessgeek/models/FoodItem.js');
const { default: FoodLog } = await import('../graphql/fitnessgeek/models/FoodLog.js');
const { default: DailySummary } = await import('../graphql/fitnessgeek/models/DailySummary.js');
const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');

const HEATHER = String(new mongoose.Types.ObjectId());
const CHEF = String(new mongoose.Types.ObjectId());

let server;
const run = async (query, variables = {}, userId = HEATHER) => {
  const res = await server.executeOperation(
    { query, variables },
    { contextValue: { user: userId ? { id: userId } : null } },
  );
  const r = res.body.singleResult;
  return { data: r.data ?? null, errors: r.errors ?? null };
};
const ok = async (...a) => {
  const { data, errors } = await run(...a);
  if (errors) throw new Error(JSON.stringify(errors));
  return data;
};

const UPDATE = `mutation ($id: ID!, $input: FoodLogUpdateInput!) {
  updateFoodLog(id: $id, input: $input) {
    id log_date servings
    nutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sodium_mg }
  }
}`;

const soup = () => FoodItem.create({
  name: 'chicken soup',
  nutrition: { calories_per_serving: 220, protein_grams: 15, carbs_grams: 20, fat_grams: 8, fiber_grams: 2, sodium_mg: 900 },
  serving: { size: 1, unit: 'bowl' },
  source: 'ai',
  user_id: HEATHER,
});

const logOf = async (food, overrides = {}) => FoodLog.create({
  user_id: HEATHER,
  log_date: new Date('2026-10-15T00:00:00Z'),
  meal_type: 'lunch',
  food_item_id: food._id,
  servings: 1,
  nutrition: { ...food.nutrition.toObject() },
  ...overrides,
});

const summaryCalories = async (day) =>
  (await DailySummary.findOne({ user_id: HEATHER, date: new Date(`${day}T00:00:00Z`) }))?.totals?.calories ?? null;

beforeAll(async () => {
  await FoodLog.db.asPromise();
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);

afterEach(async () => {
  await Promise.all([
    FoodItem.deleteMany({}), FoodLog.deleteMany({}), DailySummary.deleteMany({}), UserSettings.deleteMany({}),
  ]);
});

afterAll(async () => {
  await server.stop();
  await FoodLog.db.close();
  try {
    const { getAIGeekConnection } = await import('../config/database.js');
    await getAIGeekConnection().close();
  } catch { /* not opened */ }
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('C3 — calorie and macro overrides', () => {
  test('calories alone: the snapshot changes, the other macros stay, the food is untouched', async () => {
    const food = await soup();
    const log = await logOf(food);
    const { updateFoodLog } = await ok(UPDATE, { id: String(log._id), input: { calories: 300 } });
    expect(updateFoodLog.nutrition).toMatchObject({ calories_per_serving: 300, protein_grams: 15, carbs_grams: 20, fat_grams: 8, sodium_mg: 900 });
    expect((await FoodItem.findById(food._id)).nutrition.calories_per_serving).toBe(220);
  });

  test('all four overrides at once', async () => {
    const log = await logOf(await soup());
    const { updateFoodLog } = await ok(UPDATE, {
      id: String(log._id),
      input: { calories: 180, protein_grams: 12, carbs_grams: 16.5, fat_grams: 6 },
    });
    expect(updateFoodLog.nutrition).toMatchObject({ calories_per_serving: 180, protein_grams: 12, carbs_grams: 16.5, fat_grams: 6, fiber_grams: 2 });
  });

  test('a log with no snapshot is seeded from its food before the override', async () => {
    const food = await soup();
    const log = await logOf(food, { nutrition: undefined });
    const { updateFoodLog } = await ok(UPDATE, { id: String(log._id), input: { calories: 250 } });
    expect(updateFoodLog.nutrition).toMatchObject({ calories_per_serving: 250, protein_grams: 15, fat_grams: 8 });
  });

  test('the day\'s summary (the Home ring) follows the override', async () => {
    const log = await logOf(await soup(), { servings: 2 });
    await ok(UPDATE, { id: String(log._id), input: { calories: 300 } });
    expect(await summaryCalories('2026-10-15')).toBe(600);
  });

  test.each([
    [{ calories: -1 }, 'Calories must be between 0 and 10,000.'],
    [{ calories: 10001 }, 'Calories must be between 0 and 10,000.'],
    [{ protein_grams: 1001 }, 'Protein must be between 0 and 1,000 grams.'],
    [{ carbs_grams: -5 }, 'Carbs must be between 0 and 1,000 grams.'],
    [{ fat_grams: 5000 }, 'Fat must be between 0 and 1,000 grams.'],
  ])('refuses %j in plain words, writing nothing', async (input, message) => {
    const log = await logOf(await soup());
    const { errors } = await run(UPDATE, { id: String(log._id), input: { ...input, servings: 3 } });
    expect(errors[0].message).toBe(message);
    expect(errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const after = await FoodLog.findById(log._id);
    expect(after.servings).toBe(1);
    expect(after.nutrition.calories_per_serving).toBe(220);
  });

  test('zero is allowed (black coffee)', async () => {
    const log = await logOf(await soup());
    const { updateFoodLog } = await ok(UPDATE, { id: String(log._id), input: { calories: 0 } });
    expect(updateFoodLog.nutrition.calories_per_serving).toBe(0);
  });

  test('only the owner: Chef cannot edit Heather\'s log', async () => {
    const log = await logOf(await soup());
    const { errors } = await run(UPDATE, { id: String(log._id), input: { calories: 1 } }, CHEF);
    expect(errors[0].message).toBe('Food log not found');
    expect((await FoodLog.findById(log._id)).nutrition.calories_per_serving).toBe(220);
  });
});

describe('C3 — moving an entry to another day', () => {
  test('log_date moves it, and both days\' summaries are recomputed', async () => {
    const log = await logOf(await soup());
    // The 15th's summary as it stood with the entry on it.
    await DailySummary.updateFromLogs(HEATHER, '2026-10-15');
    expect(await summaryCalories('2026-10-15')).toBe(220);

    const { updateFoodLog } = await ok(UPDATE, { id: String(log._id), input: { log_date: '2026-10-14' } });
    expect(updateFoodLog.log_date).toBe('2026-10-14T00:00:00.000Z');
    expect(await summaryCalories('2026-10-14')).toBe(220);
    expect(await summaryCalories('2026-10-15')).toBe(0);
  });

  test.each(['1999-12-31', '2206-01-01'])('refuses a date that is not sane (%s)', async (day) => {
    const log = await logOf(await soup());
    const { errors } = await run(UPDATE, { id: String(log._id), input: { log_date: day } });
    expect(errors[0].message).toBe("That date doesn't look right. Pick a day on the calendar.");
    expect((await FoodLog.findById(log._id)).log_date.toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });

  test('an old frontend\'s servings-only edit still works', async () => {
    const log = await logOf(await soup());
    const { updateFoodLog } = await ok(UPDATE, { id: String(log._id), input: { servings: 2 } });
    expect(updateFoodLog.servings).toBe(2);
    expect(updateFoodLog.nutrition.calories_per_serving).toBe(220);
  });
});

describe('report window — the caller\'s own last day (P2)', () => {
  const OVERVIEW = `query ($end: String, $start: String, $days: Int) {
    fitnessFoodReportOverview(end: $end, start: $start, days: $days) { range days_logged }
  }`;
  const TRENDS = `query ($end: String, $days: Int) { fitnessFoodReportTrends(end: $end, days: $days) { range daily } }`;

  test('`end` anchors the overview on that day', async () => {
    const food = await soup();
    await logOf(food, { log_date: new Date('2026-10-09T00:00:00Z') }); // a day before the window
    await logOf(food, { log_date: new Date('2026-10-10T00:00:00Z') }); // the window's first day
    await logOf(food, { log_date: new Date('2026-10-16T00:00:00Z') }); // its last
    const { fitnessFoodReportOverview } = await ok(OVERVIEW, { end: '2026-10-16', days: 7 });
    expect(fitnessFoodReportOverview.range).toEqual({ start: '2026-10-10', end: '2026-10-16', days: 7 });
    expect(fitnessFoodReportOverview.days_logged).toBe(2);
  });

  test('`end` anchors the trends too', async () => {
    const { fitnessFoodReportTrends } = await ok(TRENDS, { end: '2026-10-16', days: 30 });
    expect(fitnessFoodReportTrends.range).toEqual({ start: '2026-09-17', end: '2026-10-16', days: 30 });
  });

  test('`start` still wins when both are sent', async () => {
    const { fitnessFoodReportOverview } = await ok(OVERVIEW, { start: '2026-10-01', end: '2026-10-16', days: 7 });
    expect(fitnessFoodReportOverview.range.start).toBe('2026-10-01');
  });

  test('a malformed `end` is refused in words', async () => {
    const { errors } = await run(OVERVIEW, { end: 'tomorrow', days: 7 });
    expect(errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
});
