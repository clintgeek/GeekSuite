import { createTheme } from '@mui/material/styles';

/**
 * BaseGeek Theme: "Mission Control"
 *
 * The control room of your digital life.
 * Warm, calm, dark. Not a corporate admin panel —
 * a desk you built yourself, lit by a warm lamp.
 *
 * Palette: warm stone + amber accents (matches StartGeek launcher)
 * Typography: Geist (matches StartGeek launcher for suite consistency)
 * Mood: personal OS, not enterprise SaaS
 */

// Warm stone scale — zero blue cast, amber/brown undertones
// Harmonizes with NoteGeek's ink scale while being distinctly darker
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

// Accent palette — amber warmth, sage green for status, muted red for errors
const accent = {
  amber:     '#e8a849',
  amberSoft: '#d4956a',
  amberGlow: 'rgba(232, 168, 73, 0.12)',
  sage:      '#7dac8e',
  sageSoft:  'rgba(125, 172, 142, 0.12)',
  coral:     '#c76b6b',
  coralSoft: 'rgba(199, 107, 107, 0.12)',
  indigo:    '#a99df0',
  indigoSoft:'rgba(169, 157, 240, 0.10)',
};

const glow = {
  ring:   'rgba(232, 168, 73, 0.20)',
  soft:   'rgba(232, 168, 73, 0.06)',
  medium: 'rgba(232, 168, 73, 0.10)',
  border: 'rgba(232, 168, 73, 0.30)',
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: accent.amber,
      light: '#f0c078',
      dark: '#c48a30',
      contrastText: '#0c0c0f',
    },
    secondary: {
      main: accent.sage,
      light: '#a0c8ae',
      dark: '#5a8c6a',
      contrastText: '#0c0c0f',
    },
    background: {
      default: stone[900],
      paper: stone[850],
    },
    text: {
      primary: '#e4dfd6',
      secondary: '#8a8690',
      disabled: '#52525a',
    },
    divider: 'rgba(255, 255, 255, 0.06)',
    error:   { main: accent.coral,  light: '#e0a0a0', dark: '#a85050' },
    warning: { main: '#d4b06a',     light: '#e8cc90', dark: '#b8903a' },
    success: { main: accent.sage,   light: '#a0c8ae', dark: '#5a8c6a' },
    info:    { main: accent.indigo, light: '#c4bcf5', dark: '#8a7ed0' },
    // Expose custom tokens for components
    stone,
    accent,
    glow,
  },
  typography: {
    fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: {
      fontFamily: '"Geist", sans-serif',
      fontWeight: 700,
      letterSpacing: '-0.03em',
      lineHeight: 1.15,
    },
    h2: {
      fontFamily: '"Geist", sans-serif',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      lineHeight: 1.2,
    },
    h3: {
      fontFamily: '"Geist", sans-serif',
      fontWeight: 600,
      letterSpacing: '-0.015em',
      lineHeight: 1.25,
    },
    h4: {
      fontFamily: '"Geist", sans-serif',
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
      fontWeight: 500,
      fontSize: '0.9375rem',
      lineHeight: 1.5,
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
      color: '#8a8690',
    },
    overline: {
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      fontSize: '0.6875rem',
      fontFamily: '"Geist Mono", monospace',
    },
  },
  shape: {
    borderRadius: 10,
  },
  shadows: [
    'none',
    '0 1px 2px rgba(0, 0, 0, 0.3)',
    '0 2px 4px rgba(0, 0, 0, 0.3)',
    '0 4px 8px rgba(0, 0, 0, 0.35)',
    '0 8px 16px rgba(0, 0, 0, 0.4)',
    '0 12px 24px rgba(0, 0, 0, 0.45)',
    '0 16px 32px rgba(0, 0, 0, 0.5)',
    ...Array(18).fill('0 16px 32px rgba(0, 0, 0, 0.5)'),
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': {
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        '::selection': {
          backgroundColor: 'rgba(232, 168, 73, 0.25)',
          color: 'inherit',
        },
        'input, textarea, [contenteditable]': {
          caretColor: `${accent.amber} !important`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 18px',
          transition: 'all 150ms ease',
          fontSize: '0.8125rem',
          minHeight: 36,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        outlined: {
          borderColor: stone[600],
          '&:hover': {
            borderColor: accent.amber,
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
          border: `1px solid ${stone[700]}`,
        },
        elevation0: { boxShadow: 'none' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: `1px solid ${stone[700]}`,
          backgroundImage: 'none',
          transition: 'all 150ms ease',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 14,
          border: `1px solid ${stone[600]}`,
          backgroundColor: stone[800],
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 6,
          fontWeight: 500,
          fontSize: '0.75rem',
          padding: '6px 12px',
          backgroundColor: stone[600],
          color: '#e4dfd6',
          border: `1px solid ${stone[500]}`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
          fontSize: '0.6875rem',
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
            borderLeft: `2px solid ${accent.amber}`,
            paddingLeft: 10,
            '&:hover': {
              backgroundColor: glow.medium,
            },
          },
          '&:hover': {
            backgroundColor: `rgba(255, 255, 255, 0.04)`,
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: stone[900],
          borderRight: `1px solid ${stone[700]}`,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: stone[900],
          borderBottom: `1px solid ${stone[700]}`,
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
              borderColor: stone[600],
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: stone[400],
            },
            '&.Mui-focused': {
              boxShadow: `0 0 0 3px ${glow.ring}`,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: accent.amber,
              borderWidth: 1.5,
            },
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 500,
          border: '1px solid',
        },
        standardError: {
          backgroundColor: accent.coralSoft,
          borderColor: 'rgba(199, 107, 107, 0.25)',
        },
        standardSuccess: {
          backgroundColor: accent.sageSoft,
          borderColor: 'rgba(125, 172, 142, 0.25)',
        },
        standardInfo: {
          backgroundColor: accent.indigoSoft,
          borderColor: 'rgba(169, 157, 240, 0.25)',
        },
        standardWarning: {
          backgroundColor: 'rgba(212, 176, 106, 0.10)',
          borderColor: 'rgba(212, 176, 106, 0.25)',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: accent.amber,
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
          '&.Mui-selected': {
            color: accent.amber,
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255, 255, 255, 0.06)',
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: accent.amber,
            '& + .MuiSwitch-track': {
              backgroundColor: accent.amber,
              opacity: 0.4,
            },
          },
        },
      },
    },
  },
});

export default theme;