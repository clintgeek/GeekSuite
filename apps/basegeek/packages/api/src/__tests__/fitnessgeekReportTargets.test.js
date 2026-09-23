// fitnessFoodReportOverview returns the plan's targets (the day ribbon's
// compliance colouring read `targets`, which was never returned) and how many
// days the averages cover. Real models on the suite's in-memory Mongo.
import mongoose from 'mongoose';
import { describe, test, expect, beforeAll, afterEach, afterAll } from '@jest/globals';

const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');
const { default: BodyComposition } = await import('../graphql/fitnessgeek/models/BodyComposition.js');
const { resolvers } = await import('../graphql/fitnessgeek/resolvers.js');

const USER = String(new mongoose.Types.ObjectId());
const ctx = { user: { id: USER } };

beforeAll(async () => { await UserSettings.db.asPromise(); }, 60000);
afterEach(async () => { await Promise.all([UserSettings.deleteMany({}), BodyComposition.deleteMany({})]); });
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
