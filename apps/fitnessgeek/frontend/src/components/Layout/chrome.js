/**
 * FitnessGeek's sidebar chrome: always dark (`#0C0A09`) in both app modes,
 * with the teal accent. It lives in its own module, apart from Sidebar.jsx,
 * so packages/ui's themeContrast.test.js can import it and assert its text
 * pairs. The theme's `text.*` tokens follow the app mode, so they are the
 * wrong ink here: light mode's `text.secondary` measures 4.12:1 on this
 * ground (the 2026-09-25 desktop harness finding).
 */
export const CHROME_BG = '#0C0A09';
export const INK = '#F5F5F4'; // 18.1:1 on CHROME_BG
export const MUTED = '#A8A29E'; // 7.8:1: rows, and the section captions
export const ACCENT = '#2DD4BF';
