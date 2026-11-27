// Wave A scenes (pages): Today (its rows, dialogs, other days, failed loads
// and empty states), Saved foods, Weight, More and the sidebar, the first run,
// the ErrorBoundary, and Trends (Food, Activity, Health). Prefix 5x, plus 20x
// (first run) and 70x/71x (the two container pages). See scenes.mjs for how
// this file is gathered.
//
// Everything here is page-scoped: a scene stubs its own GraphQL (and REST) and
// takes it away again in teardown, because one page serves every scene of a
// viewport. The two things that cannot be undone (a fixed clock) are in `tail`.
import { json, corsHeaders } from '../../lib/net.mjs';
import {
  OPS, SETTINGS, DERIVED, DAILY_SUMMARY, SAVED_MEALS, experienceOf,
} from './fixtures.mjs';
import { must, scrollToSection, isoLocal, setDetails, openMealMenu, openEdit } from './helpers.mjs';
import { withHistoryBounds, bareOpOf } from './history-ops.mjs';

// `must`, but it waits a few seconds first: a dialog's content (a household log,
// a copy count) arrives after a request, and a dark first run is the slow one.
const need = async (locator, what) => {
  await locator.first().waitFor({ timeout: 8000 }).catch(() => {});
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
    // A bounded read fails exactly when its bare read would (history-ops.mjs).
    if (fail && (fail(op, vars) || fail(bareOpOf(op), vars))) {
      return r.fulfill({
        status: 502,
        contentType: 'application/json',
        headers: corsHeaders(r),
        body: JSON.stringify({ errors: [{ message: 'Bad gateway' }] }),
      });
    }
    const data = withHistoryBounds(ops)(op, vars, r);
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

// Chef, with `rows` as his food log (each row on its own day).
const dayOps = (rows, extra = {}) => ({ ...OPS, ...ledger(rows), ...extra });
const absent = async (locator, what) => {
  if (await locator.count()) throw new Error(`still on the page: ${what}`);
};
const landedOn = (page, path, query = {}) => {
  const url = new URL(page.url());
  if (url.pathname !== path) throw new Error(`landed on ${url.pathname}${url.search}, wanted ${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (url.searchParams.get(k) !== v) throw new Error(`landed on ${url.pathname}${url.search}, wanted ${k}=${v}`);
  }
};

// ── Fixtures for the Today scenes ────────────────────────────────────────

// Scene brief a-foodlog 1: two eggs at 78 cal, Greek yogurt 190, and a lunch
// food at 1.5 servings of 4 oz (so the row says "6 oz"). Dinner is empty.
const logDay = (day = TODAY) => [
  row('Egg', 'breakfast', 2, 78, { day, macros: [6, 1, 5] }),
  row('Greek yogurt', 'breakfast', 1, 190, { day, macros: [18, 8, 10] }),
  row('Chicken salad wrap', 'lunch', 1.5, 210, { day, size: 4, unit: 'oz', macros: [18, 20, 7] }),
];

// ── Today: the meals, their rows and their dialogs ──────────────────────────

const menuItem = async (menu, name) => must(menu.getByRole('menuitem', { name }), `"${name}" in the menu`);
const detailToggle = (dlg) => dlg.locator('button[aria-controls="edit-log-detail"]');

const todayScenes = [
  // Today's rows: name, amount and calories, the whole row one button that
  // opens Edit; "Nothing yet" on the empty dinner. Copy and Save-as-a-meal are
  // in each meal's "more" menu, not on the page.
  pageScene('50-today-rows', () => dayOps(logDay()), async (page, h) => {
    await need(page.getByRole('button', { name: /^Edit Egg, ×2, 156 cal$/ }), 'Egg row with its amount');
    await need(page.getByText('6 oz', { exact: true }), 'the "6 oz" amount');
    const dinner = (await (await need(page.locator('[data-testid="meal-total-dinner"]'), 'dinner total')).innerText()).trim();
    if (dinner !== 'Nothing yet') throw new Error(`the empty dinner reads "${dinner}"`);
    const card = page.locator('[data-testid="meal-cards"]');
    // No star, pencil or trash to aim at: a row is one button.
    for (const gone of ['Edit', 'Remove', 'Delete']) await absent(card.getByRole('button', { name: gone, exact: true }), `a row "${gone}" button`);
    await absent(card.getByRole('button', { name: /favou?rite/i }), 'a row favourite star');
    if ((await card.locator('li button').count()) !== 3) throw new Error(`${await card.locator('li button').count()} buttons in 3 food rows`);
    await absent(page.getByRole('button', { name: /copy a meal/i }), 'the old "Copy a meal" link on the page');
    await absent(page.getByRole('button', { name: /save .* as a meal/i }), 'the old per-meal "Save as a meal" button on the page');
    await scrollToSection(page, h, '#meal-card-breakfast', 88);
  }),

  // A meal's "more" menu, open: Copy from another day, and Save as a meal —
  // which is off for a meal with nothing in it.
  pageScene('50i-meal-more-menu', () => dayOps(logDay()), async (page, h) => {
    const empty = await openMealMenu(page, h, 'dinner');
    await menuItem(empty, 'Copy from another day');
    const save = await menuItem(empty, 'Save as a meal');
    if ((await save.getAttribute('aria-disabled')) !== 'true') throw new Error('"Save as a meal" is live on an empty meal');
    await h.esc(400);
    const more = page.locator('[data-testid="meal-more-breakfast"]');
    const menu = await openMealMenu(page, h, 'breakfast');
    if ((await more.getAttribute('aria-expanded')) !== 'true') throw new Error('the "more" button does not say its menu is open');
    await menuItem(menu, 'Copy from another day');
    if ((await (await menuItem(menu, 'Save as a meal')).getAttribute('aria-disabled')) === 'true') throw new Error('"Save as a meal" is off on a meal with food in it');
    if ((await menu.getByRole('menuitem').count()) !== 2) throw new Error(`the menu has ${await menu.getByRole('menuitem').count()} items, wanted 2`);
  }, { dialog: true }),

  // Edit a food, just opened: tap the Egg row. Total calories first, then
  // Servings, Day, Meal; "Per serving and nutrition" closed; Remove and Save.
  pageScene('50c-edit-entry', () => dayOps(logDay()), async (page, h) => {
    const dlg = await openEdit(page, h, 'Egg');
    const calories = await need(dlg.getByLabel('Calories', { exact: true }), 'the total calories field');
    if ((await calories.inputValue()) !== '156') throw new Error(`total calories reads "${await calories.inputValue()}", wanted 156 (2 × 78)`);
    const first = await dlg.locator('input, [role="slider"], [role="combobox"]').first().getAttribute('id');
    if (first !== (await calories.getAttribute('id'))) throw new Error('total calories is not the first field in the dialog');
    const toggle = await need(detailToggle(dlg), 'the "Per serving and nutrition" disclosure');
    if ((await toggle.innerText()).trim() !== 'Per serving and nutrition') throw new Error(`the disclosure reads "${await toggle.innerText()}"`);
    if ((await toggle.getAttribute('aria-expanded')) !== 'false') throw new Error('"Per serving and nutrition" should start closed');
    await absent(dlg.locator('#edit-log-detail'), 'the per-serving fields, before the disclosure is opened');
    await need(dlg.getByRole('button', { name: /^save/i }), 'Save');
    // Delete lives here now: the rows have no trash.
    await need(dlg.getByRole('button', { name: 'Remove Egg' }), 'Remove');
  }, { dialog: true }),

  // …with "Per serving and nutrition" open: the per-serving inputs and the
  // nutrition for the servings entered.
  pageScene('50d-edit-entry-details', () => dayOps(logDay()), async (page, h) => {
    const dlg = await openEdit(page, h, 'Egg');
    const toggle = await need(detailToggle(dlg), 'the "Per serving and nutrition" disclosure');
    await toggle.click();
    await h.settle(600);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') throw new Error('"Per serving and nutrition" did not open');
    const detail = await need(dlg.locator('#edit-log-detail'), 'the per-serving fields');
    const perServing = await need(detail.getByLabel(/^Calories \(per serving\)/), 'Calories (per serving)');
    if ((await perServing.inputValue()) !== '78') throw new Error(`per-serving calories reads "${await perServing.inputValue()}", wanted 78`);
    await need(detail.getByText(/^Nutrition for 2 servings:/), 'the "Nutrition for 2 servings" line');
    await need(detail.getByText('156 cal', { exact: true }), 'the total for 2 servings');
    await need(dlg.getByRole('button', { name: /^save/i }), 'Save');
    await toggle.scrollIntoViewIfNeeded();
    await h.settle(300);
  }, { dialog: true }),

  // Removing a food: row → Edit → Remove. The dialog closes and the toast
  // says what went, with Undo.
  pageScene('50k-remove-undo', () => dayOps(logDay()), async (page, h) => {
    const dlg = await openEdit(page, h, 'Greek yogurt');
    await (await need(dlg.getByRole('button', { name: 'Remove Greek yogurt' }), 'Remove')).click();
    await h.settle(900);
    if (await page.getByRole('dialog').count()) throw new Error('the edit dialog stayed open after Remove');
    const toast = await need(page.locator('[data-geek-toast]').filter({ hasText: 'Removed Greek yogurt' }), 'the "Removed Greek yogurt" toast');
    await need(toast.getByRole('button', { name: 'Undo' }), 'Undo on the toast');
    const box = await toast.first().boundingBox();
    const vp = page.viewportSize();
    if (!box || box.x < 0 || box.y < 0 || box.x + box.width > vp.width + 0.5 || box.y + box.height > vp.height + 0.5) throw new Error(`the toast runs off the screen: ${JSON.stringify(box)}`);
  }),

  // Copy from another day, out of Breakfast's menu: it opens already set to
  // that meal on the day before, says so in a sentence with the number of
  // foods, and Copy is live.
  pageScene('50e-copy-meal-opened', () => dayOps([...logDay(YEST), ...logDay()]), async (page, h) => {
    const menu = await openMealMenu(page, h, 'breakfast');
    await (await menuItem(menu, 'Copy from another day')).click();
    await h.settle(900);
    const dlg = await need(page.getByRole('dialog'), 'copy dialog');
    const summary = (await (await need(dlg.locator('[data-testid="copy-summary"]'), 'the summary sentence')).innerText()).trim();
    h.log(`copy summary: ${summary}`);
    const want = `Copy your breakfast from ${weekdayOf(YEST)} into today’s breakfast (2 foods)`;
    if (summary !== want) throw new Error(`the copy summary reads "${summary}", wanted "${want}"`);
    await need(dlg.getByRole('button', { name: /^copy$/i, disabled: false }), 'Copy live');
  }, { dialog: true }),

  // Copy a meal from Sarah (who shares her log): Whose log = Sarah, Which meal =
  // Dinner. The summary reads "Copy Sarah's dinner from <day> into today's dinner
  // (3 foods)" and Copy is live at the bottom.
  pageScene('50f-copy-meal-sarah', () => dayOps(logDay()), async (page, h) => {
    const menu = await openMealMenu(page, h, 'dinner');
    await (await menuItem(menu, 'Copy from another day')).click();
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
  }, { dialog: true }),

  // What your household ate: "What Sarah ate today" with a Copy to your log on each meal.
  pageScene('50g-household-view', () => dayOps(logDay()), async (page, h) => {
    await (await need(page.locator('[data-testid="household-link"]'), 'household link')).click();
    await h.settle(1200);
    const dlg = await need(page.getByRole('dialog'), 'household dialog');
    try {
      await need(dlg.getByText(/What Sarah ate today/), 'What Sarah ate today');
    } catch (e) { throw new Error(`${e.message} :: ${(await dlg.innerText()).slice(0, 300).replace(/\n/g, ' | ')}`); }
    await need(dlg.getByRole('button', { name: /^Copy Sarah’s .* to your log$/ }).first(), 'Copy to your log');
  }, { dialog: true }),

  // Save a meal, out of Breakfast's menu: the name box, the foods in it, and the save at the bottom.
  pageScene('50h-save-as-meal', () => dayOps(logDay()), async (page, h) => {
    const menu = await openMealMenu(page, h, 'breakfast');
    await (await menuItem(menu, 'Save as a meal')).click();
    await h.settle(800);
    const dlg = await need(page.getByRole('dialog'), 'save-meal dialog');
    await need(dlg.getByText('Greek yogurt').first(), 'the meal’s foods in the dialog');
  }, { dialog: true }),

  // Another day, reached with Previous: the header says "Yesterday" over its
  // date, "Today" brings it back, the card is "Calories for this day" in the
  // past tense, and the check-ins and meds (today's business) are gone.
  pageScene('50j-today-previous-day', () => dayOps([
    ...logDay(YEST),
    row('Ribeye, grilled', 'dinner', 1, 465, { day: YEST, macros: [39, 0, 35] }),
    ...logDay(),
  ]), async (page, h) => {
    const title = page.locator('[data-testid="day-header-title"]');
    const titleNow = async () => (await title.innerText()).trim();
    await need(page.locator('[data-testid="today-strip"]'), 'the check-in pills on today');
    await (await need(page.getByRole('button', { name: 'Previous day' }), 'Previous day')).click();
    await h.settle(1200);
    if ((await titleNow()) !== 'Yesterday') throw new Error(`after Previous the h1 reads "${await titleNow()}"`);
    await (await need(page.locator('[data-testid="back-to-today"]'), 'the way back to today')).click();
    await h.settle(1200);
    if (!/^Good /.test(await titleNow())) throw new Error(`"Today" did not come back to today (h1 "${await titleNow()}")`);
    await absent(page.locator('[data-testid="back-to-today"]'), '"Today" (back) while on today');
    await page.getByRole('button', { name: 'Previous day' }).click();
    await h.settle(1400);
    if ((await titleNow()) !== 'Yesterday') throw new Error(`the h1 reads "${await titleNow()}"`);
    const date = (await (await need(page.locator('[data-testid="day-header-date"]'), 'the date over "Yesterday"')).innerText()).trim();
    if (!date.startsWith(weekdayOf(YEST))) throw new Error(`the date line reads "${date}", wanted ${weekdayOf(YEST)}, …`);
    await need(page.getByRole('heading', { name: 'Calories for this day' }), 'the card title for another day');
    // 2,340 less yesterday's 156 + 190 + 315 + 465.
    const sentence = (await page.locator('[data-testid="calories-sentence"]').innerText()).trim();
    if (sentence !== 'You had 1,214 calories left') throw new Error(`yesterday's sentence reads "${sentence}"`);
    await need(page.getByRole('heading', { name: 'Meals', exact: true }), 'the meals heading without "Today’s"');
    await need(page.getByRole('button', { name: /^Edit Ribeye, grilled, 465 cal$/ }), 'yesterday’s dinner');
    await absent(page.locator('[data-testid="today-strip"]'), 'today’s check-in pills on another day');
    await absent(page.locator('[data-testid="meds-checklist"]'), 'today’s meds on another day');
    await need(page.locator('[data-testid="your-numbers"]'), 'Your numbers (the newest readings, whichever day)');
  }, { wait: 1800 }),

  // The add sheet for a day with no history behind it: no Again chips and no
  // "Same as yesterday", only the box, its microphone and Log it (dim).
  pageScene('21a-add-sheet-no-history', () => dayOps([]), async (page, h) => {
    // A draft from an earlier scene's lunch sheet would be "words".
    await page.evaluate(() => { try { sessionStorage.clear(); } catch { /* blocked */ } });
    await (await need(page.getByRole('button', { name: /^add to lunch$/i }).first(), 'Add to lunch')).click();
    await h.settle(900);
    const sheet = await need(page.getByRole('dialog'), 'add sheet');
    await need(sheet.locator('[data-testid="speak-button"]'), 'microphone button');
    await need(sheet.getByLabel('Tell me what you ate'), 'the composer box');
    await need(sheet.locator('[data-testid="log-it"][disabled]'), 'Log it, dim until there are words');
    await absent(sheet.locator('[data-testid="again-chips"]'), 'Again chips with no history');
    await absent(sheet.locator('[data-testid="same-as-yesterday"]'), '"Same as yesterday" with no yesterday');
  }, { dialog: true }),
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
// A person who has been through the first run and logged nothing since.
const newAccount = (patch = {}) => ({
  ...OPS,
  GetFitnessExperience: experienceOf({ first_run_done: true, preferred_name: 'Heather', ...patch }),
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
  GetLoginStreak: { loginStreak: { __typename: 'LoginStreak', currentStreak: 0, longestStreak: 0, lastLoginDate: TODAY, streakStartDate: null } },
  GetGarminDaily: { garminDaily: null },
});

// ── Saved foods: Meals and Foods ────────────────────────────────────────────

const food = (id, name, brand, source, cal, extra = {}) => ({
  __typename: 'FitnessFood', id, name, brand, serving_size: 100, serving_unit: 'g', barcode: null, is_verified: false,
  nutrition: nutr(cal), ...(source === undefined ? {} : { source }), ...extra,
});

// The container's own tabs: both there, both whole, the right one selected,
// and the tab's page without a second <Page> or a repeated title inside it.
async function assertContainerTabs(page, h, label, names, selected) {
  const list = await need(page.getByRole('tablist', { name: label }), `the "${label}" tabs`);
  const tabs = await list.getByRole('tab').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { label: el.innerText.trim(), clipped: el.scrollWidth > el.clientWidth + 1, x: r.x, right: r.right, selected: el.getAttribute('aria-selected') === 'true' };
  }));
  if (tabs.map((t) => t.label).join(' · ') !== names.join(' · ')) throw new Error(`"${label}" tabs read ${tabs.map((t) => t.label).join(' · ')}`);
  const vw = page.viewportSize().width;
  const off = tabs.filter((t) => t.clipped || t.x < -0.5 || t.right > vw + 0.5);
  if (off.length) throw new Error(`"${label}" tabs cut off: ${off.map((t) => t.label).join(', ')}`);
  const on = tabs.filter((t) => t.selected).map((t) => t.label).join(',');
  if (on !== selected) throw new Error(`"${label}" has "${on}" selected, wanted "${selected}"`);
  await need(page.locator(`[role="tabpanel"][aria-labelledby="tab-${selected.toLowerCase()}"]`), `the ${selected} panel`);
  h.log(`${label}: ${tabs.map((t) => `${t.label}${t.selected ? '*' : ''}`).join(' · ')}`);
}
const SAVED_TABS = ['Meals', 'Foods'];

