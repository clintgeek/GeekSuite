// StartGeek console screenshots (MOBILE_UI_PLAN.md M5). Unlike flockgeek,
// nothing here is phone-only — the scratch script shot all four scenes at
// both phone and desktop.
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
];

// Known, ticketed violations. Each one should die when the app is fixed —
// an empty list is the goal, not a permanent parking lot.
export const waivers = [];
