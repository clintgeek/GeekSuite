/**
 * NewsGeek theme: "County Gazette" (DOCS/NEWSGEEK_PLAN.md, Decisions → Identity).
 *
 * A modern small-town weekly. The page is newsprint, the headlines are ink,
 * sections are divided by hairline rules instead of cards, and labels are
 * small capitals in a Franklin gothic, the way a paper sets its section
 * flags. Dark mode is the same paper at night: warm dark stock, not black,
 * with the ink turned to a warm off-white.
 *
 * ONE spot colour: civic blue, reserved for "official" (city notices, NWS
 * alerts). Nothing else is painted with it: not links, not the active tab,
 * not buttons. The interactive accent is the ink itself.
 *
 * Type: Newsreader (an editorial serif drawn for news reading) for
 * headlines, the masthead and everything you read; Libre Franklin (the
 * newspaper gothic) for section flags, chips, buttons and the shell. Text
 * first, no images in v1.
 *
 * Every text colour is measured against every surface it lands on
 * (__tests__/theme/gazetteContrast.test.js mirrors packages/ui's
 * themeContrast). Never wrap a text token in alpha().
 *
 * Composes createGeekSuiteTheme; nothing here reaches into packages/ui.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';

export const SERIF = '"Newsreader", "Iowan Old Style", "Charter", Georgia, "Times New Roman", serif';
export const GOTHIC = '"Libre Franklin", "Franklin Gothic Medium", "Helvetica Neue", Arial, system-ui, sans-serif';

/** Surfaces and inks per mode. `newsprint` is the page; `stock` is a sheet laid on it (dialogs, menus). */
export const GAZETTE = {
  light: {
    newsprint: '#F4F0E6',
    stock: '#FBF9F3',
    shade: '#ECE6D8', // a section band, the selected sidebar row
    ink: '#1B1A17',
    inkSoft: '#47433B',
    inkFaint: '#5C574C',
    hairline: '#CFC7B5',
    rule: '#1B1A17', // the heavy rule under the masthead
    spot: '#1D4A8A', // official
    spotTint: '#E3E9F2', // official badge ground
    tone: { ok: '#2C6236', stale: '#7A5200', failing: '#9A4400', broken: '#9E2A1E', never: '#5C574C' },
  },
  dark: {
    newsprint: '#1C1A16',
    stock: '#25221D',
    shade: '#2D2A23',
    ink: '#EDE7DA',
    inkSoft: '#CDC5B4',
    inkFaint: '#ADA492',
    hairline: '#433E35',
    rule: '#EDE7DA',
    spot: '#9DBDF0',
    spotTint: '#26313F',
    tone: { ok: '#8FCB9B', stale: '#E5BC66', failing: '#F0A06A', broken: '#F2918A', never: '#ADA492' },
  },
};

export function gazetteTokens(mode) {
  return mode === 'dark' ? GAZETTE.dark : GAZETTE.light;
}

/** The accent is the ink: links, the active tab, contained buttons. */
const ACCENT = {
  light: { main: '#1B1A17', light: '#3A372F', dark: '#000000', contrastText: '#F4F0E6' },
  dark: { main: '#EDE7DA', light: '#FFFFFF', dark: '#D6CFBF', contrastText: '#1C1A16' },
};

/** Small capitals for section flags and labels (real small caps where the face has them). */
export const flagSx = {
  fontFamily: GOTHIC,
  fontWeight: 700,
  fontSize: '0.75rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  lineHeight: 1.4,
};

/** The desktop sidebar panel (GeekShell navSx and GeekSidebar sx): newsprint with a hairline edge. */
export const SIDEBAR_SX = {
  bgcolor: 'background.default',
  borderRight: 1,
  borderColor: 'divider',
  '& [data-geek-sidebar="section-label"]': { ...flagSx, color: 'text.secondary' },
};

function buildOverrides(mode) {
  const g = gazetteTokens(mode);
  const isDark = mode === 'dark';
  return {
    palette: {
      background: { default: g.newsprint, paper: g.stock, shade: g.shade },
      text: { primary: g.ink, secondary: g.inkSoft, muted: g.inkFaint, disabled: g.inkFaint },
      divider: g.hairline,
      success: { main: g.tone.ok, contrastText: g.newsprint },
      warning: { main: g.tone.stale, contrastText: g.newsprint },
      error: { main: g.tone.broken, contrastText: g.newsprint },
      info: { main: g.spot, contrastText: g.newsprint },
      // App slots: components read palette.gazette.* and palette.official.*.
      gazette: { ...g, mode },
      official: { main: g.spot, tint: g.spotTint, contrastText: g.newsprint },
    },
    typography: {
      fontFamily: SERIF,
      h1: { fontFamily: SERIF, fontWeight: 800, letterSpacing: '-0.015em', lineHeight: 1.05 },
      h2: { fontFamily: SERIF, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.12 },
      h3: { fontFamily: SERIF, fontWeight: 700, letterSpacing: '-0.005em', lineHeight: 1.18 },
      h4: { fontFamily: SERIF, fontWeight: 700, lineHeight: 1.22 },
      h5: { fontFamily: SERIF, fontWeight: 600, lineHeight: 1.25 },
      h6: { fontFamily: SERIF, fontWeight: 600, lineHeight: 1.3 },
      body1: { fontFamily: SERIF, fontSize: '1.0625rem', lineHeight: 1.6 },
      body2: { fontFamily: SERIF, fontSize: '0.9375rem', lineHeight: 1.55 },
      subtitle1: { fontFamily: GOTHIC },
      subtitle2: { fontFamily: GOTHIC, fontWeight: 600 },
      caption: { fontFamily: GOTHIC, fontSize: '0.8125rem', lineHeight: 1.45 },
      overline: { ...flagSx },
      button: { fontFamily: GOTHIC, fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: g.newsprint, fontFeatureSettings: '"kern", "liga", "onum"' },
          '::selection': { background: isDark ? '#4A4436' : '#E2D9C3' },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: {
        styleOverrides: {
          root: { borderRadius: 2, boxShadow: 'none', border: `1px solid ${g.hairline}`, backgroundColor: g.stock },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 2, minHeight: 44 },
          containedPrimary: { boxShadow: 'none' },
        },
      },
      MuiChip: {
        styleOverrides: { root: { fontFamily: GOTHIC, borderRadius: 2 } },
      },
      MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: g.stock, borderRadius: 2 } } },
      MuiListItemButton: {
        styleOverrides: {
          root: { '&.Mui-selected': { color: g.ink, backgroundColor: g.shade } },
        },
      },
      MuiLink: {
        styleOverrides: { root: { color: g.ink, textDecorationColor: g.hairline, textUnderlineOffset: '0.2em' } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { fontFamily: GOTHIC, backgroundColor: g.ink, color: g.newsprint, fontSize: '0.8125rem' },
        },
      },
    },
  };
}

export function createNewsTheme(mode = 'light') {
  const m = mode === 'dark' ? 'dark' : 'light';
  return createGeekSuiteTheme({ mode: m, accent: ACCENT[m], overrides: buildOverrides(m) });
}

export default createNewsTheme;
