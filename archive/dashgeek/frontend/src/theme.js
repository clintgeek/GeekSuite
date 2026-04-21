import { createTheme } from '@mui/material/styles';

/**
 * DashGeek Theme: "Ledger"
 *
 * A data-forward control surface for someone using the whole suite.
 * Quiet chrome, expressive data. The dashboard itself stays neutral
 * (warm off-white in light mode, warm-black in dark) so the real
 * signal — numbers, activity, domain identity — can carry color.
 *
 * Typography splits like notegeek does: Geist for prose / structure
 * (section titles, body), JetBrains Mono for every metric, timestamp,
 * and metadata pill. Numbers are stamped, not typed.
 *
 * The five suite apps each get a domain color pulled from their own
 * theme (oxblood / GeekSuite blue / gold-brown / teal / forest green)
 * that dashgeek uses as a 3px left-border accent on any card or row
 * carrying that app's data. This is how the eye learns "that's my
 * bujo stuff" at a glance without any label.
 *
 * See apps/dashgeek/PLAN.md for the full direction.
 */
export function createAppTheme(mode) {
  const isLight = mode === 'light';

  const surfaces = isLight
    ? { default: '#F9F8F6', paper: '#FFFFFF', elevated: '#FDFCFA' }
    : { default: '#16140F', paper: '#1F1C16', elevated: '#27231A' };

  const text = isLight
    ? { primary: '#1F1C16', secondary: '#6B6258', disabled: '#A8A09A' }
    : { primary: '#EDE6D6', secondary: '#998F80', disabled: '#5C544A' };

  const divider = isLight ? '#E5DDD0' : '#2D2A24';
  const border = isLight ? '#D8D0BD' : '#3A352D';

  // Primary accent is QUIET ink-slate — chrome, focus, active states
  // only. Dashgeek doesn't "own" a bright accent; the five domain
  // colors do the expressive work.
  const accent = isLight
    ? { main: '#2D3138', light: '#5A6070', dark: '#181B20' }
    : { main: '#C8CDD4', light: '#E4E7EB', dark: '#9AA0A8' };

  const glow = isLight
    ? {
        ring:   'rgba(45, 49, 56, 0.18)',
        soft:   'rgba(45, 49, 56, 0.04)',
        medium: 'rgba(45, 49, 56, 0.08)',
        border: 'rgba(45, 49, 56, 0.28)',
      }
    : {
        ring:   'rgba(200, 205, 212, 0.22)',
        soft:   'rgba(200, 205, 212, 0.06)',
        medium: 'rgba(200, 205, 212, 0.12)',
        border: 'rgba(200, 205, 212, 0.30)',
      };

  // Semantic — muted, editorial, never alarmist. Shared with notegeek
  // so error-oxblood / success-moss / warning-ochre / info-teal are
  // a cross-suite vocabulary.
  const semantic = isLight
    ? { success: '#5B7A4A', warning: '#A8782F', error: '#8B2C2A', info: '#3D6B7A' }
    : { success: '#7DA869', warning: '#D4A05A', error: '#C97570', info: '#7AA4B0' };

  // Domain colors — each app's provenance. Use as 3px left-border on
  // any card/row carrying that app's data, as 6px dot prefix on
  // activity-feed rows, and as the fill color for domain sparklines.
  // Never as card background; always as accent.
  const domains = isLight
    ? {
        notegeek:    '#8B2C2A',  // oxblood (notegeek primary)
        bujogeek:    '#6098CC',  // GeekSuite blue (bujogeek primary)
        bookgeek:    '#8C7240',  // warm gold-brown
        fitnessgeek: '#0D9488',  // teal (fitnessgeek primary)
        flockgeek:   '#3D6B4F',  // forest green (flockgeek secondary)
      }
    : {
        notegeek:    '#C97570',
        bujogeek:    '#9FC9E9',
        bookgeek:    '#D4A066',
        fitnessgeek: '#2DD4BF',
        flockgeek:   '#6B9A7D',
      };

  const sansStack =
    '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const monoStack =
    '"JetBrains Mono", "Geist Mono", ui-monospace, "SFMono-Regular", monospace';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: accent.main,
        light: accent.light,
        dark: accent.dark,
        contrastText: surfaces.paper,
      },
      secondary: {
        main: text.secondary,
        light: text.disabled,
        dark: text.primary,
        contrastText: surfaces.paper,
      },
      background: {
        default: surfaces.default,
        paper: surfaces.paper,
      },
      text: {
        primary: text.primary,
        secondary: text.secondary,
        disabled: text.disabled,
      },
      divider,
      error:   { main: semantic.error,   light: accent.light,  dark: accent.dark },
      warning: { main: semantic.warning, light: '#D4A05A',     dark: '#7A5520' },
      success: { main: semantic.success, light: '#7DA869',     dark: '#3D5230' },
      info:    { main: semantic.info,    light: '#7AA4B0',     dark: '#264755' },

      // Custom slots for dashgeek surfaces + data.
      surfaces,
      border,
      glow,
      domains,
    },

    typography: {
      fontFamily: sansStack,
      fontFamilyMono: monoStack,

      h1: { fontFamily: sansStack, fontWeight: 700, fontSize: '2rem',     letterSpacing: '-0.025em', lineHeight: 1.15 },
      h2: { fontFamily: sansStack, fontWeight: 700, fontSize: '1.5rem',   letterSpacing: '-0.02em',  lineHeight: 1.2 },
      h3: { fontFamily: sansStack, fontWeight: 600, fontSize: '1.125rem', letterSpacing: '-0.01em',  lineHeight: 1.3 },
      h4: { fontFamily: sansStack, fontWeight: 600, fontSize: '0.9375rem',lineHeight: 1.35 },
      h5: { fontFamily: sansStack, fontWeight: 500, fontSize: '0.875rem', lineHeight: 1.4 },
      // h6 = mono caps section header. Widget titles, panel headings,
      // "DEPT" labels. Lean into it.
      h6: {
        fontFamily: monoStack,
        fontWeight: 600,
        fontSize: '0.6875rem',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        lineHeight: 1,
      },
      subtitle1: { fontFamily: sansStack, fontWeight: 500, fontSize: '0.875rem', lineHeight: 1.5 },
      subtitle2: {
        fontFamily: monoStack,
        fontWeight: 600,
        fontSize: '0.6875rem',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      },
      body1:  { fontFamily: sansStack, fontWeight: 400, fontSize: '0.9375rem', lineHeight: 1.6 },
      body2:  { fontFamily: sansStack, fontWeight: 400, fontSize: '0.8125rem', lineHeight: 1.55 },
      button: {
        fontFamily: sansStack,
        fontWeight: 600,
        fontSize: '0.8125rem',
        textTransform: 'none',
        letterSpacing: '0.005em',
      },
      // Caption is mono — every timestamp, count, tag, ratio, weight,
      // calorie value, egg count, byte count renders through this.
      // Most important typographic rule in the dashboard.
      caption: {
        fontFamily: monoStack,
        fontWeight: 500,
        fontSize: '0.75rem',
        color: text.secondary,
      },
      overline: {
        fontFamily: monoStack,
        fontWeight: 600,
        fontSize: '0.6875rem',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
      },
    },

    shape: { borderRadius: 8 },

    // Near-zero elevation. The design earns definition through
    // domain-color left-borders + 1px hairline, not shadow depth.
    shadows: [
      'none',
      isLight ? '0 1px 2px rgba(31, 28, 22, 0.06)' : '0 1px 2px rgba(0, 0, 0, 0.30)',
      isLight ? '0 2px 4px rgba(31, 28, 22, 0.08)' : '0 2px 4px rgba(0, 0, 0, 0.35)',
      isLight ? '0 4px 8px rgba(31, 28, 22, 0.10)' : '0 4px 8px rgba(0, 0, 0, 0.40)',
      isLight ? '0 8px 16px rgba(31, 28, 22, 0.12)': '0 8px 16px rgba(0, 0, 0, 0.45)',
      isLight ? '0 12px 24px rgba(31, 28, 22, 0.14)':'0 12px 24px rgba(0, 0, 0, 0.50)',
      ...Array(19).fill(isLight
        ? '0 12px 24px rgba(31, 28, 22, 0.14)'
        : '0 12px 24px rgba(0, 0, 0, 0.50)'),
    ],

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*, *::before, *::after': {
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          },
          '::selection': {
            backgroundColor: glow.medium,
            color: 'inherit',
          },
          'input, textarea, [contenteditable]': {
            caretColor: `${accent.main} !important`,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${border}`,
            backgroundColor: surfaces.paper,
          },
          elevation0: { boxShadow: 'none' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            border: `1px solid ${border}`,
            backgroundImage: 'none',
            backgroundColor: surfaces.paper,
            transition: 'border-color 120ms ease, box-shadow 150ms ease',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            padding: '6px 14px',
            transition: 'all 120ms ease',
            fontSize: '0.8125rem',
            minHeight: 34,
            textTransform: 'none',
          },
          sizeSmall: { padding: '4px 10px', fontSize: '0.75rem', minHeight: 28 },
          contained: {
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
          },
          outlined: {
            borderWidth: 1,
            borderColor: border,
            '&:hover': {
              borderWidth: 1,
              borderColor: accent.main,
              backgroundColor: glow.soft,
            },
            '&:focus-visible': {
              boxShadow: `0 0 0 3px ${glow.ring}`,
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 10,
            border: `1px solid ${border}`,
            backgroundColor: surfaces.paper,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 4,
            fontFamily: monoStack,
            fontWeight: 500,
            fontSize: '0.6875rem',
            letterSpacing: '0.04em',
            padding: '5px 10px',
            backgroundColor: text.primary,
            color: surfaces.paper,
          },
          arrow: { color: text.primary },
        },
      },
      // Chips = ink-stamps. 4px corners, mono, hairline border.
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            fontFamily: monoStack,
            fontWeight: 500,
            fontSize: '0.6875rem',
            height: 22,
            border: `1px solid ${border}`,
            backgroundColor: 'transparent',
          },
          label: { paddingLeft: 8, paddingRight: 8 },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 6,
              transition: 'all 120ms ease',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: border },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: text.disabled },
              '&.Mui-focused': { boxShadow: `0 0 0 3px ${glow.ring}` },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: accent.main,
                borderWidth: 1.5,
              },
            },
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: divider },
        },
      },
      MuiSkeleton: {
        styleOverrides: {
          root: { backgroundColor: glow.soft },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            backgroundColor: glow.soft,
            height: 3,
            borderRadius: 2,
          },
          bar: {
            backgroundColor: accent.main,
            borderRadius: 2,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            fontWeight: 500,
            border: '1px solid',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { backgroundColor: accent.main, height: 2 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.8125rem',
            '&.Mui-selected': { color: accent.main },
          },
        },
      },
    },
  });
}

// Back-compat export so existing `import theme from './theme'` call
// sites keep working during the transition. The live theme comes
// from `createAppTheme(mode)` inside the ThemeProvider wrapper; this
// default exports the dark variant for any static imports.
export const tokens = {
  // Preserved legacy token names that existing components may still
  // reference. Map to the new Ledger values so nothing breaks
  // mid-migration; the component agent will remove these as it
  // restyles each widget.
  ink: '#16140F',
  bone: '#EDE6D6',
  boneDim: 'rgba(237, 230, 214, 0.72)',
  boneFaint: 'rgba(237, 230, 214, 0.38)',
  boneGhost: 'rgba(237, 230, 214, 0.12)',
  rule: 'rgba(237, 230, 214, 0.10)',
  ruleStrong: 'rgba(237, 230, 214, 0.18)',
  brass: '#C8CDD4',         // redirected to the new primary accent
  brassBright: '#E4E7EB',
  brassDeep: '#9AA0A8',
  oxblood: '#C97570',
  patina: '#7DA869',
  fontDisplay: '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
  fontItalic: '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
  fontMono: '"JetBrains Mono", "Geist Mono", ui-monospace, monospace',
};

export const theme = createAppTheme('dark');

export default theme;
