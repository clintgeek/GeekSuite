import { alpha, createTheme, lighten } from '@mui/material/styles';
import { geekDesignTokens } from './designTokens.js';

const {
  interaction,
  layout,
  motion,
  palette,
  shape,
  spacing,
  typography,
} = geekDesignTokens;

function buildPalette({ mode, accent }) {
  const isDark = mode === 'dark';
  const appAccent = accent || palette.primary;
  const semantic = isDark ? palette.semanticDark : palette.semantic;

  return {
    mode,
    primary: appAccent,
    secondary: {
      main: appAccent.dark || palette.primary.dark,
      light: appAccent.light || palette.primary.light,
      dark: appAccent.dark || palette.primary.dark,
      contrastText: appAccent.contrastText || palette.primary.contrastText,
    },
    background: {
      default: isDark ? '#121212' : palette.neutral.background,
      paper: isDark ? '#1E1E1E' : palette.neutral.paper,
    },
    text: {
      primary: isDark ? '#F5F5F5' : palette.neutral.textPrimary,
      secondary: isDark ? '#BDBDBD' : palette.neutral.textSecondary,
      // muted = de-emphasized but still readable copy (timestamps, counts, empty states); disabled = inert controls only.
      muted: isDark ? '#A0A0A0' : '#6B6B6B',
      // Apps lean on text.disabled for tertiary copy (timestamps, counts,
      // empty states), so it must stay perceptible: ~3:1 on each mode's paper.
      disabled: isDark ? '#8F8F8F' : palette.neutral.textDisabled,
    },
    divider: isDark ? 'rgba(255, 255, 255, 0.12)' : palette.neutral.border,
    success: { main: semantic.success },
    warning: { main: semantic.warning },
    error: { main: semantic.error },
    info: { main: semantic.info },
    glow: {
      ring: alpha(appAccent.main, 0.20),
      soft: alpha(appAccent.main, 0.06),
      medium: alpha(appAccent.main, 0.10),
      border: alpha(appAccent.main, 0.30),
    },
  };
}

function buildTypography() {
  return {
    fontFamily: typography.fontFamily,
    h1: typography.scale.h1,
    h2: typography.scale.h2,
    h3: typography.scale.h3,
    h4: {
      fontSize: '1.125rem',
      lineHeight: 1.35,
      fontWeight: typography.weights.heading,
    },
    h5: {
      fontSize: '1rem',
      lineHeight: 1.4,
      fontWeight: typography.weights.heading,
    },
    h6: {
      fontSize: '0.875rem',
      lineHeight: 1.4,
      fontWeight: typography.weights.heading,
    },
    body1: typography.scale.body,
    body2: typography.scale.caption,
    caption: typography.scale.caption,
    button: {
      fontSize: typography.scale.body.fontSize,
      fontWeight: typography.weights.interactive,
      lineHeight: 1.4,
      textTransform: 'none',
    },
  };
}

