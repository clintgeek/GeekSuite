/**
 * FitnessGeek's sidebar chrome: the label inverted. One ink panel in both app
 * modes, set in white, with the app's blue as the accent. It lives in its own
 * module, apart from Sidebar.jsx, so packages/ui's themeContrast.test.js can
 * import it and assert its text pairs. The theme's `text.*` tokens follow the
 * app mode, so they are the wrong ink here.
 */
export const CHROME_BG = '#111318';
export const INK = '#FFFFFF';
export const MUTED = '#C4C7CF'; // rows, and the section captions
export const ACCENT = '#8FA6FF'; // the night blue: readable on the ink panel
export const ACTIVE_BG = 'rgba(143, 166, 255, 0.24)';
export const HOVER_BG = 'rgba(255, 255, 255, 0.08)';
