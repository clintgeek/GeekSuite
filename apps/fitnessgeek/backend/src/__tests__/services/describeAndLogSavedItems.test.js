/**
 * Saved meals and foods win — when the text really names them.
 *
 * Chef, 2026-09-22: "if I have homemade quesadilla saved as a meal/food, it
 * should use that before guessing at something else." He had a saved meal
 * called "Homemade Quesadilla" (seven component foods). Describing "homemade
 * quesadilla" never read it: meals were consulted by nothing on this path, and
 * the history lookup — which discards "homemade" as noise — would token-match
 * an old row called "Quesadillas" at 1,680 cal instead.
 *
 * The other half matters as much: matching must not be loose. "quesadilla"
 * alone is the restaurant one, and "chicken caesar salad" is not his saved
 * side of "chicken". A false saved match writes the wrong numbers under a
 * "this is yours" label, which is worse than the ordinary fallback.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mod = (p) => new URL(p, import.meta.url).pathname;

const chain = (value) => {
  const self = {
    sort: () => self,
    limit: () => self,
    select: () => self,
    populate: () => self,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return self;
};

const findOne = jest.fn(() => chain(null));
const find = jest.fn(() => chain([]));
const create = jest.fn(async (doc) => ({ ...doc, _id: 'food-new' }));
const mealFind = jest.fn(() => chain([]));
const savedLogs = [];
const estimateDishes = jest.fn(async () => ({ ok: false, dishes: [], reason: 'unavailable' }));

class FakeFoodLog {
  constructor(doc) { Object.assign(this, doc); }
  async save() {
    if (!this._id) { this._id = `log-${savedLogs.length + 1}`; savedLogs.push(this); }
    return this;
  }
}

jest.unstable_mockModule(mod('../../models/FoodItem.js'), () => ({
  __esModule: true,
  default: { findOne, find, create }
}));
jest.unstable_mockModule(mod('../../models/Meal.js'), () => ({
  __esModule: true,
  default: { find: mealFind }
}));
jest.unstable_mockModule(mod('../../models/FoodLog.js'), () => ({
  __esModule: true,
  default: FakeFoodLog
}));
jest.unstable_mockModule(mod('../../models/DailySummary.js'), () => ({
  __esModule: true,
  default: { updateFromLogs: async () => {} }
}));
jest.unstable_mockModule(mod('../../services/aiFoodService.js'), () => ({
  __esModule: true,
  default: {
    estimateDishes,
    judgeEntries: async () => ({ ok: false, verdicts: [] }),
    prepareClassificationInput: () => ({ detectedBrands: [] })
  }
}));
jest.unstable_mockModule(mod('../../services/unifiedFoodService.js'), () => ({
  __esModule: true,
  default: { search: async () => [] }
}));

const { logDescription } = await import('../../services/describeAndLogService.js');
const { matchSavedItem, matchSavedMealSpans } = await import('../../services/savedItemMatcher.js');
const { parseMealDescription } = await import('../../services/mealDescriptionParser.js');

const food = (id, name, calories, extra = {}) => ({
  _id: id,
  name,
  nutrition: { calories_per_serving: calories, protein_grams: 5, carbs_grams: 5, fat_grams: 5 },
  serving: { size: 1, unit: 'serving' },
  ...extra
});

// The real meal's shape, from Chef's data: components at fractional servings.
const quesadillaMeal = () => ({
  _id: 'meal-q',
  name: 'Homemade Quesadilla',
  meal_type: 'dinner',
  food_items: [
    { food_item_id: food('f-tortilla', 'Flour Tortillas BURRITO', 210), servings: 1 },
    { food_item_id: food('f-chicken', 'chicken', 220), servings: 1 },
    { food_item_id: food('f-cheese', 'cheese', 110), servings: 0.5 }
  ]
});

const estimated = (index, name, calories) => ({
  index,
  name,
  servingDescription: '1 plate',
  nutrition: { calories_per_serving: calories, protein_grams: 20, carbs_grams: 40, fat_grams: 20 },
  lowCalories: null,
  highCalories: null
});

const run = (text) => logDescription(text, { userId: 'u1', date: '2026-09-22', hour: 19, skipReview: true });
const entryOf = (text) => parseMealDescription(text, { hour: 19 }).entries[0];

/** Every described entry appears on at least one logged or skipped row. */
const everyEntryAccountedFor = (result) => {
  const seen = new Set([...result.logged, ...result.skipped].flatMap((row) => row.entryIndexes || [row.entryIndex]));
  for (let i = 0; i < result.requested; i += 1) {
    if (!seen.has(i)) return false;
  }
  return true;
};

