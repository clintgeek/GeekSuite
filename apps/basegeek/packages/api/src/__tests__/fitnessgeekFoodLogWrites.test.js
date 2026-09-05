/**
 * fitnessgeekFoodLogWrites.test.js
 *
 * The gateway's food-log mutations have to be drop-in replacements for
 * fitnessgeek's REST writes (`POST/PUT/DELETE /api/logs`,
 * `POST /api/meals/:id/add-to-log`) before the frontend can be pointed at
 * them and the routes deleted. See `DOCS/SUITE_TODO.md` item 2.
 *
 * What is pinned here:
 *
 *   1. `addFoodLog` accepts a whole `food_item` and runs REST's
 *      `FoodItem.findOrCreate` dedupe — barcode, then `(source, source_id)`,
 *      then `(name, brand)` — creating a GLOBAL row otherwise.
 *   2. Whatever that resolves to still passes the catalog accessibility
 *      check, so the unscoped dedupe queries cannot hand back another user's
 *      private food (a hole REST actually has).
 *   3. `updateFoodLog` is a partial patch: a servings-only edit works on a
 *      log whose food has since been soft-deleted.
 *   4. `logMeal` stamps the `Added from meal: <name>` provenance caption.
 *   5. All three foodLog mutations recompute the DailySummary, as REST does.
 *   6. Calendar dates are UTC midnight, never local midnight.
 */

import mongoose from 'mongoose';
import { Kind } from 'graphql';

const { default: FoodItem } = await import('../graphql/fitnessgeek/models/FoodItem.js');
const { default: FoodLog } = await import('../graphql/fitnessgeek/models/FoodLog.js');
const { default: Meal } = await import('../graphql/fitnessgeek/models/Meal.js');
const { default: DailySummary } = await import('../graphql/fitnessgeek/models/DailySummary.js');
const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');
const { resolvers } = await import('../graphql/fitnessgeek/resolvers.js');
const { typeDefs } = await import('../graphql/fitnessgeek/typeDefs.js');

const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: userId } } : {});

const M = resolvers.Mutation;

const NUTRITION = {
  calories_per_serving: 150,
  protein_grams: 5,
  carbs_grams: 27,
  fat_grams: 3,
  fiber_grams: 4,
  sugar_grams: 1,
  sodium_mg: 2,
};

/** A search-result-shaped `food_item`: synthetic id, nested serving is flat here. */
const searchResult = (overrides = {}) => ({
  id: 'usda_2341880',
  name: 'rolled oats',
  brand: 'Bob’s Red Mill',
  serving_size: 40,
  serving_unit: 'g',
  nutrition: { ...NUTRITION },
  source: 'usda',
  source_id: '2341880',
  ...overrides,
});

