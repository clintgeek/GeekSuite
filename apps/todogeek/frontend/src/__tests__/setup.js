// Global test setup for Vitest + Testing Library.
// Mirrors apps/notegeek/frontend/src/__tests__/setup.js and
// apps/storygeek/frontend/src/test/setup.js.
import '@testing-library/jest-dom';

// jsdom implements neither matchMedia nor ResizeObserver, both of which are
// pulled in by MUI's useMediaQuery and @geeksuite/ui's motion helpers.
// Without these shims any component tree containing them throws before a
// single assertion runs.
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

// jsdom's window is 1024x768 with no pointer media. `useFormFactor` (the
// suite's device rule, used by AppShell and Today since the tablet wave)
// would call that a tablet with two panes, while MUI's useMediaQuery (no
// query matches) calls it a desktop. Every test written before the tablet
// wave assumed the desktop, so the default is a 1280x900 desktop window;
// the tablet and two-pane tests set their own size (see __tests__/tablet).
Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 900 });
