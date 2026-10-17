// Wave A scenes (pages): Food Log, Home, Weight, My Foods, My Meals, the
// household views, the empty states, the ErrorBoundary, Activity and the
// Health dashboard. Prefix 5x. See scenes.mjs for how this file is gathered.
//
// Everything here is page-scoped: a scene stubs its own GraphQL (and REST) and
// takes it away again in teardown, because one page serves every scene of a
// viewport. The two things that cannot be undone (a fixed clock) are in `tail`.
import { json, corsHeaders } from '../../lib/net.mjs';
import {
  OPS, SETTINGS, DERIVED, DAILY_SUMMARY, WEIGHTS, SAVED_MEALS, FOODS, BPS, experienceOf, heatherOps,
} from './fixtures.mjs';
import { must, scrollToSection, HEATHER, isoLocal } from './helpers.mjs';

// `must`, but it waits a few seconds first: a dialog's content (a household log,
// a copy count) arrives after a request, and a dark first run is the slow one.
const need = async (locator, what) => {
  await locator.first().waitFor({ timeout: 5000 }).catch(() => {});
  return must(locator, what);
};

// ── Plumbing ───────────────────────────────────────────────────────────────

// helpers.mjs's withPageOps stubs GraphQL by operation name but cannot answer
// a 502. The "Can't reach FitnessGeek" scenes need exactly that, so this is the
// same page-scoped stub with a `fail(op, vars)` hook. `page.route()` beats the
// context's route, and it is dropped again in teardown or on a throw.
async function routeOps(page, ops, { fail } = {}) {
  await page.route('**/graphql', (r) => {
    if (r.request().method() === 'OPTIONS') {
      return r.fulfill({ status: 204, headers: corsHeaders(r), body: '' });
    }
    let payload = {};
    try { payload = JSON.parse(r.request().postData() || '{}'); } catch { /* a miss, not a crash */ }
    const op = payload.operationName || (/\b(?:query|mutation)\s+([A-Za-z0-9_]+)/.exec(payload.query || '') || [])[1];
    const vars = payload.variables || {};
    if (fail && fail(op, vars)) {
      return r.fulfill({
        status: 502,
        contentType: 'application/json',
        headers: corsHeaders(r),
        body: JSON.stringify({ errors: [{ message: 'Bad gateway' }] }),
      });
    }
    const entry = ops[op];
    const data = typeof entry === 'function' ? entry(vars, r) : entry;
    if (data === undefined) {
      console.log(`  [graphql] unstubbed op: ${op}`);
      return json(r, { data: {} });
    }
    return json(r, { data });
  });
}

async function withOps(page, ops, fn, opts) {
  await routeOps(page, ops, opts);
  try {
    return await fn();
  } catch (err) {
    await page.unroute('**/graphql');
    throw err;
  }
}

/**
 * A scene on a page-scoped op set. `build()` returns the ops (called per run so
 * a fresh date or counter is read each time); `run(page, h)` does the acting.
 * `dialog` closes with Escape before the stub goes.
 */
const pageScene = (name, build, run, { path = '/dashboard', wait = 1500, dialog = false, ...extra } = {}) => ({
  name,
  ...extra,
  async setup(page, h) {
    const built = build();
    const { ops, fail } = built.ops ? built : { ops: built };
    return withOps(page, ops, async () => {
      await page.goto(h.base + path, { waitUntil: 'networkidle' });
      await h.settle(wait);
      await run(page, h);
    }, { fail });
  },
  async teardown(page, h) {
    if (dialog) await h.esc(400);
    await page.unroute('**/graphql');
  },
});

// ── Dates and rows ──────────────────────────────────────────────────────────

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoLocal(d); };
const TODAY = daysAgo(0);
const YEST = daysAgo(1);
const weekdayOf = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', { weekday: 'long' });
};

const nutr = (cal, p = 8, c = 10, f = 4, fib = 1) => ({
  __typename: 'Nutrition', calories_per_serving: cal, protein_grams: p, carbs_grams: c, fat_grams: f,
  fiber_grams: fib, sugar_grams: 2, sodium_mg: 120,
});

let seq = 0;
// One logged entry, shaped like the FoodLog the gateway returns.
const row = (name, meal, servings, cal, { day = TODAY, size = 100, unit = 'g', brand = null, macros = [8, 10, 4] } = {}) => {
  seq += 1;
  const n = nutr(cal, ...macros);
  return {
    __typename: 'FoodLog', id: `pg${seq}`, log_date: day, meal_type: meal, servings, notes: null,
    nutrition: n, calculatedNutrition: n,
    food_item_id: { __typename: 'FitnessFood', id: `pf${seq}`, name, brand, serving_size: size, serving_unit: unit, barcode: null },
  };
};

const totalsOf = (rows) => rows.reduce((a, l) => {
  const s = l.servings;
  a.calories += l.nutrition.calories_per_serving * s;
  a.protein_grams += l.nutrition.protein_grams * s;
  a.carbs_grams += l.nutrition.carbs_grams * s;
  a.fat_grams += l.nutrition.fat_grams * s;
  a.fiber_grams += l.nutrition.fiber_grams * s;
  return a;
}, { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0, fiber_grams: 0 });

const mealTotal = (rows, meal) => {
  const t = totalsOf(rows.filter((r) => r.meal_type === meal));
  return { __typename: 'MealTotal', calories: Math.round(t.calories), protein_grams: Math.round(t.protein_grams), carbs_grams: Math.round(t.carbs_grams), fat_grams: Math.round(t.fat_grams) };
};

const summaryFor = (rows, date, goal, over = {}) => {
  const t = totalsOf(rows);
  return {
    ...DAILY_SUMMARY,
    date,
    calorieGoal: goal,
    totals: {
      ...DAILY_SUMMARY.totals,
      calories: Math.round(t.calories), protein_grams: Math.round(t.protein_grams), carbs_grams: Math.round(t.carbs_grams),
      fat_grams: Math.round(t.fat_grams), fiber_grams: Math.round(t.fiber_grams),
      net_carbs_grams: Math.round(t.carbs_grams - t.fiber_grams),
      ...over,
    },
    meals: {
      __typename: 'MealTotals',
      breakfast: mealTotal(rows, 'breakfast'), lunch: mealTotal(rows, 'lunch'),
      dinner: mealTotal(rows, 'dinner'), snack: mealTotal(rows, 'snack'),
    },
  };
};

