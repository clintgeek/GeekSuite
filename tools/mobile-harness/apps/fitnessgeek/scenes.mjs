// FitnessGeek — the M1/M2 pilot surfaces (MOBILE_UI_PLAN.md), plus the Night 2
// AI quick-add scene (R115/R126). Scenes are independent: any scene that
// needs a dialog open re-navigates and re-opens it rather than relying on a
// previous scene's state.
import { json, graphqlRoute } from '../../lib/net.mjs';
import { OPS, SETTINGS } from './fixtures.mjs';

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
  // Weight, with its FAB.
  { name: '05-weight', goto: '/weight', wait: 1600 },
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
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
