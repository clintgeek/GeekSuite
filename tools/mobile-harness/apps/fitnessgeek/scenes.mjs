// FitnessGeek — the M1/M2 pilot surfaces (MOBILE_UI_PLAN.md). Scenes are
// independent: any scene that needs a dialog open re-navigates and re-opens
// it rather than relying on a previous scene's state.
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
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
