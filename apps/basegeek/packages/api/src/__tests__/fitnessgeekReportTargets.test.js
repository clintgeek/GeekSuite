// fitnessFoodReportOverview returns the plan's targets (the day ribbon's
// compliance colouring read `targets`, which was never returned) and how many
// days the averages cover. Real models on the suite's in-memory Mongo.
import mongoose from 'mongoose';
import { describe, test, expect, beforeAll, afterEach, afterAll } from '@jest/globals';

const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');
const { default: BodyComposition } = await import('../graphql/fitnessgeek/models/BodyComposition.js');
const { default: FoodLog } = await import('../graphql/fitnessgeek/models/FoodLog.js');
const { resolvers } = await import('../graphql/fitnessgeek/resolvers.js');

const USER = String(new mongoose.Types.ObjectId());
const ctx = { user: { id: USER } };

beforeAll(async () => { await UserSettings.db.asPromise(); }, 60000);
afterEach(async () => { await Promise.all([UserSettings.deleteMany({}), BodyComposition.deleteMany({}), FoodLog.deleteMany({})]); });
afterAll(async () => {
  await UserSettings.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const report = () => resolvers.Query.fitnessFoodReportOverview(null, { start: '2026-09-17', days: 7 }, ctx);

describe('fitnessFoodReportOverview targets', () => {
  test('with a plan: calorie and macro targets from the same goal compliance uses', async () => {
    const s = await UserSettings.getOrCreate(USER);
    s.nutrition_goal = { enabled: true, daily_calorie_target: 1691, target_weight: 220, mode: 'standard' };
    await s.save();
    const r = await report();
    expect(r.targets.calories).toBe(1691);
    expect(r.targets.protein).toBe(176); // 0.8 g/lb × 220, no scan
    expect(r.targets.fat).toBe(77);
    expect(r.targets.carbs).toBeGreaterThan(0);
    expect(r.days_logged).toBe(0);
  });

  test('without a plan: no targets, not zeros', async () => {
    const r = await report();
    expect(r.targets).toBeNull();
  });
});

describe('fitnessFoodReportOverview sodium and net carbs (TRENDS_PLAN D6)', () => {
  // Invented values. Stored nutrition is per serving.
  const log = (day, n, servings = 1) => FoodLog.create({
    user_id: USER, log_date: new Date(`${day}T00:00:00.000Z`), meal_type: 'lunch',
    food_item_id: new mongoose.Types.ObjectId(), servings,
    nutrition: { calories_per_serving: 400, protein_grams: 30, carbs_grams: n.carbs, fat_grams: 10, fiber_grams: n.fiber, sugar_grams: 5, sodium_mg: n.sodium },
  });

  test('daily totals and averages carry sodium (mg) and net carbs (carbs − fiber, floored per log)', async () => {
    await log('2026-09-18', { carbs: 40, fiber: 10, sodium: 800 }, 2); // net 60, sodium 1600
    await log('2026-09-18', { carbs: 5, fiber: 8, sodium: 200 });      // net floors at 0, not -3
    await log('2026-09-20', { carbs: 30, fiber: 6, sodium: 1000 });    // net 24
    const r = await report();
    const byDate = Object.fromEntries(r.daily.map((d) => [d.date, d]));
    expect(byDate['2026-09-18']).toMatchObject({ sodium: 1800, net_carbs: 60 });
    expect(byDate['2026-09-20']).toMatchObject({ sodium: 1000, net_carbs: 24 });
    expect(r.averages).toMatchObject({ sodium: 1400, net_carbs: 42 });
    expect(r.days_logged).toBe(2);
  });
});

