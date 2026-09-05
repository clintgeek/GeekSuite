// basegeek — Mission Control's M4 surfaces, plus the /aigeek route it hosts.
export const scenes = [
  { name: '00-home', goto: '/', wait: 1200 },
  { name: '01-usergeek', goto: '/usergeek', wait: 900 },
  {
    // Create User was maxWidth="xs" — narrower than the phone — before M4.
    name: '02-usergeek-create',
    goto: '/usergeek',
    wait: 900,
    async setup(page, h) {
      const addUser = page.getByRole('button', { name: /add user/i }).first();
      if (!(await addUser.count())) return h.log('no "Add user" button') ?? false;
      await addUser.click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(),
  },
  { name: '03-datageek-mongo', goto: '/datageek', wait: 1000 },
  ...['Redis', 'Postgres', 'InfluxDB'].map((tabName, i) => ({
    name: `0${4 + i}-datageek-${tabName.toLowerCase()}`,
    goto: '/datageek',
    wait: 1000,
    async setup(page, h) {
      const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') }).first();
      if (!(await tab.count())) return false;
      await tab.click();
      await h.settle(600);
    },
  })),
  { name: '07-account', goto: '/account', wait: 1000 },
  // The public portal. The session fixtures answer as a signed-in user, so
  // this is the portal as a returning visitor sees it, not the cold splash.
  { name: '08-portal', goto: '/portal', wait: 1200 },
  {
    // Databases.jsx is orphaned (no route, no nav entry) — converted during
    // M4 anyway. Skip cleanly rather than fail when the route is absent.
    name: '09-databases',
    goto: '/databases',
    wait: 900,
    async setup(page, h) {
      if (!page.url().includes('/databases')) return h.log('/databases route not present') ?? false;
    },
  },
  {
    name: '10-databases-add',
    goto: '/databases',
    wait: 900,
    async setup(page, h) {
      if (!page.url().includes('/databases')) return false;
      const addDb = page.getByRole('button', { name: /add database/i }).first();
      if (!(await addDb.count())) return false;
      await addDb.click();
      await h.settle(600);
    },
    teardown: (page, h) => h.esc(),
  },
  // ── /aigeek: a basegeek route, four dense admin tabs ────────────────────
  // The page reads ?tab=<slug>, which is steadier than clicking a tab that
  // only appears once the config query resolves.
  ...[
    ['configuration', '11'],
    ['usage', '12'],
    ['keys', '13'],
    ['catalog', '14'],
  ].map(([slug, n]) => ({
    name: `${n}-aigeek-${slug}`,
    goto: `/aigeek?tab=${slug}`,
    wait: 1600,
  })),
];

export const waivers = [];
