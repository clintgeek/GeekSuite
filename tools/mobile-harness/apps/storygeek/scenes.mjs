// StoryGeek — the M4 pilot surfaces (MOBILE_UI_PLAN.md). Scenes are
// independent: each one that needs a sheet/dialog open re-navigates and
// re-opens it from scratch rather than relying on a previous scene's state.
export const scenes = [
  { name: '01-list', goto: '/', wait: 1200 },
  {
    // The FAB is the one create action below `md`.
    name: '02-new-tale-dialog',
    goto: '/',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      const fab = page.getByRole('button', { name: /^new tale$/i }).first();
      if (!(await fab.count())) {
        h.log('no "New Tale" FAB at', h.viewport, h.scheme);
        return false;
      }
      await fab.click();
      await h.settle(700);
    },
    // This dialog closes via its own Close button, not Escape.
    async teardown(page, h) {
      await page.getByRole('button', { name: /^close$/i }).first().click();
      await h.settle(500);
    },
  },
  {
    // Delete confirm — window mode even on a phone. The delete icon carries a
    // per-card name ("Delete <title>") since the 2026-09-05 a11y pass, so match
    // it by role instead of by MUI's data-testid.
    name: '03-delete-confirm',
    goto: '/',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      const del = page.getByRole('button', { name: /^delete /i }).first();
      if (!(await del.count())) return false;
      await del.click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(400),
  },
  { name: '04-play', goto: '/play/s1', wait: 1400 },
  {
    // Left rail as a sheet.
    name: '05-rail-sheet-left',
    goto: '/play/s1',
    wait: 1400,
    async setup(page, h) {
      const left = page.getByRole('button', { name: /scene and character/i }).first();
      if (!(await left.count())) {
        h.log('no left rail toggle at', h.viewport, h.scheme);
        return false;
      }
      await left.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(600),
  },
  {
    // Right rail as a sheet.
    name: '06-rail-sheet-right',
    goto: '/play/s1',
    wait: 1400,
    async setup(page, h) {
      const right = page.getByRole('button', { name: /party and threads/i }).first();
      if (!(await right.count())) return false;
      await right.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(600),
  },
  {
    name: '07-journal',
    goto: '/play/s1',
    wait: 1400,
    viewports: ['phone'],
    async setup(page, h) {
      const journal = page.getByRole('button', { name: /^journal$/i }).first();
      if (!(await journal.count())) return false;
      await journal.click();
      await h.settle(800);
    },
    teardown: (page, h) => h.esc(600),
  },
  {
    // Composer with the keyboard-less focus state, so the pinned row is
    // visible with content in it.
    name: '08-composer',
    goto: '/play/s1',
    wait: 1400,
    viewports: ['phone'],
    async setup(page, h) {
      const composer = page.getByPlaceholder('What do you do?');
      if (!(await composer.count())) return false;
      await composer.click();
      await composer.type('I ask her what the third cart is carrying.');
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '09-bookify',
    goto: '/play/s1',
    wait: 1400,
    async setup(page, h) {
      const bookify = page.getByRole('button', { name: /^bookify$/i }).first();
      if (!(await bookify.count())) {
        h.log('no Bookify button at', h.viewport, h.scheme);
        return false;
      }
      await bookify.click();
      await h.settle(1400);
    },
    teardown: (page, h) => h.esc(500),
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
