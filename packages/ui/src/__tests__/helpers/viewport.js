/**
 * A matchMedia that actually reads the query, for tests that need MUI's
 * `useMediaQuery` (width breakpoints) and `useFormFactor` (pointer) to agree
 * about one viewport. Understands comma-separated OR lists and the features
 * the suite uses: min/max width/height, pointer, hover, any-hover.
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
        case 'min-width':
          return width >= n;
        case 'max-width':
          return width <= n;
        case 'min-height':
          return height >= n;
        case 'max-height':
          return height <= n;
        case 'pointer':
          return raw === 'coarse' ? coarse : raw === 'fine' ? fine : !coarse && !fine;
        case 'any-hover':
          return raw === 'hover' ? anyHover : !anyHover;
        case 'hover':
          return raw === 'none' ? !anyHover : anyHover;
        default:
          return false;
      }
    });
  });
}

/** The harness viewports (tablet baseline, 2026-11-15). */
export const VIEWPORTS = {
  phone: { width: 390, height: 844, coarse: true, fine: false, anyHover: false },
  phoneLandscape: { width: 844, height: 390, coarse: true, fine: false, anyHover: false },
  tabletPortrait: { width: 800, height: 1280, coarse: true, fine: false, anyHover: false },
  tabletLandscape: { width: 1280, height: 800, coarse: true, fine: false, anyHover: false },
  desktop: { width: 1440, height: 900, coarse: false, fine: true, anyHover: true },
};

/** Point jsdom's window at a viewport: size plus a query-reading matchMedia. */
export function setViewport(vp) {
  window.innerWidth = vp.width;
  window.innerHeight = vp.height;
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
