/**
 * FitnessGeek's sidebar chrome: the market's chalkboard. One deep green-black
 * board in both app modes, written on in chalk, with a lemon accent — the
 * sign by the stall, not a second copy of the page. It lives in its own
 * module, apart from Sidebar.jsx, so packages/ui's themeContrast.test.js can
 * import it and assert its text pairs. The theme's `text.*` tokens follow the
 * app mode, so they are the wrong ink here.
 */
export const CHROME_BG = '#1F2A22';
export const INK = '#F4EFE4'; // 12.96:1 on CHROME_BG
export const MUTED = '#C9C2AE'; // 8.36:1: rows, and the section captions
export const ACCENT = '#F6C945'; // lemon chalk: 9.46:1 on CHROME_BG
export const ACTIVE_BG = 'rgba(246, 201, 69, 0.14)'; // INK on it over the board: ~9.4:1
export const HOVER_BG = 'rgba(255, 255, 255, 0.06)';
