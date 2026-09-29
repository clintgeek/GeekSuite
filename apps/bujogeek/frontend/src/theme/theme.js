/**
 * BuJoGeek theme — "Red Pen" (DOCS/SIMPLE_PLAN.md § Identity).
 *
 * Composes createGeekSuiteTheme with BuJoGeek's identity: one typeface (Inter
 * Tight, self-hosted, tabular numerals), ink on paper, one red. The accent is
 * the INK, not the red: every MUI control (focus rings, buttons, switches, the
 * selected nav row) is drawn in ink, and the red is reserved for the pen —
 * the tick, the strike, "2 days late", the priority mark, a parsed date. A red
 * that is on every control stops meaning anything.
 *
 * Semantic tones are greys for the same reason, except error, which is the
 * red. A toast is a note in the margin, not a traffic light.
 *
 * Button sizing, spacing, focus rings and interaction tokens still belong to
 * the shared system.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';
import { pen, PEN_FONT } from './pen';

function buildPalette(mode) {
  const p = mode === 'dark' ? pen.dark : pen.light;
  const tone = (main) => ({ main, light: main, dark: main, contrastText: p.paper });
  const quiet = mode === 'dark' ? '#BDBDB7' : '#4A4A47';
  return {
    pen: p,
    background: { default: p.paper, paper: p.surface },
    text: {
      primary: p.ink,
      secondary: p.grey,
      muted: p.muted,
      disabled: p.faint,
    },
    divider: p.rule,
    secondary: { main: p.red, light: p.red, dark: p.red, contrastText: p.onRed },
    error: { main: p.red, light: p.red, dark: p.red, contrastText: p.onRed },
    success: tone(quiet),
    info: tone(quiet),
    warning: tone(quiet),
  };
}

const heading = (size, weight = 650, tracking = '-0.02em') => ({
  fontFamily: PEN_FONT,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: tracking,
  lineHeight: 1.15,
});

function buildOverrides(mode) {
  const p = mode === 'dark' ? pen.dark : pen.light;
  return {
    palette: buildPalette(mode),
    typography: {
      fontFamily: PEN_FONT,
      h1: heading('2.25rem', 700, '-0.03em'),
      h2: heading('1.75rem', 700, '-0.025em'),
      h3: heading('1.375rem'),
      h4: heading('1.0625rem', 600, '-0.01em'),
      h5: heading('0.9375rem', 600, '0'),
      // The eyebrow. No uppercase mono stamps here: that is NoteGeek's voice.
      h6: { fontFamily: PEN_FONT, fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0', lineHeight: 1.3 },
      body1: { fontFamily: PEN_FONT, fontSize: '1rem', lineHeight: 1.5 },
      body2: { fontFamily: PEN_FONT, fontSize: '0.875rem', lineHeight: 1.45 },
      caption: { fontFamily: PEN_FONT, fontSize: '0.8125rem', lineHeight: 1.4 },
      button: { fontFamily: PEN_FONT, fontWeight: 600, letterSpacing: '0', textTransform: 'none' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            fontFeatureSettings: '"tnum" 1',
            fontVariantNumeric: 'tabular-nums',
            scrollbarWidth: 'thin',
          },
          '::selection': { backgroundColor: mode === 'dark' ? '#3A3A38' : '#E2E2DC' },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: { backgroundColor: p.paper, borderBottom: `1px solid ${p.rule}`, boxShadow: 'none' },
        },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      // Toasts and notices are notes in the margin: no severity icon.
      MuiAlert: {
        defaultProps: { icon: false },
      },
      MuiButton: {
        styleOverrides: { root: { textTransform: 'none', boxShadow: 'none' } },
      },
      MuiBottomNavigation: {
        styleOverrides: {
          root: { backgroundColor: p.paper, borderTop: `1px solid ${p.rule}` },
        },
      },
    },
  };
}

/**
 * createBuJoTheme(mode) — the shared GeekSuite theme with Red Pen on top.
 * Shared rules win unless explicitly overridden here.
 */
export function createBuJoTheme(mode = 'light') {
  const p = mode === 'dark' ? pen.dark : pen.light;
  return createGeekSuiteTheme({
    mode,
    accent: { main: p.ink, light: p.grey, dark: p.ink, contrastText: p.paper },
    overrides: buildOverrides(mode),
  });
}

export default createBuJoTheme('light');
