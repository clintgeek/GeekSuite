// StartGeek console screenshots (MOBILE_UI_PLAN.md M5). Unlike flockgeek,
// nothing here is phone-only — the scratch script shot every scene at both
// phone and desktop. (The morning-brief scene went with the brief, 2026-09-25.)
import { graphqlRoute, json } from '../../lib/net.mjs';
import { OPS } from './fixtures.mjs';

export const scenes = [
  { name: '01-console', goto: '/', wait: 1200 },

  {
    name: '02-dock',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      const dock = page.locator('nav[aria-label="Apps"]');
      if (!(await dock.count())) return false;
      await dock.scrollIntoViewIfNeeded();
    },
  },

  {
    name: '03-weather-modal',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      const weatherBtn = page.getByRole('button', { name: /^Weather in/ });
      if (!(await weatherBtn.count())) return false;
      await weatherBtn.click();
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(300),
  },

  {
    name: '04-settings',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      const settingsBtn = page.getByRole('button', { name: 'Blocks and backdrop' });
      if (!(await settingsBtn.count())) return false;
      await settingsBtn.click();
      await h.settle(500);
    },
    teardown: (page, h) => h.esc(300),
  },

  // A failed glanceToday must say so, with Retry — never the empty day
  // (SUITE_REVIEW_2026-11 §2, wave 3).
  {
    name: '05-glance-load-error',
    async setup(page, h) {
      await graphqlRoute(page, {
        ...OPS,
        GlanceToday: { __graphql: { data: null, errors: [{ message: 'Gateway timeout' }] } },
      });
      await page.goto(h.base + '/', { waitUntil: 'networkidle' });
      await h.settle(1500);
      if (!(await page.locator('[data-load-problem]').count())) throw new Error('a failed glanceToday drew no load problem');
      if (!(await page.getByRole('button', { name: 'Retry' }).count())) throw new Error('the load problem has no Retry');
      if (await page.getByRole('region', { name: 'Tasks' }).count()) throw new Error('the Tasks panel drew despite the failed read');
    },
    teardown: (page) => page.unroute('**/graphql'),
  },

  // basegeek unreachable at startup (503 AUTH_UNAVAILABLE) is "not
  // connected", not the signed-out console.
  {
    name: '06-session-unreachable',
    async setup(page, h) {
      await page.route('**/api/users/me', (r) =>
        json(r, { message: 'Authentication service unavailable', code: 'AUTH_UNAVAILABLE', retryAfter: 5 }, 503)
      );
      await page.goto(h.base + '/', { waitUntil: 'networkidle' });
      await h.settle(1500);
      if (await page.getByRole('link', { name: 'Sign in' }).count()) throw new Error('a 503 at startup drew the signed-out console');
      if (!(await page.locator('[data-load-problem]').count())) throw new Error('no "couldn\'t reach your account" panel');
    },
    teardown: (page) => page.unroute('**/api/users/me'),
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