function buildComponents(themePalette) {
  const focusColor = themePalette.primary.main;
  const transition = `${motion.duration.base}ms ${motion.easing.standard}`;
  const isDark = themePalette.mode === 'dark';

  // Tooltips are palette-derived rather than MUI's stock grey-700 wash, which
  // reads as a foreign object on a warm paper and, in dark mode, as a *lighter*
  // box than the surface it explains. The rule (TODO_ORDER #19):
  //   dark  — the app's own paper, lifted a step, with its primary text on it;
  //   light — inverted: primary text becomes the surface, paper becomes the ink.
  // The light pair is the app's asserted `text.primary on background.paper`
  // read backwards, so it inherits that pair's AA guarantee for free; the dark
  // pair is checked directly in `__tests__/themeContrast.test.js`.
  const tooltipBg = isDark
    ? lighten(themePalette.background.paper, 0.16)
    : themePalette.text.primary;
  const tooltipFg = isDark ? themePalette.text.primary : themePalette.background.paper;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': {
          boxSizing: 'border-box',
        },
        body: {
          backgroundColor: themePalette.background.default,
          color: themePalette.text.primary,
        },
        'button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])': {
          '&:focus-visible': {
            outline: `${interaction.focus.outlineWidth}px solid ${focusColor}`,
            outlineOffset: interaction.focus.outlineOffset,
          },
        },
      },
    },
    MuiAppBar: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          minHeight: layout.topBarHeight,
          borderRadius: 0,
          borderBottom: `1px solid ${themePalette.divider}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: shape.radius.control,
          minHeight: layout.minClickTarget,
          minWidth: layout.minClickTarget,
          padding: `${spacing.scale[2]}px ${spacing.scale[4]}px`,
          fontSize: typography.scale.body.fontSize,
          fontWeight: typography.weights.interactive,
          textTransform: 'none',
          transition: `background-color ${transition}, border-color ${transition}, box-shadow ${transition}`,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
            backgroundColor: themePalette.primary.dark,
          },
          '&:active': {
            backgroundColor: themePalette.primary.dark,
          },
        },
        outlined: {
          borderColor: themePalette.divider,
          '&:hover': {
            borderColor: themePalette.primary.main,
            backgroundColor: alpha(themePalette.primary.main, interaction.hoverOpacity),
          },
        },
        text: {
          '&:hover': {
            backgroundColor: alpha(themePalette.primary.main, interaction.hoverOpacity),
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: shape.radius.control,
          minHeight: layout.minClickTarget,
          minWidth: layout.minClickTarget,
          transition: `background-color ${transition}, color ${transition}`,
          '&:hover': {
            backgroundColor: alpha(themePalette.primary.main, interaction.hoverOpacity),
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            minHeight: layout.minClickTarget,
            borderRadius: shape.radius.control,
            transition: `border-color ${transition}, box-shadow ${transition}`,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: themePalette.primary.main,
            },
            '&.Mui-focused': {
              boxShadow: `0 0 0 ${interaction.focus.outlineWidth}px ${alpha(
                themePalette.primary.main,
                0.18
              )}`,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: themePalette.primary.main,
            },
          },
          '& .MuiInputBase-input': {
            paddingTop: spacing.scale[3],
            paddingBottom: spacing.scale[3],
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: shape.radius.panel,
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          borderRadius: shape.radius.panel,
          border: `1px solid ${themePalette.divider}`,
          backgroundImage: 'none',
          transition: `border-color ${transition}, box-shadow ${transition}`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          height: 24,
          borderRadius: shape.radius.chip,
          fontSize: typography.scale.caption.fontSize,
          fontWeight: typography.weights.interactive,
        },
        label: {
          paddingLeft: spacing.scale[2],
          paddingRight: spacing.scale[2],
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          width: layout.sidebarWidth,
          borderRight: `1px solid ${themePalette.divider}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: shape.radius.control,
          minHeight: layout.minClickTarget,
          margin: `${spacing.scale[1]}px ${spacing.scale[2]}px`,
          transition: `background-color ${transition}, color ${transition}`,
          '&:hover': {
            backgroundColor: alpha(themePalette.primary.main, interaction.hoverOpacity),
          },
          '&.Mui-selected': {
            backgroundColor: alpha(themePalette.primary.main, interaction.activeOpacity),
            color: themePalette.primary.main,
            '&:hover': {
              backgroundColor: alpha(themePalette.primary.main, interaction.activeOpacity),
            },
          },
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
      },
      styleOverrides: {
        tooltip: {
          borderRadius: shape.radius.chip,
          fontSize: typography.scale.caption.fontSize,
          fontWeight: typography.weights.interactive,
          padding: `${spacing.scale[1]}px ${spacing.scale[2]}px`,
          backgroundColor: tooltipBg,
          color: tooltipFg,
        },
        arrow: {
          color: tooltipBg,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: layout.minClickTarget,
          fontSize: typography.scale.body.fontSize,
          fontWeight: typography.weights.interactive,
          textTransform: 'none',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: shape.radius.panel,
        },
      },
    },
  };
}

function deepMerge(target, source) {
  if (!source) return target;
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (target[key] && typeof target[key] === 'object') {
        output[key] = deepMerge(target[key], source[key]);
      } else {
        output[key] = { ...source[key] };
      }
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

export function createGeekSuiteTheme({
  mode = 'light',
  accent,
  overrides = {},
} = {}) {
  // Merge the app's palette overrides *before* building component styles, so
  // CssBaseline body colors, card/app-bar borders and selected-row tints are
  // derived from the app's real surfaces rather than the suite defaults.
  const themePalette = deepMerge(buildPalette({ mode, accent }), overrides.palette);

  const baseOptions = {
    palette: themePalette,
    typography: buildTypography(),
    spacing: spacing.unit,
    shape: {
      borderRadius: shape.radius.control,
    },
    components: buildComponents(themePalette),
    breakpoints: {
      values: {
        xs: 0,
        sm: 600,
        md: 900,
        lg: 1200,
        xl: 1536,
      },
    },
    geek: geekDesignTokens,
  };

  const mergedOptions = deepMerge(baseOptions, overrides);

  return createTheme(mergedOptions);
}

export { geekDesignTokens };

