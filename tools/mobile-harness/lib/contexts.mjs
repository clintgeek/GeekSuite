// The viewports the mobile grammar is reviewed at (MOBILE_UI_PLAN.md §6):
// 390x844 in both colour schemes, plus a desktop context so a mobile fix can
// be checked for desktop collateral damage.
import { loadPlaywright } from './playwright.mjs';

export const VIEWPORTS = {
  'phone-dark': { device: 'iPhone 14', scheme: 'dark', label: 'phone', suffix: '' },
  'phone-light': { device: 'iPhone 14', scheme: 'light', label: 'phone', suffix: '' },
  'desktop-dark': { viewport: { width: 1280, height: 900 }, scheme: 'dark', label: 'desktop', suffix: '-desktop' },
  'desktop-light': { viewport: { width: 1280, height: 900 }, scheme: 'light', label: 'desktop', suffix: '-desktop' },
};

export const PHONE_VIEWPORTS = ['phone-dark', 'phone-light'];
export const ALL_VIEWPORTS = Object.keys(VIEWPORTS);

export async function launch() {
  const { chromium } = await loadPlaywright();
  return chromium.launch();
}

// serviceWorkers: 'block' is load-bearing. Every app in the suite ships a PWA
// service worker; without this the worker answers from its cache and the route
// fixtures below never see the request (and a stale build renders instead).
export async function newContext(browser, key, { base } = {}) {
  const spec = VIEWPORTS[key];
  if (!spec) throw new Error(`unknown viewport "${key}" (have: ${ALL_VIEWPORTS.join(', ')})`);
  const { devices } = await loadPlaywright();
  const opts = spec.device
    ? { ...devices[spec.device], colorScheme: spec.scheme, serviceWorkers: 'block' }
    : { viewport: spec.viewport, colorScheme: spec.scheme, serviceWorkers: 'block' };
  const ctx = await browser.newContext(opts);
  // Every app reads the suite theme cookie before React boots (themePreboot),
  // so the cookie has to agree with colorScheme or the first paint flips.
  if (base) {
    await ctx.addCookies([{ name: 'geek_theme', value: spec.scheme, url: base }]);
  }
  return ctx;
}

export const viewportSpec = (key) => VIEWPORTS[key];
