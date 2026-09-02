import { alpha, darken } from '@mui/material/styles';
import { createGeekSuiteTheme } from '@geeksuite/ui';

/**
 * BaseGeek Theme: "Mission Control"
 *
 * The control room of your digital life. Warm, calm, and now legible in
 * daylight too — a desk you built yourself, lit by a warm lamp at night and
 * by the window in the morning.
 *
 * Composes `createGeekSuiteTheme` with BaseGeek's identity overrides:
 * - Amber accent (bright ochre on stone in dark, deep amber on paper in light)
 * - Warm stone surfaces (dark) / warm off-white paper surfaces (light)
 * - Geist (sans) / Geist Mono typography, 10px panel radius
 *
 * Contrast: every palette pair asserted by
 * packages/ui/src/__tests__/themeContrast.test.js clears WCAG AA in BOTH
 * modes. Measured ratios are noted beside the values that are close to a
 * threshold — retune with that suite, not by eye.
 */

// Warm stone scale — zero blue cast, amber/brown undertones. This is the
// DARK-mode surface ramp; light mode uses `paperScale` below. Exposed on the
// palette as `stone` for continuity, but prefer `palette.surfaces` /
// `palette.text` in components so the value tracks the active mode.
const stone = {
  950:  '#0c0c0f',
  900:  '#121215',
  850:  '#17171b',
  800:  '#1c1c21',
  700:  '#252529',
  600:  '#2e2e33',
  500:  '#3a3a40',
  400:  '#52525a',
  300:  '#71717a',
  200:  '#a1a1aa',
  100:  '#d4d4dc',
  50:   '#f0f0f3',
};

// Warm off-white ramp — the light-mode counterpart to `stone`. Same amber
// undertone, so the two modes read as one family rather than two products.
const paperScale = {
  50:  '#ffffff',
  100: '#faf9f6',
  200: '#f4f2ee',
  300: '#ebe8e2',
  400: '#ddd9d2',
};

// Amber accent, per mode.
// Dark: bright ochre on near-black, dark ink label (9.37:1).
// Light: deep amber on paper — 4.86:1 as foreground text/icons (needs 3.0)
// and 4.86:1 against its white label (needs 4.5). A brighter amber cannot
// carry a white label at AA, which is why light mode goes deeper, not lighter.
const accentDark = {
  main: '#e8a849',
  light: '#f0c078',
  dark: '#c48a30',
  contrastText: stone[950],
};

const accentLight = {
  main: '#a56118',
  light: '#c9852f',
  dark: '#7d4a0a',
  contrastText: '#ffffff',
};

// Status hues. Dark values are lifted for the near-black ground; light values
// are deepened so each clears 3.0:1 on paper (error clears 4.5:1, since
// "Password is required" is real body copy).
const semanticDark = {
  error:   { main: '#c76b6b', light: '#e0a0a0', dark: '#a85050' },  // 4.86:1
  warning: { main: '#d4b06a', light: '#e8cc90', dark: '#b8903a' },
  success: { main: '#7dac8e', light: '#a0c8ae', dark: '#5a8c6a' },
  info:    { main: '#a99df0', light: '#c4bcf5', dark: '#8a7ed0' },
};

const semanticLight = {
  error:   { main: '#a33b3b', light: '#c76b6b', dark: '#7d2a2a' },  // 6.48:1
  warning: { main: '#8a5a00', light: '#b8903a', dark: '#5e3d00' },
  success: { main: '#2f6b45', light: '#5a8c6a', dark: '#1f4a2e' },
  info:    { main: '#5b4bbd', light: '#8a7ed0', dark: '#3d3186' },
};

const accentFor = (mode) => (mode === 'light' ? accentLight : accentDark);

/**
 * Per-app brand hues (the `color` fields in the app directories) are tuned for
 * the dark ground and land near 2:1 on light paper. Darken them for anything
 * that carries meaning — glyphs, chip labels — while tinted FILLS keep the raw
 * hue in both modes. Verified: every suite brand hue clears 4.9:1 on its own
 * 9% tint and 5.2:1 on white at this coefficient.
 */