/** GetFoodLogs / GetDailySummary / GetFoodLogActivity answering for whatever day is asked. */
const ledger = (rows, goal = 2340, over = {}) => ({
  GetFoodLogs: (v = {}) => ({
    foodLogs: v.startDate
      ? rows.filter((r) => r.log_date >= v.startDate && (!v.endDate || r.log_date <= v.endDate))
      : rows.filter((r) => r.log_date === (v.date || TODAY)),
  }),
  GetDailySummary: (v = {}) => ({
    dailySummary: summaryFor(rows.filter((r) => r.log_date === (v.date || TODAY)), v.date || TODAY, goal, over),
  }),
  GetFoodLogActivity: { foodLogs: rows.map((r) => ({ __typename: 'FoodLog', id: r.id, log_date: r.log_date })) },
});

const FULL = { GetFitnessExperience: experienceOf({ mode: 'full', first_run_done: true }) };
const fullOps = (rows, extra = {}) => ({ ...OPS, ...FULL, ...ledger(rows), ...extra });
// Heather: Simple, no history of any kind, whatever `rows` says is today.
const simpleOps = (rows, extra = {}) => ({ ...heatherOps(HEATHER, { today: rows }), ...ledger(rows, 1800), ...extra });

// ── Fixtures for the Food Log scenes ────────────────────────────────────────

// Scene brief a-foodlog 1: two eggs at 78 cal, Greek yogurt 190, and a lunch
// food at 1.5 servings of 4 oz (so the row says "6 oz"). Dinner is empty.
const logDay = (day = TODAY) => [
  row('Egg', 'breakfast', 2, 78, { day, macros: [6, 1, 5] }),
  row('Greek yogurt', 'breakfast', 1, 190, { day, macros: [18, 8, 10] }),
  row('Chicken salad wrap', 'lunch', 1.5, 210, { day, size: 4, unit: 'oz', macros: [18, 20, 7] }),
];

// ── The Food Log ────────────────────────────────────────────────────────────

const foodLogScenes = [
  // Simple Log, today: plain rows (name, amount, calories), only "+ Add" in the
  // header, no Copy link, "Nothing yet" on the empty dinner.
  pageScene('50-simple-log-today', () => simpleOps(logDay()), async (page, h) => {
    await need(page.getByRole('button', { name: /^Edit Egg, ×2, 156 cal$/ }), 'Egg row with its amount');
    await need(page.getByText('6 oz', { exact: true }), 'the "6 oz" amount');
    await need(page.getByText('Nothing yet', { exact: true }), 'dinner "Nothing yet"');
    if (await page.getByRole('button', { name: /copy a meal/i }).count()) throw new Error('Simple shows Copy a meal');
    if (await page.getByText('Save as a meal').count()) throw new Error('Simple shows "Save as a meal"');
    await scrollToSection(page, h, '#meal-section-breakfast', 88);
  }, { path: '/food-log' }),

  // Full Log, same fixture: star, pencil and Remove on each row, "Save as a meal"
  // and "Add" in the header, and the Copy / household links under the meals.
  pageScene('50b-full-log-today', () => fullOps(logDay()), async (page, h) => {
    await need(page.getByRole('button', { name: 'Edit', exact: true }).first(), 'a row pencil');
    await need(page.getByRole('button', { name: 'Remove', exact: true }).first(), 'a row Remove');
    await need(page.getByRole('button', { name: /save breakfast as a meal/i }), 'Save as a meal');
    await need(page.getByRole('button', { name: /copy a meal from another day/i }), 'Copy a meal link');
    await scrollToSection(page, h, '#meal-section-breakfast', 88);
  }, { path: '/food-log' }),

  // Edit entry in Simple: tap the Egg row. Calories, Servings, Day and Meal, then
  // Remove, and Save full-width at the bottom.
  pageScene('50c-edit-entry-simple', () => simpleOps(logDay()), async (page, h) => {
    await (await need(page.getByRole('button', { name: /^Edit Egg, ×2/ }), 'Egg row')).click();
    await h.settle(800);
    const dlg = await need(page.getByRole('dialog'), 'edit dialog');
    await need(dlg.getByRole('button', { name: /^save/i }), 'Save');
    await need(dlg.getByText('Remove', { exact: false }).first(), 'Remove');
  }, { path: '/food-log', dialog: true }),

  // Edit entry in Full: the pencil opens per-serving inputs, Remove, Save at the bottom.
  pageScene('50d-edit-entry-full', () => fullOps(logDay()), async (page, h) => {
    await (await need(page.getByRole('button', { name: 'Edit', exact: true }).first(), 'row pencil')).click();
    await h.settle(800);
    const dlg = await need(page.getByRole('dialog'), 'edit dialog');
    await need(dlg.getByRole('button', { name: /^save/i }), 'Save');
  }, { path: '/food-log', dialog: true }),

  // Copy a meal, just opened: "Choose which meal to copy." and Copy dim.
  pageScene('50e-copy-meal-opened', () => fullOps(logDay()), async (page, h) => {
    await (await need(page.getByRole('button', { name: /copy a meal from another day/i }), 'Copy link')).click();
    await h.settle(800);
    const dlg = await need(page.getByRole('dialog'), 'copy dialog');
    await need(dlg.getByText('Choose which meal to copy.'), 'the opening summary');
    await need(dlg.getByRole('button', { name: /^copy$/i, disabled: true }), 'Copy disabled');
  }, { path: '/food-log', dialog: true }),

  // Copy a meal from Sarah (who shares her log): Whose log = Sarah, Which meal =
  // Dinner. The summary reads "Copy Sarah's dinner from <day> into today's dinner
  // (3 foods)" and Copy is live at the bottom.
  pageScene('50f-copy-meal-sarah', () => fullOps(logDay()), async (page, h) => {
    await (await need(page.getByRole('button', { name: /copy a meal from another day/i }), 'Copy link')).click();
    await h.settle(800);
    const dlg = await need(page.getByRole('dialog'), 'copy dialog');
    await (await need(dlg.getByRole('combobox', { name: /whose log/i }), 'Whose log')).click();
    await (await need(page.getByRole('option', { name: 'Sarah' }), 'Sarah option')).click();
    await h.settle(300);
    await (await need(dlg.getByRole('combobox', { name: 'Which meal', exact: true }), 'Which meal')).click();
    await (await need(page.getByRole('option', { name: 'Dinner', exact: true }), 'Dinner option')).click();
    await h.settle(900);
    await need(dlg.getByText(/Copy Sarah’s dinner from .* into today’s dinner \(3 foods\)/), 'the Sarah summary');
    await need(dlg.getByRole('button', { name: /^copy$/i, disabled: false }), 'Copy live');
  }, { path: '/food-log', dialog: true }),

  // What your household ate: "What Sarah ate today" with a Copy to your log on each meal.
  pageScene('50g-household-view', () => fullOps(logDay()), async (page, h) => {
    await (await need(page.getByRole('button', { name: /what your household ate/i }), 'household link')).click();
    await h.settle(1200);
    const dlg = await need(page.getByRole('dialog'), 'household dialog');
    try {
      await need(dlg.getByText(/What Sarah ate today/), 'What Sarah ate today');
    } catch (e) { throw new Error(`${e.message} :: ${(await dlg.innerText()).slice(0, 300).replace(/\n/g, ' | ')}`); }
    await need(dlg.getByRole('button', { name: /^Copy Sarah’s .* to your log$/ }).first(), 'Copy to your log');
  }, { path: '/food-log', dialog: true }),

  // Save a meal from the Full Log: the name box, the foods in it, and the save at the bottom.
  pageScene('50h-save-as-meal', () => fullOps(logDay()), async (page, h) => {
    await (await need(page.getByRole('button', { name: /save breakfast as a meal/i }), 'Save as a meal')).click();
    await h.settle(800);
    await need(page.getByRole('dialog'), 'save-meal dialog');
  }, { path: '/food-log', dialog: true }),

  // An empty Log in a brand-new account (Full): four "Nothing yet" meals, no target.
  pageScene('57c-empty-log', () => newAccount('full'), async (page) => {
    await need(page.getByText('Nothing yet', { exact: true }).first(), 'an empty meal');
  }, { path: '/food-log' }),
  pageScene('57d-empty-log-simple', () => newAccount('simple'), async (page) => {
    await need(page.getByText('Nothing yet', { exact: true }).first(), 'an empty meal');
  }, { path: '/food-log' }),
];

