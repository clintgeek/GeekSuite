/**
 * FitnessGeek Theme: "Studio Slate"
 *
 * Performance-focused, clean aesthetics. Teal accents,
 * stone surfaces, and serif-heavy headings for a premium editorial feel.
 *
 * Composes createGeekSuiteTheme with FitnessGeek-specific identity overrides.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';

// ─── Design Tokens ───────────────────────────────────────────────
export const tokens = {
  radius: {
    xs: 4,
    sm: 8,
    md: 8,
    lg: 16,
    pill: 4,
  },
  font: {
    display: '"DM Serif Display", Georgia, "Times New Roman", serif',
    body: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  },
};

// ─── Light Palette ───────────────────────────────────────────────
const lightColors = {
  primary: { main: '#0D9488', light: '#14B8A6', dark: '#0F766E', contrastText: '#FFFFFF' },
  secondary: { main: '#78716C', light: '#A8A29E', dark: '#57534E', contrastText: '#FFFFFF' },
  background: { default: '#FAFAF9', paper: '#FFFFFF' },
  text: { primary: '#1C1917', secondary: '#78716C' },
  divider: '#E7E5E4',
};

// ─── Dark Palette ────────────────────────────────────────────────
const darkColors = {
  primary: { main: '#2DD4BF', light: '#5EEAD4', dark: '#14B8A6', contrastText: '#1C1917' },
  secondary: { main: '#A8A29E', light: '#D6D3D1', dark: '#78716C', contrastText: '#1C1917' },
  background: { default: '#1C1917', paper: '#292524' },
  text: { primary: '#F5F5F4', secondary: '#A8A29E' },
  divider: '#44403C',
};

function buildFitnessOverrides(mode) {
  const isDark = mode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return {
    palette: {
      background: colors.background,
      text: colors.text,
      divider: colors.divider,
    },

    typography: {
      fontFamily: tokens.font.body,
      h1: { fontFamily: tokens.font.display, fontSize: '2.5rem', fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.2 },
      h2: { fontFamily: tokens.font.display, fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.005em', lineHeight: 1.3 },
      h3: { fontFamily: tokens.font.display, fontSize: '1.5rem', fontWeight: 400, lineHeight: 1.35 },
      h4: { fontFamily: tokens.font.body, fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 },
      h5: { fontFamily: tokens.font.body, fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
      h6: { fontFamily: tokens.font.body, fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 },
      button: { fontFamily: tokens.font.body, fontSize: '0.875rem', fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em' },
    },

    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: colors.background.paper,
            borderBottom: `1px solid ${colors.divider}`,
            borderRadius: 0,
            color: colors.text.primary,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.sm,
            backgroundColor: colors.background.paper,
            border: `1px solid ${colors.divider}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: '#0C0A09', // Stone 950 — near-black sidebar
            borderRight: 'none',
          },
        },
      },
    }
  };
}

/**
 * createFitnessTheme(mode)
 *
 * Composes shared GeekSuite rules with FitnessGeek "Studio Slate" identity.
 */
export function createFitnessTheme(mode = 'light') {
  const isDark = mode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return createGeekSuiteTheme({
    mode,
    accent: colors.primary,
    overrides: buildFitnessOverrides(mode),
  });
}

// Legacy exports
export const createAppTheme = (mode = 'light') => createFitnessTheme(mode);
export const theme = createFitnessTheme('light');
export default theme;
