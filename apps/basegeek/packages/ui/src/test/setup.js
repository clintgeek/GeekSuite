// Global test setup for Vitest + Testing Library. Mirrors
// apps/flockgeek/frontend/src/test/setup.js and apps/bookgeek/web/src/__tests__/setup.js.
import '@testing-library/jest-dom';

// jsdom implements neither matchMedia nor ResizeObserver, both of which are
// pulled in by MUI's useMediaQuery (ResponsiveTable's mobile check, GeekSheet's
// / GeekDialog's mode="auto") and @geeksuite/user's theme detection. Without
// these shims any component tree containing them throws before a single
// assertion runs.
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
