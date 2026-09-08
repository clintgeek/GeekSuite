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
  // ── /aigeek: a basegeek route, one long status page ─────────────────────
  //
  // Four tab scenes until Phase 3 (apps/basegeek/DOCS/AIGEEK_STATUS_PAGE.md).
  // The tabs are gone; `?tab=` still resolves to the section that absorbed
  // each slug, but screenshotting through it would only prove the redirect.
  // What is worth a picture is the page itself, in three passes: the top (the
  // attention list and the spend line), the apps and providers below it, and
  // the two collapsed sections opened, since a collapsed panel photographs as
  // a header and tells you nothing about the table inside it.
  {
    name: '11-aigeek-status',
    goto: '/aigeek',
    wait: 1800,
  },
  {
    name: '12-aigeek-apps',
    goto: '/aigeek',
    wait: 1800,
    async setup(page, h) {
      const apps = page.locator('#apps-keys');
      if (!(await apps.count())) return h.log('no #apps-keys section') ?? false;
      await apps.scrollIntoViewIfNeeded();
      await h.settle(500);
    },
  },
  {
    // The Pinned picker and the two switches, which is the densest routing
    // card the page renders — storygeek's row has both switches on and a cap.
    name: '13-aigeek-routing',
    goto: '/aigeek',
    wait: 1800,
    async setup(page, h) {
      const pinned = page.getByRole('button', { name: 'Pinned' }).first();
      if (!(await pinned.count())) return h.log('no Pinned toggle') ?? false;
      await pinned.scrollIntoViewIfNeeded();
      await pinned.click();
      await h.settle(600);
    },
  },
  {
    // Both collapsed sections open: the read-only catalog table and Try it.
    name: '14-aigeek-catalog-tryit',
    goto: '/aigeek',
    wait: 1800,
    async setup(page, h) {
      // Always the *first* remaining "Show", never `nth(i)`: the locator is
      // live, and clicking one turns its own label into "Hide", so indexing
      // into the shrinking list waits forever for an nth that no longer
      // exists. Two sections, so two rounds of "click the first one left".
      for (let round = 0; round < 2; round += 1) {
        const next = page.getByRole('button', { name: 'Show' }).first();
        if (!(await next.count())) {
          if (round === 0) return h.log('no collapsed sections') ?? false;
          break;
        }
        await next.scrollIntoViewIfNeeded();
        await next.click();
        await h.settle(500);
      }
      await h.settle(600);
    },
  },
];

export const waivers = [];