const makeFood = (overrides = {}) =>
  FoodItem.create({
    name: 'oats',
    nutrition: { ...NUTRITION },
    serving: { size: 100, unit: 'g' },
    source: 'custom',
    user_id: ALICE,
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

// ---------------------------------------------------------------------------
// the wire contract
// ---------------------------------------------------------------------------

const inputDef = (name) =>
  typeDefs.definitions.find(
    (d) => d.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION && d.name.value === name
  );

const fieldTypes = (def) =>
  Object.fromEntries(
    def.fields.map((f) => [
      f.name.value,
      f.type.kind === Kind.NON_NULL_TYPE ? 'required' : 'optional',
    ])
  );

describe('schema — the shape a client actually sends', () => {
  test('FoodLogInput takes either food_item_id or a whole food_item', () => {
    const t = fieldTypes(inputDef('FoodLogInput'));
    expect(t.food_item_id).toBe('optional'); // was ID! — now "unless food_item"
    expect(t.food_item).toBe('optional');
    expect(t.log_date).toBe('required');
    expect(t.meal_type).toBe('required');
    expect(t.servings).toBe('required');
  });

  test('FitnessFoodInput carries the provenance findOrCreate dedupes on', () => {
    const t = fieldTypes(inputDef('FitnessFoodInput'));
    expect(t.id).toBe('optional');
    expect(t.source).toBe('optional');
    expect(t.source_id).toBe('optional');
    // unchanged for addFitnessFood's sake
    expect(t.name).toBe('required');
    expect(t.serving_size).toBe('required');
    expect(t.nutrition).toBe('required');
  });

  test('FoodLogUpdateInput is entirely nullable', () => {
    const t = fieldTypes(inputDef('FoodLogUpdateInput'));
    expect(Object.values(t)).not.toContain('required');
    expect(Object.keys(t).sort()).toEqual(
      ['food_item_id', 'log_date', 'meal_type', 'notes', 'nutrition', 'servings'].sort()
    );
  });

  test('updateFoodLog is declared against FoodLogUpdateInput', () => {
    const mutation = typeDefs.definitions.find(
      (d) => d.kind === Kind.OBJECT_TYPE_DEFINITION && d.name.value === 'Mutation'
    );
    const field = mutation.fields.find((f) => f.name.value === 'updateFoodLog');
    const arg = field.arguments.find((a) => a.name.value === 'input');
    expect(arg.type.type.name.value).toBe('FoodLogUpdateInput');
  });
});

// ---------------------------------------------------------------------------
// addFoodLog — on-the-fly FoodItem
// ---------------------------------------------------------------------------

describe('addFoodLog — findOrCreate', () => {
  test('a search result with a synthetic id creates a GLOBAL catalog row', async () => {
    const log = await M.addFoodLog(
      null,
      { input: { log_date: '2026-03-01', meal_type: 'breakfast', servings: 2, food_item: searchResult() } },
      ctx(BOB)
    );

    const foods = await FoodItem.find({});
    expect(foods).toHaveLength(1);
    expect(foods[0].user_id).toBeNull(); // global, not private to BOB
    expect(foods[0].source).toBe('usda');
    expect(foods[0].source_id).toBe('2341880');
    expect(foods[0].serving.size).toBe(40);
    expect(foods[0].nutrition.calories_per_serving).toBe(150);

    expect(String(log.food_item_id._id)).toBe(String(foods[0]._id));
    expect(log.user_id).toBe(BOB);
    expect(log.servings).toBe(2);
    // the log's own nutrition snapshot falls back to the food's
    expect(log.nutrition.calories_per_serving).toBe(150);
  });

  test('barcode is the first dedupe key', async () => {
    const existing = await makeFood({ name: 'anything', barcode: '5000112548167', user_id: null, source: 'openfoodfacts' });
    await M.addFoodLog(
      null,
      {
        input: {
          log_date: '2026-03-01',
          meal_type: 'snack',
          servings: 1,
          // different name/brand/source — barcode still wins
          food_item: searchResult({ name: 'coke zero', brand: 'Coca-Cola', barcode: '5000112548167', source_id: 'x' }),
        },
      },
      ctx(BOB)
    );
    expect(await FoodItem.countDocuments({})).toBe(1);
    const log = await FoodLog.findOne({ user_id: BOB });
    expect(String(log.food_item_id)).toBe(String(existing._id));
  });

  test('(source, source_id) is the second dedupe key', async () => {
    const existing = await makeFood({ name: 'whatever', user_id: null, source: 'usda', source_id: '2341880' });
    await M.addFoodLog(
      null,
      { input: { log_date: '2026-03-01', meal_type: 'snack', servings: 1, food_item: searchResult({ brand: 'different' }) } },
      ctx(BOB)
    );
    expect(await FoodItem.countDocuments({})).toBe(1);
    expect(String((await FoodLog.findOne({ user_id: BOB })).food_item_id)).toBe(String(existing._id));
  });

  test('(name, brand) is the third dedupe key', async () => {
    const existing = await makeFood({ name: 'rolled oats', brand: 'Bob’s Red Mill', user_id: null, source: 'ai' });
    await M.addFoodLog(
      null,
      {
        input: {
          log_date: '2026-03-01',
          meal_type: 'snack',
          servings: 1,
          food_item: searchResult({ source: 'ai', source_id: undefined }),
        },
      },
      ctx(BOB)
    );
    expect(await FoodItem.countDocuments({})).toBe(1);
    expect(String((await FoodLog.findOne({ user_id: BOB })).food_item_id)).toBe(String(existing._id));
  });

  test('logging the same search result twice does not mint a second row', async () => {
    for (const meal_type of ['breakfast', 'lunch']) {
      await M.addFoodLog(
        null,
        { input: { log_date: '2026-03-01', meal_type, servings: 1, food_item: searchResult() } },
        ctx(BOB)
      );
    }
    expect(await FoodItem.countDocuments({})).toBe(1);
    expect(await FoodLog.countDocuments({ user_id: BOB })).toBe(2);
  });

  test('a food_item whose id IS an ObjectId is used as-is, not re-created', async () => {
    const global = await makeFood({ name: 'banana', user_id: null, source: 'usda' });
    const log = await M.addFoodLog(
      null,
      {
        input: {
          log_date: '2026-03-01',
          meal_type: 'snack',
          servings: 1,
          food_item: searchResult({ id: String(global._id) }),
        },
      },
      ctx(BOB)
    );
    expect(await FoodItem.countDocuments({})).toBe(1);
    expect(String(log.food_item_id._id)).toBe(String(global._id));
  });

  test('accessibility is still enforced when food_item_id is given', async () => {
    const alicePrivate = await makeFood({ name: 'secret shake' });
    await expect(
      M.addFoodLog(
        null,
        { input: { log_date: '2026-03-01', meal_type: 'snack', servings: 1, food_item_id: String(alicePrivate._id) } },
        ctx(BOB)
      )
    ).rejects.toThrow('Food item not found');
    expect(await FoodLog.countDocuments({ user_id: BOB })).toBe(0);
  });

  test('accessibility is enforced on the row findOrCreate resolves to', async () => {
    // REST's dedupe queries are unscoped, so a crafted (name, brand) can match
    // another user's PRIVATE food. The gateway re-checks and refuses.
    await makeFood({ name: 'secret shake', brand: 'acme' });
    await expect(
      M.addFoodLog(
        null,
        {
          input: {
            log_date: '2026-03-01',
            meal_type: 'snack',
            servings: 1,
            food_item: searchResult({ id: 'ai_1', name: 'secret shake', brand: 'acme', source: 'ai', source_id: undefined }),
          },
        },
        ctx(BOB)
      )
    ).rejects.toThrow('Food item not found');
    expect(await FoodLog.countDocuments({ user_id: BOB })).toBe(0);
  });

  test('neither food_item nor food_item_id is a not-found, not a crash', async () => {
    await expect(
      M.addFoodLog(null, { input: { log_date: '2026-03-01', meal_type: 'snack', servings: 1 } }, ctx(BOB))
    ).rejects.toThrow('Food item not found');
  });

  test('log_date lands on UTC midnight, not local midnight', async () => {
    const log = await M.addFoodLog(
      null,
      { input: { log_date: '2026-03-01', meal_type: 'snack', servings: 1, food_item: searchResult() } },
      ctx(BOB)
    );
    expect(log.log_date.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  test('a mid-day timestamp is flattened to that UTC day', async () => {
    const log = await M.addFoodLog(
      null,
      {
        input: {
          log_date: new Date('2026-03-01T18:30:00.000Z'),
          meal_type: 'snack',
          servings: 1,
          food_item: searchResult(),
        },
      },
      ctx(BOB)
    );
    expect(log.log_date.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  test('the DailySummary is recomputed', async () => {
    await M.addFoodLog(
      null,
      { input: { log_date: '2026-03-01', meal_type: 'breakfast', servings: 2, food_item: searchResult() } },
      ctx(BOB)
    );
    const summary = await DailySummary.findOne({ user_id: BOB });
    expect(summary).not.toBeNull();
    expect(summary.date.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(summary.totals.calories).toBe(300);
    expect(summary.meals.breakfast.calories).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// addFitnessFood is deliberately unchanged
// ---------------------------------------------------------------------------

describe('addFitnessFood is untouched by the new input fields', () => {
  test('source / source_id / id on the input are ignored; the food stays private custom', async () => {
    const food = await M.addFitnessFood(
      null,
      {
        input: {
          id: 'usda_999',
          name: 'my shake',
          serving_size: 250,
          serving_unit: 'ml',
          nutrition: { ...NUTRITION },
          source: 'usda',
          source_id: '999',
        },
      },
      ctx(ALICE)
    );
    expect(food.source).toBe('custom');
    expect(food.source_id).toBeUndefined();
    expect(food.user_id).toBe(ALICE);
    expect(food.serving.size).toBe(250);
    expect(String(food._id)).not.toBe('usda_999');
  });
});

// ---------------------------------------------------------------------------
// updateFoodLog — partial patch
// ---------------------------------------------------------------------------

describe('updateFoodLog — partial patch', () => {
  const seedLog = async (foodOverrides = {}, logOverrides = {}) => {
    const food = await makeFood({ user_id: BOB, ...foodOverrides });
    const log = await FoodLog.create({
      user_id: BOB,
      log_date: new Date('2026-03-01T00:00:00.000Z'),
      meal_type: 'breakfast',
      food_item_id: food._id,
      servings: 1,
      notes: 'original',
      nutrition: { ...NUTRITION },
      ...logOverrides,
    });
    return { food, log };
  };

  test('servings-only edit works on a log whose food was soft-deleted', async () => {
    const { log } = await seedLog({ is_deleted: true });
    const updated = await M.updateFoodLog(null, { id: String(log._id), input: { servings: 2.5 } }, ctx(BOB));
    expect(updated.servings).toBe(2.5);
    // untouched fields survive
    expect(updated.meal_type).toBe('breakfast');
    expect(updated.notes).toBe('original');
    expect(updated.log_date.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  test('omitted fields are not overwritten', async () => {
    const { log } = await seedLog();
    const updated = await M.updateFoodLog(null, { id: String(log._id), input: { meal_type: 'dinner' } }, ctx(BOB));
    expect(updated.meal_type).toBe('dinner');
    expect(updated.servings).toBe(1);
    expect(updated.notes).toBe('original');
  });

  test('log_date is normalized to UTC midnight', async () => {
    const { log } = await seedLog();
    const updated = await M.updateFoodLog(
      null,
      { id: String(log._id), input: { log_date: new Date('2026-03-04T22:00:00.000Z') } },
      ctx(BOB)
    );
    expect(updated.log_date.toISOString()).toBe('2026-03-04T00:00:00.000Z');
  });

  test('supplying food_item_id still runs the accessibility check', async () => {
    const alicePrivate = await makeFood({ name: 'secret shake' });
    const { log } = await seedLog();
    await expect(
      M.updateFoodLog(null, { id: String(log._id), input: { food_item_id: String(alicePrivate._id) } }, ctx(BOB))
    ).rejects.toThrow('Food item not found');
  });

  test('the DailySummary is recomputed for the log’s (new) date', async () => {
    const { log } = await seedLog();
    await M.updateFoodLog(null, { id: String(log._id), input: { servings: 3 } }, ctx(BOB));
    const summary = await DailySummary.findOne({ user_id: BOB, date: new Date('2026-03-01T00:00:00.000Z') });
    expect(summary.totals.calories).toBe(450);
  });
});

// ---------------------------------------------------------------------------
// deleteFoodLog
// ---------------------------------------------------------------------------

describe('deleteFoodLog', () => {
  test('recomputes the DailySummary for the deleted log’s date', async () => {
    await M.addFoodLog(
      null,
      { input: { log_date: '2026-03-01', meal_type: 'breakfast', servings: 2, food_item: searchResult() } },
      ctx(BOB)
    );
    const log = await FoodLog.findOne({ user_id: BOB });
    expect((await DailySummary.findOne({ user_id: BOB })).totals.calories).toBe(300);

    expect(await M.deleteFoodLog(null, { id: String(log._id) }, ctx(BOB))).toBe(true);
    expect((await DailySummary.findOne({ user_id: BOB })).totals.calories).toBe(0);
  });

  test('a malformed id is a false, not a CastError', async () => {
    expect(await M.deleteFoodLog(null, { id: 'not-an-objectid' }, ctx(BOB))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// logMeal
// ---------------------------------------------------------------------------

describe('logMeal', () => {
  const seedMeal = async () => {
    const a = await makeFood({ name: 'oats', user_id: null, source: 'usda' });
    const b = await makeFood({ name: 'milk', user_id: null, source: 'usda' });
    return Meal.create({
      name: 'Weekday breakfast',
      meal_type: 'breakfast',
      user_id: BOB,
      food_items: [
        { food_item_id: a._id, servings: 1 },
        { food_item_id: b._id, servings: 2 },
      ],
    });
  };

  test('stamps the provenance caption REST writes', async () => {
    const meal = await seedMeal();
    const logs = await M.logMeal(
      null,
      { mealId: String(meal._id), date: '2026-03-02', mealType: 'lunch' },
      ctx(BOB)
    );
    expect(logs).toHaveLength(2);
    for (const l of logs) expect(l.notes).toBe('Added from meal: Weekday breakfast');
  });

  test('writes UTC midnight and recomputes the DailySummary', async () => {
    const meal = await seedMeal();
    const logs = await M.logMeal(null, { mealId: String(meal._id), date: '2026-03-02' }, ctx(BOB));
    for (const l of logs) expect(l.log_date.toISOString()).toBe('2026-03-02T00:00:00.000Z');

    const summary = await DailySummary.findOne({ user_id: BOB, date: new Date('2026-03-02T00:00:00.000Z') });
    expect(summary.totals.calories).toBe(450); // 1x150 + 2x150
  });
});

// ---------------------------------------------------------------------------
// the custom-food edit path (BURN_REVIEW #15, #19)
// ---------------------------------------------------------------------------

describe('FitnessFood exposes the serving it actually stores', () => {
  // `FitnessFood` is declared flat (serving_size / serving_unit); the shared
  // FoodItem schema stores `serving: {size, unit}`. With no field resolvers
  // both answered null, and MyFoods' edit dialog — which pre-fills from the
  // row it just read — rewrote every custom food's serving to its 100 g
  // fallback on save.
  test('serving_size / serving_unit resolve from serving.{size,unit}', async () => {
    const food = await makeFood({ name: 'almonds', serving: { size: 28, unit: 'g' } });
    expect(resolvers.FitnessFood.serving_size(food)).toBe(28);
    expect(resolvers.FitnessFood.serving_unit(food)).toBe('g');
  });

  test('a freshly created food round-trips its serving through the type', async () => {
    const created = await M.addFitnessFood(
      null,
      { input: { name: 'skyr', serving_size: 150, serving_unit: 'ml', nutrition: { ...NUTRITION } } },
      ctx(ALICE)
    );
    expect(resolvers.FitnessFood.serving_size(created)).toBe(150);
    expect(resolvers.FitnessFood.serving_unit(created)).toBe('ml');
  });
});

describe('updateFitnessFood is a partial patch', () => {
  const seedFood = () =>
    makeFood({ name: 'granola', serving: { size: 45, unit: 'g' }, nutrition: { ...NUTRITION } });

  test('a nutrition patch keeps the macros it did not mention', async () => {
    const food = await seedFood();

    const updated = await M.updateFitnessFood(
      null,
      { id: String(food._id), input: { nutrition: { calories_per_serving: 210 } } },
      ctx(ALICE)
    );

    expect(updated.nutrition.calories_per_serving).toBe(210);
    // Wholesale replacement reset these six to the schema's 0.
    expect(updated.nutrition.protein_grams).toBe(NUTRITION.protein_grams);
    expect(updated.nutrition.carbs_grams).toBe(NUTRITION.carbs_grams);
    expect(updated.nutrition.fat_grams).toBe(NUTRITION.fat_grams);
    expect(updated.nutrition.fiber_grams).toBe(NUTRITION.fiber_grams);
    expect(updated.nutrition.sugar_grams).toBe(NUTRITION.sugar_grams);
    expect(updated.nutrition.sodium_mg).toBe(NUTRITION.sodium_mg);
  });

  test('a serving_unit-only edit keeps serving.size — a required, min 0.1 path', async () => {
    const food = await seedFood();

    const updated = await M.updateFitnessFood(
      null,
      { id: String(food._id), input: { serving_unit: 'oz' } },
      ctx(ALICE)
    );

    expect(updated.serving.unit).toBe('oz');
    expect(updated.serving.size).toBe(45);
  });

  test('a serving_size-only edit keeps the unit rather than defaulting it to g', async () => {
    const food = await makeFood({ name: 'kefir', serving: { size: 240, unit: 'ml' } });

    const updated = await M.updateFitnessFood(
      null,
      { id: String(food._id), input: { serving_size: 200 } },
      ctx(ALICE)
    );

    expect(updated.serving.size).toBe(200);
    expect(updated.serving.unit).toBe('ml');
  });

  test('another user’s food is still untouchable', async () => {
    const food = await seedFood();
    await expect(
      M.updateFitnessFood(null, { id: String(food._id), input: { serving_size: 1 } }, ctx(BOB))
    ).rejects.toThrow(/not found or unauthorized/i);
  });
});

// ---------------------------------------------------------------------------
// the calendar day comes from the client, never the server clock
// (BURN_REVIEW #14)
// ---------------------------------------------------------------------------

describe('per-day reads require the caller’s date', () => {
  // The gateway runs in UTC (no image installs tzdata, so TZ is inert). A
  // server-clock default answered about tomorrow for every Central-time
  // caller after 19:00 — an empty ring on the dashboard. The browser sends
  // localDateString() now, and a missing date is a loud caller bug.
  test('dailySummary without a date throws instead of guessing', async () => {
    await expect(resolvers.Query.dailySummary(null, {}, ctx(ALICE))).rejects.toThrow(
      /requires a date/i
    );
  });

  test('refreshDailySummary without a date throws too', async () => {
    await expect(M.refreshDailySummary(null, {}, ctx(ALICE))).rejects.toThrow(/requires a date/i);
  });

  test('a non-calendar date is rejected rather than coerced', async () => {
    await expect(
      resolvers.Query.dailySummary(null, { date: 'today' }, ctx(ALICE))
    ).rejects.toThrow(/YYYY-MM-DD/);
  });

  test('with a date it answers about that day', async () => {
    const food = await makeFood();
    await M.addFoodLog(
      null,
      { input: { food_item_id: String(food._id), log_date: '2026-03-04', meal_type: 'lunch', servings: 2 } },
      ctx(ALICE)
    );

    const summary = await resolvers.Query.dailySummary(null, { date: '2026-03-04' }, ctx(ALICE));
    expect(summary.date).toBe('2026-03-04');
    expect(summary.totals.calories).toBe(300);
  });
});