beforeEach(() => {
  savedLogs.length = 0;
  findOne.mockReset().mockImplementation(() => chain(null));
  find.mockReset().mockImplementation(() => chain([]));
  create.mockClear();
  mealFind.mockReset().mockImplementation(() => chain([quesadillaMeal()]));
  estimateDishes.mockReset().mockImplementation(async () => ({ ok: false, dishes: [], reason: 'unavailable' }));
});

describe('the matching rule', () => {
  const meals = [{ name: 'Homemade Quesadilla' }];

  test('the saved name, as said, matches', () => {
    expect(matchSavedItem(entryOf('a homemade quesadilla'), { meals })?.kind).toBe('meal');
    expect(matchSavedItem(entryOf('2 homemade quesadillas'), { meals })?.kind).toBe('meal');
  });

  test('"my" points at his own version and satisfies the qualifier', () => {
    expect(matchSavedItem(entryOf('my quesadilla'), { meals })?.kind).toBe('meal');
  });

  test('a bare "quesadilla" is NOT the homemade one — it may be a restaurant plate', () => {
    expect(matchSavedItem(entryOf('a quesadilla'), { meals })).toBeNull();
  });

  test('sharing a word is not naming it: "chicken caesar salad" is not his saved chicken', () => {
    const saved = {
      meals: [{ name: 'Chicken' }],
      foods: [{ name: 'Homemade Chicken' }]
    };
    expect(matchSavedItem(entryOf('chicken caesar salad'), saved)).toBeNull();
  });

  test('extra words fall through rather than guess (the trade-off, pinned)', () => {
    expect(matchSavedItem(entryOf('homemade quesadilla with extra guac'), { meals })).toBeNull();
  });

  test('a saved food is only eligible when a person named it "homemade"', () => {
    // A describe-minted row can hold a TOTAL ("a dozen nachos" → one row with
    // all twelve). Multiplying it by a new quantity is the double count, so
    // an unqualified custom food is left to the history lookup.
    const foods = [{ name: 'Nachos with beef' }];
    expect(matchSavedItem(entryOf('6 nachos with beef'), { foods })).toBeNull();
    expect(matchSavedItem(entryOf('homemade tamales'), { foods: [{ name: 'Homemade Tamales' }] })?.kind).toBe('food');
  });
});

describe('a saved meal in the text', () => {
  test('logs as its component foods, from his numbers, with no model call', async () => {
    const result = await run('a homemade quesadilla');

    expect(estimateDishes).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(result.skipped).toHaveLength(0);
    expect(result.logged.map((row) => row.name)).toEqual(['Flour Tortillas BURRITO', 'chicken', 'cheese']);
    for (const row of result.logged) {
      expect(row.source).toBe('saved-meal');
      expect(row.savedMeal).toEqual({ id: 'meal-q', name: 'Homemade Quesadilla' });
    }

    // Written exactly as logging the meal from the meals screen writes it.
    expect(savedLogs.map((log) => log.food_item_id)).toEqual(['f-tortilla', 'f-chicken', 'f-cheese']);
    expect(savedLogs.map((log) => log.servings)).toEqual([1, 1, 0.5]);
    expect(savedLogs.every((log) => log.notes === 'Added from meal: Homemade Quesadilla')).toBe(true);
    expect(savedLogs.every((log) => log.meal_type === 'dinner')).toBe(true);
    expect(savedLogs[1].nutrition.calories_per_serving).toBe(220);
  });

  test('a quantity scales every component', async () => {
    await run('2 homemade quesadillas');
    expect(savedLogs.map((log) => log.servings)).toEqual([2, 2, 1]);
  });

  test('beats an old history row the qualifier-blind lookup would have taken', async () => {
    // His real data: a "Quesadillas" row at 1,680 cal, which history's token
    // match finds for "homemade quesadilla" because it strips "homemade".
    find.mockImplementation(() => chain([food('f-old', 'Quesadillas', 1680)]));

    const result = await run('homemade quesadilla');

    expect(result.logged.every((row) => row.source === 'saved-meal')).toBe(true);
    expect(savedLogs.some((log) => log.food_item_id === 'f-old')).toBe(false);
  });

  test('a bare "quesadilla" does not use the saved meal', async () => {
    estimateDishes.mockImplementation(async () => ({ ok: true, dishes: [estimated(0, 'Quesadilla', 700)] }));

    const result = await run('quesadilla');

    expect(result.logged).toHaveLength(1);
    expect(result.logged[0].source).toBe('estimate');
    expect(savedLogs.some((log) => log.notes)).toBe(false);
  });

  test('a component that no longer exists is skipped by name, never dropped', async () => {
    const meal = quesadillaMeal();
    meal.food_items[2].food_item_id = null; // deleted food, dangling reference
    mealFind.mockImplementation(() => chain([meal]));

    const result = await run('homemade quesadilla and a coffee');

    expect(result.logged.filter((row) => row.source === 'saved-meal')).toHaveLength(2);
    expect(result.skipped).toContainEqual(expect.objectContaining({
      reason: 'missing-from-saved-meal',
      name: expect.stringContaining('Homemade Quesadilla')
    }));
    // The coffee's estimate declined, so it is skipped too — and every entry
    // he described is accounted for.
    expect(result.requested).toBe(2);
    expect(everyEntryAccountedFor(result)).toBe(true);
  });

  test('a saved meal sits alongside ordinary entries in one sentence', async () => {
    estimateDishes.mockImplementation(async () => ({ ok: true, dishes: [estimated(0, 'Coffee', 5)] }));

    const result = await run('homemade quesadilla and a coffee');

    // Only the coffee reached the model.
    expect(estimateDishes).toHaveBeenCalledTimes(1);
    expect(estimateDishes.mock.calls[0][0]).toHaveLength(1);
    expect(result.logged.map((row) => row.source)).toEqual(['saved-meal', 'saved-meal', 'saved-meal', 'estimate']);
    expect(everyEntryAccountedFor(result)).toBe(true);
  });
});