const libraryScenes = [
  // Saved foods › Foods with nothing in it: the empty state and the way in.
  // The old /my-foods address opens this tab.
  pageScene('51-my-foods-empty', () => ({ ...OPS, GetFitnessFoods: { fitnessFoods: [] } }), async (page, h) => {
    landedOn(page, '/saved-foods', { tab: 'foods' });
    await assertContainerTabs(page, h, 'Saved foods sections', SAVED_TABS, 'Foods');
    await need(page.getByRole('button', { name: /new food/i }), 'New food');
  }, { path: '/my-foods' }),

  // Foods rows by source: "usda" says USDA, an unknown or missing source says
  // nothing at all (UX review 2.7), a custom food says "My food".
  pageScene('51a-my-foods-sources', () => ({
    ...OPS,
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
  }, { path: '/saved-foods?tab=foods' }),

  // Saved foods › Meals with SAVED_MEALS. The old /my-meals address opens it.
  pageScene('51b-my-meals', () => ({ ...OPS, GetFitnessMeals: { fitnessMeals: SAVED_MEALS } }), async (page, h) => {
    landedOn(page, '/saved-foods', { tab: 'meals' });
    await assertContainerTabs(page, h, 'Saved foods sections', SAVED_TABS, 'Meals');
    await need(page.getByText('Usual breakfast').first(), 'a saved meal');
  }, { path: '/my-meals' }),

  // Meals, when the read fails: a plain "couldn't load" with a way to retry,
  // not the "No meals saved yet" an empty list would say.
  pageScene('51d-my-meals-failed', () => ({ ops: OPS, fail: (op) => op === 'GetFitnessMeals' }), async (page, h) => {
    const failed = await need(page.locator('[data-testid="my-meals-failed"]'), 'the "couldn’t load your meals" card');
    await need(failed.getByRole('button', { name: 'Try again' }), 'its Try again button');
    await absent(page.getByText('No meals saved yet'), '"No meals saved yet" after a failed read');
  }, { path: '/saved-foods?tab=meals' }),

  // Meals, nothing saved yet.
  pageScene('51c-my-meals-empty', () => ({ ...OPS, GetFitnessMeals: { fitnessMeals: [] } }), async (page) => {
    await need(page.locator('main, #root').first(), 'the page');
  }, { path: '/saved-foods?tab=meals' }),

  // Saved foods as it opens from the sidebar or More: no ?tab=, so Meals; a
  // tap on Foods swaps the panel and writes ?tab=foods without adding a
  // history entry.
  pageScene('71-saved-foods-meals', () => OPS, async (page, h) => {
    await assertContainerTabs(page, h, 'Saved foods sections', SAVED_TABS, 'Meals');
    await need(page.getByText('Usual breakfast').first(), 'a saved meal');
    await absent(page.getByRole('heading', { level: 1 }).filter({ hasText: /^(My meals|Saved foods)$/ }), 'a page title repeated under the top bar');
  }, { path: '/saved-foods' }),
  pageScene('71a-saved-foods-foods', () => OPS, async (page, h) => {
    const before = await page.evaluate(() => window.history.length);
    await (await need(page.getByRole('tab', { name: 'Foods', exact: true }), 'the Foods tab')).click();
    await h.settle(1200);
    landedOn(page, '/saved-foods', { tab: 'foods' });
    if ((await page.evaluate(() => window.history.length)) !== before) throw new Error('changing tab pushed a history entry');
    await assertContainerTabs(page, h, 'Saved foods sections', SAVED_TABS, 'Foods');
    await need(page.getByText('Greek Yogurt, Plain Whole Milk').first(), 'a saved food');
    await need(page.getByRole('button', { name: /new food/i }), 'New food');
  }, { path: '/saved-foods' }),
];

// ── Home ────────────────────────────────────────────────────────────────────

const HOME_PROBLEM = /Can’t reach FitnessGeek right now\. What you logged is safe\./;
const FAILING_READS = new Set(['GetFoodLogs', 'GetDailySummary', 'GetDerivedMacros', 'GetFitnessWeights']);

// Today after a failed load: the reads 502, so the card says it couldn't reach
// FitnessGeek (with Try again), every meal says "—", and there is no "Weigh in"
// chip and no "Nothing yet" to read as an empty day.
const homeFailed = (name, build) => pageScene(name, () => ({ ops: build(), fail: (op) => FAILING_READS.has(op) }), async (page) => {
  await need(page.locator('[data-testid="home-load-problem"]'), 'the load-problem line');
  await need(page.getByText(HOME_PROBLEM), 'the sentence');
  await need(page.getByRole('button', { name: 'Try again' }), 'Try again');
  if (await page.getByText('Nothing yet', { exact: true }).count()) throw new Error('"Nothing yet" shown after a failed read');
  for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
    const total = (await (await need(page.locator(`[data-testid="meal-total-${meal}"]`), `${meal} total`)).innerText()).trim();
    if (total !== '—') throw new Error(`${meal} reads "${total}" after a failed read, wanted "—"`);
  }
  await absent(page.locator('[data-testid="calories-sentence"]'), 'a calories sentence after a failed read');
  await absent(page.locator('[data-testid="plate-number"]'), 'a number in the ring after a failed read');
  if (await page.getByText(/^Weigh in/).count()) throw new Error('a Weigh in chip after a failed read');
}, { path: '/dashboard', wait: 2200 });

