// Global test setup for Vitest + Testing Library.
// Mirrors apps/flockgeek/frontend/src/test/setup.js and storygeek's.
import '@testing-library/jest-dom';

// jsdom implements neither matchMedia nor ResizeObserver, both of which are
// pulled in by MUI's useMediaQuery (ModernLayout's bottom nav breakpoints,
// GeekDialog's fullScreenBelow, GeekSheet's mode="auto") and by @geeksuite/ui's
// motion helpers. Without these shims any component tree containing them throws
// before a single assertion runs.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},      // deprecated, still called by some libs
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// The composer keeps a typed draft per (day, meal) in sessionStorage
// (FoodSearch/composerDraft.js). Clear it so one test's draft never appears in
// the next test's box.
import { afterEach } from 'vitest';
afterEach(() => {
  try { window.sessionStorage.clear(); } catch { /* storage unavailable */ }
});
