/**
 * fitnessgeekHouseholdFoods.test.js — review 2026-10-16, B9 / C4 / C5.
 *
 *   C4. A household member's private food may be READ for logging, copying
 *       and re-logging — never edited or deleted, and search is unchanged.
 *       Outside the household it is still "Food item not found".
 *   C5. A tapped AI search result becomes the tapper's food (user_id set),
 *       not a global catalog row. Catalog sources stay global.
 */

import mongoose from 'mongoose';

const { default: FoodItem } = await import('../graphql/fitnessgeek/models/FoodItem.js');
const { default: FoodLog } = await import('../graphql/fitnessgeek/models/FoodLog.js');
const { default: Meal } = await import('../graphql/fitnessgeek/models/Meal.js');
const { default: DailySummary } = await import('../graphql/fitnessgeek/models/DailySummary.js');
const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');
const { resolvers } = await import('../graphql/fitnessgeek/resolvers.js');

const CHEF = String(new mongoose.Types.ObjectId());
const HEATHER = String(new mongoose.Types.ObjectId());
const STRANGER = String(new mongoose.Types.ObjectId());
const ctx = (userId) => ({ user: { id: userId } });
const Q = resolvers.Query;
const M = resolvers.Mutation;

const household = (userId, household_id, name = 'Member') =>
  UserSettings.create({
    user_id: userId,
    household: { household_id, display_name: name, share_food_logs: true, share_meals: true },
  });

const chefsFood = (overrides = {}) =>
  FoodItem.create({
    name: 'Chef chili',
    nutrition: { calories_per_serving: 420, protein_grams: 30 },
    serving: { size: 1, unit: 'bowl' },
    source: 'custom',
    user_id: CHEF,
    ...overrides,
  });

const logInput = (food) => ({
  input: { log_date: '2026-10-15', meal_type: 'dinner', servings: 1, food_item_id: String(food._id) },
});

beforeAll(async () => {
  await Meal.db.asPromise();
}, 60000);

beforeEach(async () => {
  await household(CHEF, 'CROCKER01', 'Chef');
  await household(HEATHER, 'CROCKER01', 'Heather');
  await household(STRANGER, 'OTHERS0001', 'Stranger');
});

afterEach(async () => {
  await Promise.all([
    FoodItem.deleteMany({}),
    FoodLog.deleteMany({}),
    Meal.deleteMany({}),
    DailySummary.deleteMany({}),
    UserSettings.deleteMany({}),
  ]);
});