// The meals after a load that worked and a reload that did not: something is
// removed (row → Edit → Remove), the reads behind it 502, and the meals keep
// their foods while the line says so. `armed` flips after the first paint.
const homeReloadFailed = (name, build) => {
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
        // Anything that changes the day reloads Today; a Remove is the simplest.
        const dlg = await openEdit(page, h, 'Greek yogurt');
        await (await need(dlg.getByRole('button', { name: 'Remove Greek yogurt' }), 'Remove in the edit dialog')).click();
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
  homeFailed('52-home-failed', () => dayOps(logDay())),
  homeReloadFailed('52b-home-reload-failed', () => dayOps(logDay())),

  // Amounts on Today: every entry is its own row — Egg, Egg, Toast ×2 — so
  // each can be opened and changed on its own.
  pageScene('52d-home-amounts', () => dayOps(homeAmountRows()), async (page, h) => {
    const eggs = await page.getByRole('button', { name: /^Edit Egg, 78 cal$/ }).count();
    if (eggs !== 2) throw new Error(`expected two Egg rows, saw ${eggs}`);
    await need(page.getByRole('button', { name: /^Edit Toast, ×2, 160 cal$/ }), '"Toast ×2"');
    await need(page.getByText('Toast', { exact: false }).filter({ hasText: '×2' }).first(), '"Toast ×2" on the row');
    await scrollToSection(page, h, '#todays-meals', 88);
  }),

  // Today, fat over target, with "Macros and details" open: the Fat row reads
  // "Fat 99 g of 78" with a "21 over" tag and 127%, and the Eaten row says 72%.
  pageScene('52e-home-fat-over', () => ({
    ...OPS,
    ...ledger(logDay(), 2340, { fat_grams: 99, calories: 1685 }),
  }), async (page, h) => {
    await absent(page.locator('[data-testid="macro-strip"]'), 'the macro rows before the disclosure is opened');
    await setDetails(page, h, true);
    const strip = page.locator('[data-testid="today-details"] [data-testid="macro-strip"]');
    await need(strip.getByText(/Fat\s*99 g\s*of 78/), 'the Fat row "Fat 99 g of 78"');
    await need(strip.getByText(/^21 over$/i), 'the "21 over" tag');
    await need(strip.getByText('127%', { exact: true }), 'Fat at 127%');
    await need(strip.getByText('72%', { exact: true }).first(), 'Eaten at 72%');
    await scrollToSection(page, h, '[data-testid="home-hero"]', 88);
  }),
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
const goalWeight = (weights = goalWeights()) => weightOps(dayOps([]), weights);

// The chart box is the element after the "lb" caption.
const chartBox = (page, testid) => page.locator(`[data-testid="${testid}"] + *`).first();

// Tap the right half of a chart on a phone and check the tooltip stays inside
// the card and keeps its words on one line each.
/** The chart's box once it has stopped moving (smooth scroll, nivo animating in). */
async function stableBox(box, h) {
  let b = null;
  for (let i = 0; i < 20; i++) {
    const next = await box.boundingBox();
    if (next && b && Math.abs(next.x - b.x) < 0.5 && Math.abs(next.y - b.y) < 0.5 && Math.abs(next.height - b.height) < 0.5) return next;
    b = next;
    await h.settle(100);
  }
  return b;
}

async function tapChartTooltip(page, h, box) {
  // Measure only once the chart has stopped moving: right after a smooth
  // scroll, and while nivo animates in, the box drifts, and a tap aimed at the
  // old box lands beside the chart (flaky 53d/53e, 2026-10-18).
  let b = await stableBox(box, h);
  if (!b) throw new Error('chart has no box');
  // On a shorter viewport (CI's runner) the chart's middle can sit under the
  // fixed bottom nav, and the tap lands on the nav. Put the middle at ~40%.
  const vh = page.viewportSize()?.height || 800;
  const mid = b.y + b.height * 0.5;
  if (mid < vh * 0.2 || mid > vh * 0.65) {
    await page.evaluate((dy) => {
      const root = document.scrollingElement;
      const main = document.querySelector('main');
      (main && main.scrollHeight > main.clientHeight ? main : root).scrollBy(0, dy);
    }, Math.round(mid - vh * 0.4));
    b = await stableBox(box, h);
    if (!b) throw new Error('chart has no box after scrolling');
  }
  const tipLoc = page.locator('[data-testid="chart-tooltip"]');
  // These scenes run with `freshPage` (runner.mjs): a mouse cursor left
  // parked by an earlier scene's page.click() — 53b/53c click the Log weight
  // button — is moved back over its spot right after a tap, and that
  // mouseleave makes nivo hide the tooltip the tap just opened (CI
  // 2026-10-29: "missing after a plain tap", "tooltip has no box"). A phone
  // has no cursor, so the scene starts on a page that never had one.
  // A plain tap must be enough. A touch pointer "leaves" as the finger
  // lifts, and that used to disarm the tooltip the tap had just armed, so it
  // took a tap plus a mouse move (fixed in chartTips.js, d-fixes). Each try is
  // ONE plain tap at a fresh point; if taps stop arming the tooltip, all fail.
  for (const fx of [0.7, 0.55, 0.85]) {
    await page.touchscreen.tap(b.x + b.width * fx, b.y + b.height * 0.5);
    // A slow runner can take well over 700 ms to draw it; wait for it.
    if (await tipLoc.first().waitFor({ state: 'attached', timeout: 2000 }).then(() => true, () => false)) break;
  }
  await need(tipLoc, 'the tooltip after a plain tap');
  // Measure the tooltip a person SEES. Nivo mounts it at the raw touch point
  // with opacity 0, measures it (ResizeObserver), and only then moves it to
  // its anchor beside the finger and shows it. On a slow runner the box was
  // read in that hidden first frame: "tip 266-435 chart 17-373" is the tap
  // point itself (17 + 0.7 x 356 = 266), never a placement. CI 2026-11,
  // red on four of five pushes; reproduced locally by delaying
  // ResizeObserver callbacks 400 ms.
  const shown = await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="chart-tooltip"]');
    return Boolean(el?.parentElement) && getComputedStyle(el.parentElement).opacity === '1';
  }, null, { timeout: 3000 }).then(() => true, () => false);
  if (!shown) throw new Error('the tooltip never became visible after a tap');
  const tip = tipLoc;
  const t = await stableBox(tip.first(), h);
  if (!t) throw new Error('tooltip has no box');
  if (t.x < b.x - 1 || t.x + t.width > b.x + b.width + 1) {
    throw new Error(`tooltip leaves the chart: tip ${Math.round(t.x)}-${Math.round(t.x + t.width)} chart ${Math.round(b.x)}-${Math.round(b.x + b.width)}`);
  }
  if (t.width < 140 || t.height > 130) throw new Error(`tooltip wraps: ${Math.round(t.width)}x${Math.round(t.height)}`);
}

