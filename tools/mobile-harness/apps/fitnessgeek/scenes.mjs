// FitnessGeek — the M1/M2 pilot surfaces (MOBILE_UI_PLAN.md), plus the Night 2
// AI quick-add scene (R115/R126). Scenes are independent: any scene that
// needs a dialog open re-navigates and re-opens it rather than relying on a
// previous scene's state.
import { json, graphqlRoute } from '../../lib/net.mjs';
import { OPS, SETTINGS, BODY_COMP_SUMMARY_EARLY, BODY_COMP_SCANS_EARLY, opsWithPlan } from './fixtures.mjs';

// The weight, dashboard and wizard scenes THROW when their anchor is missing instead of
// returning false: a skip is silent (see scene 11's note), and these exist
// to prove specific UI is on screen.
const must = async (locator, what) => {
  if (!(await locator.count())) throw new Error(`missing: ${what}`);
  return locator;
};

// A page-scoped GraphQL stub for one scene. page.route() beats ctx.route(),
// so it is dropped again whether setup succeeds or throws — the runner skips
// teardown on a throw, and one page serves every scene of a viewport.
async function withPageOps(page, ops, fn) {
  await graphqlRoute(page, ops);
  try {
    return await fn();
  } catch (err) {
    await page.unroute('**/graphql');
    throw err;
  }
}

// A saved plan calculated after the BMR fix, from Mifflin — so the stale
// banner stands down and the measured-BMR offer can show.
const CURRENT_MIFFLIN_PLAN = { bmr_calc_version: 2, bmr_source: 'mifflin', lean_mass_lb: null };
// Internally consistent: Katch-McArdle BMR from the fixture scans' 140.7 lb
// lean mass, × 1.55 (moderate) for TDEE, less 500 for 1 lb/week.
const SCAN_PLAN = {
  bmr_calc_version: 2, bmr_source: 'scan', lean_mass_lb: 140.7,
  bmr: 1749, tdee: 2711, daily_calorie_target: 2211, weekly_schedule: Array(7).fill(2211),
};

