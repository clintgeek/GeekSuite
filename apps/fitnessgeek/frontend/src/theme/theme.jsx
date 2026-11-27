/**
 * FitnessGeek Theme: "The Label"
 *
 * The Nutrition Facts panel, as an app (DOCS/THEME_REVIEW_2026-11.md, item 1;
 * Chef picked direction A on 2026-11-26). A white panel with a 2px ink border
 * on a cool grey ground, thick and thin ink rules, heavy grotesque numerals
 * (Archivo, self-hosted), and one ink-blue for anything you can press or that
 * shows progress. Meals and statuses get a few more bold ink colours in the
 * same vein as the blue; they are marks and fills, never card bodies.
 *
 * Night is the label inverted: near-black panel, off-white rules.
 *
 * Replaces "Market Morning" (cream, Nunito, basil green and produce fills),
 * which read as a sandwich shop.
 *
 * CONTRAST (WCAG): every meal `fill` carries its `ink` at AA; packages/ui's
 * themeContrast.test.js holds the pairs in both modes.
 *
 * Composes createGeekSuiteTheme with FitnessGeek-specific identity overrides.
 */
import { alpha } from '@mui/material/styles';
import { createGeekSuiteTheme } from '@geeksuite/ui';

// ─── Design Tokens ───────────────────────────────────────────────
const ARCHIVO = '"Archivo", "Helvetica Neue", Helvetica, Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const tokens = {
  radius: {
    // A label has square corners. Controls get a 4px ease; `pill` is kept as
    // a name for older call sites and is now that same 4px.
    xs: 2,
    sm: 4,
    md: 4,
    lg: 0,
    pill: 4,
  },
  // One family everywhere. The display/mono slots are kept so older call
  // sites that read `tokens.font.display` keep working; numbers get
  // tabular figures from the body rule below rather than a monospace face.
  font: {
    display: ARCHIVO,
    body: ARCHIVO,
    mono: ARCHIVO,
  },
};

// ─── Light: the label ────────────────────────────────────────────
const lightColors = {
  // Ink blue. White on it 8.3:1.
  primary: { main: '#1F3FD1', light: '#4A66E0', dark: '#1630A8', contrastText: '#FFFFFF' },
  secondary: { main: '#111318', light: '#3D414B', dark: '#000000', contrastText: '#FFFFFF' },
  background: { default: '#ECEEF2', paper: '#FFFFFF' },
  text: { primary: '#111318', secondary: '#3D414B', muted: '#4A4E57', disabled: '#6B7080' },
  // The hairline between rows; the heavy rules are drawn in the ink itself.
  divider: '#C9CCD3',
};

// ─── Dark: the label inverted ────────────────────────────────────
const darkColors = {
  primary: { main: '#8FA6FF', light: '#B3C2FF', dark: '#6F88F0', contrastText: '#0E0F12' },
  secondary: { main: '#F2F2EE', light: '#FFFFFF', dark: '#C4C7CF', contrastText: '#0E0F12' },
  background: { default: '#0E0F12', paper: '#17181C' },
  text: { primary: '#F2F2EE', secondary: '#C4C7CF', muted: '#A9ADB8', disabled: '#9498A3' },
  divider: '#3A3D46',
};

const semantic = {
  light: { success: '#0B7A3B', warning: '#9A5200', error: '#C81E1E', info: '#1F3FD1' },
  dark: { success: '#5FD08A', warning: '#F2B45A', error: '#FF8A80', info: '#8FA6FF' },
};

/**
 * One bold ink per meal, in the same vein as the blue. `fill` is a mark or a
 * button that always carries `ink`; `tint` is a faint wash for the rare
 * surface that needs one; `text` is the colour as words on paper.
 */
const PRODUCE = {
  light: {
    breakfast: { name: 'Orange', fill: '#C2410C', tint: '#FBEDE6', text: '#C2410C', ink: '#FFFFFF' },
    lunch: { name: 'Green', fill: '#0B7A3B', tint: '#E6F3EB', text: '#0B7A3B', ink: '#FFFFFF' },
    dinner: { name: 'Violet', fill: '#6D28D9', tint: '#EFE9FB', text: '#6D28D9', ink: '#FFFFFF' },
    snack: { name: 'Magenta', fill: '#B0127E', tint: '#F9E6F2', text: '#B0127E', ink: '#FFFFFF' },
  },
  dark: {
    breakfast: { name: 'Orange', fill: '#FF9A6B', tint: '#2A1D17', text: '#FF9A6B', ink: '#0E0F12' },
    lunch: { name: 'Green', fill: '#5FD08A', tint: '#16261C', text: '#5FD08A', ink: '#0E0F12' },
    dinner: { name: 'Violet', fill: '#B79CFF', tint: '#201B30', text: '#B79CFF', ink: '#0E0F12' },
    snack: { name: 'Magenta', fill: '#F58AD0', tint: '#2A1826', text: '#F58AD0', ink: '#0E0F12' },
  },
};

