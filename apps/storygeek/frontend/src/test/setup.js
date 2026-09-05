// Global test setup for Vitest + Testing Library.
// Mirrors apps/notegeek/frontend/src/__tests__/setup.js.
import '@testing-library/jest-dom';

// jsdom implements neither matchMedia nor ResizeObserver, both of which are
// pulled in by MUI's useMediaQuery (StoryPlay's rail breakpoints, GeekDialog's
// fullScreenBelow, GeekSheet's mode="auto" resolution) and by @geeksuite/ui's
// motion helpers. Without these shims any component tree containing them
// throws before a single assertion runs.
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

// jsdom has no scrollIntoView; StoryPlay calls it on every message.
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
