/**
 * fitnessgeekOwnership.test.js
 *
 * Ownership/IDOR coverage for the fitnessgeek GraphQL module.
 *
 *   1. Personal data (meals, food logs, weights, blood pressure, medications,
 *      summaries, goals, settings) is readable/writable only by its owner.
 *   2. Unauthenticated calls are rejected.
 *   3. The FoodItem catalog stays deliberately shared: entries with no
 *      `user_id` are global and readable by everybody, while another user's
 *      PRIVATE custom food is not.
 *   4. The data-access layer itself refuses to run unscoped.
 */

import mongoose from 'mongoose';

const { default: FoodItem } = await import('../graphql/fitnessgeek/models/FoodItem.js');
const { default: FoodLog } = await import('../graphql/fitnessgeek/models/FoodLog.js');
const { default: Meal } = await import('../graphql/fitnessgeek/models/Meal.js');
const { default: Weight } = await import('../graphql/fitnessgeek/models/Weight.js');
const { default: BloodPressure } = await import('../graphql/fitnessgeek/models/BloodPressure.js');
const { default: Medication } = await import('../graphql/fitnessgeek/models/Medication.js');
const { default: DailySummary } = await import('../graphql/fitnessgeek/models/DailySummary.js');
const { default: NutritionGoals } = await import('../graphql/fitnessgeek/models/NutritionGoals.js');
const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');
const { resolvers } = await import('../graphql/fitnessgeek/resolvers.js');

const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: userId } } : {});

const Q = resolvers.Query;
const M = resolvers.Mutation;

const makeFood = (overrides = {}) =>
  FoodItem.create({
    name: 'oats',
    nutrition: { calories_per_serving: 150, protein_grams: 5 },
    serving: { size: 100, unit: 'g' },
    source: 'custom',
    user_id: ALICE,
    ...overrides,
  });

const makeMeal = (food, overrides = {}) =>
  Meal.create({
    name: 'alice breakfast',
    meal_type: 'breakfast',
    user_id: ALICE,
    food_items: [{ food_item_id: food._id, servings: 2 }],
    ...overrides,
  });

const makeLog = (food, overrides = {}) =>
  FoodLog.create({
    user_id: ALICE,
    log_date: new Date('2026-03-01T00:00:00Z'),
    meal_type: 'breakfast',
    food_item_id: food._id,
    servings: 1,
    ...overrides,
  });

beforeAll(async () => {
  await Meal.db.asPromise();
}, 60000);

afterEach(async () => {
  await Promise.all([
    FoodItem.deleteMany({}),
    FoodLog.deleteMany({}),
    Meal.deleteMany({}),
    Weight.deleteMany({}),
    BloodPressure.deleteMany({}),
    Medication.deleteMany({}),
    DailySummary.deleteMany({}),
    NutritionGoals.deleteMany({}),
    UserSettings.deleteMany({}),
  ]);
});