export const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
export const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

/** The produce colours for one meal in one mode. */
export function mealColors(mealType, mode = 'light') {
  const set = PRODUCE[mode === 'dark' ? 'dark' : 'light'];
  return set[mealType] || set.snack;
}

/**
 * Macros are label rows: ink bars, like the panel's own rules. The meal
 * colours mean "which meal" and nothing else, so a reader can't connect
 * "Fat" to a meal. Fibre is the quieter grey (a bar or dot only).
 */
const MACROS = {
  light: { protein: '#111318', carbs: '#111318', fat: '#111318', fiber: '#4A4E57' },
  dark: { protein: '#F2F2EE', carbs: '#F2F2EE', fat: '#F2F2EE', fiber: '#A9ADB8' },
};

/** The macro colours in one mode: { protein, carbs, fat, fiber }. */
export function macroColors(mode = 'light') {
  return MACROS[mode === 'dark' ? 'dark' : 'light'];
}

/**
 * Every progress track: a cool grey groove by day, a charcoal one at
 * night (review A2). The blue on the light track and on the dark
 * one 6.51:1 — the old grey[200]/[300] tracks were cold, and in dark the
 * brightest thing on the screen.
 */
const TRACK = { light: '#D9DCE3', dark: '#2C2F38' };

/**
 * The second-rank button (review B1): one filled blue per view; every other
 * action is tonal. The blue on the light tint and the night blue on the
 * dark tint 7.42:1.
 */
const TONAL = {
  light: { bg: '#E3E8FB', hover: '#D3DBF8', ink: '#1F3FD1' },
  dark: { bg: '#1F2540', hover: '#283056', ink: '#B3C2FF' },
};

/** The track colour for this theme, with a fallback for a bare MUI theme. */
export function trackColor(theme) {
  return theme?.palette?.track || TRACK[theme?.palette?.mode === 'dark' ? 'dark' : 'light'];
}

