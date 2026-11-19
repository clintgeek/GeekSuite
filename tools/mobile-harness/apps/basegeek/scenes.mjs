// basegeek — the Signal Box console's surfaces, plus the /aigeek route it
// hosts and the SSO door (login/register) every suite app redirects to.
import { DEFAULT_USER, json } from '../../lib/net.mjs';

const PROFILE = '**/api/auth/profile';

/** Page-level routes win over the context's, so a scene can be signed out. */
const signedOut = (page) => page.route(PROFILE, (r) => json(r, { message: 'no session' }, 401));
const asMember = (page) => page.route(PROFILE, (r) => json(r, { ...DEFAULT_USER, id: 'u2', username: 'heather', role: 'user' }));
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
  // 09/10 used to target /databases, which was retired for DataGeek (scenes
  // 03-06 cover its four tabs) and produced nothing. The numbers now hold two
  // states the 2026-11-18 fixes introduced.
  {
    // On the phone a healthy line folds to a summary and a yard of
    // nameboards; this is the full-card view one tap away.
    name: '09-home-line-details',
    goto: '/',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      const details = page.getByRole('button', { name: 'Show details' }).first();
      if (!(await details.count())) return h.log('no "Show details" toggle') ?? false;
      await details.click();
      await h.settle(500);
    },
  },
  {
    // A provider row opened for a key: Save key and Cancel, plain words.
    name: '10-aigeek-provider-key',
    goto: '/aigeek',
    wait: 1800,
    async setup(page, h) {
      const open = page.getByRole('button', { name: /^(add|replace) key$/i }).first();
      if (!(await open.count())) return h.log('no provider Add/Replace key button') ?? false;
      await open.scrollIntoViewIfNeeded();
      await open.click();
      await h.settle(600);
      const save = page.getByRole('button', { name: 'Save key' }).first();
      if (await save.count()) await save.scrollIntoViewIfNeeded();
      await h.settle(300);
    },
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
  // ── Signal Box additions (2026-09-27) ───────────────────────────────────
  { name: '15-settings', goto: '/settings', wait: 900 },
  {
    // The suite's SSO door, as someone arriving from another app sees it.
    name: '16-login',
    async setup(page, h) {
      await signedOut(page);
      await page.goto(`${h.base}/login?app=notegeek&redirect=${encodeURIComponent('https://notegeek.clintgeek.com/')}`, { waitUntil: 'networkidle' });
      await h.settle(800);
    },
    teardown: (page) => page.unroute(PROFILE),
  },
  {
    name: '17-register',
    async setup(page, h) {
      await signedOut(page);
      await page.goto(`${h.base}/register`, { waitUntil: 'networkidle' });
      await h.settle(800);
    },
    teardown: (page) => page.unroute(PROFILE),
  },
  {
    // Home for a household member (not an admin): the line and the depot from
    // the public probe, no instruments, no levers.
    name: '18-home-member',
    async setup(page, h) {
      await asMember(page);
      await page.goto(`${h.base}/`, { waitUntil: 'networkidle' });
      await h.settle(1200);
    },
    teardown: (page) => page.unroute(PROFILE),
  },
];

export const waivers = [];