describe('a saved food in the text', () => {
  test('"2 homemade tamales" is two servings of his food, not a new estimate', async () => {
    mealFind.mockImplementation(() => chain([]));
    // loadSavedItems asks for his qualifier-named foods; history's own find
    // gets nothing.
    find.mockImplementation((query) => chain(
      query?.name instanceof RegExp ? [food('f-tamale', 'Homemade Tamales', 250)] : []
    ));

    const result = await run('2 homemade tamales');

    expect(estimateDishes).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(result.logged).toHaveLength(1);
    expect(result.logged[0]).toMatchObject({ source: 'saved-food', name: 'Homemade Tamales', loggedServings: 2 });
    expect(savedLogs[0].food_item_id).toBe('f-tamale');
  });
});

// Chef's real saved meal names, 2026-09-22. Half contain "and", which the
// parser splits into separate entries before any matching runs.
const REAL_MEALS = [
  'Home Breakfast Sandwich',
  "El P's Enchiladas Ranchera Plate and a Margarita",
  "Fat Boy's Burger and Fries",
  "Fat Boy's Burger and Fries",
  'Regular Home Breakfast',
  "El P's Rachero and Marg",
  'Shake Meal',
  'Homemade Quesadilla'
].map((name, i) => ({ _id: `meal-${i}`, name }));

/** What each entry of a sentence resolves to, by name ('-' for no saved meal). */
const whatMatches = (text) => {
  const entries = parseMealDescription(text, { hour: 12 }).entries;
  const out = entries.map(() => '-');
  const covered = new Set();
  for (const span of matchSavedMealSpans(entries, { meals: REAL_MEALS })) {
    for (let k = span.start; k <= span.end; k += 1) { out[k] = span.meal.name; covered.add(k); }
  }
  entries.forEach((entry, k) => {
    if (covered.has(k)) return;
    const hit = matchSavedItem(entry, { meals: REAL_MEALS });
    if (hit) out[k] = hit.meal.name;
  });
  return out;
};