function buildFitnessOverrides(mode) {
  const isDark = mode === 'dark';
  const colors = isDark ? darkColors : lightColors;
  const tones = semantic[isDark ? 'dark' : 'light'];
  const track = TRACK[isDark ? 'dark' : 'light'];
  const tonal = TONAL[isDark ? 'dark' : 'light'];
  // Panels are bordered in the ink itself, like a label; outlined
  // pills and chips get a warm edge instead of MUI's cold grey (A9, B5).
  const cardBorder = colors.text.primary;
  const outline = isDark ? '#6B7080' : '#6B7080';
  // Disabled is warm too (A8): the composer's Log it rests here every time
  // it opens, and MUI's cold grey read as "broken". 3.33:1 light.
  const disabled = isDark ? { bg: '#23252B', ink: '#9498A3' } : { bg: '#E1E3E8', ink: '#6B7080' };
  // The keyboard focus ring (A3): the blue, in both modes.
  const focusRing = colors.primary.main;
  const ink = colors.text.primary;
  // A label is flat: no shadows anywhere.
  const softShadow = 'none';

  return {
    palette: {
      background: colors.background,
      text: colors.text,
      divider: colors.divider,
      secondary: colors.secondary,
      success: { main: tones.success },
      warning: { main: tones.warning },
      error: { main: tones.error },
      info: { main: tones.info },
      action: { disabled: disabled.ink, disabledBackground: disabled.bg },
      track,
      tonal,
      cardBorder,
      macro: MACROS[isDark ? 'dark' : 'light'],
    },

    shape: { borderRadius: 4 },

    typography: {
      fontFamily: tokens.font.body,
      h1: { fontFamily: ARCHIVO, fontSize: '2.25rem', fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.15 },
      h2: { fontFamily: ARCHIVO, fontSize: '1.875rem', fontWeight: 900, letterSpacing: '-0.005em', lineHeight: 1.2 },
      h3: { fontFamily: ARCHIVO, fontSize: '1.5rem', fontWeight: 900, lineHeight: 1.25 },
      h4: { fontFamily: ARCHIVO, fontSize: '1.25rem', fontWeight: 900, lineHeight: 1.3 },
      // Card titles are h6 at 800 (review B10): one weight per heading level.
      h5: { fontFamily: ARCHIVO, fontSize: '1.125rem', fontWeight: 800, lineHeight: 1.35 },
      h6: { fontFamily: ARCHIVO, fontSize: '1.0625rem', fontWeight: 800, lineHeight: 1.4 },
      // Body text at 18px on phones (plan item 5), a notch smaller on a
      // desktop where the dense Full pages live.
      body1: { fontSize: '1.125rem', lineHeight: 1.55, '@media (min-width:900px)': { fontSize: '1rem' } },
      body2: { fontSize: '1rem', lineHeight: 1.5, '@media (min-width:900px)': { fontSize: '0.9375rem' } },
      // Captions never drop under 13px on a desktop (review C9).
      caption: { fontSize: '0.75rem', '@media (min-width:900px)': { fontSize: '0.8125rem' } },
      button: { fontFamily: ARCHIVO, fontSize: '1rem', fontWeight: 700, textTransform: 'none', letterSpacing: 0 },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            fontFamily: ARCHIVO,
            // Tabular figures everywhere: calorie totals line up without a
            // monospace face.
            fontVariantNumeric: 'tabular-nums',
            backgroundColor: colors.background.default,
          },
          // Every floating button is round, like every other button here
          // (review B6). The shell's FAB is the suite's squircle, set in its
          // own sx; `body` outranks that one class without touching the
          // shared package.
          'body .MuiFab-root': { borderRadius: tokens.radius.pill },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: colors.background.default,
            borderBottom: `1px solid ${colors.divider}`,
            borderRadius: 0,
            color: colors.text.primary,
            boxShadow: 'none',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.lg,
            backgroundColor: colors.background.paper,
            border: `2px solid ${cardBorder}`,
            boxShadow: softShadow,
          },
        },
      },
      // A visible ring on every keyboard-focused control (review A3): the
      // focused Log it used to differ from its rest state by 1.41:1 of fill.
      MuiButtonBase: {
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': { outline: `2px solid ${focusRing}`, outlineOffset: 2 },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.pill,
            fontWeight: 700,
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
            '&.Mui-disabled': { color: disabled.ink },
          },
          contained: {
            '&.Mui-disabled': { backgroundColor: disabled.bg, color: disabled.ink },
          },
          outlined: {
            borderColor: outline,
            '&.Mui-disabled': { borderColor: disabled.bg },
          },
          sizeLarge: { minHeight: 56, fontSize: '1.125rem', paddingLeft: 24, paddingRight: 24 },
        },
        // `variant="tonal"`: the second-rank action (review B1).
        variants: [
          {
            props: { variant: 'tonal' },
            style: {
              backgroundColor: tonal.bg,
              color: tonal.ink,
              '&:hover': { backgroundColor: tonal.hover },
              '&:active': { backgroundColor: tonal.hover },
              '&.Mui-disabled': { backgroundColor: disabled.bg, color: disabled.ink },
            },
          },
          {
            props: { variant: 'tonal', size: 'small' },
            style: { padding: '4px 14px', fontSize: '0.9375rem' },
          },
        ],
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            borderColor: outline,
            // The same 44px phone floor as chips and icon buttons.
            '@media (max-width:899.95px)': { minHeight: 44, minWidth: 44 },
            // A tablet in landscape is wider than md but still a finger.
            '@media (pointer: coarse)': { minHeight: 44, minWidth: 44 },
          },
        },
      },
      // Every track, every bar (review A2).
      MuiLinearProgress: {
        styleOverrides: {
          root: { backgroundColor: track, borderRadius: 0, height: 10 },
          bar: { borderRadius: 0 },
        },
      },
      // The app's one switch, warmed (review B11): 52 × 32 drawn on a 44px
      // tall hit area, the off track in the ink at 25%, blue when on.
      MuiSwitch: {
        styleOverrides: {
          root: { width: 52, height: 44, padding: '6px 0', overflow: 'visible' },
          switchBase: {
            padding: 0,
            top: 10,
            left: 4,
            '&:hover': { backgroundColor: 'transparent' },
            '&.Mui-checked': {
              transform: 'translateX(20px)',
              color: isDark ? colors.primary.contrastText : '#FFFFFF',
              '& + .MuiSwitch-track': { backgroundColor: colors.primary.main, opacity: 1 },
            },
            '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.4 },
          },
          thumb: {
            width: 24,
            height: 24,
            boxShadow: softShadow,
            color: isDark ? colors.text.primary : '#FFFFFF',
          },
          track: {
            borderRadius: 4,
            backgroundColor: alpha(ink, 0.25),
            opacity: 1,
          },
        },
      },
      // MUI pulls a label's control 11px left to cancel the stock Switch's
      // 12px padding; the themed switch has none, so give it a plain gap.
      MuiFormControlLabel: {
        styleOverrides: {
          root: { '&:has(.MuiSwitch-root)': { marginLeft: 0, gap: 12 } },
        },
      },
      // The toast at night sat darker than the ground and read as a hole
      // (review A9): a lifted card instead.
      MuiSnackbar: {
        styleOverrides: {
          root: isDark
            ? {
                '& .MuiAlert-root': {
                  backgroundColor: '#23252B',
                  color: colors.text.primary,
                  border: `1px solid ${outline}`,
                },
              }
            : {},
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { fontFamily: ARCHIVO, fontSize: '0.875rem' },
        },
      },

      // ─── Mobile grammar (MOBILE_UI_PLAN.md §2) ───────────────────────
      // 44px hit areas and a 12px text floor on phones, fixed here so every
      // chip/icon-button/select in the app inherits it rather than patching
      // each `sx={{ height: 40 }}` call site.
      // Two chip shapes (review B5), both round: the action pill (44px tall on
      // a phone when it's tappable) and `variant="tag"`, a quiet info tag.
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 700,
            borderRadius: tokens.radius.pill,
            '@media (max-width:899.95px)': {
              '&.MuiChip-clickable': {
                minHeight: 44,
                minWidth: 44,
              },
            },
          },
          label: {
            fontSize: '0.875rem',
          },
          outlined: { borderColor: outline },
        },
        variants: [
          {
            props: { variant: 'tag' },
            style: {
              height: 28,
              border: 'none',
              backgroundColor: alpha(ink, isDark ? 0.1 : 0.06),
              color: ink,
              fontWeight: 700,
              '& .MuiChip-label': { fontSize: '0.875rem' },
              '& .MuiChip-icon': { color: colors.text.secondary },
            },
          },
        ],
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            '@media (max-width:899.95px)': {
              '&.MuiIconButton-sizeSmall': {
                minWidth: 44,
                minHeight: 44,
              },
            },
          },
        },
      },
      // Bare `<Select>`/`<OutlinedInput>` outside a `<TextField>` don't get
      // the suite's TextField-scoped 44px floor — give them their own below md.
      MuiOutlinedInput: {
        styleOverrides: {
          // A warm edge on fields too, not MUI's cold 23% black.
          notchedOutline: { borderColor: outline },
          root: {
            borderRadius: tokens.radius.sm,
            '@media (max-width:899.95px)': {
              minHeight: 44,
            },
            '@media (pointer: coarse)': {
              minHeight: 44,
              '& .MuiSelect-select': { minHeight: 44, boxSizing: 'border-box', display: 'flex', alignItems: 'center' },
            },
          },
        },
      },
    },
  };
}

/**
 * createFitnessTheme(mode)
 *
 * Composes shared GeekSuite rules with FitnessGeek's "The Label" identity.
 */
export function createFitnessTheme(mode = 'light') {
  const isDark = mode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const theme = createGeekSuiteTheme({
    mode,
    accent: colors.primary,
    overrides: buildFitnessOverrides(mode),
  });

  // Failsafe: Ensure theme.palette.glow is always defined even if
  // Vite is serving an outdated, pre-bundled cache of @geeksuite/ui.
  if (!theme.palette.glow) {
    theme.palette.glow = {
      ring: alpha(colors.primary.main, 0.20),
      soft: alpha(colors.primary.main, 0.06),
      medium: alpha(colors.primary.main, 0.10),
      border: alpha(colors.primary.main, 0.30),
    };
  }

  theme.palette.produce = PRODUCE[isDark ? 'dark' : 'light'];

  return theme;
}

// Legacy exports
export const createAppTheme = (mode = 'light') => createFitnessTheme(mode);
export const theme = createFitnessTheme('light');
export default theme;
