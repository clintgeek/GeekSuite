// Global test setup for Vitest + Testing Library
import '@testing-library/jest-dom';

// jsdom implements neither matchMedia nor ResizeObserver, both of which are
// pulled in by MUI's useMediaQuery, MantineProvider and @geeksuite/user's
// theme detection. Without these shims any component tree containing them
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

// jsdom's window is 1024x768 with no pointer, which `useFormFactor`
// (@geeksuite/ui) reads as a TABLET (600–1199 px, mouse rules). The suite was
// written against the desktop shape, so tests start on a 1280x900 desktop;
// a test that wants a phone or a tablet sets its own viewport
// (__tests__/helpers/viewport.js).
window.innerWidth = 1280;
window.innerHeight = 900;

if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
