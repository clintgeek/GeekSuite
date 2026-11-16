/**
 * A pretend device for jsdom: window size plus a matchMedia that answers
 * width, pointer and hover queries the way that device's Chrome would. Both
 * MUI's useMediaQuery and the suite's useFormFactor read it.
 *
 *   phone           390x844, touch
 *   tablet          800x1280, touch (Chef's grip: portrait)
 *   tablet-land     1280x800, touch
 *   desktop         1280x900, mouse
 */
const DEVICES = {
  phone: { width: 390, height: 844, coarse: true },
  tablet: { width: 800, height: 1280, coarse: true },
  'tablet-land': { width: 1280, height: 800, coarse: true },
  desktop: { width: 1280, height: 900, coarse: false },
};

function answers(query, d) {
  // Every comma-separated alternative; each one is an AND of (feature) tests.
  return query.split(',').some((alt) => {
    const tests = alt.match(/\(([^)]+)\)/g) || [];
    if (!tests.length) return false;
    return tests.every((t) => {
      const [k, v] = t.slice(1, -1).split(':').map((x) => x.trim());
      if (k === 'max-width') return d.width <= parseFloat(v);
      if (k === 'min-width') return d.width >= parseFloat(v);
      if (k === 'max-height') return d.height <= parseFloat(v);
      if (k === 'min-height') return d.height >= parseFloat(v);
      if (k === 'pointer' || k === 'any-pointer') return v === (d.coarse ? 'coarse' : 'fine');
      if (k === 'hover' || k === 'any-hover') return v === (d.coarse ? 'none' : 'hover');
      if (k === 'prefers-reduced-motion') return false;
      return false;
    });
  });
}

export function setDevice(kind) {
  const d = DEVICES[kind];
  if (!d) throw new Error(`unknown device ${kind}`);
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: d.width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: d.height });
  window.matchMedia = (query) => ({
    matches: answers(query, d),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
}

const realMatchMedia = window.matchMedia;
export function resetDevice() {
  window.matchMedia = realMatchMedia;
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 900 });
}
