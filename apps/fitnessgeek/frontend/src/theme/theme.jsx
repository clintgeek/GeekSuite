/**
 * FitnessGeek Theme: "Market Morning"
 *
 * Warm and food-first (DOCS/SIMPLE_AND_FULL_PLAN.md, Decisions). A sunny
 * cream ground, rounded friendly type (Nunito, self-hosted), big soft cards,
 * and a produce colour per meal: tomato for Breakfast, leaf for Lunch, lemon
 * for Dinner, plum for Snacks. Night is the same kitchen with the lamp on —
 * walnut and warm cream — not the day palette inverted.
 *
 * Replaces "Studio Slate" (teal, a serif display face and monospace labels),
 * which sat too close to NoteGeek's Lab Notebook and BookGeek's serif.
 *
 * CONTRAST (measured, WCAG): the produce colours are FILLS and EDGES, never
 * text on the cream. Lemon measures 1.6:1 and leaf 2.5:1 as text on paper —
 * both unreadable — so every produce fill carries INK text instead, and each
 * colour has a deep `text` variant for the rare case it must be the ink.
 * The measured pairs are listed beside each value; packages/ui's
 * themeContrast.test.js holds the palette pairs to AA in both modes.
 *
 * Composes createGeekSuiteTheme with FitnessGeek-specific identity overrides.
 */
import { alpha } from '@mui/material/styles';
import { createGeekSuiteTheme } from '@geeksuite/ui';

// ─── Design Tokens ───────────────────────────────────────────────
const NUNITO = '"Nunito", "Segoe UI Rounded", "SF Pro Rounded", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const tokens = {
  radius: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    pill: 999,
  },
  // One family everywhere. The display/mono slots are kept so older call
  // sites that read `tokens.font.display` keep working; numbers get
  // tabular figures from the body rule below rather than a monospace face.
  font: {
    display: NUNITO,
    body: NUNITO,
    mono: NUNITO,
  },
};

// ─── Light: the market in the morning ────────────────────────────
const lightColors = {
  // Basil. White on it 6.41:1; as ink on paper 6.36:1.
  primary: { main: '#2F6B35', light: '#4E8A2A', dark: '#24522A', contrastText: '#FFFFFF' },
  secondary: { main: '#8A5A3C', light: '#B07A55', dark: '#6B4329', contrastText: '#FFFFFF' },
  background: { default: '#FFF8EC', paper: '#FFFEFB' },
  // Espresso ink: 14.96:1 on cream. Secondary 7.88:1, muted 6.39:1.
  text: { primary: '#2A2118', secondary: '#5C4B3B', muted: '#6B5847', disabled: '#8C7A67' },
  divider: '#EFE3CF',
};

// ─── Dark: the same kitchen at night ─────────────────────────────
const darkColors = {
  // Basil under the lamp. 8.40:1 on the night paper; its dark label 8.82:1.
  primary: { main: '#8BCB7E', light: '#A9DA9E', dark: '#6DB35F', contrastText: '#13200F' },
  secondary: { main: '#D9A77F', light: '#E8C3A4', dark: '#C08A60', contrastText: '#1B1612' },
  background: { default: '#1B1612', paper: '#262019' },
  // Warm cream ink: 15.51:1 on walnut. Secondary 9.66:1, muted 7.83:1.
  text: { primary: '#F7EDE0', secondary: '#D6C6B3', muted: '#C4B29D', disabled: '#A08E7A' },
  divider: '#3D3228',
};

// Semantic tones retuned for the warm grounds (the suite's defaults are
// tuned for neutral grey and land under AA on cream / walnut).
const semantic = {
  light: { success: '#2F7D32', warning: '#9A5B00', error: '#B3261E', info: '#2A5F8F' },
  dark: { success: '#8BCB7E', warning: '#F2B45A', error: '#FF9A8A', info: '#8CC4F0' },
};

/**
 * The produce, per meal. `fill` is a surface (cards' edge, buttons) that
 * always carries `ink`; `tint` is the soft card body; `text` is the deep
 * variant for the rare time the colour itself has to be read.
 *
 * Light, ink #2A2118 on fill: tomato 5.42, leaf 7.53, lemon 10.05, plum 5.50.
 * Dark, ink #1B1612 on fill: tomato 7.80, leaf 10.47, lemon 12.29, plum 7.94.
 */