// ── Brand-new account: everything empty ─────────────────────────────────────

const ZERO_SUMMARY = (date = TODAY) => summaryFor([], date, 0);
const NO_TARGET = {
  ...DERIVED,
  calories: { __typename: 'DerivedCalories', daily: 0, weekly_schedule: [0, 0, 0, 0, 0, 0, 0] },
  today: { ...DERIVED.today, base_calories: 0, activity_add_kcal: 0, target_calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
};
const noGoalSettings = (base = SETTINGS) => ({
  ...base,
  garmin: { ...base.garmin, enabled: false, username: null },
  weight_goal: null,
  nutrition_goal: { ...base.nutrition_goal, enabled: false, start_date: null, start_weight: null, target_weight: null, bmr: null, daily_calorie_target: null },
});
const newAccount = (mode, patch = {}) => ({
  ...OPS,
  GetFitnessExperience: experienceOf({ mode, first_run_done: true, preferred_name: 'Heather', ...patch }),
  ...ledger([], 0),
  GetDailySummary: (v = {}) => ({ dailySummary: ZERO_SUMMARY(v.date) }),
  GetDerivedMacros: { derivedMacros: NO_TARGET },
  GetFitnessWeights: { fitnessWeights: [] },
  GetBps: { bloodPressures: [] },
  GetBodyCompositionSummary: { bodyCompositionSummary: null },
  GetBodyCompositions: { bodyCompositions: [] },
  GetFitnessMeals: { fitnessMeals: [] },
  GetFitnessFoods: { fitnessFoods: [] },
  GetFitnessMedications: { fitnessMedications: [] },
  GetFitnessUserSettings: { fitnessUserSettings: noGoalSettings() },
  GetLoginStreak: { loginStreak: { __typename: 'LoginStreak', current_streak: 0, longest_streak: 0, last_login: TODAY } },
  GetGarminDaily: { garminDaily: null },
});

// ── My Foods, My Meals ──────────────────────────────────────────────────────

const food = (id, name, brand, source, cal, extra = {}) => ({
  __typename: 'FitnessFood', id, name, brand, serving_size: 100, serving_unit: 'g', barcode: null, is_verified: false,
  nutrition: nutr(cal), ...(source === undefined ? {} : { source }), ...extra,
});

const libraryScenes = [
  // My Foods with nothing in it: the empty state and the way in.
  pageScene('51-my-foods-empty', () => ({ ...OPS, ...FULL, GetFitnessFoods: { fitnessFoods: [] } }), async (page) => {
    await need(page.getByRole('button', { name: /new food/i }), 'New food');
  }, { path: '/my-foods' }),

  // My Foods rows by source: "usda" says USDA, an unknown or missing source says
  // nothing at all (UX review 2.7), a custom food says "My food".
  pageScene('51a-my-foods-sources', () => ({
    ...OPS,
    ...FULL,
    GetFitnessFoods: {
      fitnessFoods: [
        food('mf1', 'Chicken breast, cooked', null, 'usda', 165),
        food('mf2', 'Protein bar, peanut butter', 'Quest', 'unknown', 200),
        food('mf3', 'Grandma’s banana bread', null, undefined, 320),
        food('mf4', 'Greek yogurt', 'Fage', 'openfoodfacts', 190),
        food('mf5', 'Overnight oats', null, 'custom', 310),
      ],
    },
  }), async (page) => {
    await need(page.getByText('Chicken breast, cooked').first(), 'usda row');
    await need(page.getByText('Protein bar, peanut butter').first(), 'unknown-source row');
    await need(page.getByText('Grandma’s banana bread').first(), 'missing-source row');
    if (await page.getByText(/^unknown$/i).count()) throw new Error('an unknown source says "Unknown"');
  }, { path: '/my-foods' }),

  // My Meals with SAVED_MEALS.
  pageScene('51b-my-meals', () => ({ ...OPS, ...FULL, GetFitnessMeals: { fitnessMeals: SAVED_MEALS } }), async (page) => {
    await need(page.getByText('Usual breakfast').first(), 'a saved meal');
  }, { path: '/my-meals' }),

  // My Meals, nothing saved yet.
  pageScene('51c-my-meals-empty', () => ({ ...OPS, ...FULL, GetFitnessMeals: { fitnessMeals: [] } }), async (page) => {
    await need(page.locator('main, #root').first(), 'the page');
  }, { path: '/my-meals' }),
];

// ── Home ────────────────────────────────────────────────────────────────────

const HOME_PROBLEM = /Can’t reach FitnessGeek right now\. What you logged is safe\./;
const FAILING_READS = new Set(['GetFoodLogs', 'GetDailySummary', 'GetDerivedMacros', 'GetFitnessWeights']);

// Home after a failed load, Simple and Full: the reads 502, so the hero says it
// couldn't reach FitnessGeek (with Try again), the meal cards say "—", and there
// is no "Weigh in" chip and no "Nothing yet" to read as an empty day.
const homeFailed = (name, build) => pageScene(name, () => ({ ops: build(), fail: (op) => FAILING_READS.has(op) }), async (page) => {
  await need(page.locator('[data-testid="home-load-problem"]'), 'the load-problem line');
  await need(page.getByText(HOME_PROBLEM), 'the sentence');
  await need(page.getByRole('button', { name: 'Try again' }), 'Try again');
  if (await page.getByText('Nothing yet', { exact: true }).count()) throw new Error('"Nothing yet" shown after a failed read');
  if (await page.getByText(/^Weigh in/).count()) throw new Error('a Weigh in chip after a failed read');
}, { path: '/dashboard', wait: 2200 });

// The meal cards after a load that worked and a reload that did not: she removes
// something, the reads behind it 502, and the cards keep their foods while the
// line says so. `armed` flips after the first paint.
const homeReloadFailed = (name, build, { simple = false } = {}) => {
  const state = { armed: false };
  return {
    name,
    async setup(page, h) {
      state.armed = false;
      await withOps(page, build(), async () => {
        await page.goto(h.base + '/dashboard', { waitUntil: 'networkidle' });
        await h.settle(1500);
        await need(page.getByText(/Greek yogurt|Chicken salad wrap/).first(), 'a food on the cards');
        state.armed = true;
        // Anything that changes the day reloads Home; a Remove is the simplest.
        await (await need(page.getByRole('button', { name: 'Remove Greek yogurt from breakfast' }), 'Remove on a card')).click();
        await h.settle(1500);
        try { await need(page.getByText(HOME_PROBLEM), 'the line after the failed reload'); } catch (e) {
          throw new Error(`${e.message} :: ${(await page.locator('body').innerText()).slice(0, 700).replace(/\n/g, ' | ')}`);
        }
        await need(page.getByText(/Greek yogurt|Chicken salad wrap/).first(), 'the cards keep their foods');
      }, { fail: (op) => state.armed && FAILING_READS.has(op) });
    },
    async teardown(page, h) { await h.esc(400); await page.unroute('**/graphql'); },
  };
};

const homeAmountRows = () => [
  row('Egg', 'breakfast', 1, 78, { macros: [6, 1, 5] }),
  row('Egg', 'breakfast', 1, 78, { macros: [6, 1, 5] }),
  row('Toast', 'lunch', 2, 80, { macros: [3, 14, 1] }),
];

const homeScenes = [
  homeFailed('52-home-failed-simple', () => simpleOps(logDay())),
  homeFailed('52a-home-failed-full', () => fullOps(logDay())),
  homeReloadFailed('52b-home-reload-failed-full', () => fullOps(logDay())),

  // Amounts on Home: Simple merges the two eggs into "Egg ×2" and says "Toast ×2".
  pageScene('52c-home-amounts-simple', () => simpleOps(homeAmountRows()), async (page) => {
    await need(page.getByText('Egg', { exact: false }).filter({ hasText: '×2' }).first(), '"Egg ×2"');
    await need(page.getByText('Toast', { exact: false }).filter({ hasText: '×2' }).first(), '"Toast ×2"');
  }),
  // Full lists each entry: Egg, Egg, Toast ×2.
  pageScene('52d-home-amounts-full', () => fullOps(homeAmountRows()), async (page, h) => {
    await need(page.getByText('Toast', { exact: false }).filter({ hasText: '×2' }).first(), '"Toast ×2"');
    await scrollToSection(page, h, '#todays-meals', 88);
  }),

  // Full Home, fat over target: "99 of 78g · 21 over", and "72%" in the plate.
  {
    ...pageScene('52e-home-fat-over', () => ({
      ...OPS,
      ...FULL,
      ...ledger(logDay(), 2340, { fat_grams: 99, calories: 1685 }),
    }), async (page) => {
      await need(page.getByText(/99 of 78g · 21 over/), '"99 of 78g · 21 over"');
      await need(page.getByText('72%', { exact: true }).first(), 'the plate centre 72%');
    }),
  },
];

// ── Weight ──────────────────────────────────────────────────────────────────

// Daily weigh-ins since the plan started 121 days ago (232 start, 195 goal,
// goal date 45 days out, a pound a week planned), easing down to a 7-day average
// near 219.9. Day 3 is a missed day, so "a day without one" exists. Newest first.
const goalWeights = ({ today } = {}) => {
  const out = [];
  for (let n = 0; n <= 121; n += 1) {
    if (n === 3) continue;
    const since = 121 - n;
    let w = Math.round((231.7 - 0.1 * since + Math.sin(n * 2.1) * 0.35) * 10) / 10;
    if (n === 0 && today != null) w = today;
    out.push({
      __typename: 'FitnessWeight', id: `gw${n}`, weight_value: w, log_date: daysAgo(n), notes: null,
      source: 'manual', formatted_date: daysAgo(n),
    });
  }
  return out;
};
const withGoal = (doc) => ({
  ...doc,
  weight_goal: { ...SETTINGS.weight_goal, startWeight: 232, targetWeight: 195, startDate: daysAgo(121), goalDate: daysAgo(-45), ratePerWeek: 1 },
  nutrition_goal: { ...doc.nutrition_goal, start_date: daysAgo(130) },
});
const weightOps = (base, weights) => ({
  ...base,
  GetFitnessWeights: { fitnessWeights: weights },
  GetFitnessUserSettings: { fitnessUserSettings: withGoal(base.GetFitnessUserSettings.fitnessUserSettings) },
});
const fullWeight = (weights = goalWeights()) => weightOps(fullOps([]), weights);
const simpleWeight = (weights = goalWeights()) => weightOps(simpleOps([]), weights);

// The chart box is the element after the "lb" caption.
const chartBox = (page, testid) => page.locator(`[data-testid="${testid}"] + *`).first();

// Tap the right half of a chart on a phone and check the tooltip stays inside
// the card and keeps its words on one line each.
async function tapChartTooltip(page, h, box) {
  const b = await box.boundingBox();
  if (!b) throw new Error('chart has no box');
  const x = b.x + b.width * 0.7;
  const y = b.y + b.height * 0.5;
  const tipLoc = page.locator('[data-testid="chart-tooltip"]');
  await page.touchscreen.tap(x, y);
  await h.settle(700);
  let how = 'tap';
  if (!(await tipLoc.count())) {
    // A phone's tap leaves an emulated mouse behind; if the tap alone shows
    // nothing, say so and see whether a touch-then-move does.
    await page.mouse.move(x - 6, y);
    await page.mouse.move(x, y);
    await h.settle(700);
    how = 'tap then mouse move (a plain tap showed no tooltip)';
  }
  const tip = await need(tipLoc, `the tooltip after ${how}`);
  h.log(`tooltip via ${how}`);
  const t = await tip.first().boundingBox();
  if (!t) throw new Error('tooltip has no box');
  if (t.x < b.x - 1 || t.x + t.width > b.x + b.width + 1) {
    throw new Error(`tooltip leaves the chart: tip ${Math.round(t.x)}-${Math.round(t.x + t.width)} chart ${Math.round(b.x)}-${Math.round(b.x + b.width)}`);
  }
  if (t.width < 140 || t.height > 130) throw new Error(`tooltip wraps: ${Math.round(t.width)}x${Math.round(t.height)}`);
}

const weightScenes = [
  // The goal card in Full: the pace sentence, "12.1 of 37 lb lost", the basis
  // line, a lemon "Behind plan" chip, and the projection in words.
  pageScene('53-weight-goal-full', () => fullWeight(), async (page) => {
    await need(page.getByText(/You’re losing [\d.]+ lb a week/), 'the pace sentence');
    await need(page.getByText(/of 37 lb lost/), '"… of 37 lb lost"');
    await need(page.getByText(/From your 7-day average, 21\d\.\d lb/), 'the basis line');
    await need(page.getByText('Behind plan', { exact: true }), 'the Behind plan chip');
  }, { path: '/weight', wait: 1800 }),

  // The goal card in Simple: "Down 12.1 lb since June", and no chip or tiles.
  pageScene('53a-weight-goal-simple', () => simpleWeight(), async (page) => {
    await need(page.locator('[data-testid="weight-trend-words"]'), 'the trend words');
    const words = await page.locator('[data-testid="weight-trend-words"]').innerText();
    if (!/^Down 1\d(\.\d)? lb since /.test(words)) throw new Error(`trend words say "${words}"`);
    if (await page.getByText('Behind plan', { exact: true }).count()) throw new Error('Simple shows the plan chip');
  }, { path: '/weight', wait: 1800 }),

  // The weight dialog on a day that already has a weight: "You already have 218.7
  // for today. Saving replaces it." and the button says Replace.
  pageScene('53b-weight-replace-warning', () => fullWeight(goalWeights({ today: 218.7 })), async (page, h) => {
    await (await need(page.getByRole('button', { name: /log weight/i }).first(), 'Log weight')).click();
    await h.settle(800);
    const dlg = await need(page.getByRole('dialog'), 'weight dialog');
    await need(dlg.getByText('You already have 218.7 for today. Saving replaces it.'), 'the replace note');
    await need(dlg.getByRole('button', { name: 'Replace', exact: true }), 'Replace');
  }, { path: '/weight', viewports: ['phone'], dialog: true }),

  // The same dialog with the day moved to one without a weigh-in: the note goes
  // and the button says Save again.
  pageScene('53c-weight-save-other-day', () => fullWeight(goalWeights({ today: 218.7 })), async (page, h) => {
    await (await need(page.getByRole('button', { name: /log weight/i }).first(), 'Log weight')).click();
    await h.settle(800);
    const dlg = await need(page.getByRole('dialog'), 'weight dialog');
    await need(dlg.getByText(/You already have 218\.7/), 'the replace note first');
    await dlg.getByLabel('Date').fill(daysAgo(3));
    await h.settle(500);
    if (await dlg.getByText(/You already have/).count()) throw new Error('the replace note stayed on a free day');
    await need(dlg.getByRole('button', { name: 'Save', exact: true }), 'Save');
  }, { path: '/weight', viewports: ['phone'], dialog: true }),

  // The weight trend, tapped on its right half: the tooltip stays inside the card
  // in one-line rows, and the "lb" caption sits above the chart.
  pageScene('53d-weight-tooltip', () => fullWeight(), async (page, h) => {
    await scrollToSection(page, h, 'text=Weight trend', 88);
    await need(page.locator('[data-testid="weight-y-unit"]'), 'the lb caption');
    await tapChartTooltip(page, h, chartBox(page, 'weight-y-unit'));
  }, { path: '/weight', wait: 1800, viewports: ['phone'] }),

  // The body-composition trend, the same tap.
  pageScene('53e-bodycomp-tooltip', () => fullWeight(), async (page, h) => {
    await scrollToSection(page, h, '#body-composition');
    await scrollToSection(page, h, 'text=Line: 7-day average · dots: each scan', 160);
    await need(page.locator('[data-testid="bodycomp-y-unit"]'), 'the lb caption');
    await tapChartTooltip(page, h, page.locator('svg[aria-label*="over time, in pounds"]').first());
  }, { path: '/weight', wait: 1800, viewports: ['phone'] }),

  // A brand-new account's Weight page: no logs, no goal, and a way to start.
  pageScene('57a-weight-empty', () => newAccount('full'), async (page) => {
    await need(page.getByText('Set your goal', { exact: false }).first(), 'the Set your goal prompt');
  }, { path: '/weight', wait: 1800 }),
  pageScene('57e-weight-empty-simple', () => newAccount('simple'), async (page) => {
    await need(page.getByText('Set your goal', { exact: false }).first(), 'the Set your goal prompt');
  }, { path: '/weight', wait: 1800 }),
  // And Blood pressure with no readings.
  pageScene('57b-bp-empty', () => newAccount('full'), async (page) => {
    await need(page.locator('main, #root').first(), 'the page');
  }, { path: '/blood-pressure', wait: 1800 }),
];

// ── More, the sidebar, first run, empty Home ────────────────────────────────

const moreScenes = [
  // More in Simple: Check-ins and You first, "Everything else" with the "needs…"
  // lines, and no Profile row.
  pageScene('54-more-simple-order', () => simpleOps([]), async (page) => {
    await need(page.locator('[data-testid="more-page"]'), 'More page');
    if (await page.getByRole('link', { name: /^profile/i }).count()) throw new Error('Simple More still lists Profile');
    await need(page.getByText(/needs/i).first(), 'a "needs…" line');
    const heads = await page.locator('[data-testid="more-page"] h2').allInnerTexts();
    if (heads[0] !== 'Check-ins' || heads[1] !== 'You') throw new Error(`More order is ${heads.join(', ')}`);
  }, { path: '/more', wait: 1400, viewports: ['phone'] }),

  // The Full sidebar on desktop: the sections, and no Profile.
  pageScene('54a-sidebar-full', () => fullOps(logDay()), async (page) => {
    await need(page.getByText('Settings', { exact: true }).first(), 'Settings in the sidebar');
    await need(page.getByText('Looking back', { exact: true }), 'the sidebar sections');
    if (await page.getByText(/^Profile$/).count()) throw new Error('the sidebar still lists Profile');
  }, { path: '/dashboard', wait: 1500, viewports: ['desktop'] }),
];

// Heather before she has answered anything: step 3 of the first run.
const firstRunOps = () => ({
  ...newAccount('simple'),
  GetFitnessExperience: experienceOf({ mode: null, first_run_done: false, preferred_name: null }),
});
const toStep3 = async (page, h, { goal = null } = {}) => {
  await (await need(page.getByRole('button', { name: /^next$/i }).first(), 'Next')).click();
  await h.settle(400);
  if (goal) await (await need(page.getByRole('radio', { name: goal }), 'goal radio')).click();
  await (await need(page.getByRole('button', { name: /^next$/i }).first(), 'Next (2)')).click();
  await h.settle(500);
};

const firstRunScenes = [
  // Step 3: "Try logging your <meal>", "Add my <meal>", and Maybe later.
  pageScene('55-first-run-step3', firstRunOps, async (page, h) => {
    await toStep3(page, h, { goal: /lose a little weight/i });
    await need(page.getByRole('heading', { name: /try logging your/i }), 'step 3');
    await need(page.getByRole('button', { name: 'Maybe later' }), 'Maybe later');
  }, { viewports: ['phone'] }),

  // Home right after "Maybe later" with "Lose a little weight" picked and no
  // target: the plate offers "Set your daily target", never "Nothing logged".
  pageScene('55a-home-after-maybe-later', firstRunOps, async (page, h) => {
    await toStep3(page, h, { goal: /lose a little weight/i });
    await (await need(page.getByRole('button', { name: 'Maybe later' }), 'Maybe later')).click();
    await h.settle(1500);
    await need(page.locator('[data-testid="set-daily-target"]'), 'Set your daily target');
  }, { viewports: ['phone'] }),

  // A brand-new account's Home, Simple and Full: no target, no logs, no weights.
  pageScene('57f-home-empty-simple', () => newAccount('simple'), async (page) => {
    try { await need(page.locator('#todays-meals'), 'the meals heading'); } catch (e) {
      throw new Error(`${e.message} :: ${(await page.locator('body').innerText()).slice(0, 500).replace(/\n/g, ' | ')}`);
    }
  }, { wait: 1800 }),
  pageScene('57g-home-empty-full', () => newAccount('full'), async (page) => {
    try { await need(page.locator('#todays-meals'), 'the meals heading'); } catch (e) {
      throw new Error(`${e.message} :: ${(await page.locator('body').innerText()).slice(0, 500).replace(/\n/g, ' | ')}`);
    }
  }, { wait: 1800 }),
];

// ── The ErrorBoundary ───────────────────────────────────────────────────────

// A logged entry whose snapshot and food both lack nutrition: the Full Log row
// reads `nutrition.calories_per_serving` off nothing and throws mid-render, and the
// boundary under the router answers "Something went wrong." with a Reload button.
const brokenRow = () => {
  const r = row('Broken entry', 'lunch', 1, 100);
  return { ...r, nutrition: null, calculatedNutrition: null };
};
const boundaryScene = pageScene('56-error-boundary', () => fullOps([brokenRow()]), async (page) => {
  await need(page.locator('[data-testid="error-boundary"]'), 'the ErrorBoundary screen');
  await need(page.getByRole('button', { name: 'Reload' }), 'Reload');
}, { path: '/food-log', wait: 1500 });

// ── Activity and the Health dashboard (Garmin) ─────────────────────────────

const iso = (hh, mm = 0, day = TODAY) => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).toISOString();

