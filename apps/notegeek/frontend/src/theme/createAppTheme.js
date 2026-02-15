import { createTheme } from '@mui/material/styles';

/**
 * NoteGeek Theme: "Thinking Workbench"
 * Warm, calm, tactile. A notebook under warm light.
 * Warm neutral palette with desaturated indigo accent.
 * Not a SaaS dashboard. A desk you sit back down at.
 */
export function createAppTheme(mode) {
  const isLight = mode === 'light';

  // Warm neutral ink scale — stone tones, zero blue cast
  // Every gray has a slight amber/brown undertone.
  // Think: paper, charcoal, graphite — real materials, not LCD subpixels.
  const ink = {
    black:    '#1C1917',
    charcoal: '#1C1917',
    graphite: '#44403C',
    slate:    '#78716C',
    silver:   '#A8A29E',
    mist:     '#D6D3D1',
    fog:      isLight ? '#E7E5E4' : '#373432',
    surface:  isLight ? '#F7F5F2' : '#23211F',
    paper:    isLight ? '#FDFCFA' : '#2C2A27',
    base:     isLight ? '#F0EEEB' : '#1C1917',
  };

  // Desaturated accents — ink on warm paper, not neon on glass
  const accent = {
    indigo: isLight ? '#5B50A8' : '#A99DF0',
    coral:  isLight ? '#B87341' : '#D4A47A',
    sage:   isLight ? '#4A8C6F' : '#7DB99A',
  };

  // Thinking glow — soft indigo at low opacity for focus states
  const glow = {
    ring:   isLight ? 'rgba(91, 80, 168, 0.14)' : 'rgba(169, 157, 240, 0.16)',
    soft:   isLight ? 'rgba(91, 80, 168, 0.04)' : 'rgba(169, 157, 240, 0.05)',
    medium: isLight ? 'rgba(91, 80, 168, 0.08)' : 'rgba(169, 157, 240, 0.09)',
    border: isLight ? 'rgba(91, 80, 168, 0.28)' : 'rgba(169, 157, 240, 0.32)',
  };

  return createTheme({
    palette: {
      mode,
      primary: {
        main: accent.indigo,
        light: isLight ? '#7B6FC5' : '#BDB4F5',
        dark: isLight ? '#463C8A' : '#8A7ED0',
        contrastText: '#FFFFFF',
      },
      secondary: {
        main: accent.coral,
        light: isLight ? '#D4A47A' : '#E4BFA0',
        dark: isLight ? '#955D33' : '#B87341',
        contrastText: '#FFFFFF',
      },
      background: {
        default: ink.base,
        paper: ink.paper,
      },
      text: {
        primary: isLight ? ink.black : '#E8E4DF',
        secondary: isLight ? ink.slate : '#A8A29E',
        disabled: isLight ? ink.silver : '#78716C',
      },
      divider: ink.fog,
      error:   { main: '#C4413A', light: '#E5A19B', dark: '#A33529' },
      warning: { main: '#B8862F', light: '#E4C37A', dark: '#96682A' },
      success: { main: '#4A8C6F', light: '#8DC4A8', dark: '#3A7058' },
      info:    { main: '#3D8493', light: '#8BC4CE', dark: '#2E6A77' },
      brand: {
        note: isLight ? ink.black : '#E8E4DF',
        geek: accent.indigo,
      },
      // Note type colors — earthy and muted, like colored ink not neon markers
      noteTypes: {
        text:        isLight ? '#5B50A8' : '#A99DF0',
        markdown:    isLight ? '#7B5DAE' : '#B89BD8',
        code:        isLight ? '#4A8C6F' : '#7DB99A',
        mindmap:     isLight ? '#3D8493' : '#6DB5C0',
        handwritten: isLight ? '#A85C73' : '#D49AAE',
      },
      ink,
      accent,
      glow,
    },
    typography: {
      fontFamily: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      h1: {
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        fontWeight: 800,
        letterSpacing: '-0.025em',
        lineHeight: 1.15,
      },
      h2: {
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1.2,
      },
      h3: {
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        fontWeight: 700,
        letterSpacing: '-0.015em',
        lineHeight: 1.25,
      },
      h4: {
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        fontWeight: 600,
        letterSpacing: '-0.01em',
        lineHeight: 1.3,
      },
      h5: {
        fontWeight: 600,
        letterSpacing: '-0.005em',
        lineHeight: 1.35,
      },
      h6: {
        fontWeight: 600,
        lineHeight: 1.4,
      },
      subtitle1: {
        fontWeight: 600,
        fontSize: '0.9375rem',
        lineHeight: 1.4,
      },
      subtitle2: {
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        fontSize: '0.6875rem',
      },
      body1: {
        lineHeight: 1.65,
        fontSize: '0.9375rem',
      },
      body2: {
        lineHeight: 1.6,
        fontSize: '0.8125rem',
      },
      button: {
        fontWeight: 600,
        textTransform: 'none',
        fontSize: '0.8125rem',
      },
      caption: {
        fontWeight: 500,
        fontSize: '0.75rem',
        color: isLight ? ink.slate : '#A8A29E',
      },
      overline: {
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontSize: '0.6875rem',
      },
    },
    shape: {
      borderRadius: 8,
    },
    shadows: [
      'none',
      isLight
        ? '0 1px 2px rgba(28, 25, 23, 0.05)'
        : '0 1px 2px rgba(0, 0, 0, 0.25)',
      isLight
        ? '0 1px 3px rgba(28, 25, 23, 0.07), 0 2px 6px rgba(28, 25, 23, 0.04)'
        : '0 2px 4px rgba(0, 0, 0, 0.25)',
      isLight
        ? '0 2px 8px rgba(28, 25, 23, 0.08)'
        : '0 4px 8px rgba(0, 0, 0, 0.3)',
      isLight
        ? '0 4px 16px rgba(28, 25, 23, 0.1)'
        : '0 8px 16px rgba(0, 0, 0, 0.35)',
      isLight
        ? '0 8px 24px rgba(28, 25, 23, 0.12)'
        : '0 12px 24px rgba(0, 0, 0, 0.45)',
      isLight
        ? '0 12px 32px rgba(28, 25, 23, 0.14)'
        : '0 16px 32px rgba(0, 0, 0, 0.5)',
      ...Array(18).fill(isLight
        ? '0 12px 32px rgba(28, 25, 23, 0.14)'
        : '0 16px 32px rgba(0, 0, 0, 0.5)'),
    ],
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*, *::before, *::after': {
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          },
          '::selection': {
            backgroundColor: glow.ring,
            color: 'inherit',
          },
          'input, textarea, [contenteditable]': {
            caretColor: `${accent.indigo} !important`,
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
          },
          sizeSmall: {
            padding: '4px 10px',
            fontSize: '0.75rem',
            minHeight: 28,
          },
          contained: {
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
          },
          outlined: {
            borderWidth: 1,
            '&:hover': {
              borderWidth: 1,
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
            border: `1px solid ${ink.fog}`,
          },
          elevation0: { boxShadow: 'none' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            transition: 'all 120ms ease',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            border: `1px solid ${ink.fog}`,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 6,
            fontWeight: 500,
            fontSize: '0.75rem',
            padding: '4px 10px',
            backgroundColor: isLight ? ink.black : '#E8E4DF',
            color: isLight ? '#E8E4DF' : ink.black,
          },
          arrow: {
            color: isLight ? ink.black : '#E8E4DF',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            fontWeight: 500,
            fontSize: '0.6875rem',
            height: 22,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            margin: '1px 4px',
            padding: '4px 8px',
            transition: 'all 100ms ease',
            '&.Mui-selected': {
              backgroundColor: glow.soft,
              borderLeft: `2px solid ${accent.indigo}`,
              paddingLeft: 6,
              '&:hover': {
                backgroundColor: glow.medium,
              },
            },
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: `1px solid ${ink.fog}`,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: isLight ? ink.paper : ink.surface,
            borderBottom: `1px solid ${ink.fog}`,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 6,
              transition: 'all 120ms ease',
              '&.Mui-focused': {
                boxShadow: `0 0 0 3px ${glow.ring}`,
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: accent.indigo,
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
          },
        },
      },
    },
  });
}
