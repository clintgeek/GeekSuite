/**
 * Point jsdom at one of the harness viewports, so MUI's `useMediaQuery`
 * (width breakpoints) and `useFormFactor` (pointer AND size) agree about it.
 * A copy of packages/ui/src/__tests__/helpers/viewport.js (apps do not import
 * a package's test helpers); `restoreViewport` puts back the suite default
 * from setup.js.
 */
export function matchesQuery(query, { width, height, coarse = false, fine = false, anyHover = false }) {
  const q = query.replace(/^@media\s*/, '');
  return q.split(',').some((part) => {
    const features = part.match(/\(([^()]+)\)/g) || [];
    if (!features.length) return false;
    return features.every((feature) => {
      const [key, raw = ''] = feature.slice(1, -1).split(':').map((s) => s.trim());
      const n = parseFloat(raw);
      switch (key) {
        case 'min-width': return width >= n;
        case 'max-width': return width <= n;
        case 'min-height': return height >= n;
        case 'max-height': return height <= n;
        case 'pointer': return raw === 'coarse' ? coarse : raw === 'fine' ? fine : !coarse && !fine;
        case 'any-hover': return raw === 'hover' ? anyHover : !anyHover;
        case 'hover': return raw === 'none' ? !anyHover : anyHover;
        default: return false;
      }
    });
  });
}

export const VIEWPORTS = {
  phone: { width: 390, height: 844, coarse: true, fine: false, anyHover: false },
  tabletPortrait: { width: 800, height: 1280, coarse: true, fine: false, anyHover: false },
  tabletLandscape: { width: 1280, height: 800, coarse: true, fine: false, anyHover: false },
  desktop: { width: 1440, height: 900, coarse: false, fine: true, anyHover: true },
};

const original = { matchMedia: window.matchMedia };

function setSize(width, height) {
  // defineProperty, not assignment: a test that pinned innerHeight with
  // defineProperty({ value }) made it read-only, and assignment then fails silently.
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
}

export function setViewport(vp) {
  setSize(vp.width, vp.height);
  window.matchMedia = (query) => ({
    media: query,
    matches: matchesQuery(query, vp),
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

export function restoreViewport() {
  setSize(1280, 900);
  window.matchMedia = original.matchMedia;
}
