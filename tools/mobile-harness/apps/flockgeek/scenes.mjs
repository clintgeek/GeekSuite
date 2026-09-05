// FlockGeek phone-width screenshots (MOBILE_UI_PLAN.md M3).
//
// Scenes 04+ are phone-only in the scratch script: the desktop pass only
// ever covered 01-home and 03-birds (the rest lived inside an `isPhone`
// guard). Every scene here is independent — one that needs an open sheet
// or dialog re-opens it from its own `goto`, since the runner carries no
// state between scenes.
export const scenes = [
  { name: '01-home', goto: '/', wait: 1500 },

  {
    name: '02-harvest-sheet',
    goto: '/',
    wait: 1500,
    viewports: ['phone'],
    async setup(page, h) {
      const fab = page.getByRole('button', { name: /^log eggs$/i }).first();
      if (!(await fab.count())) {
        h.log('no "Log eggs" FAB');
        return false;
      }
      await fab.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(),
  },

  { name: '03-birds', goto: '/birds', wait: 1500 },

  {
    name: '04-birds-row-sheet',
    goto: '/birds',
    wait: 1500,
    viewports: ['phone'],
    async setup(page, h) {
      const more = page.getByRole('button', { name: /^actions for /i }).first();
      if (!(await more.count())) {
        h.log('no row ⋯ button');
        return false;
      }
      await more.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(),
  },

  {
    name: '05-birds-edit-dialog',
    goto: '/birds',
    wait: 1500,
    viewports: ['phone'],
    async setup(page, h) {
      const more = page.getByRole('button', { name: /^actions for /i }).first();
      if (!(await more.count())) return false;
      await more.click();
      await h.settle(800);
      const edit = page.getByRole('button', { name: /^edit bird$/i }).first();
      if (!(await edit.count())) return false;
      await edit.click();
      await h.settle(900);
    },
    teardown: (page, h) => h.esc(),
  },

  {
    name: '06a-birds-filter-sheet',
    goto: '/birds',
    wait: 1500,
    viewports: ['phone'],
    async setup(page, h) {
      const filterPill = page.getByRole('button', { name: /^filters/i }).first();
      if (!(await filterPill.count())) return false;
      await filterPill.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(),
  },

  {
    name: '06-birds-sort-sheet',
    goto: '/birds',
    wait: 1500,
    viewports: ['phone'],
    async setup(page, h) {
      const sort = page.getByRole('button', { name: /tag id|^sort$/i }).first();
      if (!(await sort.count())) {
        h.log('no Sort pill');
        return false;
      }
      await sort.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(),
  },

  {
    name: '07-add-bird-dialog',
    goto: '/birds',
    wait: 1500,
    viewports: ['phone'],
    async setup(page, h) {
      const addBird = page.getByRole('button', { name: /^add bird$/i }).first();
      if (!(await addBird.count())) return false;
      await addBird.click();
      await h.settle(900);
    },
    teardown: (page, h) => h.esc(),
  },

  { name: '08-hatch-log', goto: '/hatch-log', wait: 1400, viewports: ['phone'] },
  { name: '09-egg-log', goto: '/egg-log', wait: 1400, viewports: ['phone'] },
  { name: '10-pairings', goto: '/pairings', wait: 1400, viewports: ['phone'] },
  { name: '11-groups', goto: '/groups', wait: 1400, viewports: ['phone'] },
  { name: '12-locations', goto: '/locations', wait: 1400, viewports: ['phone'] },

  {
    name: '13-location-dialog',
    goto: '/locations',
    wait: 1400,
    viewports: ['phone'],
    async setup(page, h) {
      const editLoc = page.getByRole('button', { name: /^edit north coop$/i }).first();
      if (!(await editLoc.count())) return false;
      await editLoc.click();
      await h.settle(900);
    },
    teardown: (page, h) => h.esc(),
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
