import { useSyncExternalStore } from 'react';

/**
 * Pointer and hover media queries, for sizing by input rather than by width
 * (review 4.3). A 1280-wide Android tablet in landscape is still a finger:
 * size targets with `geekMedia.coarse`, not a width breakpoint.
 *
 *   sx={{ minHeight: 32, [geekMedia.coarse]: { minHeight: 44 } }}
 */
export const geekMedia = {
  coarse: '@media (pointer: coarse)',
  fine: '@media (pointer: fine)',
  anyHover: '@media (any-hover: hover)',
  noHover: '@media (hover: none)',
  /**
   * "Not a phone", as CSS — the same rule as `classifyFormFactor` below:
   * at least 600 wide AND (at least 600 tall, or a fine pointer). So a phone
   * held sideways (844x390, a finger) stays a phone, a portrait tablet
   * (800x1280) and a desktop window both match. CSS rather than the hook so
   * it needs no re-render and server markup carries the same rule. (An
   * engine with no pointer at all is the one edge it reads differently: a
   * 700x500 window there stays phone-sized here.)
   *
   *   sx={{ [geekMedia.tabletUp]: { maxWidth: 600, mx: 'auto' } }}
   */
  tabletUp:
    '@media (min-width: 600px) and (min-height: 600px), (min-width: 600px) and (pointer: fine)',
};

const QUERIES = {
  coarse: '(pointer: coarse)',
  fine: '(pointer: fine)',
  anyHover: '(any-hover: hover)',
};

/** Shortest side at which a touch device is a tablet, not a phone (CSS px). */
export const TABLET_MIN_SHORT_SIDE = 600;
/** Width at which a fine-pointer window stops being "tablet" and is desktop. */
export const DESKTOP_MIN_WIDTH = 1200;
/**
 * Width from which list | detail sit side by side (plan P2a, 2026-11-15).
 * A portrait tablet (800) is rail + ONE pane; landscape (1280) and desktop
 * get two. Width only, not pointer: it is about room, not fingers.
 */
export const TWO_PANE_MIN_WIDTH = 1024;

/**
 * The classification, as a pure function so it can be tested and reused.
 *
 * Coarse primary pointer (a finger; Android/iPad, even with a pen):
 *   - phone   when the SHORT side is under 600 — a phone stays a phone when
 *             it is turned sideways (844x390), so it never gets tablet chrome
 *             in 390px of height;
 *   - tablet  otherwise, in either orientation (800x1280 and 1280x800 alike);
 *   - never desktop: a big touch screen still needs 44px targets.
 *
 * Fine primary pointer (mouse/trackpad):
 *   - phone   under 600 wide (a narrow window gets the phone layout);
 *   - tablet  600-1199 wide (the rail range, D9);
 *   - desktop 1200 and up.
 *
 * Neither (no pointer, or an engine without the query): treated as fine.
 *
 * Derived, for layout code that wants one value: `kind` ('phone' | 'tablet'
 * | 'desktop'), `navMode` ('bottom' | 'rail' | 'sidebar') and `twoPane`
 * (width >= TWO_PANE_MIN_WIDTH and not a phone).
 *
 * `coarse`/`fine` describe the PRIMARY pointer; `anyHover` is true when ANY
 * input can hover (a tablet with a trackpad attached), which is the right
 * test for "show hover-revealed actions" — gating them on the primary
 * pointer hides them from that tablet entirely (review 4.3, TodoGeek PenRow).
 */
export function classifyFormFactor({ width = 0, height = 0, coarse = false, fine = false, anyHover = false } = {}) {
  const shortSide = Math.min(width, height);
  let phone;
  let tablet;
  let desktop;
  if (coarse) {
    phone = shortSide < TABLET_MIN_SHORT_SIDE;
    tablet = !phone;
    desktop = false;
  } else {
    phone = width < TABLET_MIN_SHORT_SIDE;
    tablet = !phone && width < DESKTOP_MIN_WIDTH;
    desktop = !phone && !tablet;
  }
  return {
    phone,
    tablet,
    desktop,
    // The same answer as one value, for a switch or a data attribute.
    kind: phone ? 'phone' : tablet ? 'tablet' : 'desktop',
    // Which primary navigation this device gets (plan 2.6, D9): the phone's
    // bottom bar, the tablet's rail, the desktop's sidebar. A touch tablet in
    // landscape (1280x800) is still a tablet, so it keeps the rail.
    navMode: phone ? 'bottom' : tablet ? 'rail' : 'sidebar',
    // List | detail side by side (GeekTwoPane). Never on a phone, even a
    // wide one held sideways.
    twoPane: !phone && width >= TWO_PANE_MIN_WIDTH,
    coarse: Boolean(coarse),
    fine: Boolean(fine),
    anyHover: Boolean(anyHover),
    width,
    height,
    landscape: width > height,
  };
}

// Client-only SPAs never render on a server, but tests do (react-dom/server):
// there the answer matches MUI's useMediaQuery default (no query matches),
// i.e. a fine-pointer desktop.
const SERVER_SNAPSHOT = classifyFormFactor({ width: 1280, height: 800, fine: true, anyHover: true });

let cached = null;
let cachedKey = '';

function readSnapshot() {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  const mm = typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null;
  const match = (q) => Boolean(mm && mm(q).matches);
  const input = {
    width: window.innerWidth || 0,
    height: window.innerHeight || 0,
    coarse: match(QUERIES.coarse),
    fine: match(QUERIES.fine),
    anyHover: match(QUERIES.anyHover),
  };
  const key = `${input.width}x${input.height}|${input.coarse}|${input.fine}|${input.anyHover}`;
  if (key !== cachedKey || !cached) {
    cachedKey = key;
    cached = classifyFormFactor(input);
  }
  return cached;
}

function subscribe(onChange) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  const lists =
    typeof window.matchMedia === 'function' ? Object.values(QUERIES).map((q) => window.matchMedia(q)) : [];
  for (const list of lists) {
    if (typeof list.addEventListener === 'function') list.addEventListener('change', onChange);
    else if (typeof list.addListener === 'function') list.addListener(onChange);
  }
  return () => {
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
    for (const list of lists) {
      if (typeof list.removeEventListener === 'function') list.removeEventListener('change', onChange);
      else if (typeof list.removeListener === 'function') list.removeListener(onChange);
    }
  };
}

/**
 * What kind of device this is, by pointer first and size second (review
 * 4.2). Returns `{ phone, tablet, desktop, kind, navMode, twoPane, coarse,
 * fine, anyHover, width, height, landscape }`; exactly one of phone/tablet/desktop is true. The
 * rule is `classifyFormFactor` above. Re-renders on resize, rotation, and a
 * pointer change (a keyboard/trackpad cover attached).
 *
 * Use it for LAYOUT decisions (rail vs drawer, panes). For target SIZES
 * prefer CSS: `geekMedia.coarse` in an sx block needs no re-render.
 */
export function useFormFactor() {
  return useSyncExternalStore(subscribe, readSnapshot, () => SERVER_SNAPSHOT);
}

/** Just the navigation the shell should draw: 'bottom' | 'rail' | 'sidebar'. */
export function useGeekNavMode() {
  return useFormFactor().navMode;
}

export default useFormFactor;
