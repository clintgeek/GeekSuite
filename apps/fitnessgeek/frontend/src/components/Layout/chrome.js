/**
 * FitnessGeek's sidebar chrome ("Daylight"): the sidebar is part of the page,
 * not a dark board beside it. It takes the app's ground in each mode, with
 * the app's blue for the active row.
 *
 * It lives in its own module, apart from Sidebar.jsx, so packages/ui's
 * themeContrast.test.js can import it and assert its text pairs in both
 * modes. `chromeFor(mode)` is what the app paints with; the bare named
 * exports are the light set, kept for that test's older imports.
 */
const LIGHT = {
  CHROME_BG: '#FFFFFF',
  INK: '#1B1F27',
  MUTED: '#4A5160', // rows, and the section captions
  ACCENT: '#3B5BDB',
  ACTIVE_INK: '#2F4AC0',
  ACTIVE_BG: 'rgba(59, 91, 219, 0.10)',
  HOVER_BG: 'rgba(27, 31, 39, 0.05)',
  EDGE: '#E2E5EA',
};
const DARK = {
  CHROME_BG: '#14171C',
  INK: '#ECEEF2',
  MUTED: '#B9BFCA',
  ACCENT: '#91A7FF',
  ACTIVE_INK: '#BAC8FF',
  ACTIVE_BG: 'rgba(145, 167, 255, 0.16)',
  HOVER_BG: 'rgba(255, 255, 255, 0.06)',
  EDGE: '#2B3039',
};

export const CHROME = { light: LIGHT, dark: DARK };
export const chromeFor = (mode) => (mode === 'dark' ? DARK : LIGHT);

export const { CHROME_BG, INK, MUTED, ACCENT, ACTIVE_INK, ACTIVE_BG, HOVER_BG, EDGE } = LIGHT;
