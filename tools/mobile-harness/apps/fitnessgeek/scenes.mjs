// FitnessGeek — the M1/M2 pilot surfaces (MOBILE_UI_PLAN.md), plus the Night 2
// AI quick-add scene (R115/R126). Scenes are independent: any scene that
// needs a dialog open re-navigates and re-opens it rather than relying on a
// previous scene's state.
import { json, graphqlRoute } from '../../lib/net.mjs';
import { OPS } from './fixtures.mjs';

// The opt-in is client-only localStorage (`utils/quickAddPreference.js`),
// default off, so no existing scene below renders "Describe a meal" — it is
// seeded only inside the new scene's own page.addInitScript().
const QUICK_ADD_NL_KEY = 'fitnessgeek:quickAddNL';

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
    // Natural-language quick-add (DOCS/AI_IDEAS.md #2, Night 2 R115). Both the
    // localStorage opt-in and the two network stubs are page-scoped (not in
    // fixtures.mjs's context-wide routes()), so this must stay the LAST scene
    // in the file — a page.addInitScript() applies to every navigation after
    // the one that registers it.
    name: '11-quickadd-proposal',
    async setup(page, h) {
      await page.addInitScript((key) => {
        try { window.localStorage.setItem(key, 'true'); } catch { /* ignore */ }
      }, QUICK_ADD_NL_KEY);

      await graphqlRoute(page, {
        ...OPS,
        ParseFoodEntry: {
          parseFoodEntry: {
            __typename: 'ParsedFoodEntry',
            fragments: [
              { __typename: 'ParsedFoodFragment', text: 'two eggs', query: 'eggs', servings: 2, unit: null, mealType: 'breakfast' },
              { __typename: 'ParsedFoodFragment', text: 'toast with butter', query: 'toast', servings: 1, unit: null, mealType: 'breakfast' },
              { __typename: 'ParsedFoodFragment', text: 'kombucha', query: 'kombucha', servings: 1, unit: null, mealType: 'breakfast' },
            ],
            provenance: { __typename: 'AIProvenance', source: 'model', reason: null, model: 'llama-3.1-8b-instant', provider: 'groq', cached: false, callsToday: 1, cap: 40 },
          },
        },
      });

      // foodService.search() calls fitnessgeek's own REST `/api/foods` directly
      // (restClient, not the apiService→GraphQL rewrite) — "eggs" and "toast"
      // match the catalog, "kombucha" comes back empty, i.e. "no match".
      await page.route('**/api/foods*', (r) => {
        const search = new URL(r.request().url()).searchParams.get('search') || '';
        const q = search.toLowerCase();
        let data = [];
        if (q.includes('egg')) {
          data = [{ id: 'f-egg', name: 'Two Large Eggs, fried', brand: null, source: 'usda' }];
        } else if (q.includes('toast')) {
          data = [{ id: 'f-toast', name: 'Sourdough Toast with Butter', brand: 'Boudin', source: 'custom' }];
        }
        return json(r, { success: true, data });
      });

      await page.goto(h.base + '/food-log', { waitUntil: 'networkidle' });
      await h.settle(1600);

      const describeBtn = page.getByRole('button', { name: /^describe a meal$/i }).first();
      if (!(await describeBtn.count())) return h.log('no "Describe a meal" button') ?? false;
      await describeBtn.click();
      await h.settle(600);

      const textField = page.getByTestId('quick-add-text');
      if (!(await textField.count())) return false;
      await textField.fill('two eggs, toast with butter, kombucha');
      await h.settle(200);

      const readBtn = page.getByRole('button', { name: /^read it$/i }).first();
      if (!(await readBtn.count())) return false;
      await readBtn.click();
      await h.settle(1200);
    },
    teardown: (page, h) => h.esc(400),
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