afterAll(async () => {
  await Meal.db.close();
  // resolvers.js pulls in aiService, which opens the aiGeek connection at
  // import time — close it so Jest can exit cleanly.
  try {
    const { getAIGeekConnection } = await import('../config/database.js');
    await getAIGeekConnection().close();
  } catch { /* not opened */ }
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('meals — personal data', () => {
  test('fitnessMeal returns null for another user’s meal', async () => {
    const meal = await makeMeal(await makeFood());
    expect(await Q.fitnessMeal(null, { id: String(meal._id) }, ctx(ALICE))).not.toBeNull();
    expect(await Q.fitnessMeal(null, { id: String(meal._id) }, ctx(BOB))).toBeNull();
  });

  test('fitnessMeals lists only the caller’s meals', async () => {
    const food = await makeFood();
    await makeMeal(food);
    await makeMeal(food, { name: 'bob dinner', meal_type: 'dinner', user_id: BOB });
    const forBob = await Q.fitnessMeals(null, {}, ctx(BOB));
    expect(forBob).toHaveLength(1);
    expect(forBob[0].name).toBe('bob dinner');
  });

  test('logMeal cannot log another user’s meal', async () => {
    const meal = await makeMeal(await makeFood());
    await expect(
      M.logMeal(null, { mealId: String(meal._id), date: '2026-03-02', mealType: 'lunch' }, ctx(BOB))
    ).rejects.toThrow('Meal not found');
    expect(await FoodLog.countDocuments({ user_id: BOB })).toBe(0);
  });

  test('logMeal works for the owner', async () => {
    const meal = await makeMeal(await makeFood());
    const logs = await M.logMeal(
      null,
      { mealId: String(meal._id), date: '2026-03-02', mealType: 'lunch' },
      ctx(ALICE)
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].user_id).toBe(ALICE);
  });

  test('updateFitnessMeal / deleteFitnessMeal cannot touch another user’s meal', async () => {
    const meal = await makeMeal(await makeFood());
    await expect(
      M.updateFitnessMeal(null, { id: String(meal._id), input: { name: 'pwned' } }, ctx(BOB))
    ).rejects.toThrow('Meal not found or unauthorized');
    expect(await M.deleteFitnessMeal(null, { id: String(meal._id) }, ctx(BOB))).toBe(false);
    const fresh = await Meal.findById(meal._id);
    expect(fresh.name).toBe('alice breakfast');
    expect(fresh.is_deleted).toBe(false);
  });

  test('updateFitnessMeal no longer writes to ownerless (shared) meals', async () => {
    const meal = await makeMeal(await makeFood(), { user_id: null, name: 'seeded meal' });
    await expect(
      M.updateFitnessMeal(null, { id: String(meal._id), input: { name: 'pwned' } }, ctx(BOB))
    ).rejects.toThrow('Meal not found or unauthorized');
    expect((await Meal.findById(meal._id)).name).toBe('seeded meal');
  });

  test('a meal cannot reference another user’s private food', async () => {
    const alicePrivate = await makeFood({ name: 'secret shake' });
    await expect(
      M.addFitnessMeal(
        null,
        { input: { name: 'probe', meal_type: 'snack', food_items: [{ food_item_id: String(alicePrivate._id), servings: 1 }] } },
        ctx(BOB)
      )
    ).rejects.toThrow('Food item not found');
    expect(await Meal.countDocuments({ user_id: BOB })).toBe(0);
  });
});

describe('food logs — personal data', () => {
  test('foodLog / updateFoodLog / deleteFoodLog are owner-scoped', async () => {
    const log = await makeLog(await makeFood());
    expect(await Q.foodLog(null, { id: String(log._id) }, ctx(BOB))).toBeNull();
    await expect(
      M.updateFoodLog(null, { id: String(log._id), input: { servings: 99 } }, ctx(BOB))
    ).rejects.toThrow('Food log not found');
    expect(await M.deleteFoodLog(null, { id: String(log._id) }, ctx(BOB))).toBe(false);
    expect((await FoodLog.findById(log._id)).servings).toBe(1);
  });

  test('foodLogs returns only the caller’s entries', async () => {
    const food = await makeFood();
    await makeLog(food);
    await makeLog(food, { user_id: BOB, servings: 3 });
    const logs = await Q.foodLogs(null, { date: '2026-03-01' }, ctx(BOB));
    expect(logs).toHaveLength(1);
    expect(logs[0].user_id).toBe(BOB);
  });

  test('addFoodLog rejects another user’s private food', async () => {
    const alicePrivate = await makeFood({ name: 'secret shake' });
    await expect(
      M.addFoodLog(
        null,
        { input: { log_date: new Date(), meal_type: 'snack', food_item_id: String(alicePrivate._id), servings: 1 } },
        ctx(BOB)
      )
    ).rejects.toThrow('Food item not found');
    expect(await FoodLog.countDocuments({ user_id: BOB })).toBe(0);
  });

  test('updateFoodLog rejects re-pointing at another user’s private food', async () => {
    const alicePrivate = await makeFood({ name: 'secret shake' });
    const bobFood = await makeFood({ name: 'bob rice', user_id: BOB });
    const bobLog = await makeLog(bobFood, { user_id: BOB });
    await expect(
      M.updateFoodLog(null, { id: String(bobLog._id), input: { food_item_id: String(alicePrivate._id) } }, ctx(BOB))
    ).rejects.toThrow('Food item not found');
  });
});

describe('weights, blood pressure, medications — personal data', () => {
  test('weight reads and writes are owner-scoped', async () => {
    const w = await Weight.create({ userId: ALICE, weight_value: 180, log_date: new Date() });
    expect(await Q.fitnessWeight(null, { id: String(w._id) }, ctx(BOB))).toBeNull();
    expect(await Q.fitnessWeights(null, {}, ctx(BOB))).toHaveLength(0);
    await expect(
      M.updateFitnessWeight(null, { id: String(w._id), input: { weight_value: 1 } }, ctx(BOB))
    ).rejects.toThrow('Weight record not found');
    expect(await M.deleteFitnessWeight(null, { id: String(w._id) }, ctx(BOB))).toBe(false);
    expect((await Weight.findById(w._id)).weight_value).toBe(180);
  });

  test('blood pressure reads and writes are owner-scoped', async () => {
    const bp = await BloodPressure.create({ userId: ALICE, systolic: 120, diastolic: 80, log_date: new Date() });
    expect(await Q.bloodPressure(null, { id: String(bp._id) }, ctx(BOB))).toBeNull();
    expect(await Q.bloodPressures(null, {}, ctx(BOB))).toHaveLength(0);
    await expect(
      M.updateBloodPressure(null, { id: String(bp._id), input: { systolic: 190 } }, ctx(BOB))
    ).rejects.toThrow('Blood pressure record not found');
    expect(await M.deleteBloodPressure(null, { id: String(bp._id) }, ctx(BOB))).toBe(false);
  });

  test('medication reads and writes are owner-scoped', async () => {
    const med = await Medication.create({ user_id: ALICE, display_name: 'lisinopril' });
    expect(await Q.fitnessMedication(null, { id: String(med._id) }, ctx(BOB))).toBeNull();
    expect(await Q.fitnessMedications(null, {}, ctx(BOB))).toHaveLength(0);
    await expect(
      M.updateFitnessMedication(null, { id: String(med._id), input: { display_name: 'pwned' } }, ctx(BOB))
    ).rejects.toThrow('Medication not found');
    expect(await M.deleteFitnessMedication(null, { id: String(med._id) }, ctx(BOB))).toBe(false);
    expect((await Medication.findById(med._id)).display_name).toBe('lisinopril');
  });
});

describe('food catalog — intentionally shared', () => {
  test('global foods stay readable by everybody', async () => {
    const global = await makeFood({ name: 'banana', user_id: null, source: 'usda' });
    expect((await Q.fitnessFood(null, { id: String(global._id) }, ctx(ALICE))).name).toBe('banana');
    expect((await Q.fitnessFood(null, { id: String(global._id) }, ctx(BOB))).name).toBe('banana');

    const names = (await Q.fitnessFoods(null, {}, ctx(BOB))).map((f) => f.name);
    expect(names).toContain('banana');
  });

  test('a global food can be logged by any user', async () => {
    const global = await makeFood({ name: 'banana', user_id: null, source: 'usda' });
    const log = await M.addFoodLog(
      null,
      { input: { log_date: new Date(), meal_type: 'snack', food_item_id: String(global._id), servings: 1 } },
      ctx(BOB)
    );
    expect(log.user_id).toBe(BOB);
  });

  test('another user’s PRIVATE custom food is not readable', async () => {
    const alicePrivate = await makeFood({ name: 'secret shake' });
    expect(await Q.fitnessFood(null, { id: String(alicePrivate._id) }, ctx(BOB))).toBeNull();
    const names = (await Q.fitnessFoods(null, {}, ctx(BOB))).map((f) => f.name);
    expect(names).not.toContain('secret shake');
  });

  test('catalog writes stay owner-scoped (global rows are not editable)', async () => {
    const global = await makeFood({ name: 'banana', user_id: null, source: 'usda' });
    const alicePrivate = await makeFood({ name: 'secret shake' });
    await expect(
      M.updateFitnessFood(null, { id: String(global._id), input: { name: 'pwned' } }, ctx(BOB))
    ).rejects.toThrow('Food item not found or unauthorized');
    await expect(
      M.updateFitnessFood(null, { id: String(alicePrivate._id), input: { name: 'pwned' } }, ctx(BOB))
    ).rejects.toThrow('Food item not found or unauthorized');
    expect(await M.deleteFitnessFood(null, { id: String(alicePrivate._id) }, ctx(BOB))).toBe(false);
    expect((await FoodItem.findById(global._id)).name).toBe('banana');
  });
});

describe('household — consent-gated sharing', () => {
  const joinHousehold = (userId, overrides = {}) =>
    UserSettings.create({
      user_id: userId,
      household: { household_id: 'ABC123', display_name: userId, share_food_logs: true, share_meals: true, ...overrides },
    });

  test('a household member’s logs are readable when sharing is on', async () => {
    await joinHousehold(ALICE);
    await joinHousehold(BOB);
    await makeLog(await makeFood());
    const logs = await Q.fitnessHouseholdMemberLogs(null, { memberId: ALICE, date: '2026-03-01' }, ctx(BOB));
    expect(logs).toHaveLength(1);
  });

  test('sharing off, or no shared household, denies the read', async () => {
    await joinHousehold(ALICE, { share_food_logs: false });
    await joinHousehold(BOB);
    await expect(
      Q.fitnessHouseholdMemberLogs(null, { memberId: ALICE, date: '2026-03-01' }, ctx(BOB))
    ).rejects.toThrow('has not enabled food log sharing');

    const CAROL = String(new mongoose.Types.ObjectId());
    await UserSettings.create({ user_id: CAROL, household: { household_id: 'ZZZ999' } });
    await expect(
      Q.fitnessHouseholdMemberLogs(null, { memberId: ALICE, date: '2026-03-01' }, ctx(CAROL))
    ).rejects.toThrow('not in your household');
  });

  test('updateFitnessUserSettings cannot graft the caller onto a household', async () => {
    await joinHousehold(ALICE);
    await M.updateFitnessUserSettings(null, { input: { household: { household_id: 'ABC123' } } }, ctx(BOB));
    const bob = await UserSettings.findOne({ user_id: BOB });
    expect(bob?.household?.household_id ?? null).toBeNull();
  });
});

describe('authentication', () => {
  test('unauthenticated queries are rejected', async () => {
    for (const call of [
      () => Q.fitnessMeal(null, { id: String(new mongoose.Types.ObjectId()) }, ctx(null)),
      () => Q.fitnessMeals(null, {}, ctx(null)),
      () => Q.fitnessFood(null, { id: String(new mongoose.Types.ObjectId()) }, ctx(null)),
      () => Q.fitnessFoods(null, {}, ctx(null)),
      () => Q.foodLogs(null, { date: '2026-03-01' }, ctx(null)),
      () => Q.fitnessWeights(null, {}, ctx(null)),
      () => Q.bloodPressures(null, {}, ctx(null)),
      () => Q.dailySummary(null, { date: '2026-03-01' }, ctx(null)),
      () => Q.fitnessUserSettings(null, {}, ctx(null)),
    ]) {
      await expect(call()).rejects.toThrow('Unauthorized');
    }
  });

  test('unauthenticated mutations are rejected', async () => {
    const id = String(new mongoose.Types.ObjectId());
    for (const call of [
      () => M.logMeal(null, { mealId: id, date: '2026-03-01' }, ctx(null)),
      () => M.addFitnessMeal(null, { input: { name: 'x', meal_type: 'snack' } }, ctx(null)),
      () => M.updateFitnessMeal(null, { id, input: { name: 'x' } }, ctx(null)),
      () => M.deleteFitnessMeal(null, { id }, ctx(null)),
      () => M.addFoodLog(null, { input: { food_item_id: id, servings: 1 } }, ctx(null)),
      () => M.updateFoodLog(null, { id, input: {} }, ctx(null)),
      () => M.deleteFoodLog(null, { id }, ctx(null)),
      () => M.addFitnessFood(null, { input: { name: 'x' } }, ctx(null)),
      () => M.updateFitnessFood(null, { id, input: {} }, ctx(null)),
      () => M.deleteFitnessFood(null, { id }, ctx(null)),
      () => M.addFitnessWeight(null, { input: { weight_value: 1 } }, ctx(null)),
      () => M.updateFitnessWeight(null, { id, input: {} }, ctx(null)),
      () => M.deleteFitnessWeight(null, { id }, ctx(null)),
      () => M.addBloodPressure(null, { input: { systolic: 120, diastolic: 80 } }, ctx(null)),
      () => M.updateBloodPressure(null, { id, input: {} }, ctx(null)),
      () => M.deleteBloodPressure(null, { id }, ctx(null)),
      () => M.addFitnessMedication(null, { input: { display_name: 'x' } }, ctx(null)),
      () => M.updateFitnessMedication(null, { id, input: {} }, ctx(null)),
      () => M.deleteFitnessMedication(null, { id }, ctx(null)),
      () => M.setNutritionGoals(null, { input: {} }, ctx(null)),
      () => M.updateFitnessUserSettings(null, { input: {} }, ctx(null)),
      () => M.refreshDailySummary(null, { date: '2026-03-01' }, ctx(null)),
      () => M.recordLoginStreak(null, {}, ctx(null)),
      () => M.copyFitnessMeal(null, { from_date: '2026-03-01', to_date: '2026-03-02' }, ctx(null)),
    ]) {
      await expect(call()).rejects.toThrow('Unauthorized');
    }
    expect(await FoodLog.countDocuments({})).toBe(0);
    expect(await Meal.countDocuments({})).toBe(0);
  });
});

describe('data-access layer fails closed', () => {
  test('model statics refuse to run without a user', async () => {
    await expect(Meal.getActiveMeals()).rejects.toThrow('Unauthorized');
    await expect(Meal.getMealsByType('breakfast')).rejects.toThrow('Unauthorized');
    await expect(Meal.findOwned(String(new mongoose.Types.ObjectId()))).rejects.toThrow('Unauthorized');
    await expect(FoodLog.getLogsForDate(undefined, '2026-03-01')).rejects.toThrow('Unauthorized');
    await expect(FoodLog.getRecentLogs()).rejects.toThrow('Unauthorized');
    await expect(DailySummary.updateFromLogs(undefined, '2026-03-01')).rejects.toThrow('Unauthorized');
    await expect(NutritionGoals.getActiveGoals()).rejects.toThrow('Unauthorized');
    await expect(UserSettings.getOrCreate()).rejects.toThrow('Unauthorized');
    await expect(FoodItem.findAccessible(String(new mongoose.Types.ObjectId()))).rejects.toThrow('Unauthorized');
  });

  test('malformed ids resolve as not-found instead of throwing a CastError', async () => {
    expect(await Q.fitnessMeal(null, { id: 'not-an-objectid' }, ctx(ALICE))).toBeNull();
    expect(await Q.fitnessFood(null, { id: 'not-an-objectid' }, ctx(ALICE))).toBeNull();
    expect(await Q.foodLog(null, { id: 'not-an-objectid' }, ctx(ALICE))).toBeNull();
    await expect(
      M.logMeal(null, { mealId: 'not-an-objectid', date: '2026-03-01' }, ctx(ALICE))
    ).rejects.toThrow('Meal not found');
    expect(await M.deleteFitnessMeal(null, { id: 'not-an-objectid' }, ctx(ALICE))).toBe(false);
  });
});