const GARMIN_ON = {
  GetGarminStatus: {
    garminStatus: { __typename: 'GarminStatus', enabled: true, hasCredentials: true, hasTokens: true, lastConnectedAt: iso(6, 5) },
  },
  GetGarminDaily: {
    garminDaily: {
      __typename: 'GarminDaily', date: TODAY, steps: 8421, activeCalories: 512, restingHR: 54, weightLbs: 219.9,
      sleepMinutes: 412, fetchedAt: iso(9, 10), lastSyncAt: iso(9, 8),
    },
  },
  GetGarminSleep: {
    garminSleep: {
      __typename: 'GarminSleep', date: TODAY, totalSleepMinutes: 412, deepSleepMinutes: 74, lightSleepMinutes: 228,
      remSleepMinutes: 84, awakeSleepMinutes: 26, sleepStartTime: iso(22, 41, YEST), sleepEndTime: iso(6, 5), sleepScore: 78,
      sleepQuality: 'GOOD', sleepFeedback: 'POSITIVE_LONG_AND_DEEP', restingHeartRate: 54, avgOvernightHrv: 61,
      hrvStatus: 'BALANCED', avgSpO2: 95, avgRespiration: 14.2, avgSleepStress: 19, bodyBatteryChange: 54,
    },
  },
  GetGarminActivities: {
    garminActivities: [
      { __typename: 'GarminActivity', activityId: 'a1', activityName: 'Morning Run', activityType: 'running', startTimeLocal: `${TODAY} 06:42:11`, duration: 2520, distance: 5120, calories: 412, averageHR: 148, maxHR: 171, steps: 5980 },
      { __typename: 'GarminActivity', activityId: 'a2', activityName: 'Strength', activityType: 'strength_training', startTimeLocal: `${YEST} 17:30:00`, duration: 3300, distance: 0, calories: 288, averageHR: 112, maxHR: 138, steps: null },
      { __typename: 'GarminActivity', activityId: 'a3', activityName: 'Evening Walk', activityType: 'walking', startTimeLocal: `${daysAgo(2)} 19:10:00`, duration: 2100, distance: 2610, calories: 140, averageHR: 98, maxHR: 117, steps: 3400 },
    ],
  },
};
const activityOps = (extra = {}) => ({ ...OPS, ...FULL, ...GARMIN_ON, ...extra });

