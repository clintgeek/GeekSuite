// StartGeek console screenshots (MOBILE_UI_PLAN.md M5), plus the Night 2 AI
// morning-brief scene (R118/R126). Unlike flockgeek, nothing here is
// phone-only — the scratch script shot all four scenes at both phone and
// desktop.
import { graphqlRoute } from '../../lib/net.mjs';
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
  {
    // Morning brief (DOCS/AI_IDEAS.md #5, Night 2 R118). The opt-in lives in
    // the same `startgeek.settings` localStorage blob the console's own
    // context-level `routes()` seeds with `brief` omitted (i.e. off, per
    // DEFAULT_SETTINGS) — so this scene overrides it at the PAGE level,
    // fakes the clock so the gateway's 5 a.m. gate reads true regardless of
    // when the harness runs, and stubs `GlanceBrief`. Must stay the LAST
    // scene in the file: a page-level init script/clock override applies to
    // every navigation after the one that registers it.
    name: '05-brief',
    async setup(page, h) {
      // Fixed at 08:00 America/Chicago (this box's tz) — well past the 5 a.m.
      // gate (`BRIEF_MIN_LOCAL_HOUR` in src/lib/morningBrief.js) regardless of
      // wall-clock time when the harness actually runs.
      await page.clock.setFixedTime(new Date('2026-09-06T08:00:00-05:00'));

      await page.addInitScript(() => {
        try {
          const raw = localStorage.getItem('startgeek.settings');
          const settings = raw ? JSON.parse(raw) : {};
          localStorage.setItem('startgeek.settings', JSON.stringify({ ...settings, brief: true }));
        } catch { /* ignore */ }
      });

      await graphqlRoute(page, {
        ...OPS,
        GlanceBrief: {
          glanceBrief: {
            date: '2026-09-06',
            brief: 'Three tasks are due today, and the roofer call is still overdue from Tuesday. You’re 40 pages from the end of Lock In.',
            provenance: { source: 'model', model: 'llama-3.1-8b-instant' },
          },
        },
      });

      await page.goto(h.base + '/', { waitUntil: 'networkidle' });
      await h.settle(1400);
    },
  },
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
