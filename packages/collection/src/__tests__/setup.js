// Vitest + Testing Library setup; mirrors the apps' (gamegeek, bookgeek web).
import '@testing-library/jest-dom';

// Server-helper tests run under `@vitest-environment node`: no DOM to patch.
const dom = typeof window !== 'undefined';

// jsdom has no matchMedia / ResizeObserver / IntersectionObserver; MUI's
// useMediaQuery, GeekShell/GeekSheet breakpoints and the library sentinel
// all reach for them.
if (dom && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (dom && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (dom && !window.IntersectionObserver) {
  window.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (dom && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