export function brandInk(theme, hex) {
  return theme.palette.mode === 'light' ? darken(hex, 0.4) : hex;
}

/**
 * Build the BaseGeek theme for a mode.
 * @param {'light'|'dark'} mode
 */
export function createBaseGeekTheme(mode = 'dark') {
  const isLight = mode === 'light';
  const accentPalette = accentFor(mode);
  const semantic = isLight ? semanticLight : semanticDark;
  const amber = accentPalette.main;

  // Surfaces. Dark keeps the stone ramp; light uses warm off-white with true
  // white paper so cards lift off the canvas the way they do in dark.
  const surfaces = isLight
    ? { deep: paperScale[200], base: paperScale[200], surface: paperScale[50], elevated: paperScale[100] }
    : { deep: stone[950],      base: stone[900],      surface: stone[850],     elevated: stone[800] };

  const text = isLight
    ? { primary: '#1c1c21', secondary: '#52525a', muted: '#6e6a72', disabled: '#8e8a94' }
    // 14.13 / 5.27 / 5.27 / 3.68 on the dark canvas
    : { primary: '#e4dfd6', secondary: '#8a8690', muted: '#8a8690', disabled: stone[300] };

  // Hairlines and control outlines, per mode.
  const line = isLight
    ? {
        divider: 'rgba(0, 0, 0, 0.08)',
        panel:   'rgba(0, 0, 0, 0.10)',
        strong:  'rgba(0, 0, 0, 0.14)',
        input:   'rgba(0, 0, 0, 0.23)',
        inputHover: 'rgba(0, 0, 0, 0.42)',
        hover:   'rgba(0, 0, 0, 0.04)',
      }
    : {
        divider: 'rgba(255, 255, 255, 0.06)',
        panel:   stone[700],
        strong:  stone[600],
        input:   stone[600],
        inputHover: stone[400],
        hover:   'rgba(255, 255, 255, 0.04)',
      };

  // Amber glow — always derived from the active accent so the ring tracks the
  // mode instead of baking the dark amber into light surfaces.
  const glow = {
    ring:   alpha(amber, 0.20),
    soft:   alpha(amber, isLight ? 0.07 : 0.06),
    medium: alpha(amber, isLight ? 0.12 : 0.10),
    border: alpha(amber, 0.30),
  };

  // Tooltips invert against the page in both modes (dark bubble on light UI,
  // lifted stone on dark UI) — the conventional, most legible treatment.
  const tooltip = isLight
    ? { bg: stone[800], fg: paperScale[200], border: stone[600] }
    : { bg: stone[600], fg: text.primary,    border: stone[500] };

  const shadowTint = isLight ? '28, 28, 33' : '0, 0, 0';
  const s = (y, blur, a) => `0 ${y}px ${blur}px rgba(${shadowTint}, ${a})`;
  const shadowScale = isLight
    ? ['none', s(1, 2, 0.05), s(2, 4, 0.06), s(4, 8, 0.08), s(8, 16, 0.10), s(12, 24, 0.12), s(16, 32, 0.14)]
    : ['none', s(1, 2, 0.3),  s(2, 4, 0.3),  s(4, 8, 0.35), s(8, 16, 0.4),  s(12, 24, 0.45), s(16, 32, 0.5)];

  const sansStack = '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const monoStack = '"Geist Mono", monospace';

  return createGeekSuiteTheme({
    mode,
    accent: accentPalette,
    overrides: {
      palette: {
        secondary: isLight
          ? { main: '#2f6b45', light: '#5a8c6a', dark: '#1f4a2e', contrastText: '#ffffff' }
          : { main: '#7dac8e', light: '#a0c8ae', dark: '#5a8c6a', contrastText: stone[950] },
        background: {
          default: surfaces.base,
          paper: surfaces.surface,
        },
        text: {
          primary: text.primary,
          secondary: text.secondary,
          muted: text.muted,
          disabled: text.disabled,
        },
        divider: line.divider,
        error: semantic.error,
        warning: semantic.warning,
        success: semantic.success,
        info: semantic.info,
        // Custom BaseGeek tokens. `stone` stays the raw dark ramp for
        // continuity; `surfaces`, `line` and `accent` are mode-aware — read
        // those in components so nothing pins a dark value onto light paper.
        stone,
        paperScale,
        surfaces,
        line,
        accent: {
          amber,
          amberSoft: isLight ? '#8a5a2a' : '#d4956a',
          amberGlow: glow.medium,
          sage: semantic.success.main,
          sageSoft: alpha(semantic.success.main, 0.12),
          coral: semantic.error.main,
          coralSoft: alpha(semantic.error.main, 0.12),
          indigo: semantic.info.main,
          indigoSoft: alpha(semantic.info.main, 0.10),
          // The "bg" brand mark keeps its bright amber gradient in both modes
          // (a logo is not a surface), so its ink stays dark in both modes.
          gradient: `linear-gradient(135deg, ${accentDark.main} 0%, #d4956a 100%)`,
          // Ink for text/icons sitting on a BRIGHT fill that is the same in
          // both modes — the brand gradient and the fixed accent-colour
          // swatches. Not `primary.contrastText`, which correctly flips to
          // white in light mode and would vanish on a pale swatch.
          onBrightFill: stone[950],
        },
        glow,
      },

      typography: {
        fontFamily: sansStack,
        fontFamilyMono: monoStack,
        h1: { fontFamily: sansStack, fontWeight: 700, letterSpacing: '-0.03em',  lineHeight: 1.15 },
        h2: { fontFamily: sansStack, fontWeight: 700, letterSpacing: '-0.02em',  lineHeight: 1.2 },
        h3: { fontFamily: sansStack, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25 },
        h4: { fontFamily: sansStack, fontWeight: 600, letterSpacing: '-0.01em',  lineHeight: 1.3 },
        h5: { fontWeight: 600, letterSpacing: '-0.005em', lineHeight: 1.35 },
        h6: { fontWeight: 600, lineHeight: 1.4 },
        subtitle1: { fontWeight: 500, fontSize: '0.9375rem', lineHeight: 1.5 },
        subtitle2: {
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          fontSize: '0.6875rem',
        },
        body1: { lineHeight: 1.65, fontSize: '0.9375rem' },
        body2: { lineHeight: 1.6,  fontSize: '0.8125rem' },
        button: { fontWeight: 600, textTransform: 'none', fontSize: '0.8125rem' },
        caption: { fontWeight: 500, fontSize: '0.75rem', color: text.muted },
        overline: {
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontSize: '0.6875rem',
          fontFamily: monoStack,
        },
      },

      shape: {
        borderRadius: 10,
      },

      shadows: [...shadowScale, ...Array(25 - shadowScale.length).fill(shadowScale[shadowScale.length - 1])],

      components: {
        MuiCssBaseline: {
          styleOverrides: {
            '*, *::before, *::after': {
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
            },
            '::selection': {
              backgroundColor: alpha(amber, 0.25),
              color: 'inherit',
            },
            'input, textarea, [contenteditable]': {
              caretColor: `${amber} !important`,
            },
          },
        },
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: 8,
              padding: '8px 16px',
              transition: 'all 150ms ease',
              fontSize: '0.875rem',
              minHeight: 44,
              minWidth: 44,
            },
            contained: {
              boxShadow: 'none',
              '&:hover': { boxShadow: 'none' },
            },
            outlined: {
              borderColor: line.strong,
              '&:hover': {
                borderColor: amber,
                backgroundColor: glow.soft,
              },
              '&:focus-visible': {
                boxShadow: `0 0 0 3px ${glow.ring}`,
              },
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundImage: 'none',
              border: `1px solid ${line.panel}`,
            },
            elevation0: { boxShadow: 'none' },
          },
        },
        MuiCard: {
          styleOverrides: {
            root: {
              borderRadius: 8,
              border: `1px solid ${line.panel}`,
              backgroundImage: 'none',
              transition: 'all 150ms ease',
            },
          },
        },
        MuiDialog: {
          styleOverrides: {
            paper: {
              borderRadius: 8,
              border: `1px solid ${line.strong}`,
              backgroundColor: isLight ? paperScale[50] : stone[800],
            },
          },
        },
        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              borderRadius: 4,
              fontWeight: 500,
              fontSize: '0.75rem',
              padding: '6px 12px',
              backgroundColor: tooltip.bg,
              color: tooltip.fg,
              border: `1px solid ${tooltip.border}`,
            },
            arrow: {
              color: tooltip.bg,
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              borderRadius: 4,
              fontWeight: 500,
              fontSize: '0.75rem',
              height: 24,
            },
          },
        },
        MuiListItemButton: {
          styleOverrides: {
            root: {
              borderRadius: 8,
              margin: '2px 8px',
              padding: '8px 12px',
              transition: 'all 120ms ease',
              '&.Mui-selected': {
                backgroundColor: glow.soft,
                borderLeft: `2px solid ${amber}`,
                paddingLeft: 10,
                '&:hover': { backgroundColor: glow.medium },
              },
              '&:hover': { backgroundColor: line.hover },
            },
          },
        },
        MuiDrawer: {
          styleOverrides: {
            paper: {
              backgroundColor: surfaces.base,
              borderRight: `1px solid ${line.panel}`,
            },
          },
        },
        MuiAppBar: {
          styleOverrides: {
            root: {
              backgroundColor: surfaces.base,
              borderBottom: `1px solid ${line.panel}`,
              backgroundImage: 'none',
            },
          },
        },
        MuiTextField: {
          styleOverrides: {
            root: {
              '& .MuiOutlinedInput-root': {
                borderRadius: 8,
                transition: 'all 150ms ease',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: line.input,
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: line.inputHover,
                },
                '&.Mui-focused': {
                  boxShadow: `0 0 0 3px ${glow.ring}`,
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: amber,
                  borderWidth: 1.5,
                },
              },
            },
          },
        },
        MuiAlert: {
          styleOverrides: {
            root: {
              borderRadius: 8,
              fontWeight: 500,
              border: '1px solid',
            },
            standardError: {
              backgroundColor: alpha(semantic.error.main, isLight ? 0.08 : 0.12),
              borderColor: alpha(semantic.error.main, 0.25),
            },
            standardSuccess: {
              backgroundColor: alpha(semantic.success.main, isLight ? 0.08 : 0.12),
              borderColor: alpha(semantic.success.main, 0.25),
            },
            standardInfo: {
              backgroundColor: alpha(semantic.info.main, isLight ? 0.08 : 0.10),
              borderColor: alpha(semantic.info.main, 0.25),
            },
            standardWarning: {
              backgroundColor: alpha(semantic.warning.main, isLight ? 0.08 : 0.10),
              borderColor: alpha(semantic.warning.main, 0.25),
            },
          },
        },
        MuiTabs: {
          styleOverrides: {
            indicator: {
              backgroundColor: amber,
              height: 2,
            },
          },
        },
        MuiTab: {
          styleOverrides: {
            root: {
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              '&.Mui-selected': { color: amber },
            },
          },
        },
        MuiDivider: {
          styleOverrides: {
            root: { borderColor: line.divider },
          },
        },
        MuiSwitch: {
          styleOverrides: {
            switchBase: {
              '&.Mui-checked': {
                color: amber,
                '& + .MuiSwitch-track': {
                  backgroundColor: amber,
                  opacity: isLight ? 0.5 : 0.4,
                },
              },
            },
          },
        },
      },
    },
  });
}

// Stray default imports get the dark theme, which is BaseGeek's default mode.
export default createBaseGeekTheme('dark');
