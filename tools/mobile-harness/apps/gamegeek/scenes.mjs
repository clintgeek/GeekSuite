// GameGeek — the G0/G1 surfaces (DOCS/GameGeekPlan.md §5.8). Deep links are
// preferred over clicks wherever the app has one (/game/:id, /add, /settings);
// every scene navigates for itself.

export const scenes = [
  { name: '01-library', goto: '/', wait: 1500 },
  {
    // The list layout: 44px cover + title + a fixed star column, the likeliest
    // place for a row to push a 390px phone sideways. The layout is remembered
    // in localStorage, so the teardown switches back to covers.
    name: '01b-library-list',
    goto: '/',
    async setup(page, h) {
      const toggle = page.getByRole('button', { name: 'Show as a list' });
      if (!(await toggle.count())) return false;
      await toggle.click();
      await h.settle(600);
    },
    async teardown(page, h) {
      const back = page.getByRole('button', { name: 'Show as covers' });
      if (await back.count()) await back.click();
      await h.settle(200);
    },
  },
  {
    name: '02-drawer',
    goto: '/',
    viewports: ['phone'],
    async setup(page, h) {
      const menu = page.locator('[data-geek-topbar="menu"]');
      if (!(await menu.count())) return false;
      await menu.click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // Deep link: the library renders underneath, the sheet on top.
    name: '03-detail',
    goto: '/game/g1',
    wait: 1600,
    teardown: (page, h) => h.esc(),
  },
  {
    name: '04-add-search',
    goto: '/add',
    wait: 1200,
    async setup(page, h) {
      const field = page.getByLabel('Game title');
      if (!(await field.count())) return false;
      await field.fill('hades');
      await h.settle(1200);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '05-log-session',
    goto: '/game/g1',
    wait: 1500,
    async setup(page, h) {
      const log = page.getByTestId('detail-actions').getByRole('button', { name: 'Log session' });
      if (!(await log.count())) return false;
      await log.click();
      await h.settle(800);
    },
    teardown: async (page, h) => {
      await h.esc();
      await h.esc();
    },
  },
  { name: '06-settings', goto: '/settings', wait: 1400 },
  {
    name: '07-account-menu',
    goto: '/',
    async setup(page, h) {
      const acct = page.locator('[data-geek-topbar="account"]');
      if (!(await acct.count())) return false;
      await acct.click();
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '08-filter-sheet',
    goto: '/?shelf=finished',
    async setup(page, h) {
      const filter = page.getByRole('button', { name: /^Filter/ });
      if (!(await filter.count())) return false;
      await filter.first().click();
      await h.settle(700);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '09-add-paste-list',
    goto: '/add?tab=paste',
    wait: 1200,
    async setup(page, h) {
      const field = page.getByLabel('Titles');
      if (!(await field.count())) return false;
      await field.fill('Disco Elysium\n- Celeste\nInscryption\ncelESTE\n\nPentiment');
      await h.settle(400);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    // The Steam dry run: counts, the first titles, and the commit button.
    name: '10-steam-preview',
    goto: '/settings#steam',
    wait: 1400,
    async setup(page, h) {
      const field = page.getByLabel('Steam ID, custom URL name, or profile link');
      if (!(await field.count())) return false;
      await field.fill('chefcrocker');
      await page.getByRole('button', { name: 'Preview import' }).click();
      await h.settle(900);
      await page.getByTestId('steam-preview').scrollIntoViewIfNeeded();
      await h.settle(300);
    },
  },
  {
    // The Playnite dry run: it fires as soon as a file is picked, no button
    // to click. A tiny in-memory JSON stands in for a real export — the stub
    // route answers regardless of what's actually in it.
    name: '11-playnite-preview',
    goto: '/settings#playnite',
    wait: 1400,
    async setup(page, h) {
      const input = page.getByTestId('playnite-file-input');
      if (!(await input.count())) return false;
      await input.setInputFiles({
        name: 'playnite-library.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, generatedAtUtc: '2026-09-25T16:21:03Z', games: [] })),
      });
      await h.settle(900);
      await page.getByTestId('playnite-preview').scrollIntoViewIfNeeded();
      await h.settle(300);
    },
  },
];

// Known, ticketed violations. The list starts empty and stays that way.
export const waivers = [];