// Raw InfluxQL rows, one every ten minutes up to the afternoon, under the
// measurement's own column names (intradaySeries.js).
const intradayRows = (field, fn) => {
  const rows = [];
  for (let m = 0; m <= 14 * 60; m += 10) rows.push({ time: iso(Math.floor(m / 60), m % 60), [field]: fn(m / 60) });
  return rows;
};
const INTRADAY = {
  available: true,
  heartRate: intradayRows('HeartRate', (h) => Math.round(58 + (h > 6.5 && h < 7.5 ? 80 : 0) + (h > 12 && h < 12.8 ? 22 : 0) + Math.sin(h * 3) * 6)),
  stress: intradayRows('stressLevel', (h) => Math.max(5, Math.round(28 + Math.sin(h * 1.7) * 18))),
  bodyBattery: intradayRows('BodyBatteryLevel', (h) => Math.max(8, Math.round(h < 6 ? 40 + h * 9 : 94 - (h - 6) * 5.5))),
  breathing: intradayRows('BreathingRate', (h) => Math.round(14 + Math.sin(h * 2))),
};
const SLEEP_ANALYSIS = {
  available: true,
  qualityScore: 78,
  qualityLabel: 'GOOD',
  warnings: [],
  metrics: {
    architecture: { totalMinutes: 438, asleepMinutes: 412, deepPercent: 18, lightPercent: 55, remPercent: 20, awakePercent: 6, sleepEfficiency: 94 },
    continuity: { awakenings: 2, transitionsPerHour: 3.1, stageTransitions: 21 },
    cardiovascular: { restingHeartRate: 54, avgHeartRate: 58, avgDeepSleepHR: 52 },
    hrvRecovery: { avgHRV: 61, baselineHRV: 58, baselineNights: 7, hrvDeviation: 5, hrvStatus: 'BALANCED' },
    stress: { avgStress: 19, stressSpikes: 1, bodyBatteryStart: 34, bodyBatteryEnd: 88, bodyBatteryChange: 54 },
    respiration: { avgRespirationRate: 14.2, avgSpO2: 95, minSpO2: 92, spo2Dips: 0, longestDipMinutes: 0 },
  },
  recommendations: [
    { priority: 'MEDIUM', category: 'DEEP_SLEEP', issue: 'Deep sleep a little under 20%', suggestion: 'Keep the room cool and skip alcohol within three hours of bed.', impact: 'More deep sleep helps muscle repair and memory.' },
    { priority: 'LOW', category: 'CONSISTENCY', issue: 'Bedtime moved by 50 minutes', suggestion: 'Aim for the same bedtime within 30 minutes.', impact: 'A steady bedtime improves the score over a few weeks.' },
  ],
};
const RECOVERY = {
  available: true,
  readinessScore: 72,
  context: { sleep: { deepSleepPercent: 18 }, current: { stress: 31 } },
  recommendations: [
    { priority: 'MEDIUM', category: 'SLEEP', title: 'Protect tonight’s sleep', message: 'Deep sleep was 18% last night, a little under the 20% line.', action: 'Lights down by 10 and nothing heavy after 8.' },
    { priority: 'LOW', category: 'RECOVERY', title: 'A moderate day suits you', message: 'Your heart-rate variability is near your usual, so a normal workout is fine.', action: 'Zone 2 for 40 minutes, or your usual lift.' },
  ],
};
const INFLUX_ON = { GetFitnessUserSettings: { fitnessUserSettings: { ...SETTINGS, influxEnabled: true } } };