const PRODUCE = {
  light: {
    breakfast: { name: 'Tomato', fill: '#F07156', tint: '#FDE9E2', text: '#B23A22', ink: '#2A2118' },
    lunch: { name: 'Leaf', fill: '#8BC34A', tint: '#EDF5E0', text: '#3F7A25', ink: '#2A2118' },
    dinner: { name: 'Lemon', fill: '#F6C945', tint: '#FEF5D6', text: '#8A6100', ink: '#2A2118' },
    snack: { name: 'Plum', fill: '#C184BE', tint: '#F5E8F4', text: '#7E3F7B', ink: '#2A2118' },
  },
  dark: {
    breakfast: { name: 'Tomato', fill: '#FF8A70', tint: '#3A2620', text: '#FF8A70', ink: '#1B1612' },
    lunch: { name: 'Leaf', fill: '#A5D46F', tint: '#27301E', text: '#A5D46F', ink: '#1B1612' },
    dinner: { name: 'Lemon', fill: '#F7D26A', tint: '#35301B', text: '#F7D26A', ink: '#1B1612' },
    snack: { name: 'Plum', fill: '#D39ACF', tint: '#33253A', text: '#D39ACF', ink: '#1B1612' },
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
 * One colour per job (visual review B2): the produce colours mean "which
 * meal" and nothing else, so macros get their own warm ramp built from basil
 * and the ink — a reader can't connect "Fat" to Breakfast's tomato any more.
 * Measured on paper / against `track`: light protein 6.35 / 4.85, carbs
 * 5.78 / 4.42, fat 6.67 / 5.10, fibre 4.16 / 3.18 (a bar or dot only, never
 * text); dark 8.42 / 6.51, 7.52 / 5.82, 7.85 / 6.07, 10.15 / 7.86.
 */
const MACROS = {
  light: { protein: '#2F6B35', carbs: '#8A5A3C', fat: '#6B5847', fiber: '#4E8A2A' },
  dark: { protein: '#8BCB7E', carbs: '#D9A77F', fat: '#C4B29D', fiber: '#A9DA9E' },
};

/** The macro colours in one mode: { protein, carbs, fat, fiber }. */
export function macroColors(mode = 'light') {
  return MACROS[mode === 'dark' ? 'dark' : 'light'];
}

/**
 * Every progress track: a warm cream groove in the morning, a walnut one at
 * night (review A2). Basil on the light track 4.85:1; night basil on the dark
 * one 6.51:1 — the old grey[200]/[300] tracks were cold, and in dark the
 * brightest thing on the screen.
 */
const TRACK = { light: '#EADFCB', dark: '#3D3228' };

/**
 * The second-rank button (review B1): one filled basil per view; every other
 * action is tonal. Basil on the light tint 5.34:1; night basil-light on the
 * dark tint 7.42:1.
 */
const TONAL = {
  light: { bg: '#E3EEDC', hover: '#D3E4C9', ink: '#2F6B35' },
  dark: { bg: '#2E3B29', hover: '#394A33', ink: '#A9DA9E' },
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
  // Night cards lift off the walnut with a firmer edge (review A10); outlined
  // pills and chips get a warm edge instead of MUI's cold grey (A9, B5).
  const cardBorder = isDark ? '#4A3D30' : colors.divider;
  const outline = isDark ? '#554636' : '#CDBBA0';
  // Disabled is warm too (A8): the composer's Log it rests here every time
  // it opens, and MUI's cold grey read as "broken". 3.33:1 light.
  const disabled = isDark ? { bg: '#2E261E', ink: '#A08E7A' } : { bg: '#EFE6D6', ink: '#8C7A67' };
  // The keyboard focus ring (A3): basil on paper 6.36:1, night basil 8.40:1.
  const focusRing = colors.primary.main;
  const ink = colors.text.primary;
  const softShadow = isDark
    ? '0 1px 0 rgba(255, 236, 210, 0.04) inset, 0 10px 28px -18px rgba(0, 0, 0, 0.8)'
    : '0 1px 2px rgba(92, 64, 32, 0.06), 0 12px 28px -20px rgba(92, 64, 32, 0.28)';

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

    shape: { borderRadius: 12 },

    typography: {
      fontFamily: tokens.font.body,
      h1: { fontFamily: NUNITO, fontSize: '2.25rem', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15 },
      h2: { fontFamily: NUNITO, fontSize: '1.875rem', fontWeight: 800, letterSpacing: '-0.005em', lineHeight: 1.2 },
      h3: { fontFamily: NUNITO, fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.25 },
      h4: { fontFamily: NUNITO, fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.3 },
      // Card titles are h6 at 800 (review B10): one weight per heading level.
      h5: { fontFamily: NUNITO, fontSize: '1.125rem', fontWeight: 800, lineHeight: 1.35 },
      h6: { fontFamily: NUNITO, fontSize: '1.0625rem', fontWeight: 800, lineHeight: 1.4 },
      // Body text at 18px on phones (plan item 5), a notch smaller on a
      // desktop where the dense Full pages live.
      body1: { fontSize: '1.125rem', lineHeight: 1.55, '@media (min-width:900px)': { fontSize: '1rem' } },
      body2: { fontSize: '1rem', lineHeight: 1.5, '@media (min-width:900px)': { fontSize: '0.9375rem' } },
      // Captions never drop under 13px on a desktop (review C9).
      caption: { fontSize: '0.75rem', '@media (min-width:900px)': { fontSize: '0.8125rem' } },
      button: { fontFamily: NUNITO, fontSize: '1rem', fontWeight: 800, textTransform: 'none', letterSpacing: 0 },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            fontFamily: NUNITO,
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
            border: `1px solid ${cardBorder}`,
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
            fontWeight: 800,
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
          },
        },
      },
      // Every track, every bar (review A2).
      MuiLinearProgress: {
        styleOverrides: {
          root: { backgroundColor: track, borderRadius: tokens.radius.pill },
          bar: { borderRadius: tokens.radius.pill },
        },
      },
      // The app's one switch, warmed (review B11): 52 × 32 drawn on a 44px
      // tall hit area, the off track in the ink at 25%, basil when on.
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
              color: isDark ? colors.primary.contrastText : '#FFFEFB',
              '& + .MuiSwitch-track': { backgroundColor: colors.primary.main, opacity: 1 },
            },
            '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.4 },
          },
          thumb: {
            width: 24,
            height: 24,
            boxShadow: softShadow,
            color: isDark ? colors.text.primary : '#FFFEFB',
          },
          track: {
            borderRadius: 16,
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
      // The toast at night sat darker than the walnut and read as a hole
      // (review A9): a lifted espresso card instead, cream ink 11.13:1.
      MuiSnackbar: {
        styleOverrides: {
          root: isDark
            ? {
                '& .MuiAlert-root': {
                  backgroundColor: '#3A3026',
                  color: colors.text.primary,
                  border: `1px solid ${outline}`,
                },
              }
            : {},
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { fontFamily: NUNITO, fontSize: '0.875rem' },
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
          },
        },
      },
    },
  };
}

/**
 * createFitnessTheme(mode)
 *
 * Composes shared GeekSuite rules with FitnessGeek "Market Morning" identity.
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