const weightScenes = [
  // The goal card: the trend in words first ("Down 12.1 lb since June") over
  // its basis line, then the goal maths — "12.1 of 37 lb lost", the pace
  // sentence, a "Behind plan" chip, and the projection in words.
  pageScene('53-weight-goal', () => goalWeight(), async (page) => {
    const words = (await (await need(page.locator('[data-testid="weight-trend-words"]'), 'the trend words')).innerText()).trim();
    if (!/^Down 1\d(\.\d)? lb since /.test(words)) throw new Error(`trend words say "${words}"`);
    await need(page.getByText(/You’re losing [\d.]+ lb a week/), 'the pace sentence');
    await need(page.getByText(/of 37 lb lost/), '"… of 37 lb lost"');
    await need(page.locator('[data-testid="weight-basis"]').getByText('7-day average'), 'the basis line (7-day average)');
    const now = (await (await need(page.locator('[data-testid="weight-now"]'), 'the big weight')).innerText()).replace(/\s+/g, ' ').trim();
    if (!/^21\d\.\d lb$/.test(now)) throw new Error(`big weight says "${now}"`);
    await need(page.getByText('Behind plan', { exact: true }), 'the Behind plan chip');
    // One page for everybody: body composition is always on it, and from md
    // the weigh-in is a card in the left column (the thumb button below it).
    await need(page.locator('#body-composition'), 'body composition');
    const fab = page.locator('[data-testid="log-weight-fab"]');
    const card = page.getByRole('button', { name: /^(log weight|save|replace)$/i });
    if (!(await fab.count()) && !(await card.count())) throw new Error('no way to weigh in on the Weight page');
  }, { path: '/weight', wait: 1800 }),

  // The weight dialog on a day that already has a weight: "You already have 218.7
  // for today. Saving replaces it." and the button says Replace.
  pageScene('53b-weight-replace-warning', () => goalWeight(goalWeights({ today: 218.7 })), async (page, h) => {
    await (await need(page.getByRole('button', { name: /log weight/i }).first(), 'Log weight')).click();
    await h.settle(800);
    const dlg = await need(page.getByRole('dialog'), 'weight dialog');
    await need(dlg.getByText('You already have 218.7 for today. Saving replaces it.'), 'the replace note');
    await need(dlg.getByRole('button', { name: 'Replace', exact: true }), 'Replace');
  }, { path: '/weight', viewports: ['phone'], dialog: true }),

  // The same dialog with the day moved to one without a weigh-in: the note goes
  // and the button says Save again.
  pageScene('53c-weight-save-other-day', () => goalWeight(goalWeights({ today: 218.7 })), async (page, h) => {
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
  pageScene('53d-weight-tooltip', () => goalWeight(), async (page, h) => {
    await scrollToSection(page, h, 'text=Weight trend', 88);
    await need(page.locator('[data-testid="weight-y-unit"]'), 'the lb caption');
    await tapChartTooltip(page, h, chartBox(page, 'weight-y-unit'));
  }, { path: '/weight', wait: 1800, viewports: ['phone'], freshPage: true }),

  // The body-composition trend, the same tap.
  pageScene('53e-bodycomp-tooltip', () => goalWeight(), async (page, h) => {
    await scrollToSection(page, h, '#body-composition');
    await scrollToSection(page, h, 'text=Line: 7-day average · dots: each scan', 160);
    await need(page.locator('[data-testid="bodycomp-y-unit"]'), 'the lb caption');
    await tapChartTooltip(page, h, page.locator('svg[aria-label*="over time, in pounds"]').first());
  }, { path: '/weight', wait: 1800, viewports: ['phone'], freshPage: true }),

  // A brand-new account's Weight page: no logs, no goal, and a way to start.
  pageScene('57a-weight-empty', () => newAccount(), async (page) => {
    await need(page.getByText('Set your goal', { exact: false }).first(), 'the Set your goal prompt');
  }, { path: '/weight', wait: 1800 }),
  // And Blood pressure with no readings.
  pageScene('57b-bp-empty', () => newAccount(), async (page) => {
    await need(page.locator('main, #root').first(), 'the page');
  }, { path: '/blood-pressure', wait: 1800 }),
];

// ── The sidebar, first run, empty Today ─────────────────────────────────────

const SIDEBAR = ['Today', 'Weight', 'Blood pressure', 'Medications', 'Trends', 'Saved foods'];

const moreScenes = [
  // The sidebar on desktop: six rows, in order, with no group headings, and
  // none of the pages that moved inside Trends and Saved foods.
  pageScene('54a-sidebar', () => dayOps(logDay()), async (page) => {
    const body = await need(page.locator('[data-geek-sidebar="body"]'), 'the sidebar list');
    const rows = (await body.getByRole('link').or(body.getByRole('button')).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    if (rows.join(' · ') !== SIDEBAR.join(' · ')) throw new Error(`the sidebar reads ${rows.join(' · ')}`);
    for (const gone of ['Looking back', 'Food', 'Profile', 'Reports', 'Activity', 'Health', 'My meals', 'My foods', 'Food log', 'Home']) {
      await absent(body.getByText(gone, { exact: true }), `"${gone}" in the sidebar`);
    }
  }, { path: '/dashboard', wait: 1500, viewports: ['desktop', 'tablet-landscape'] }),
];

// A person before they have answered anything. The three-step first run is
// the one thing the saved `mode` is still read for: it shows to a person who
// never chose and has no history (20, 20a), and to one saved as "simple" who
// never finished it (55, 55a) — these are the only scenes that set it.
const firstRunOps = (mode = null) => () => ({
  ...newAccount(),
  GetFitnessExperience: experienceOf({ mode, first_run_done: false, preferred_name: null }),
});
const toStep3 = async (page, h, { goal = null } = {}) => {
  await (await need(page.getByRole('button', { name: /^next$/i }).first(), 'Next')).click();
  await h.settle(400);
  if (goal) await (await need(page.getByRole('radio', { name: goal }), 'goal radio')).click();
  await (await need(page.getByRole('button', { name: /^next$/i }).first(), 'Next (2)')).click();
  await h.settle(500);
};

const firstRunScenes = [
  // First run: a person who never chose, and has never logged, lands here
  // instead of Today.
  pageScene('20-first-run', firstRunOps(), async (page) => {
    await need(page.locator('[data-testid="first-run"]'), 'first run');
    await absent(page.locator('[data-testid="home-hero"]'), 'Today behind the first run');
    await absent(page.locator('[data-testid="day-header"]'), 'the day header behind the first run');
  }),
  pageScene('20a-first-run-goal', firstRunOps(), async (page, h) => {
    const next = await need(page.getByRole('button', { name: /^next$/i }).first(), 'Next');
    await next.click();
    await h.settle(500);
    await need(page.getByRole('radio', { name: /keep my weight steady/i }), 'goal choices');
  }, { viewports: ['phone'] }),

  // Step 3: "Try logging your <meal>", "Add my <meal>", and Maybe later.
  pageScene('55-first-run-step3', firstRunOps('simple'), async (page, h) => {
    await need(page.locator('[data-testid="first-run"]'), 'first run');
    await toStep3(page, h, { goal: /lose a little weight/i });
    await need(page.getByRole('heading', { name: /try logging your/i }), 'step 3');
    await need(page.getByRole('button', { name: 'Maybe later' }), 'Maybe later');
  }, { viewports: ['phone'] }),

  // Today right after "Maybe later" with "Lose a little weight" picked and no
  // target: the card offers "Set your daily target", never "Nothing logged".
  pageScene('55a-home-after-maybe-later', firstRunOps('simple'), async (page, h) => {
    await toStep3(page, h, { goal: /lose a little weight/i });
    await (await need(page.getByRole('button', { name: 'Maybe later' }), 'Maybe later')).click();
    await h.settle(1500);
    await absent(page.locator('[data-testid="first-run"]'), 'the first run after "Maybe later"');
    await need(page.locator('[data-testid="set-daily-target"]'), 'Set your daily target');
  }, { viewports: ['phone'] }),

  // A brand-new account's Today: no target, no logs, no weights, no meds.
  // Four meals that say "Nothing yet", and a quiet way in to medications.
  pageScene('57f-today-empty', () => newAccount(), async (page) => {
    try { await need(page.locator('#todays-meals'), 'the meals heading'); } catch (e) {
      throw new Error(`${e.message} :: ${(await page.locator('body').innerText()).slice(0, 500).replace(/\n/g, ' | ')}`);
    }
    await absent(page.locator('[data-testid="first-run"]'), 'the first run for a person who finished it');
    const empties = await page.getByText('Nothing yet', { exact: true }).count();
    if (empties !== 4) throw new Error(`expected four "Nothing yet" meals, saw ${empties}`);
    await need(page.locator('[data-testid="track-meds"]'), 'Track your meds');
  }, { wait: 1800 }),
];

// ── The ErrorBoundary ───────────────────────────────────────────────────────

// Every list is guarded now (a null in saved foods no longer throws), so no
// fixture DATA makes a page throw. The boundary is reached the way a bad deploy
// reaches it: the screen's code chunk fails to load. React.lazy rethrows the
// import error during render, which the boundary around the page (inside the
// layout, ModernLayout.jsx) catches. SYNTHETIC TRIGGER: the SavedFoods chunk
// request is aborted. We arrive from /dashboard by the router, not by a full
// load, so the layout (and its navigation) is already drawn when it fails.
// Assertions: the screen, its buttons ("Go to Today" because we are not on
// Today), and that the navigation STAYS on screen.
const boundaryScene = {
  name: '56-error-boundary',
  async setup(page, h) {
    await withOps(page, OPS, async () => {
      await page.goto(h.base + '/dashboard', { waitUntil: 'networkidle' });
      await h.settle(1200);
      await page.route(/\/assets\/SavedFoods-[^/]*\.js(\?.*)?$/, (r) => r.abort());
      await page.evaluate(() => {
        window.history.pushState({}, '', '/saved-foods?tab=foods');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await h.settle(1500);
      await need(page.locator('[data-testid="error-boundary"]'), 'the ErrorBoundary screen');
      await need(page.getByRole('button', { name: 'Try again' }), 'Try again');
      await need(page.getByRole('button', { name: 'Reload' }), 'Reload');
      await need(page.getByRole('button', { name: 'Go to Today' }), 'Go to Today (not on Today)');
      // The page failed, the app did not: the navigation is still on screen.
      const vp = page.viewportSize();
      const navs = await page.locator('nav').evaluateAll((els) => els.map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0, inView: r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight };
      }));
      if (!navs.some((n) => n.shown && n.inView)) throw new Error(`the navigation is gone with the page error (vp ${vp.width}x${vp.height}): ${JSON.stringify(navs)}`);
      if (await page.locator('[data-testid="error-boundary"]').count() !== 1) throw new Error('more than one error screen: the outer boundary caught it, not the one inside the layout');
    });
  },
  async teardown(page) {
    await page.unroute(/\/assets\/SavedFoods-[^/]*\.js(\?.*)?$/);
    await page.unroute('**/graphql');
  },
};

// ── Trends: Activity and Health (Garmin) ─────────────────────────────

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
const activityOps = (extra = {}) => ({ ...OPS, ...GARMIN_ON, ...extra });

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

// The day's rows with the time each was written (created_at), as the gateway
// sends them: breakfast at 7:10 and 7:15, lunch at 12:20. Meal impact times
// meals by created_at; log_date is only the day.
const timedDay = () => logDay().map((r, i) => ({ ...r, created_at: iso([7, 7, 12][i], [10, 15, 20][i]) }));

// A Trends › Health scene: influx on, the REST answers up, the section's pill
// tab clicked. `path` lets one scene arrive by the old /health address.
const TREND_TABS = ['Food', 'Activity', 'Health'];
const healthScene = (name, tabName, check, { influxOn = true, answers, path = '/trends?tab=health' } = {}) => ({
  name,
  async setup(page, h) {
    await influxRoutes(page, answers);
    try {
      await withOps(page, { ...OPS, ...(influxOn ? INFLUX_ON : {}), ...ledger(timedDay()), ...GARMIN_ON }, async () => {
        await page.goto(h.base + path, { waitUntil: 'networkidle' });
        await h.settle(1500);
        landedOn(page, '/trends', { tab: 'health' });
        await assertContainerTabs(page, h, 'Trends sections', TREND_TABS, 'Health');
        if (tabName) {
          await (await need(healthTabs(page).getByRole('tab', { name: tabName }), `the ${tabName} tab`)).click();
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

// Health's own sections, under Trends: a lighter row of small pill tabs
// (aria-label "Health sections"), every one whole — none with its label cut —
// and the selected one on screen. On a phone five full-width tabs cut
// "Settings" off the end; they scroll sideways now (d-fixes).
const healthTabs = (page) => page.locator('[data-testid="health-tabs"]');
async function assertTabsWhole(page, h) {
  const vp = page.viewportSize();
  await need(page.getByRole('tablist', { name: 'Health sections' }), 'the "Health sections" pill tabs');
  const tabs = await healthTabs(page).getByRole('tab').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    const label = el.innerText.trim();
    return { label, clipped: el.scrollWidth > el.clientWidth + 1, x: r.x, right: r.right, h: r.height, selected: el.getAttribute('aria-selected') === 'true' };
  }));
  h.log(`tabs ${JSON.stringify(tabs.map((t) => [t.label, Math.round(t.x), Math.round(t.right)]))}`);
  if (tabs.length !== 4) throw new Error(`expected 4 tabs (Overview, Sleep, Meals, Recovery), saw ${tabs.length}`);
  const cut = tabs.filter((t) => t.clipped);
  if (cut.length) throw new Error(`tab labels cut: ${cut.map((t) => t.label).join(', ')}`);
  const sel = tabs.find((t) => t.selected);
  if (!sel || sel.x < -0.5 || sel.right > vp.width + 0.5) throw new Error(`the selected tab is off screen: ${JSON.stringify(sel)}`);
  // Two rows of tabs, one above the other: the outer one first.
  const outer = await page.getByRole('tablist', { name: 'Trends sections' }).boundingBox();
  const inner = await healthTabs(page).boundingBox();
  if (!outer || !inner || inner.y < outer.y + outer.height - 1) throw new Error(`Health's tabs are not below the Trends tabs: ${JSON.stringify({ outer, inner })}`);
}

const garminScenes = [
  // Trends › Food, as Trends opens from the navigation: no ?tab=, so Food.
  pageScene('70-trends-food', () => OPS, async (page, h) => {
    await assertContainerTabs(page, h, 'Trends sections', TREND_TABS, 'Food');
    await need(page.locator('[data-testid="reports-food"]'), 'the Food report');
    await absent(page.getByRole('tablist', { name: 'Health sections' }), 'Health’s tabs on the Food tab');
  }, { path: '/trends', wait: 1800 }),

  // Trends › Activity, reached by tapping its tab: the panel swaps, the
  // address says ?tab=activity, no history entry is added, and the page's old
  // "Activity" title is not repeated under the tab that already says it.
  pageScene('70a-trends-activity', () => activityOps(), async (page, h) => {
    const before = await page.evaluate(() => window.history.length);
    await (await need(page.getByRole('tab', { name: 'Activity', exact: true }), 'the Activity tab')).click();
    await h.settle(1800);
    landedOn(page, '/trends', { tab: 'activity' });
    if ((await page.evaluate(() => window.history.length)) !== before) throw new Error('changing tab pushed a history entry');
    await assertContainerTabs(page, h, 'Trends sections', TREND_TABS, 'Activity');
    await need(page.getByText('Today so far'), 'Today so far');
    await absent(page.getByRole('heading', { name: 'Activity', exact: true }), 'an "Activity" heading under the Activity tab');
    await absent(page.locator('[data-testid="reports-food"]'), 'the Food report under the Activity tab');
  }, { path: '/trends', wait: 1800 }),

  // Trends › Health from the top: the two rows of tabs, Overview selected.
  healthScene('70b-trends-health', null, async (page, h) => {
    await assertTabsWhole(page, h);
    await need(healthTabs(page).getByRole('tab', { name: /overview/i, selected: true }), 'Overview selected');
    await need(page.locator('svg[role="img"]').first(), 'a chart');
  }),

  // Activity with a connected Garmin: today so far, the night's sleep, recent
  // workouts. The old /activity address opens the tab.
  pageScene('58-activity-garmin', () => activityOps(), async (page) => {
    landedOn(page, '/trends', { tab: 'activity' });
    await need(page.getByText('Today so far'), 'Today so far');
    await need(page.getByText('Morning Run').first(), 'a recent workout');
  }, { path: '/activity', wait: 1800 }),

  // Activity before Garmin is connected: the empty state and its way in.
  pageScene('58a-activity-not-connected', () => activityOps({
    GetGarminStatus: { garminStatus: { __typename: 'GarminStatus', enabled: false, hasCredentials: false, hasTokens: false, lastConnectedAt: null } },
  }), async (page) => {
    await need(page.getByText('Connect a Garmin watch', { exact: true }), 'the empty state');
    await need(page.getByRole('link', { name: 'Connect Garmin' }), 'Connect Garmin');
  }, { path: '/trends?tab=activity', wait: 1500 }),

  // Health with the home data server off: what it needs, and the switch. The
  // old /health address opens the tab.
  healthScene('59-health-off', null, async (page) => {
    const card = await need(page.locator('[data-testid="connect-watch"]'), 'the connect-a-watch card');
    await need(card.getByText('Connect a Garmin watch', { exact: true }), 'its title');
    await need(card.getByRole('button', { name: 'Set it up' }), 'the Set it up button');
  }, { influxOn: false, path: '/health' }),

  // Health, Overview: heart rate, stress and Body Battery through the day.
  healthScene('59a-health-overview', 'Overview', async (page, h) => {
    await need(healthTabs(page).getByRole('tab', { name: /overview/i, selected: true }), 'Overview selected');
    await assertTabsWhole(page, h);
    await need(page.locator('svg[role="img"]').first(), 'a chart');
  }),
  // Sleep: the score, the metric cards, and the accordions below.
  healthScene('59b-health-sleep', 'Sleep', async (page) => {
    await need(page.getByText('Your sleep', { exact: true }), 'the sleep summary');
    await need(page.getByText('78/100'), 'the sleep score');
  }),
  // Meal impact: how her heart rate answered the day's meals.
  healthScene('59c-health-meal-impact', 'Meals', async (page) => {
    await need(healthTabs(page).getByRole('tab', { name: /meals/i, selected: true }), 'Meals selected');
    // Cards name the food and its calories. They read fields the rows don't
    // have, so every card said "Meal" and "0 cal" (d-fixes).
    await need(page.getByText('Greek yogurt', { exact: true }).first(), 'the Greek yogurt card');
    await need(page.getByText(/· 190 cal ·/).first(), 'its calories');
    if (await page.getByText(/· 0 cal ·/).count()) throw new Error('a card says 0 cal');
    if (await page.getByText('Meal', { exact: true }).count()) throw new Error('a card is called "Meal"');
  }),
  // Recovery coach: the readiness score and the two notes.
  healthScene('59d-health-recovery', 'Recovery', async (page) => {
    await need(page.getByText('Ready-for-today score'), 'the readiness gauge');
    await need(page.getByText('Protect tonight’s sleep'), 'a recovery note');
  }),
  // Watch settings: not a tab any more. A button at the foot opens the
  // data-server switch and the baselines.
  healthScene('59e-health-settings', null, async (page, h) => {
    await assertTabsWhole(page, h);
    await (await need(page.locator('[data-testid="watch-settings-toggle"]'), 'the "Watch settings" button')).click();
    await h.settle(800);
    await need(page.locator('[data-testid="watch-settings-panels"]'), 'the watch settings panels');
    await need(page.getByRole('checkbox', { name: 'Use the home data server (InfluxDB)' }), 'the data-server switch');
  }),
  // The days the server has nothing for: sleep and recovery say so in a sentence.
  healthScene('59f-health-sleep-none', 'Sleep', async (page) => {
    await need(page.getByText('No sleep for this night'), 'the empty sleep state');
  }, { answers: { sleep: { available: false }, recovery: { available: false } } }),
];

export const scenes = [
  ...todayScenes, ...libraryScenes, ...homeScenes, ...weightScenes, ...moreScenes, ...firstRunScenes, boundaryScene, ...garminScenes,
];

// The one scene that cannot be undone: the clock is fixed at 19:00, so the add
// box picks "dinner". Today on Yesterday by a link (?date=): the box on the
// page (md and up) names the day it adds to.
export const tail = [
  {
    name: '50a-today-yesterday',
    async setup(page, h) {
      const evening = new Date();
      evening.setHours(19, 0, 0, 0);
      await page.clock.setFixedTime(evening);
      await withOps(page, dayOps([...logDay(YEST), ...logDay(TODAY)]), async () => {
        await page.goto(`${h.base}/dashboard?date=${YEST}`, { waitUntil: 'networkidle' });
        await h.settle(1500);
        const title = (await (await need(page.locator('h1[data-testid="day-header-title"]'), 'the day (the page h1)')).innerText()).trim();
        if (title !== 'Yesterday') throw new Error(`?date=${YEST} shows "${title}"`);
        await need(page.locator('[data-testid="back-to-today"]'), 'the way back to today');
        await need(page.getByRole('button', { name: /^Edit Egg, ×2/ }), 'yesterday\'s Egg row');
        const want = `Add to ${weekdayOf(YEST)}’s dinner (yesterday)`;
        if (h.isPhone) {
          // No box on a phone's page: the button opens the sheet, and the
          // sheet names the day (36 and 46 shoot it).
          await need(page.locator('[data-testid="what-did-you-eat"]'), '"What did you eat?"');
          await absent(page.locator('[data-testid="inline-add-day"]'), 'the inline add box on a phone');
        } else {
          const head = await need(page.locator('[data-testid="inline-add-day"]'), 'the inline box heading');
          const text = await head.innerText();
          if (text !== want) throw new Error(`inline box says "${text}", wanted "${want}"`);
        }
      });
    },
    teardown: (page) => page.unroute('**/graphql'),
  },
];