// Page-scoped /api/influx/* answers; dropped in teardown or on a throw.
async function influxRoutes(page, { sleep = SLEEP_ANALYSIS, recovery = RECOVERY, intraday = INTRADAY } = {}) {
  await page.route('**/api/influx/**', (r) => {
    const url = r.request().url();
    if (/\/influx\/status/.test(url)) return json(r, { userEnabled: true, serverConnected: true, error: null });
    if (/\/influx\/intraday\//.test(url)) return json(r, intraday);
    if (/\/influx\/sleep-analysis\//.test(url)) return json(r, sleep);
    if (/\/influx\/recovery-recommendations\//.test(url)) return json(r, recovery);
    if (/\/influx\/recovery-context\//.test(url)) return json(r, recovery.context || {});
    return json(r, { available: false });
  });
}

// A Health-dashboard scene: influx on, the REST answers up, the tab clicked.
const healthScene = (name, tabName, check, { influxOn = true, answers } = {}) => ({
  name,
  async setup(page, h) {
    await influxRoutes(page, answers);
    try {
      await withOps(page, { ...OPS, ...FULL, ...(influxOn ? INFLUX_ON : {}), ...ledger(logDay()), ...GARMIN_ON }, async () => {
        await page.goto(h.base + '/health', { waitUntil: 'networkidle' });
        await h.settle(1500);
        if (tabName) {
          await (await need(page.getByRole('tab', { name: tabName }), `the ${tabName} tab`)).click();
          await h.settle(1500);
        }
        await check(page, h);
      });
    } catch (err) {
      await page.unroute('**/api/influx/**');
      throw err;
    }
  },
  async teardown(page) {
    await page.unroute('**/graphql');
    await page.unroute('**/api/influx/**');
  },
});

const garminScenes = [
  // Activity with a connected Garmin: today so far, the night's sleep, recent workouts.
  pageScene('58-activity-garmin', () => activityOps(), async (page) => {
    await need(page.getByText('Today so far'), 'Today so far');
    await need(page.getByText('Morning Run').first(), 'a recent workout');
  }, { path: '/activity', wait: 1800 }),

  // Activity before Garmin is connected: the empty state and its way in.
  pageScene('58a-activity-not-connected', () => activityOps({
    GetGarminStatus: { garminStatus: { __typename: 'GarminStatus', enabled: false, hasCredentials: false, hasTokens: false, lastConnectedAt: null } },
  }), async (page) => {
    await need(page.getByText('Garmin isn’t connected'), 'the empty state');
    await need(page.getByRole('link', { name: 'Connect Garmin' }), 'Connect Garmin');
  }, { path: '/activity', wait: 1500 }),

  // The Health dashboard with the home data server off: what it needs, and the switch.
  healthScene('59-health-off', null, async (page) => {
    await need(page.getByText('Turn on the home data server first'), 'the turn-on prompt');
  }, { influxOn: false }),

  // Health, Overview: heart rate, stress and Body Battery through the day.
  healthScene('59a-health-overview', 'Overview', async (page) => {
    await need(page.getByRole('tab', { name: /overview/i, selected: true }), 'Overview selected');
    await need(page.locator('svg[role="img"]').first(), 'a chart');
  }),
  // Sleep analysis: the score, the metric cards, and the accordions below.
  healthScene('59b-health-sleep', 'Sleep analysis', async (page) => {
    await need(page.getByText('Your sleep', { exact: true }), 'the sleep summary');
    await need(page.getByText('78/100'), 'the sleep score');
  }),
  // Meal impact: how her heart rate answered the day's meals.
  healthScene('59c-health-meal-impact', 'Meal impact', async (page) => {
    await need(page.getByRole('tab', { name: /meal impact/i, selected: true }), 'Meal impact selected');
  }),
  // Recovery coach: the readiness score and the two notes.
  healthScene('59d-health-recovery', 'Recovery coach', async (page) => {
    await need(page.getByText('Ready-for-today score'), 'the readiness gauge');
    await need(page.getByText('Protect tonight’s sleep'), 'a recovery note');
  }),
  // Settings tab: the data-server switch and the baselines.
  healthScene('59e-health-settings', 'Settings', async (page) => {
    await need(page.getByRole('tab', { name: /settings/i, selected: true }), 'Settings selected');
  }),
  // The days the server has nothing for: sleep and recovery say so in a sentence.
  healthScene('59f-health-sleep-none', 'Sleep analysis', async (page) => {
    await need(page.getByText('No sleep for this night'), 'the empty sleep state');
  }, { answers: { sleep: { available: false }, recovery: { available: false } } }),
];

export const scenes = [
  ...foodLogScenes, ...libraryScenes, ...homeScenes, ...weightScenes, ...moreScenes, ...firstRunScenes, boundaryScene, ...garminScenes,
];

void FOODS; void BPS; void WEIGHTS; void scrollToSection;

// The one scene that cannot be undone: the clock is fixed at 19:00, so the
// Log's inline box picks "dinner". The Log on Yesterday names the day it adds to.
export const tail = [
  {
    name: '50a-simple-log-yesterday',
    async setup(page, h) {
      const evening = new Date();
      evening.setHours(19, 0, 0, 0);
      await page.clock.setFixedTime(evening);
      await withOps(page, simpleOps([...logDay(YEST), ...logDay(TODAY)]), async () => {
        await page.goto(`${h.base}/food-log?date=${YEST}`, { waitUntil: 'networkidle' });
        await h.settle(1500);
        const head = await need(page.locator('[data-testid="inline-add-day"]'), 'the inline box heading');
        const text = await head.innerText();
        const want = `Add to ${weekdayOf(YEST)}’s dinner (yesterday)`;
        if (text !== want) throw new Error(`inline box says "${text}", wanted "${want}"`);
        await need(page.getByRole('button', { name: /^Edit Egg, ×2/ }), 'yesterday\'s Egg row');
      });
    },
    teardown: (page) => page.unroute('**/graphql'),
  },
];
