// FitnessGeek — the M1/M2 pilot surfaces (MOBILE_UI_PLAN.md), plus the Night 2
// AI quick-add scene (R115/R126). Scenes are independent: any scene that
// needs a dialog open re-navigates and re-opens it rather than relying on a
// previous scene's state.
import { json } from '../../lib/net.mjs';
import { OPS, FOODS, BODY_COMP_SUMMARY_EARLY, BODY_COMP_SCANS_EARLY, opsWithPlan, experienceOf, DESCRIBED_SOUP } from './fixtures.mjs';
import {
  must, withPageOps, scrollToSection, HEATHER, SPEECH_STUB, heatherScene, foodRoutes, dropFoodRoutes,
  soupSuggest, fageSuggest, fageDeep, composerScene, typeInto, SOUP, YESTERDAY,
} from './helpers.mjs';


// A saved recipe for the My Foods scenes: 6 servings, three ingredients, one
// of them an AI estimate. Nutrition is what the gateway would compute.
const ing = (name, amount, unit, servings, size, sunit, kcal, estimated = false) => ({
  __typename: 'FitnessRecipeIngredient', food_item_id: null, name, amount, unit, servings,
  serving_size: size, serving_unit: sunit, estimated,
  nutrition: { __typename: 'NutritionData', calories_per_serving: kcal, protein_grams: 0, carbs_grams: 0, fat_grams: 0, fiber_grams: 0, sugar_grams: 0, sodium_mg: 0 },
});
const CHILI = {
  __typename: 'FitnessFood', id: 'r1', name: 'Turkey chili', brand: null, serving_size: 1, serving_unit: 'serving',
  source: 'custom', barcode: null, is_verified: false,
  nutrition: { __typename: 'NutritionData', calories_per_serving: 248, protein_grams: 24, carbs_grams: 18, fat_grams: 8, fiber_grams: 6, sugar_grams: 4, sodium_mg: 520 },
  recipe: {
    __typename: 'FitnessRecipe', yield_servings: 6,
    ingredients: [
      ing('Ground turkey 93/7', 2, 'lb', 9.07, 100, 'g', 150),
      ing('Kidney beans', 2, 'cup', 4, 0.5, 'cup', 110),
      ing('Chili seasoning blend', 1, 'serving', 1, 1, 'serving', 30, true),
    ],
  },
};


// A saved plan calculated after the BMR fix, from Mifflin — so the stale
// banner stands down and the measured-BMR offer can show.
const CURRENT_MIFFLIN_PLAN = { bmr_calc_version: 2, bmr_source: 'mifflin', lean_mass_lb: null };
// Internally consistent: Katch-McArdle BMR from the fixture scans' 140.7 lb
// lean mass, × 1.55 (moderate) for TDEE, less 500 for 1 lb/week.
const SCAN_PLAN = {
  bmr_calc_version: 2, bmr_source: 'scan', lean_mass_lb: 140.7,
  bmr: 1749, tdee: 2711, daily_calorie_target: 2211, weekly_schedule: Array(7).fill(2211),
};


// The opt-in is server-side now (`ai.features.natural_language_food_logging`
// on the settings document, R124 — see
// `apps/fitnessgeek/frontend/src/utils/quickAddPreference.js`), off by
// default in fixtures.mjs's context-wide SETTINGS so no scene above this one
// renders "Describe a meal". Scene 11 flips it on for itself only, via a
// page-scoped GetFitnessUserSettings stub (page.route() beats ctx.route()
// for a matching request — README "Night 2"), and must stay the LAST scene
// in the file for the same reason.

// The wizard scenes are Full's: in Simple, /calorie-wizard opens the one-screen
// quick target instead (wave A). Chef is Full by the default rule (he has
// logs), but these say so outright rather than lean on it.
const FULL_USER = { GetFitnessExperience: experienceOf({ mode: 'full', first_run_done: true }) };