afterAll(async () => {
  await Meal.db.close();
  try {
    const { getAIGeekConnection } = await import('../config/database.js');
    await getAIGeekConnection().close();
  } catch { /* not opened */ }
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('C4 — household members can log each other\'s foods', () => {
  test('Heather logs a food Chef owns (same household)', async () => {
    const chili = await chefsFood();
    const log = await M.addFoodLog(null, logInput(chili), ctx(HEATHER));
    expect(log.user_id).toBe(HEATHER);
    expect(String(log.food_item_id._id)).toBe(String(chili._id));
  });

  test('a user outside the household still gets "Food item not found"', async () => {
    const chili = await chefsFood();
    await expect(M.addFoodLog(null, logInput(chili), ctx(STRANGER))).rejects.toThrow('Food item not found');
    expect(await FoodLog.countDocuments({ user_id: STRANGER })).toBe(0);
  });

  test('leaving the household takes the access with it', async () => {
    const chili = await chefsFood();
    await UserSettings.updateOne({ user_id: HEATHER }, { $unset: { 'household.household_id': '' } });
    await expect(M.addFoodLog(null, logInput(chili), ctx(HEATHER))).rejects.toThrow('Food item not found');
  });

  test('re-logging (updateFoodLog with the food id) and saving a meal work too', async () => {
    const chili = await chefsFood();
    const mine = await FoodItem.create({
      name: 'toast', nutrition: { calories_per_serving: 90 }, serving: { size: 1, unit: 'slice' }, source: 'custom', user_id: HEATHER,
    });
    const log = await M.addFoodLog(null, logInput(mine), ctx(HEATHER));
    const moved = await M.updateFoodLog(null, { id: String(log._id), input: { food_item_id: String(chili._id) } }, ctx(HEATHER));
    expect(String(moved.food_item_id._id)).toBe(String(chili._id));

    const meal = await M.addFitnessMeal(
      null,
      { input: { name: 'chili night', meal_type: 'dinner', food_items: [{ food_item_id: String(chili._id), servings: 1 }] } },
      ctx(HEATHER)
    );
    expect(meal.food_items).toHaveLength(1);
  });

  test('read only: Heather cannot edit or delete Chef\'s food', async () => {
    const chili = await chefsFood();
    await expect(
      M.updateFitnessFood(null, { id: String(chili._id), input: { name: 'mine now' } }, ctx(HEATHER))
    ).rejects.toThrow('Food item not found or unauthorized');
    expect(await M.deleteFitnessFood(null, { id: String(chili._id) }, ctx(HEATHER))).toBe(false);
    const after = await FoodItem.findById(chili._id);
    expect(after.name).toBe('Chef chili');
    expect(after.is_deleted).toBe(false);
  });

  test('search is not widened: Chef\'s private food is not in Heather\'s search', async () => {
    await chefsFood();
    const found = await Q.fitnessFoods(null, { search: 'chili' }, ctx(HEATHER));
    expect(found).toHaveLength(0);
  });
});

describe('B9 — copyFitnessMeal from a household member', () => {
  const seedChefDinner = async () => {
    const chili = await chefsFood();
    await FoodLog.create({
      user_id: CHEF,
      log_date: new Date('2026-10-14T00:00:00Z'),
      meal_type: 'dinner',
      food_item_id: chili._id,
      servings: 1,
      nutrition: { calories_per_serving: 420, protein_grams: 30 },
    });
    return chili;
  };

  test('the copy lands, and then re-logs from Heather\'s side', async () => {
    const chili = await seedChefDinner();
    const copied = await Promise.all(await M.copyFitnessMeal(
      null,
      { from_date: '2026-10-14', to_date: '2026-10-15', from_meal_type: 'dinner', from_user_id: CHEF },
      ctx(HEATHER)
    ));
    expect(copied).toHaveLength(1);
    expect(String(copied[0].food_item_id._id)).toBe(String(chili._id));
    // The "Again" chip / re-log path: a plain addFoodLog with that id.
    await expect(M.addFoodLog(null, logInput(chili), ctx(HEATHER))).resolves.toBeTruthy();
  });

  test('a food the copier cannot read refuses the whole copy, writing nothing', async () => {
    // A log pointing at a third party's private food — not readable by Heather.
    const strangers = await FoodItem.create({
      name: 'secret shake', nutrition: { calories_per_serving: 300 }, serving: { size: 1, unit: 'cup' }, source: 'custom', user_id: STRANGER,
    });
    await seedChefDinner();
    await FoodLog.create({
      user_id: CHEF, log_date: new Date('2026-10-14T00:00:00Z'), meal_type: 'dinner', food_item_id: strangers._id, servings: 1,
    });
    await expect(M.copyFitnessMeal(
      null,
      { from_date: '2026-10-14', to_date: '2026-10-15', from_meal_type: 'dinner', from_user_id: CHEF },
      ctx(HEATHER)
    )).rejects.toThrow('Food item not found');
    expect(await FoodLog.countDocuments({ user_id: HEATHER })).toBe(0);
  });

  test('copying your own day still works when a food was since soft-deleted', async () => {
    const gone = await FoodItem.create({
      name: 'old bar', nutrition: { calories_per_serving: 200 }, serving: { size: 1, unit: 'bar' }, source: 'custom', user_id: HEATHER, is_deleted: true,
    });
    await FoodLog.create({
      user_id: HEATHER, log_date: new Date('2026-10-14T00:00:00Z'), meal_type: 'snack', food_item_id: gone._id, servings: 1,
      nutrition: { calories_per_serving: 200 },
    });
    const copied = await M.copyFitnessMeal(null, { from_date: '2026-10-14', to_date: '2026-10-15' }, ctx(HEATHER));
    expect(copied).toHaveLength(1);
  });
});

describe('logMeal re-checks that the caller can read every food', () => {
  const mealWith = (userId, foods) =>
    Meal.create({
      name: 'Shared plate', meal_type: 'dinner', user_id: userId,
      food_items: foods.map((f) => ({ food_item_id: f._id, servings: 1 })),
    });

  test('a food the caller cannot read refuses the whole meal, logging nothing', async () => {
    const strangers = await FoodItem.create({
      name: 'secret shake', nutrition: { calories_per_serving: 300 }, serving: { size: 1, unit: 'cup' }, source: 'custom', user_id: STRANGER,
    });
    const mine = await FoodItem.create({
      name: 'my toast', nutrition: { calories_per_serving: 90 }, serving: { size: 1, unit: 'slice' }, source: 'custom', user_id: HEATHER,
    });
    const meal = await mealWith(HEATHER, [mine, strangers]);
    await expect(M.logMeal(null, { mealId: String(meal._id), date: '2026-10-15' }, ctx(HEATHER)))
      .rejects.toThrow('Food item not found');
    expect(await FoodLog.countDocuments({ user_id: HEATHER })).toBe(0);
  });

  test('a household member\'s food and the caller\'s own still log', async () => {
    const chili = await chefsFood();
    const meal = await mealWith(HEATHER, [chili]);
    const logs = await M.logMeal(null, { mealId: String(meal._id), date: '2026-10-15' }, ctx(HEATHER));
    expect(logs).toHaveLength(1);
  });
});

describe('C5 — a tapped AI result belongs to whoever tapped it', () => {
  const aiResult = (overrides = {}) => ({
    id: 'ai_123',
    name: 'arroz con pollo',
    brand: 'AI estimate',
    serving_size: 1,
    serving_unit: 'plate',
    nutrition: { calories_per_serving: 650, protein_grams: 35, carbs_grams: 70, fat_grams: 20, fiber_grams: 3, sugar_grams: 4, sodium_mg: 900 },
    source: 'ai',
    source_id: 'ai_arroz_con_pollo',
    ...overrides,
  });
  const logAi = (userId, food = aiResult()) =>
    M.addFoodLog(null, { input: { log_date: '2026-10-15', meal_type: 'dinner', servings: 1, food_item: food } }, ctx(userId));

  test('the new row carries the tapper\'s user_id, not null', async () => {
    await logAi(HEATHER);
    const rows = await FoodItem.find({});
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(HEATHER);
    expect(rows[0].source).toBe('ai');
  });

  test('tapping it again reuses her row; a stranger gets their own', async () => {
    await logAi(HEATHER);
    await logAi(HEATHER);
    expect(await FoodItem.countDocuments({ user_id: HEATHER })).toBe(1);
    await logAi(STRANGER);
    expect(await FoodItem.countDocuments({ user_id: STRANGER })).toBe(1);
    // and the stranger's log does not point at Heather's row
    const strangerLog = await FoodLog.findOne({ user_id: STRANGER });
    const row = await FoodItem.findById(strangerLog.food_item_id);
    expect(row.user_id).toBe(STRANGER);
  });

  test('an existing global AI row is reused and left global', async () => {
    const legacy = await FoodItem.create({
      name: 'arroz con pollo', brand: 'AI estimate', nutrition: { calories_per_serving: 640 }, serving: { size: 1, unit: 'plate' },
      source: 'ai', source_id: 'ai_arroz_con_pollo', user_id: null,
    });
    const log = await logAi(HEATHER);
    expect(String(log.food_item_id._id)).toBe(String(legacy._id));
    expect((await FoodItem.findById(legacy._id)).user_id).toBeNull();
    expect(await FoodItem.countDocuments({})).toBe(1);
  });

  test('catalog sources are unchanged: a USDA result is still global', async () => {
    await logAi(HEATHER, aiResult({ id: 'usda_1', source: 'usda', source_id: '1', name: 'rice', brand: undefined }));
    const row = await FoodItem.findOne({ source: 'usda' });
    expect(row.user_id).toBeNull();
  });
});
