// The viewports the mobile grammar is reviewed at (MOBILE_UI_PLAN.md §6):
// 390x844 in both colour schemes, plus a desktop context so a mobile fix can
// be checked for desktop collateral damage, plus (review 4.1, 2026-11) an
// Android tablet in both orientations.
//
// Every spec carries:
//   label   'phone' | 'tablet' | 'desktop' — what `scene.viewports` filters on
//           and what `h.viewport` reports;
//   form    'phone' | 'tablet-portrait' | 'tablet-landscape' | 'desktop' — a
//           finer filter a scene may name instead (viewports: ['tablet-landscape']);
//   coarse  true for a touch screen: the probe enforces the 44px tap-target
//           rule wherever the pointer is a finger, at any width;
//   suffix  appended to the screenshot name after the scheme.
import { loadPlaywright } from './playwright.mjs';

// What Chrome on a 10-11" Android tablet reports (Galaxy Tab S7/S8 at its
// default display size; a Lenovo Tab P11 is within a few px): 800x1280 CSS px
// at DPR 2, touch, isMobile (the meta viewport is honoured), and an Android
// UA WITHOUT "Mobile" — that is what makes it a tablet UA. The UA is borrowed
// from Playwright's own Galaxy Tab S9 descriptor so its Chrome version tracks
// the pinned Playwright. In Chromium, hasTouch is what flips the media
// queries to `(pointer: coarse)` / `(hover: none)` / `(any-hover: none)`.
const TABLET_BASE = 'Galaxy Tab S9';
const tablet = (width, height) => ({
  baseDevice: TABLET_BASE,
  overrides: {
    viewport: { width, height },
    screen: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
});

export const VIEWPORTS = {
  'phone-dark': { device: 'iPhone 14', scheme: 'dark', label: 'phone', form: 'phone', coarse: true, suffix: '' },
  'phone-light': { device: 'iPhone 14', scheme: 'light', label: 'phone', form: 'phone', coarse: true, suffix: '' },
  'desktop-dark': { viewport: { width: 1280, height: 900 }, scheme: 'dark', label: 'desktop', form: 'desktop', coarse: false, suffix: '-desktop' },
  'desktop-light': { viewport: { width: 1280, height: 900 }, scheme: 'light', label: 'desktop', form: 'desktop', coarse: false, suffix: '-desktop' },
  'tablet-dark': { ...tablet(800, 1280), scheme: 'dark', label: 'tablet', form: 'tablet-portrait', coarse: true, suffix: '-tablet' },
  'tablet-light': { ...tablet(800, 1280), scheme: 'light', label: 'tablet', form: 'tablet-portrait', coarse: true, suffix: '-tablet' },
  'tablet-land-dark': { ...tablet(1280, 800), scheme: 'dark', label: 'tablet', form: 'tablet-landscape', coarse: true, suffix: '-tablet-land' },
  'tablet-land-light': { ...tablet(1280, 800), scheme: 'light', label: 'tablet', form: 'tablet-landscape', coarse: true, suffix: '-tablet-land' },
};

export const PHONE_VIEWPORTS = ['phone-dark', 'phone-light'];
export const DESKTOP_VIEWPORTS = ['desktop-dark', 'desktop-light'];
export const TABLET_VIEWPORTS = ['tablet-dark', 'tablet-light', 'tablet-land-dark', 'tablet-land-light'];
// Phone + desktop: what `--desktop` / `--viewports all` have always meant.
// Tablet is added on its own flag so the existing CI shards do not grow.
export const ALL_VIEWPORTS = [...PHONE_VIEWPORTS, ...DESKTOP_VIEWPORTS];
export const EVERY_VIEWPORT = [...ALL_VIEWPORTS, ...TABLET_VIEWPORTS];

export async function launch() {
  const { chromium } = await loadPlaywright();
  return chromium.launch();
}

// serviceWorkers: 'block' is load-bearing. Every app in the suite ships a PWA
// service worker; without this the worker answers from its cache and the route
// fixtures below never see the request (and a stale build renders instead).
export async function newContext(browser, key, { base } = {}) {
  const spec = VIEWPORTS[key];
  if (!spec) throw new Error(`unknown viewport "${key}" (have: ${EVERY_VIEWPORT.join(', ')})`);
  const { devices } = await loadPlaywright();
  // HARNESS_PHONE_WIDTH=320 narrows the phone contexts, for checking a
  // layout on a small (or display-zoomed) phone. Unset in CI.
  const phoneWidth = Number(process.env.HARNESS_PHONE_WIDTH) || 0;
  const device = spec.device
    ? { ...devices[spec.device] }
    : spec.baseDevice
      ? { ...devices[spec.baseDevice], ...spec.overrides }
      : null;
  if (spec.device && phoneWidth) device.viewport = { ...device.viewport, width: phoneWidth };
  const opts = device
    ? { ...device, colorScheme: spec.scheme, serviceWorkers: 'block' }
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