export const scenes = [
  { name: '01-home', goto: '/dashboard', wait: 1600 },
  { name: '02-log', goto: '/food-log', wait: 1600 },
  {
    // The FAB opens the food dialog with the meal pre-picked from the clock.
    // Phone only: desktop has no FAB (it used to skip there silently).
    name: '03-food-dialog',
    viewports: ['phone'],
    goto: '/food-log',
    wait: 1600,
    async setup(page, h) {
      const fab = await must(page.getByRole('button', { name: /log food/i }).first(), 'the "Log food" FAB');
      await fab.click();
      await h.settle(900);
      await must(page.getByRole('dialog'), 'the add sheet');
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // A converted form dialog, full-screen below sm: Copy Meal off the Log page.
    name: '04-copy-meal-dialog',
    goto: '/food-log',
    wait: 1600,
    async setup(page, h) {
      // Copy Meal moved out of the stacked row ahead of the date and under
      // the meals, in words (SIMPLE_AND_FULL_PLAN.md item 8).
      const copy = await must(page.getByRole('button', { name: /copy a meal/i }).first(), 'Copy a meal');
      await copy.click();
      await h.settle(800);
      await must(page.getByRole('dialog'), 'Copy Meal dialog');
    },
    teardown: (page, h) => h.esc(400),
  },
  // Weight & body (FITNESSGEEK_BODY_DATA_PLAN D6), top: goal progress and the
  // smoothed weight trend. The body section and the log are further down, so
  // they get their own scrolled scenes — a screenshot is one viewport tall.
  { name: '05-weight', goto: '/weight', wait: 1600 },
  {
    // The weight chart itself: a 7-day-average line over faint reading dots.
    name: '05a-weight-trend',
    goto: '/weight',
    wait: 1800,
    async setup(page, h) {
      await scrollToSection(page, h, 'text=Weight trend', 88);
    },
  },
  {
    name: '05b-weight-body',
    goto: '/weight',
    wait: 1800,
    setup: async (page, h) => { await scrollToSection(page, h, '#body-composition'); },
  },
  {
    // The fat/lean trend (lazy Nivo island) under the summary and change cards.
    name: '05c-weight-body-trend',
    goto: '/weight',
    wait: 1800,
    async setup(page, h) {
      await scrollToSection(page, h, '#body-composition');
      await scrollToSection(page, h, 'text=Line: 7-day average · dots: each scan', 120);
    },
  },
  {
    name: '05d-weight-log',
    goto: '/weight',
    wait: 1800,
    async setup(page, h) {
      await scrollToSection(page, h, 'text=Weight log', 88);
    },
  },
  {
    // Edit a past weight — a scale row, so the re-import warning shows too.
    name: '05e-weight-edit-dialog',
    goto: '/weight',
    wait: 1800,
    async setup(page, h) {
      const edit = await must(page.getByRole('button', { name: /^edit the .* weigh-in from/i }).first(), 'weight log edit button');
      await edit.scrollIntoViewIfNeeded();
      await edit.click();
      await h.settle(800);
      await must(page.getByRole('dialog'), 'edit dialog');
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    name: '06-weight-dialog',
    goto: '/weight',
    wait: 1600,
    viewports: ['phone'],
    async setup(page, h) {
      const wfab = await must(page.getByRole('button', { name: /log weight/i }).first(), 'the "Log weight" FAB');
      await wfab.click();
      await h.settle(800);
      await must(page.getByRole('dialog'), 'weight dialog');
    },
    teardown: (page, h) => h.esc(400),
  },
  // Blood pressure, with its FAB.
  { name: '07-bp', goto: '/blood-pressure', wait: 1800 },
  // Reports: Food comes first now — the averages coverage line, and the day
  // ribbon WITH targets. The ribbon's "Goal:" legend went in wave A; each day
  // card says its status in words instead ("a bit over", "over"), so that is
  // the anchor, and the meal rows carry protein.
  {
    name: '07r-reports',
    goto: '/reports',
    wait: 1800,
    async setup(page, h) {
      await must(page.locator('[data-testid="reports-food"]'), 'the Food section');
      await must(page.locator('[data-testid="day-status"]').first(), 'day ribbon status words');
      await must(page.locator('[data-testid="meal-row"]').first(), 'meal rows');
      await scrollToSection(page, h, '[data-testid="report-days-logged"]', 96);
    },
  },
  // Reports › Body & recovery (FITNESSGEEK_TRENDS_PLAN D1–D3): 90-day Garmin
  // trends from GET /api/influx/trends (fixtures' INFLUX_TRENDS), then the
  // body cards. Three shots, one per group — the section is several screens
  // tall on a phone. The sparklines are one lazy Nivo island.
  {
    name: '07s-reports-body-recovery',
    goto: '/reports',
    wait: 2000,
    async setup(page, h) {
      await must(page.locator('[data-testid="trend-restingHR"]'), 'resting HR trend card');
      await scrollToSection(page, h, '#body-recovery', 88);
    },
  },
  {
    name: '07t-reports-activity',
    goto: '/reports',
    wait: 2000,
    async setup(page, h) {
      await must(page.locator('[data-testid="trend-intensity"]'), 'intensity minutes card');
      await scrollToSection(page, h, 'section[aria-label="Activity"]', 88);
    },
  },
  {
    name: '07u-reports-body',
    goto: '/reports',
    wait: 2000,
    async setup(page, h) {
      await must(page.locator('[data-testid="trend-bp"]'), 'blood pressure card');
      await scrollToSection(page, h, 'section[aria-label="Body"]', 88);
    },
  },
  {
    name: '08-bp-dialog',
    goto: '/blood-pressure',
    wait: 1800,
    viewports: ['phone'],
    async setup(page, h) {
      // It used to skip silently (no PNG for weeks); now a missing FAB fails.
      const bfab = await must(page.getByRole('button', { name: /^log (bp|blood pressure)$/i }).first(), 'the "Log blood pressure" FAB');
      await bfab.click();
      await h.settle(800);
      await must(page.getByRole('dialog', { name: /log blood pressure/i }), 'BP dialog');
    },
    teardown: (page, h) => h.esc(400),
  },
  // Profile folded into Settings in wave A: /profile still works and lands on
  // the "About you" section (#you). 09 proves the redirect; 10 is the section
  // itself, scrolled under the top bar — the old Edit Profile dialog is gone.
  {
    name: '09-profile',
    goto: '/profile',
    wait: 1400,
    async setup(page) {
      if (!/\/settings#you$/.test(page.url())) throw new Error(`/profile landed on ${page.url()}, not /settings#you`);
      await must(page.locator('[data-testid="about-you"]'), 'About you');
    },
  },
  {
    name: '10-settings-about-you',
    goto: '/settings#you',
    wait: 1400,
    async setup(page, h) {
      await scrollToSection(page, h, '[data-testid="about-you"]', 88);
    },
  },
  {
    /*
     * Describe-and-log — the app's primary path
     * (apps/fitnessgeek/DOCS/THE_DESCRIBE_AND_LOG_PLAN.md).
     *
     * This scene used to drive the natural-language quick-add sheet: a
     * "Describe a meal" button behind the `natural_language_food_logging`
     * opt-in, a `quick-add-text` field and a "Read it" button. All of that was
     * deleted on 2026-09-14 when the sheet was folded into the search box, and
     * this scene has been **silently skipping** ever since — `setup` returning
     * false is a skip, not a failure, so the run kept saying PASS while one
     * scene covered nothing. Worth remembering: a scene that bails is quieter
     * than a scene that fails.
     *
     * What it covers now is the real thing: type a sentence into the one box,
     * and the offer to log it is the first thing under it.
     *
     * The stubs are page-scoped, so this must stay the LAST scene in the file
     * — page.route() beats ctx.route() only for requests registered after it.
     */
    name: '11-describe-and-log',
    async setup(page, h) {
      // The box's two search waves. Neither should be what answers here, but
      // both fire on a pause, and an unstubbed call would hang the scene.
      await page.route('**/api/foods*', (r) => json(r, { success: true, data: [] }));

      // POST /api/logs/describe — the front door. Shaped exactly as
      // `logDescription` returns it (routes/logRoutes.js).
      await page.route('**/api/logs/describe', (r) => json(r, {
        success: true,
        data: {
          logged: [{
            logId: 'log-desc-1',
            name: 'Chocolate chip pancakes, homemade',
            servings: 4,
            loggedServings: 1,
            mealType: 'breakfast',
            calories: 880,
            nutrition: { calories_per_serving: 880, protein_grams: 18, carbs_grams: 112, fat_grams: 34 },
            source: 'estimate',
            flags: [],
            needsJudge: false,
          }],
          skipped: [],
          logIds: ['log-desc-1'],
          questions: [],
          totalCalories: 880,
        },
      }));

      await page.goto(h.base + '/food-log', { waitUntil: 'networkidle' });
      await h.settle(1600);

      // The composer (REVIEW_2026-10 §4): "Tell me what you ate", with Log it
      // right under it. A sentence folds the list away.
      const box = await must(page.getByLabel('Tell me what you ate').first(), 'the composer box on the food log');
      await box.fill('4 chocolate chip pancakes homemade');
      // Long enough for the 400ms deep-search debounce to come and go, so the
      // shot is of a settled surface rather than a spinner.
      await h.settle(900);

      // Log it is the point of the scene: if it isn't live under the box,
      // describing has stopped being the primary path.
      const logIt = await must(page.locator('[data-testid="log-it"]').first(), 'Log it under the box');
      if (await logIt.isDisabled()) throw new Error('Log it is disabled with a sentence in the box');
    },
    teardown: (page, h) => h.esc(400),
  },
  // Body-composition scan import. Reachable from the Android share sheet and
  // from its own file picker, so it is a real destination rather than a
  // sub-view of something already covered — it needs its own scene or the
  // gate never looks at it.
  { name: '12-scan-import', goto: '/scan-import', wait: 1600 },
  {
    // The change card before a comparison exists — today's real shape: eight
    // scans in a week, four on one day. It must say WHEN ("around 5 Oct"),
    // never a number (§0). A page-scoped GraphQL stub overrides the context's
    // month of scans for this scene only; teardown drops it so nothing after
    // this sees it (and it sits last for the same reason as scene 11).
    name: '13-weight-body-early',
    setup: (page, h) => withPageOps(page, {
      ...OPS,
      GetBodyCompositionSummary: { bodyCompositionSummary: BODY_COMP_SUMMARY_EARLY },
      GetBodyCompositions: { bodyCompositions: BODY_COMP_SCANS_EARLY },
    }, async () => {
      await page.goto(h.base + '/weight', { waitUntil: 'networkidle' });
      await h.settle(1800);
      await must(page.getByText(/Your first comparison appears around/).first(), 'change card "appears around" state');
      await scrollToSection(page, h, '#body-composition');
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // Dashboard, the other banner: a current plan built on Mifflin while a
    // measured BMR exists — the dismissible "A measured BMR is available".
    // (The stale "needs recalculating" banner is on 01-home: SETTINGS' plan
    // has a bmr and no bmr_calc_version.)
    name: '14-home-scan-bmr-banner',
    setup: (page, h) => withPageOps(page, opsWithPlan(CURRENT_MIFFLIN_PLAN), async () => {
      await page.goto(h.base + '/dashboard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      await must(page.locator('[data-testid="plan-accuracy-banner"][data-kind="scan"]'), 'scan-BMR banner');
      await scrollToSection(page, h, '[data-testid="plan-accuracy-banner"]', 96);
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // Dashboard weight stat: 7-day mean now vs the 7-day mean ~30 days ago.
    name: '15-home-weight-stat',
    goto: '/dashboard',
    wait: 1800,
    async setup(page, h) {
      await must(page.getByText(/^7-day avg · /).first(), 'weight stat caption');
      await scrollToSection(page, h, 'text=/^7-day avg · /', 260);
    },
  },
  {
    // Calorie wizard over a saved plan built from the scans: the metabolism
    // card names the source (plan D1).
    name: '16-wizard-scan-source',
    setup: (page, h) => withPageOps(page, opsWithPlan(SCAN_PLAN, FULL_USER), async () => {
      await page.goto(h.base + '/calorie-wizard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      await must(page.locator('[data-testid="bmr-source"][data-source="scan"]'), 'scan BMR source note');
      await scrollToSection(page, h, 'text=What you burn', 96);
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // Re-running the wizard over a saved (stale) weekender plan: old vs new,
    // before anything is saved (plan D2). Walks Change plan → Continue → Next →
    // Work out my plan, with the profile coming from USER in fixtures.mjs.
    name: '17-wizard-old-vs-new',
    setup: (page, h) => withPageOps(page, opsWithPlan({
      // A weekender moves calories to Sat/Sun and keeps the weekly average
      // equal to the daily target: 5 × 1764 + 2 × 2415 = 7 × 1950.
      plan_type: 'weekender',
      weekly_schedule: [1764, 1764, 1764, 1764, 1764, 2415, 2415],
      daily_calorie_target: 1950,
    }, FULL_USER), async () => {
      await page.goto(h.base + '/calorie-wizard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      await (await must(page.getByRole('button', { name: /^change plan$/i }).first(), 'Change plan')).click();
      await h.settle(500);
      await (await must(page.getByRole('button', { name: /^continue$/i }).first(), 'Continue')).click();
      await h.settle(500);
      const next = await must(page.getByRole('button', { name: /next: set goal/i }).first(), 'Next: Set Goal');
      if (await next.isDisabled()) throw new Error('profile incomplete: Next: Set Goal is disabled');
      await next.click();
      await h.settle(500);
      await (await must(page.getByRole('button', { name: /work out my plan/i }).first(), 'Work out my plan')).click();
      await h.settle(900);
      await must(page.locator('[data-testid="plan-comparison"]'), 'old-vs-new card');
      await scrollToSection(page, h, '[data-testid="plan-comparison"]', 120);
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // Body & recovery for a user without the Influx connection: the trends
    // route answers 403 (settings.influxEnabled false). The body cards stay;
    // the Garmin groups become one quiet line. Page-scoped route, so last.
    name: '18-reports-no-influx',
    async setup(page, h) {
      await page.route('**/api/influx/trends*', (r) =>
        // What the endpoint sends a user without Influx (a 200 — a 403 would
        // make the auth interceptor refresh the token on every visit).
        json(r, { available: false, reason: 'not_enabled', days: [], fitnessAge: null, activeKcal30: null }));
      try {
        await page.goto(h.base + '/reports', { waitUntil: 'networkidle' });
        await h.settle(1800);
        await must(page.locator('[data-testid="garmin-not-connected"]'), 'not-connected line');
        await must(page.locator('[data-testid="trend-weight"]'), 'weight card still shown');
        await scrollToSection(page, h, '#body-recovery', 88);
      } catch (err) {
        await page.unroute('**/api/influx/trends*');
        throw err;
      }
    },
    teardown: (page) => page.unroute('**/api/influx/trends*'),
  },
];

// ── Simple and Full + Market Morning (apps/fitnessgeek/DOCS/SIMPLE_AND_FULL_PLAN.md) ──
// Page-scoped stubs again, so these sit after everything above. Heather is
// the Simple face: no logs of any kind, two medications. The scenes THROW on
// a missing anchor — a skip would say PASS while covering nothing.

scenes.push(
  // Simple home: the plate in words, the Today strip, four meal cards.
  heatherScene('19-simple-home', HEATHER, async (page) => {
    await must(page.locator('[data-testid="calories-sentence"]'), 'the calories sentence');
    await must(page.locator('[data-testid="today-strip"]'), 'Today strip');
    await must(page.locator('[data-testid="meal-cards"]'), 'meal cards');
  }),
  // …scrolled to the check-ins: the strip and "Did you take your meds?".
  heatherScene('19a-simple-meds', HEATHER, async (page, h) => {
    await must(page.locator('[data-testid="today-strip-meds"]'), 'meds check-in on the strip');
    await must(page.locator('[data-testid="meds-checklist"]'), 'meds checklist');
    await scrollToSection(page, h, '[data-testid="meds-checklist"]', 96);
  }),
  // First run: a person who never chose, and has never logged, lands here.
  heatherScene('20-first-run', { mode: null, first_run_done: false }, async (page) => {
    await must(page.locator('[data-testid="first-run"]'), 'first run');
  }),
  heatherScene('20a-first-run-goal', { mode: null, first_run_done: false }, async (page, h) => {
    const next = await must(page.getByRole('button', { name: /^next$/i }).first(), 'Next');
    await next.click();
    await h.settle(500);
    await must(page.getByRole('radio', { name: /keep my weight steady/i }), 'goal choices');
  }, { viewports: ['phone'] }),
  // Simple's add sheet from a meal card: the big "Say what you ate".
  heatherScene('21a-simple-add-sheet', HEATHER, async (page, h) => {
    const add = await must(page.getByRole('button', { name: /^add to lunch$/i }).first(), 'Add to lunch');
    await add.click();
    await h.settle(900);
    await must(page.getByRole('dialog'), 'add sheet');
    await must(page.locator('[data-testid="speak-button"]'), 'microphone button');
    // The composer, empty: the box, Log it (dim), "Or tap one you've had".
    await must(page.getByRole('dialog').getByLabel('Tell me what you ate'), 'the composer box');
    await must(page.getByRole('dialog').locator('[data-testid="log-it"][disabled]'), 'Log it, dim until there are words');
  }, { dialog: true }),
  // Larger text, on Heather's home.
  heatherScene('22-larger-text', { ...HEATHER, larger_text: true }, async (page) => {
    const size = await page.evaluate(() => document.documentElement.dataset.textSize);
    if (size !== 'larger') throw new Error(`larger text not applied (data-text-size=${size})`);
  }),
  heatherScene('24a-more-simple', HEATHER, async (page) => {
    await must(page.locator('[data-testid="more-page"]'), 'More page');
  }, { path: '/more' }),
  {
    // Full's add sheet from Home's Lunch card: "Same as yesterday's lunch",
    // the Again chips, and the microphone (idle) in the box.
    name: '21-add-sheet-again',
    async setup(page, h) {
      await page.addInitScript(SPEECH_STUB);
      await page.goto(h.base + '/dashboard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      const add = await must(page.getByRole('button', { name: /^add to lunch$/i }).first(), 'Add to lunch');
      await add.click();
      await h.settle(1200);
      await must(page.locator('[data-testid="again-chips"]'), 'Again chips');
      await must(page.locator('[data-testid="same-as-yesterday"]'), 'Same as yesterday');
      await must(page.getByRole('button', { name: /say what you ate/i }).first(), 'microphone');
    },
    teardown: (page, h) => h.esc(400),
  },
  {
    // Full home, scrolled to the meal cards (with Chef's foods and removes).
    name: '23-full-home-meals',
    goto: '/dashboard',
    wait: 1800,
    async setup(page, h) {
      await must(page.locator('[data-testid="macro-strip"]'), 'Full home macro strip');
      await scrollToSection(page, h, '#todays-meals', 88);
    },
  },
  { name: '24-more', goto: '/more', wait: 1400 },
  {
    // Settings: Simple or Full, and Larger text, at the top.
    name: '25-settings-experience',
    goto: '/settings',
    wait: 1600,
    async setup(page) {
      await must(page.locator('[data-testid="experience-settings"]'), 'experience settings');
    },
  },
  {
    // My Foods with a recipe in it (RECIPES_PLAN.md): the "Recipe · makes 6"
    // label and the New recipe / New food buttons.
    name: '26-my-foods-recipe',
    setup: (page, h) => withPageOps(page, { ...OPS, GetFitnessFoods: { fitnessFoods: [...FOODS, CHILI] } }, async () => {
      await page.goto(h.base + '/my-foods', { waitUntil: 'networkidle' });
      await h.settle(1400);
      await must(page.getByText('Turkey chili').first(), 'recipe row');
      await must(page.getByRole('button', { name: /new recipe/i }), 'New recipe button');
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // The builder, pre-filled from that recipe: rows with amount + unit, an
    // AI-estimate marker, the live per-serving preview.
    name: '27-recipe-builder',
    setup: (page, h) => withPageOps(page, { ...OPS, GetFitnessFoods: { fitnessFoods: [...FOODS, CHILI] } }, async () => {
      await page.goto(h.base + '/my-foods', { waitUntil: 'networkidle' });
      await h.settle(1400);
      await (await must(page.getByRole('button', { name: /edit turkey chili/i }), 'edit recipe')).click();
      await h.settle(900);
      await must(page.getByRole('textbox', { name: /amount of ground turkey/i }).or(page.getByLabel(/amount of ground turkey/i)).first(), 'builder ingredient row');
    }),
    teardown: async (page, h) => { await h.esc(400); await page.unroute('**/graphql'); },
  },
);

// ── The food composer (REVIEW_2026-10 §4, Phase 3.16) ────────────────────
// Every state gets a scene here, Simple (Heather) and Full (Chef); the
// helpers (composerScene, foodRoutes…) live in helpers.mjs.

scenes.push(
  // Typing a sentence: the list folds into "Or pick an exact food (n)".
  composerScene('28-composer-sentence', {
    simple: true,
    routes: { suggest: soupSuggest },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h);
      await must(sheet.locator('[data-testid="exact-food-toggle"][aria-expanded="false"]'), 'folded "Or pick an exact food"');
      if (await sheet.getByText(/nothing found|fewer words/i).count()) throw new Error('"Nothing found" on a sentence');
    },
  }),
  composerScene('28a-composer-sentence-full', {
    routes: { suggest: soupSuggest },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h);
      await must(sheet.locator('[data-testid="exact-food-toggle"]'), '"Or pick an exact food"');
    },
  }),
  // A short name: the list open, "+ Add" and "190 cal" on every row.
  composerScene('29-composer-short-query', {
    simple: true,
    routes: { suggest: fageSuggest, deep: fageDeep },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'fage', h, 1200);
      await must(sheet.getByText('+ Add').first(), '"+ Add" pill');
      await must(sheet.getByText('190 cal').first(), '"190 cal"');
    },
  }),
  composerScene('29a-composer-short-query-full', {
    routes: { suggest: fageSuggest, deep: fageDeep },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'fage', h, 1200);
      // After the first add, the pill is "Make it 2".
      await (await must(sheet.getByRole('button', { name: /^Add Greek Yogurt, Plain Whole Milk/ }).first(), 'the yogurt row')).click();
      await h.settle(900);
      await must(sheet.getByRole('button', { name: /^Make it 2/ }), '"Make it 2"');
    },
  }),
  // Thinking, past eight seconds: "Still working".
  (() => {
    let release = null;
    return {
      ...composerScene('30-composer-thinking', {
        simple: true,
        viewports: ['phone'],
        routes: {
          suggest: soupSuggest,
          describe: async (r) => {
            await new Promise((resolve) => { release = resolve; });
            try { await json(r, { success: true, data: DESCRIBED_SOUP }); } catch { /* gone */ }
          },
        },
        fn: async (page, h, sheet) => {
          await typeInto(sheet, SOUP, h, 400);
          await sheet.locator('[data-testid="log-it"]').click();
          await h.settle(8400);
          await must(sheet.getByText('Working it out…'), '"Working it out…"');
          await must(sheet.getByText('Still working — this one’s taking a moment.'), '"Still working"');
        },
      }),
      async teardown(page, h) {
        release?.();
        release = null;
        await h.settle(400);
        await h.esc(400);
        await dropFoodRoutes(page);
        await page.unroute('**/graphql');
      },
    };
  })(),
  // Simple's result card: it stays open on what landed.
  composerScene('31-composer-result-simple', {
    simple: true,
    routes: { suggest: soupSuggest },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 400);
      await sheet.locator('[data-testid="log-it"]').click();
      await h.settle(1200);
      await must(sheet.locator('[data-testid="result-card"]'), 'result card');
      await must(sheet.getByText('Added to lunch'), '"Added to lunch"');
    },
  }),
  // …and its Fix sheet.
  composerScene('31a-composer-fix-sheet', {
    simple: true,
    routes: { suggest: soupSuggest },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 400);
      await sheet.locator('[data-testid="log-it"]').click();
      await h.settle(1200);
      await (await must(sheet.getByRole('button', { name: 'Fix Chicken soup, 1 bowl' }), 'Fix')).click();
      await h.settle(700);
      await must(page.locator('[data-testid="fix-sheet"]'), 'Fix sheet');
    },
  }),
  // Full: the sheet closes, and the meal card carries "Just added".
  composerScene('32-full-just-added', {
    routes: { suggest: soupSuggest },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 400);
      await sheet.locator('[data-testid="log-it"]').click();
      await h.settle(1600);
      if (await page.getByRole('dialog').count()) throw new Error('Full: the add sheet should have closed');
      await must(page.locator('[data-testid="meal-card-lunch"] [data-testid="just-added"]'), '"Just added" on the lunch card');
      await scrollToSection(page, h, '[data-testid="meal-card-lunch"]', 88);
    },
  }),
  // …and on the Log page, on the meal section.
  composerScene('32a-log-just-added', {
    path: '/food-log',
    sheet: false,
    routes: { suggest: soupSuggest },
    fn: async (page, h) => {
      await typeInto(page, SOUP, h, 400);
      await page.locator('[data-testid="log-it"]').first().click();
      await h.settle(1600);
      await must(page.locator('#meal-section-lunch [data-testid="just-added"]'), '"Just added" on the Log page lunch');
      await scrollToSection(page, h, '#meal-section-lunch', 88);
    },
  }),
  // Errors, with her words kept: no signal, and a failure.
  composerScene('33-composer-offline', {
    simple: true,
    viewports: ['phone'],
    offline: true,
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 600);
      await must(sheet.getByText('No signal — I can’t log this yet. Your words are saved here.'), 'the offline line');
      await must(sheet.locator('[data-testid="log-it"][disabled]'), 'Log it off while offline');
    },
  }),
  composerScene('34-composer-failure', {
    simple: true,
    routes: { suggest: soupSuggest, describe: 500 },
    fn: async (page, h, sheet) => {
      await typeInto(sheet, SOUP, h, 400);
      await sheet.locator('[data-testid="log-it"]').click();
      await h.settle(1200);
      await must(sheet.getByText('That didn’t go through. Tap Log it to try again.'), 'the failure line');
    },
  }),
  // Day words: ask before logging.
  composerScene('35-composer-day-chip', {
    simple: true,
    meal: 'dinner',
    fn: async (page, h, sheet) => {
      await typeInto(sheet, 'fried chicken and fries last night', h, 400);
      await sheet.locator('[data-testid="log-it"]').click();
      await h.settle(500);
      await must(sheet.locator('[data-testid="day-confirm"]'), '"Log this to yesterday?"');
    },
  }),
  // The add sheet on a day that isn't today names it.
  composerScene('36-add-sheet-yesterday', {
    path: `/food-log?date=${YESTERDAY}&meal=dinner`,
    sheet: false,
    fn: async (page, h) => {
      await (await must(page.locator('#meal-section-dinner').getByRole('button', { name: /^add to dinner$/i }).first(), 'Dinner "+ Add"')).click();
      await h.settle(900);
      await must(page.getByRole('dialog').getByText(/^Add to \w+’s dinner \(yesterday\)$/), 'the title "Add to <weekday>’s dinner (yesterday)"');
    },
  }),
  {
    /*
     * DESKTOP LAYOUT STABILITY. Chef: "the entry form bounces around a lot on
     * the desktop when trying to enter foods." Open the add dialog, record
     * where the dialog and the box are, type a name that streams in wave one
     * and then (late) wave two, and record again. The dialog's and the box's
     * top edges may not move more than 2px, and a row under the pointer may
     * not move when the late batch lands.
     */
    name: '37-desktop-add-dialog-stable',
    viewports: ['desktop'],
    async setup(page, h) {
      await foodRoutes(page, { suggest: fageSuggest, deep: fageDeep, suggestMs: 250, deepMs: 1400 });
      try {
        await page.goto(h.base + '/food-log', { waitUntil: 'networkidle' });
        await h.settle(1400);
        await (await must(page.locator('#meal-section-lunch').getByRole('button', { name: /^add to lunch$/i }).first(), 'Lunch "+ Add"')).click();
        await h.settle(900);
        const paper = await must(page.locator('[data-testid="add-food-dialog"]'), 'the add dialog');
        const box = await must(paper.getByLabel('Tell me what you ate'), 'the composer box');
        // Earlier scenes in this context may have left words in today's lunch
        // draft: they now survive closing the sheet (L18, d-fixes).
        if (await box.inputValue()) {
          await box.fill('');
          await h.settle(600);
        }
        const tops = async () => ({ dialog: (await paper.boundingBox()).y, input: (await box.boundingBox()).y });
        const before = await tops();

        await box.click();
        await box.pressSequentially('fage', { delay: 90 });
        await h.settle(700);
        const first = paper.locator('[data-testid="food-row"]').first();
        await must(first, 'wave one rows');
        const rowsAfterSuggest = await paper.locator('[data-testid="food-row"]').count();
        await first.hover();
        const rowTop = (await first.boundingBox()).y;
        const mid = await tops();

        await h.settle(2200);
        const rowsAfterDeep = await paper.locator('[data-testid="food-row"]').count();
        if (rowsAfterDeep <= rowsAfterSuggest) throw new Error(`wave two never landed (${rowsAfterSuggest} → ${rowsAfterDeep} rows)`);
        const after = await tops();
        const rowTopAfter = (await first.boundingBox()).y;

        const moved = [];
        for (const key of ['dialog', 'input']) {
          for (const [label, at] of [['typing', mid], ['late batch', after]]) {
            const dy = Math.abs(at[key] - before[key]);
            if (dy > 2) moved.push(`${key} top moved ${dy.toFixed(1)}px (${label})`);
          }
        }
        if (Math.abs(rowTopAfter - rowTop) > 2) moved.push(`hovered row moved ${(rowTopAfter - rowTop).toFixed(1)}px when the late batch landed`);
        if (moved.length) throw new Error(`the add dialog bounced: ${moved.join('; ')}`);
        h.log(`stable: dialog ${before.dialog}→${after.dialog}, input ${before.input}→${after.input}, row ${rowTop}→${rowTopAfter}, rows ${rowsAfterSuggest}→${rowsAfterDeep}`);
      } catch (err) {
        await dropFoodRoutes(page);
        throw err;
      }
    },
    async teardown(page, h) {
      await h.esc(400);
      await dropFoodRoutes(page);
    },
  },
);

// ── Wave A (2026-10-17) ─────────────────────────────────────────────────
// Every state the UX-review fixes built, and every screen that had no
// picture. Kept in their own files by area; each exports `scenes` and an
// optional `tail` — scenes that change something a page cannot take back
// (page.clock, an init script), which run after everything else.
import * as composerWave from './scenes-composer.mjs';
import * as pagesWave from './scenes-pages.mjs';
import * as settingsWave from './scenes-settings.mjs';

const WAVES = [composerWave, pagesWave, settingsWave];
for (const w of WAVES) scenes.push(...(w.scenes || []));
for (const w of WAVES) scenes.push(...(w.tail || []));

// FG_SCENES=<regex> walks only the matching scenes — for iterating on a few
// without the whole run. Unset in CI.
if (process.env.FG_SCENES) {
  const only = new RegExp(process.env.FG_SCENES);
  scenes.splice(0, scenes.length, ...scenes.filter((s) => only.test(s.name)));
}

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