// Scroll a section to just under the sticky top bar, then let the lazy chart
// in it arrive. THROWS when the anchor is missing: a scene that returns false
// is skipped silently (scene 11's note), and a missing section is a regression.
async function scrollToSection(page, h, selector, offset = 72) {
  const el = page.locator(selector).first();
  if (!(await el.count())) throw new Error(`missing: ${selector}`);
  // scrollIntoView finds whichever ancestor actually scrolls (the shell's
  // main pane, not necessarily the window), then that ancestor backs off by
  // `offset` so the sticky top bar does not sit on the section's heading.
  await el.evaluate((node, off) => {
    node.scrollIntoView({ block: 'start' });
    let p = node.parentElement;
    while (p && !(p.scrollHeight > p.clientHeight && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) {
      p = p.parentElement;
    }
    (p || document.scrollingElement).scrollBy(0, -off);
  }, offset);
  await h.settle(1200);
  return true;
}

// The opt-in is server-side now (`ai.features.natural_language_food_logging`
// on the settings document, R124 — see
// `apps/fitnessgeek/frontend/src/utils/quickAddPreference.js`), off by
// default in fixtures.mjs's context-wide SETTINGS so no scene above this one
// renders "Describe a meal". Scene 11 flips it on for itself only, via a
// page-scoped GetFitnessUserSettings stub (page.route() beats ctx.route()
// for a matching request — README "Night 2"), and must stay the LAST scene
// in the file for the same reason.

export const scenes = [
  { name: '01-home', goto: '/dashboard', wait: 1600 },
  { name: '02-log', goto: '/food-log', wait: 1600 },
  {
    // The FAB opens the food dialog with the meal pre-picked from the clock.
    name: '03-food-dialog',
    goto: '/food-log',
    wait: 1600,
    async setup(page, h) {
      const fab = page.getByRole('button', { name: /log food/i }).first();
      if (!(await fab.count())) {
        h.log('no "Log food" FAB found at', h.viewport, h.scheme);
        return false;
      }
      await fab.click();
      await h.settle(900);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // A converted form dialog, full-screen below sm: Copy Meal off the Log page.
    name: '04-copy-meal-dialog',
    goto: '/food-log',
    wait: 1600,
    async setup(page, h) {
      const copy = page.getByRole('button', { name: /copy meal/i }).first();
      if (!(await copy.count())) return false;
      await copy.click();
      await h.settle(800);
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
      const edit = await must(page.getByRole('button', { name: /^edit the .* entry from/i }).first(), 'weight log edit button');
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
      const wfab = page.getByRole('button', { name: /log weight/i }).first();
      if (!(await wfab.count())) return false;
      await wfab.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(400),
  },
  // Blood pressure, with its FAB.
  { name: '07-bp', goto: '/blood-pressure', wait: 1800 },
  {
    name: '08-bp-dialog',
    goto: '/blood-pressure',
    wait: 1800,
    viewports: ['phone'],
    async setup(page, h) {
      const bfab = page.getByRole('button', { name: /log blood pressure/i }).first();
      if (!(await bfab.count())) return false;
      await bfab.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(400),
  },
  // Profile: the Edit Profile dialog is another PremiumDialog conversion, and
  // the page hosts HouseholdSettings' three converted dialogs.
  { name: '09-profile', goto: '/profile', wait: 1400 },
  {
    name: '10-profile-edit',
    goto: '/profile',
    wait: 1400,
    async setup(page, h) {
      const edit = page.getByRole('button', { name: /edit profile/i }).first();
      if (!(await edit.count())) return false;
      await edit.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(400),
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

      const box = page.getByPlaceholder(/what did you eat/i).first();
      if (!(await box.count())) return h.log('no describe box on the food log') ?? false;

      await box.fill('4 chocolate chip pancakes homemade');
      // Long enough for the 400ms deep-search debounce to come and go, so the
      // shot is of a settled surface rather than a spinner.
      await h.settle(900);

      // The offer is the point of the scene: if the box no longer leads with
      // it, describing has stopped being the primary path and this should fail
      // rather than quietly photograph a search box.
      const offer = page.getByText(/^Log “/).first();
      if (!(await offer.count())) return h.log('no "Log …" offer under the box') ?? false;
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
    setup: (page, h) => withPageOps(page, opsWithPlan(SCAN_PLAN), async () => {
      await page.goto(h.base + '/calorie-wizard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      await must(page.locator('[data-testid="bmr-source"][data-source="scan"]'), 'scan BMR source note');
      await scrollToSection(page, h, 'text=Your Metabolism', 96);
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
  {
    // Re-running the wizard over a saved (stale) weekender plan: old vs new,
    // before anything is saved (plan D2). Walks Update → Continue → Next →
    // Calculate, with the profile coming from USER in fixtures.mjs.
    name: '17-wizard-old-vs-new',
    setup: (page, h) => withPageOps(page, opsWithPlan({
      // A weekender moves calories to Sat/Sun and keeps the weekly average
      // equal to the daily target: 5 × 1764 + 2 × 2415 = 7 × 1950.
      plan_type: 'weekender',
      weekly_schedule: [1764, 1764, 1764, 1764, 1764, 2415, 2415],
      daily_calorie_target: 1950,
    }), async () => {
      await page.goto(h.base + '/calorie-wizard', { waitUntil: 'networkidle' });
      await h.settle(1600);
      await (await must(page.getByRole('button', { name: /^update$/i }).first(), 'Update')).click();
      await h.settle(500);
      await (await must(page.getByRole('button', { name: /^continue$/i }).first(), 'Continue')).click();
      await h.settle(500);
      const next = await must(page.getByRole('button', { name: /next: set goal/i }).first(), 'Next: Set Goal');
      if (await next.isDisabled()) throw new Error('profile incomplete: Next: Set Goal is disabled');
      await next.click();
      await h.settle(500);
      await (await must(page.getByRole('button', { name: /calculate my plan/i }).first(), 'Calculate My Plan')).click();
      await h.settle(900);
      await must(page.locator('[data-testid="plan-comparison"]'), 'old-vs-new card');
      await scrollToSection(page, h, '[data-testid="plan-comparison"]', 120);
    }),
    teardown: (page) => page.unroute('**/graphql'),
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
