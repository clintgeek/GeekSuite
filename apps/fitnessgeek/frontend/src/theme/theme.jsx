/**
 * FitnessGeek Theme: "Daylight"
 *
 * A calm consumer health app (apps/fitnessgeek/DOCS/DASHBOARD_REDESIGN_SPEC.md,
 * Chef 2026-11-26). A soft cool-grey ground, white cards with a hairline edge
 * and the faintest shadow, 16px corners, Figtree (self-hosted), and one blue
 * for anything you can press or that shows progress. Whitespace separates
 * things; borders and rules do not.
 *
 * Colour is used on purpose: each macro has its own (teal, amber, rose), each
 * meal has a small dot, and statuses use one success / warning / error set.
 *
 * Night is the same layout on a charcoal ground, no shadows.
 *
 * Replaces "The Label" (2px ink borders, square corners, Archivo 900), which
 * read as rigid and box-heavy, and before it "Market Morning".
 *
 * CONTRAST (WCAG): packages/ui's themeContrast.test.js holds the pairs in
 * both modes.
 *
 * Composes createGeekSuiteTheme with FitnessGeek-specific identity overrides.
 */
import { alpha } from '@mui/material/styles';
import { createGeekSuiteTheme } from '@geeksuite/ui';

// ─── Design Tokens ───────────────────────────────────────────────
const FIGTREE = '"Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

export const tokens = {
  radius: {
    xs: 6,   // tags, small marks
    sm: 8,   // fields
    md: 12,  // buttons, inset blocks
    lg: 16,  // cards
    pill: 999, // chips, bars, the floating button
  },
  // One family everywhere. The display/mono slots are kept so older call
  // sites that read `tokens.font.display` keep working; numbers get
  // tabular figures from the body rule below rather than a monospace face.
  font: {
    display: FIGTREE,
    body: FIGTREE,
    mono: FIGTREE,
  },
};

// ─── Light ───────────────────────────────────────────────────────
const lightColors = {
  // White on it 5.67:1.
  primary: { main: '#3B5BDB', light: '#5C7CFA', dark: '#2F4AC0', contrastText: '#FFFFFF' },
  secondary: { main: '#1B1F27', light: '#4A5160', dark: '#0B0D12', contrastText: '#FFFFFF' },
  background: { default: '#F4F5F7', paper: '#FFFFFF' },
  text: { primary: '#1B1F27', secondary: '#4A5160', muted: '#5A6272', disabled: '#6B7080' },
  divider: '#E2E5EA',
};

// ─── Dark ────────────────────────────────────────────────────────
const darkColors = {
  primary: { main: '#91A7FF', light: '#BAC8FF', dark: '#748FFC', contrastText: '#0F1115' },
  secondary: { main: '#ECEEF2', light: '#FFFFFF', dark: '#B9BFCA', contrastText: '#0F1115' },
  background: { default: '#0F1115', paper: '#191C22' },
  text: { primary: '#ECEEF2', secondary: '#B9BFCA', muted: '#A3AAB6', disabled: '#8B92A0' },
  divider: '#2B3039',
};

const semantic = {
  light: { success: '#18794E', warning: '#9A5200', error: '#C92A2A', info: '#3B5BDB' },
  dark: { success: '#5FD08A', warning: '#F2B45A', error: '#FF8A80', info: '#91A7FF' },
};

/**
 * One colour per meal. `fill` is a dot or a small mark (and carries `ink`
 * when something sits on it); `tint` is a faint wash for the rare surface
 * that needs one; `text` is the colour as words on paper.
 */
