/**
 * `fitnessMeals(search:)` — BURN_REVIEW_2 #13.
 *
 * The gateway declared no `search` argument on `fitnessMeals` at all, and
 * `apiService.js`'s router dropped the frontend's `?search=` before it even
 * got here, so typing "chicken" into food search returned every saved meal —
 * `UnifiedFoodSearch.jsx`, `FoodSearch.jsx` and `matcherService.js` all hit
 * this. This pins the fixed contract: `search` narrows by name
 * case-insensitively, an absent/empty search still lists everything, and the
 * value reaches mongod only after being escaped — same rule as
 * `fitnessFoods(search:)` just above it in the same resolver file — so a
 * meal literally named "C++" or "Oreo (" doesn't blow up the regex.
 */
import mongoose from 'mongoose';

const { default: Meal } = await import('../graphql/fitnessgeek/models/Meal.js');
const { resolvers } = await import('../graphql/fitnessgeek/resolvers.js');

const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: userId } } : {});

const Q = resolvers.Query;

const makeMeal = (overrides = {}) =>
  Meal.create({
    name: 'chicken salad',
    meal_type: 'lunch',
    user_id: ALICE,
    food_items: [],
    ...overrides,
  });

beforeAll(async () => {
  await Meal.db.asPromise();
}, 60000);

afterEach(async () => {
  await Meal.deleteMany({});
});

afterAll(async () => {
  await Meal.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('fitnessMeals(search:)', () => {
  test('requires a user', async () => {
    await expect(Q.fitnessMeals(null, { mealType: null, search: null }, ctx())).rejects.toThrow(
      'Unauthorized'
    );
  });

  test('no search lists everything the caller owns, same as before', async () => {
    await makeMeal({ name: 'chicken salad' });
    await makeMeal({ name: 'oat bowl' });
    await makeMeal({ name: 'other users meal', user_id: BOB });

    const meals = await Q.fitnessMeals(null, { mealType: null, search: null }, ctx(ALICE));
    expect(meals.map((m) => m.name).sort()).toEqual(['chicken salad', 'oat bowl']);
  });

  test('an empty-string search also lists everything, not nothing', async () => {
    await makeMeal({ name: 'chicken salad' });
    const meals = await Q.fitnessMeals(null, { mealType: null, search: '' }, ctx(ALICE));
    expect(meals).toHaveLength(1);
  });

  test('search narrows by name, case-insensitively', async () => {
    await makeMeal({ name: 'Chicken Salad' });
    await makeMeal({ name: 'oat bowl' });

    const meals = await Q.fitnessMeals(null, { mealType: null, search: 'chicken' }, ctx(ALICE));
    expect(meals).toHaveLength(1);
    expect(meals[0].name).toBe('Chicken Salad');
  });

  test('search never returns another user\'s meals', async () => {
    await makeMeal({ name: 'chicken salad', user_id: BOB });
    const meals = await Q.fitnessMeals(null, { mealType: null, search: 'chicken' }, ctx(ALICE));
    expect(meals).toHaveLength(0);
  });

  test('search combines with mealType', async () => {
    await makeMeal({ name: 'chicken salad', meal_type: 'lunch' });
    await makeMeal({ name: 'chicken soup', meal_type: 'dinner' });

    const meals = await Q.fitnessMeals(null, { mealType: 'lunch', search: 'chicken' }, ctx(ALICE));
    expect(meals).toHaveLength(1);
    expect(meals[0].meal_type).toBe('lunch');
  });

  test('a literal "C++" does not blow up the regex, and matches literally', async () => {
    await makeMeal({ name: 'C++ Protein Bowl' });
    await makeMeal({ name: 'unrelated meal' });

    const meals = await Q.fitnessMeals(null, { mealType: null, search: 'C++' }, ctx(ALICE));
    expect(meals).toHaveLength(1);
    expect(meals[0].name).toBe('C++ Protein Bowl');
  });

  test('an unbalanced group like "Oreo (" does not throw', async () => {
    await makeMeal({ name: 'Oreo (party size)' });

    await expect(
      Q.fitnessMeals(null, { mealType: null, search: 'Oreo (' }, ctx(ALICE))
    ).resolves.toHaveLength(1);
  });

  test('search text over 200 chars is rejected as bad input', async () => {
    await expect(
      Q.fitnessMeals(null, { mealType: null, search: 'a'.repeat(201) }, ctx(ALICE))
    ).rejects.toThrow(/Invalid input/);
  });
});
