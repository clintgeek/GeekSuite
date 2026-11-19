// StartGeek console screenshots (MOBILE_UI_PLAN.md M5). Unlike flockgeek,
// nothing here is phone-only — the scratch script shot every scene at both
// phone and desktop. (The morning-brief scene went with the brief, 2026-09-25.)
import { graphqlRoute, json } from '../../lib/net.mjs';
import { OPS } from './fixtures.mjs';

const commandBox = (page) => page.getByRole('textbox', { name: 'Command box' });

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

  // ---- The command box in use (design review 2026-11-18: none of these
  // had a scene). ----

  // Phone: the box focused and empty shows the four prefixes.
  {
    name: '07-command-focused',
    goto: '/',
    wait: 1200,
    viewports: ['phone'],
    async setup(page, h) {
      await commandBox(page).focus();
      await h.settle(400);
      if (!(await page.getByRole('group', { name: 'Command shortcuts' }).count())) {
        throw new Error('the focused phone command box shows no shortcuts');
      }
    },
  },

  // `> task` typed in TodoGeek's grammar: the mode label says where it goes.
  {
    name: '08-command-task',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      await commandBox(page).fill('> call Dana tomorrow 2pm #work');
      await h.settle(400);
    },
  },

  // `? milk`: suite search results under the box.
  {
    name: '09-command-suite-search',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      await commandBox(page).fill('? milk');
      await h.settle(900);
      if (!(await page.locator('#search-results').count())) throw new Error('no suite search results');
    },
    teardown: (page, h) => h.esc(300),
  },

  // Enter files it; the message says what was understood, in a live region.
  {
    name: '10-command-captured',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      const box = commandBox(page);
      await box.fill('> call Dana tomorrow 2pm #work');
      await box.press('Enter');
      await h.settle(700);
      if (!(await page.getByRole('status').filter({ hasText: 'Added for tomorrow' }).count())) {
        throw new Error('the capture said nothing in the live region');
      }
    },
  },

  // A failed capture stays on screen until dismissed, in plain words.
  {
    name: '11-command-capture-failed',
    async setup(page, h) {
      await graphqlRoute(page, {
        ...OPS,
        CreateTask: { __graphql: { data: null, errors: [{ message: '' }] } },
      });
      await page.goto(h.base + '/', { waitUntil: 'networkidle' });
      await h.settle(1200);
      const box = commandBox(page);
      await box.fill('> call Dana tomorrow 2pm #work');
      await box.press('Enter');
      await h.settle(700);
      if (!(await page.getByRole('button', { name: 'Dismiss message' }).count())) {
        throw new Error('a failed capture showed no dismissible message');
      }
    },
    teardown: (page) => page.unroute('**/graphql'),
  },

  // Ticking a task: struck through, then "Done: …" with Undo.
  {
    name: '12-task-ticked',
    goto: '/',
    wait: 1200,
    async setup(page, h) {
      const tick = page.getByRole('button', { name: /^Mark done: Finish the startgeek mobile pass/ });
      if (!(await tick.count())) return false;
      await tick.click();
      await h.settle(500);
      if (!(await page.getByRole('button', { name: 'Undo' }).count())) throw new Error('a ticked task offered no Undo');
    },
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
