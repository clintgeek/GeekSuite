// BookGeek — the M1 pilot surfaces (MOBILE_UI_PLAN.md §3).
export const scenes = [
  { name: '01-library', goto: '/', wait: 1500 },
  {
    name: '02-drawer',
    goto: '/',
    async setup(page, h) {
      const menu = page.locator('[data-geek-topbar="menu"]');
      if (!(await menu.count())) return false;
      await menu.click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '03-detail',
    goto: '/',
    async setup(page, h) {
      const card = page.getByText('Lock In', { exact: true }).first();
      if (!(await card.count())) return false;
      await card.click();
      await h.settle(1000);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '04-add',
    goto: '/',
    async setup(page, h) {
      const add = page.getByRole('button', { name: /add book/i }).first();
      if (!(await add.count())) return false;
      await add.click();
      await h.settle(700);
    },
    teardown: (page, h) => h.esc(),
  },
  {
    name: '05-account-menu',
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
    name: '06-settings',
    goto: '/',
    async setup(page, h) {
      const acct = page.locator('[data-geek-topbar="account"]');
      if (!(await acct.count())) return false;
      await acct.click();
      await h.settle(400);
      const settings = page.locator('[data-geek-topbar-menu="settings"]');
      if (!(await settings.count())) return false;
      await settings.click();
      await h.settle(900);
    },
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