const PRODUCE = {
  light: {
    breakfast: { name: 'Orange', fill: '#C2410C', tint: '#FBEDE6', text: '#C2410C', ink: '#FFFFFF' },
    lunch: { name: 'Green', fill: '#0B7A3B', tint: '#E6F3EB', text: '#0B7A3B', ink: '#FFFFFF' },
    dinner: { name: 'Violet', fill: '#6D28D9', tint: '#EFE9FB', text: '#6D28D9', ink: '#FFFFFF' },
    snack: { name: 'Magenta', fill: '#B0127E', tint: '#F9E6F2', text: '#B0127E', ink: '#FFFFFF' },
  },
  dark: {
    breakfast: { name: 'Orange', fill: '#FF9A6B', tint: '#2A1D17', text: '#FF9A6B', ink: '#0F1115' },
    lunch: { name: 'Green', fill: '#5FD08A', tint: '#16261C', text: '#5FD08A', ink: '#0F1115' },
    dinner: { name: 'Violet', fill: '#B79CFF', tint: '#201B30', text: '#B79CFF', ink: '#0F1115' },
    snack: { name: 'Magenta', fill: '#F58AD0', tint: '#2A1826', text: '#F58AD0', ink: '#0F1115' },
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
 * Each macro has its own colour, so three bars can be told apart at a glance:
 * teal protein, amber carbs, rose fat. None is a meal colour and none is the
 * app's blue (that one means "calories" and "press me"). Every bar also has
 * its name and numbers in words, so colour never carries it alone. Fibre is
 * the quiet grey (a bar or dot only).
 */
const MACROS = {
  light: { protein: '#0B7285', carbs: '#B35C00', fat: '#C2255C', fiber: '#5A6272' },
  dark: { protein: '#66D9E8', carbs: '#FFC078', fat: '#FAA2C1', fiber: '#A3AAB6' },
};

/** The macro colours in one mode: { protein, carbs, fat, fiber }. */
export function macroColors(mode = 'light') {
  return MACROS[mode === 'dark' ? 'dark' : 'light'];
}

/** Every progress track: a soft groove a shade under the ground. */
const TRACK = { light: '#E4E7EC', dark: '#2B3039' };

/**
 * The second-rank button: one filled blue per view; every other action is
 * tonal.
 */
const TONAL = {
  light: { bg: '#E7ECFD', hover: '#D8E0FB', ink: '#2F4AC0' },
  dark: { bg: '#1F2742', hover: '#29335A', ink: '#BAC8FF' },
};

/** A card's lift: barely there by day, nothing at night (the edge does it). */
const SHADOW = {
  light: '0 1px 2px rgba(16, 24, 40, 0.04), 0 2px 6px rgba(16, 24, 40, 0.04)',
  dark: 'none',
};

/** The track colour for this theme, with a fallback for a bare MUI theme. */
export function trackColor(theme) {
  return theme?.palette?.track || TRACK[theme?.palette?.mode === 'dark' ? 'dark' : 'light'];
}

/** The tonal (second-rank) colours for this theme, with a fallback for a bare MUI theme. */
export function tonalColors(theme) {
  return theme?.palette?.tonal || TONAL[theme?.palette?.mode === 'dark' ? 'dark' : 'light'];
}

function buildFitnessOverrides(mode) {
  const isDark = mode === 'dark';
  const colors = isDark ? darkColors : lightColors;
  const tones = semantic[isDark ? 'dark' : 'light'];
  const track = TRACK[isDark ? 'dark' : 'light'];
  const tonal = TONAL[isDark ? 'dark' : 'light'];
  // Cards get a hairline; fields and outlined buttons get an edge that
  // clears 3:1 on paper (WCAG 1.4.11), since the edge is what says "control".
  const cardBorder = colors.divider;
  const outline = isDark ? '#6B7280' : '#8A91A0';
  // Disabled is warm too (A8): the composer's Log it rests here every time
  // it opens, and MUI's cold grey read as "broken". 3.33:1 light.
  const disabled = isDark ? { bg: '#252930', ink: '#9AA1AD' } : { bg: '#E4E7EC', ink: '#6B7080' };
  // The keyboard focus ring (A3): the blue, in both modes.
  const focusRing = colors.primary.main;
  const ink = colors.text.primary;
  const softShadow = SHADOW[isDark ? 'dark' : 'light'];

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
      cardShadow: softShadow,
      // The edge of a field, chip or outlined button: 3:1 on paper.
      outline,
      macro: MACROS[isDark ? 'dark' : 'light'],
    },

    shape: { borderRadius: 8 },

    typography: {
      fontFamily: tokens.font.body,
      h1: { fontFamily: FIGTREE, fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
      h2: { fontFamily: FIGTREE, fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.25 },
      h3: { fontFamily: FIGTREE, fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3 },
      h4: { fontFamily: FIGTREE, fontSize: '1.1875rem', fontWeight: 700, lineHeight: 1.3 },
      h5: { fontFamily: FIGTREE, fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.35 },
      h6: { fontFamily: FIGTREE, fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 },
      // Body text at 18px on phones (plan item 5), a notch smaller on a
      // desktop where the dense Full pages live.
      body1: { fontSize: '1.125rem', lineHeight: 1.55, '@media (min-width:900px)': { fontSize: '1rem' } },
      body2: { fontSize: '1rem', lineHeight: 1.5, '@media (min-width:900px)': { fontSize: '0.9375rem' } },
      // Captions never drop under 13px on a desktop (review C9).
      caption: { fontSize: '0.75rem', '@media (min-width:900px)': { fontSize: '0.8125rem' } },
      button: { fontFamily: FIGTREE, fontSize: '1rem', fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            fontFamily: FIGTREE,
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
            borderRadius: tokens.radius.md,
            fontWeight: 600,
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
            '&.Mui-disabled': { color: disabled.ink },
          },
          // A filled button that is waiting for input stays recognisably the
          // page's button: a paler blue, not flat grey (2026-11-28: "primary
          // buttons look disabled on arrival" read as broken).
          contained: {
            '&.Mui-disabled': {
              backgroundColor: isDark ? '#3A4470' : '#AEBBF1',
              color: isDark ? '#AEB9E6' : '#FFFFFF',
            },
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
      // A group of toggles is one segmented control: a soft track with the
      // chosen segment lifted onto paper. Used for ranges (7 days / 30 days),
      // Today / Yesterday, units. A lone ToggleButton keeps its own look.
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: {
            backgroundColor: track,
            borderRadius: 12,
            padding: 3,
            gap: 2,
            maxWidth: '100%',
          },
          grouped: {
            border: 0,
            borderRadius: '9px !important',
            margin: '0 !important',
            paddingLeft: 14,
            paddingRight: 14,
            textTransform: 'none',
            fontWeight: 600,
            color: isDark ? '#B9BFCA' : '#4A5160',
            '&.Mui-selected, &.Mui-selected:hover': {
              backgroundColor: isDark ? '#4A5160' : '#FFFFFF',
              color: isDark ? '#ECEEF2' : '#1B1F27',
              boxShadow: isDark ? 'none' : '0 1px 2px rgba(16,24,40,.12)',
            },
          },
        },
      },
      // Every track, every bar (review A2).
      MuiLinearProgress: {
        styleOverrides: {
          root: { backgroundColor: track, borderRadius: tokens.radius.pill, height: 8 },
          bar: { borderRadius: tokens.radius.pill },
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
            boxShadow: '0 1px 2px rgba(16, 24, 40, 0.2)',
            color: isDark ? colors.text.primary : '#FFFFFF',
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
      // The toast at night sat darker than the ground and read as a hole
      // (review A9): a lifted card instead.
      MuiSnackbar: {
        styleOverrides: {
          root: isDark
            ? {
                '& .MuiAlert-root': {
                  backgroundColor: '#252930',
                  color: colors.text.primary,
                  border: `1px solid ${outline}`,
                },
              }
            : {},
        },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: tokens.radius.lg, backgroundImage: 'none' } },
      },
      MuiMenu: {
        styleOverrides: { paper: { borderRadius: tokens.radius.md, border: `1px solid ${cardBorder}` } },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: tokens.radius.md } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { fontFamily: FIGTREE, fontSize: '0.875rem' },
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
            fontWeight: 600,
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
              fontWeight: 600,
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
 * Composes shared GeekSuite rules with FitnessGeek's "Daylight" identity.
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