describe('his real saved meals', () => {
  test.each([
    ["fat boy's burger and fries", ["Fat Boy's Burger and Fries", "Fat Boy's Burger and Fries"]],
    ["for lunch fat boy's burger and fries", ["Fat Boy's Burger and Fries", "Fat Boy's Burger and Fries"]],
    ["El P's Rachero and Marg", ["El P's Rachero and Marg", "El P's Rachero and Marg"]],
    ["el p's enchiladas ranchera plate and a margarita",
      ["El P's Enchiladas Ranchera Plate and a Margarita", "El P's Enchiladas Ranchera Plate and a Margarita"]]
  ])('a name with "and" in it is rejoined: %s', (text, expected) => {
    expect(whatMatches(text)).toEqual(expected);
  });

  test('a trailing extra item stays its own entry', () => {
    expect(whatMatches("fat boy's burger and fries and a coke"))
      .toEqual(["Fat Boy's Burger and Fries", "Fat Boy's Burger and Fries", '-']);
    expect(whatMatches("a coke and el p's rachero and marg"))
      .toEqual(['-', "El P's Rachero and Marg", "El P's Rachero and Marg"]);
  });

  test('eating verbs neither add nor block words', () => {
    expect(whatMatches('had my regular home breakfast')).toEqual(['Regular Home Breakfast']);
    expect(whatMatches('I ate a shake meal')).toEqual(['Shake Meal']);
  });

  test('what already worked still works', () => {
    expect(whatMatches('homemade quesadilla')).toEqual(['Homemade Quesadilla']);
    expect(whatMatches('2 homemade quesadillas')).toEqual(['Homemade Quesadilla']);
    expect(whatMatches('my quesadilla')).toEqual(['Homemade Quesadilla']);
    expect(whatMatches('home breakfast sandwich')).toEqual(['Home Breakfast Sandwich']);
    expect(whatMatches('a shake meal and a coffee')).toEqual(['Shake Meal', '-']);
  });

  test('regression: a bare quesadilla is still not the homemade one', () => {
    expect(whatMatches('a quesadilla')).toEqual(['-']);
    expect(whatMatches('had a quesadilla')).toEqual(['-']);
  });

  test('a span never forms across a comma, and a later quantity breaks it', () => {
    expect(whatMatches("fat boy's burger, fries")).toEqual(['-', '-']);
    expect(whatMatches("fat boy's burger and 3 fries")).toEqual(['-', '-']);
  });

  test('a span logs the meal once, accounts for BOTH entries, and estimates only the rest', async () => {
    const burger = {
      _id: 'meal-fb',
      name: "Fat Boy's Burger and Fries",
      meal_type: 'lunch',
      food_items: [
        { food_item_id: food('f-burger', 'Cheeseburger', 700), servings: 1 },
        { food_item_id: food('f-fries', 'French Fries', 400), servings: 1 }
      ]
    };
    mealFind.mockImplementation(() => chain([burger]));
    estimateDishes.mockImplementation(async () => ({ ok: true, dishes: [estimated(0, 'Coke', 140)] }));

    const result = await run("2 fat boy's burger and fries and a coke");

    expect(result.requested).toBe(3);
    // The model saw only the coke — "fries" was part of the meal's name.
    expect(estimateDishes).toHaveBeenCalledTimes(1);
    expect(estimateDishes.mock.calls[0][0].map((e) => e.dish)).toEqual(['coke']);
    expect(result.logged.map((row) => row.source)).toEqual(['saved-meal', 'saved-meal', 'estimate']);
    // The first entry's quantity is the meal's.
    expect(savedLogs.slice(0, 2).map((log) => log.servings)).toEqual([2, 2]);
    expect(savedLogs[0].notes).toBe("Added from meal: Fat Boy's Burger and Fries");
    expect(result.logged[0].entryIndexes).toEqual([0, 1]);
    expect(everyEntryAccountedFor(result)).toBe(true);
  });

  test('a span whose components all fail still accounts for every entry it consumed', async () => {
    mealFind.mockImplementation(() => chain([{
      _id: 'meal-fb',
      name: "Fat Boy's Burger and Fries",
      food_items: [{ food_item_id: null, servings: 1 }]
    }]));

    const result = await run("fat boy's burger and fries");

    expect(result.logged).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ reason: 'missing-from-saved-meal', entryIndexes: [0, 1] });
    expect(everyEntryAccountedFor(result)).toBe(true);
    expect(estimateDishes).not.toHaveBeenCalled();
  });
});

describe('when the saved lookup fails', () => {
  test('the dish still logs by the ordinary path', async () => {
    mealFind.mockImplementation(() => { throw new Error('mongo down'); });
    estimateDishes.mockImplementation(async () => ({ ok: true, dishes: [estimated(0, 'Quesadilla', 700)] }));

    const result = await run('homemade quesadilla');

    expect(result.logged).toHaveLength(1);
    expect(result.logged[0].source).toBe('estimate');
  });
});
