import { createTheme } from '@mui/material/styles';

// ─── Design Tokens ───────────────────────────────────────────────
export const tokens = {
  radius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  shadow: {
    light: {
      sm: '0 1px 2px rgba(28, 25, 23, 0.06)',
      md: '0 2px 8px rgba(28, 25, 23, 0.08)',
      lg: '0 4px 16px rgba(28, 25, 23, 0.10)',
      xl: '0 8px 32px rgba(28, 25, 23, 0.12)',
    },
    dark: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.2)',
      md: '0 2px 8px rgba(0, 0, 0, 0.3)',
      lg: '0 4px 16px rgba(0, 0, 0, 0.4)',
      xl: '0 8px 32px rgba(0, 0, 0, 0.5)',
    },
  },
  font: {
    display: '"DM Serif Display", Georgia, "Times New Roman", serif',
    body: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  },
};

// ─── Light Palette ───────────────────────────────────────────────
const lightColors = {
  primary: {
    main: '#0D9488',     // Teal 600
    light: '#14B8A6',    // Teal 500
    dark: '#0F766E',     // Teal 700
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#78716C',     // Stone 500
    light: '#A8A29E',    // Stone 400
    dark: '#57534E',     // Stone 600
    contrastText: '#FFFFFF',
  },
  background: {
    default: '#FAFAF9',  // Stone 50
    paper: '#FFFFFF',
  },
  text: {
    primary: '#1C1917',  // Stone 900
    secondary: '#78716C', // Stone 500
  },
  success: {
    main: '#059669',     // Emerald 600
    light: '#10B981',
    dark: '#047857',
  },
  warning: {
    main: '#F59E0B',     // Amber 500
    light: '#FBBF24',
    dark: '#D97706',
  },
  error: {
    main: '#DC2626',     // Red 600
    light: '#EF4444',
    dark: '#B91C1C',
  },
  info: {
    main: '#0284C7',     // Sky 600
    light: '#0EA5E9',
    dark: '#0369A1',
  },
  divider: '#E7E5E4',   // Stone 200
};

// ─── Dark Palette ────────────────────────────────────────────────
const darkColors = {
  primary: {
    main: '#2DD4BF',     // Teal 400 — brighter for dark
    light: '#5EEAD4',    // Teal 300
    dark: '#14B8A6',     // Teal 500
    contrastText: '#1C1917',
  },
  secondary: {
    main: '#A8A29E',     // Stone 400
    light: '#D6D3D1',    // Stone 300
    dark: '#78716C',     // Stone 500
    contrastText: '#1C1917',
  },
  background: {
    default: '#1C1917',  // Stone 900
    paper: '#292524',    // Stone 800
  },
  text: {
    primary: '#F5F5F4',  // Stone 100
    secondary: '#A8A29E', // Stone 400
  },
  success: {
    main: '#34D399',
    light: '#6EE7B7',
    dark: '#10B981',
  },
  warning: {
    main: '#FBBF24',
    light: '#FCD34D',
    dark: '#F59E0B',
  },
  error: {
    main: '#F87171',
    light: '#FCA5A5',
    dark: '#EF4444',
  },
  info: {
    main: '#38BDF8',
    light: '#7DD3FC',
    dark: '#0EA5E9',
  },
  divider: '#44403C',   // Stone 700
};

// ─── Typography ──────────────────────────────────────────────────
const typography = {
  fontFamily: tokens.font.body,
  h1: {
    fontFamily: tokens.font.display,
    fontSize: '2.5rem',
    fontWeight: 400,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
  },
  h2: {
    fontFamily: tokens.font.display,
    fontSize: '2rem',
    fontWeight: 400,
    letterSpacing: '-0.005em',
    lineHeight: 1.3,
  },
  h3: {
    fontFamily: tokens.font.display,
    fontSize: '1.5rem',
    fontWeight: 400,
    lineHeight: 1.35,
  },
  h4: {
    fontFamily: tokens.font.body,
    fontSize: '1.25rem',
    fontWeight: 600,
    lineHeight: 1.4,
  },
  h5: {
    fontFamily: tokens.font.body,
    fontSize: '1.125rem',
    fontWeight: 600,
    lineHeight: 1.4,
  },
  h6: {
    fontFamily: tokens.font.body,
    fontSize: '1rem',
    fontWeight: 600,
    lineHeight: 1.4,
  },
  body1: {
    fontSize: '0.9375rem',
    fontWeight: 400,
    lineHeight: 1.6,
  },
  body2: {
    fontSize: '0.875rem',
    fontWeight: 400,
    lineHeight: 1.55,
  },
  subtitle1: {
    fontSize: '1rem',
    fontWeight: 600,
  },
  subtitle2: {
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  caption: {
    fontSize: '0.75rem',
    fontWeight: 500,
    letterSpacing: '0.04em',
    lineHeight: 1.4,
  },
  overline: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  button: {
    fontFamily: tokens.font.body,
    fontSize: '0.875rem',
    fontWeight: 600,
    textTransform: 'none',
    letterSpacing: '0.01em',
  },
};

// ─── Component Overrides ─────────────────────────────────────────
const getComponents = (mode) => {
  const isDark = mode === 'dark';
  const shadow = isDark ? tokens.shadow.dark : tokens.shadow.light;
  const colors = isDark ? darkColors : lightColors;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: colors.background.default,
          transition: 'background-color 0.2s ease',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: colors.background.paper,
          boxShadow: shadow.sm,
          borderBottom: `1px solid ${colors.divider}`,
          borderRadius: 0,
          color: colors.text.primary,
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm,
          boxShadow: shadow.md,
          backgroundColor: colors.background.paper,
          border: `1px solid ${colors.divider}`,
          transition: 'box-shadow 0.2s ease, background-color 0.2s ease',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.md,
          padding: '10px 24px',
          fontWeight: 600,
          textTransform: 'none',
          minWidth: '44px',
          minHeight: '44px',
          transition: 'all 0.15s ease',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: shadow.sm,
          },
        },
        containedPrimary: {
          backgroundColor: isDark ? '#2DD4BF' : '#0D9488',
          color: isDark ? '#1C1917' : '#FFFFFF',
          '&:hover': {
            backgroundColor: isDark ? '#14B8A6' : '#0F766E',
          },
        },
        outlined: {
          borderColor: colors.divider,
          '&:hover': {
            borderColor: isDark ? '#2DD4BF' : '#0D9488',
            backgroundColor: isDark ? 'rgba(45, 212, 191, 0.08)' : 'rgba(13, 148, 136, 0.06)',
          },
        },
        sizeSmall: {
          padding: '6px 16px',
          minHeight: '36px',
          fontSize: '0.8125rem',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: tokens.radius.sm,
            transition: 'all 0.15s ease',
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'transparent',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: isDark ? '#2DD4BF' : '#0D9488',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: isDark ? '#2DD4BF' : '#0D9488',
              borderWidth: 2,
            },
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: colors.divider,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: colors.text.secondary,
          '&.Mui-focused': {
            color: isDark ? '#2DD4BF' : '#0D9488',
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
          borderRadius: tokens.radius.sm,
          boxShadow: shadow.md,
          backgroundColor: colors.background.paper,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.pill,
          fontWeight: 600,
          fontSize: '0.8125rem',
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
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          transition: 'all 0.15s ease',
          '&.Mui-selected': {
            backgroundColor: 'rgba(255,255,255,0.08)',
            color: 'white',
            '&:hover': {
              backgroundColor: 'rgba(255,255,255,0.12)',
            },
          },
          '&:hover': {
            backgroundColor: 'rgba(255,255,255,0.05)',
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.xs,
          margin: '2px 4px',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: tokens.radius.md,
          backgroundColor: colors.background.paper,
          border: `1px solid ${colors.divider}`,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: colors.divider,
          fontSize: '0.875rem',
        },
        head: {
          fontWeight: 600,
          fontSize: '0.75rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: colors.text.secondary,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.pill,
          height: 6,
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          '& .MuiSwitch-switchBase.Mui-checked': {
            color: isDark ? '#2DD4BF' : '#0D9488',
          },
          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
            backgroundColor: isDark ? '#2DD4BF' : '#0D9488',
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.875rem',
          minHeight: 44,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderColor: colors.divider,
          '&.Mui-selected': {
            backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(13, 148, 136, 0.1)',
            color: isDark ? '#2DD4BF' : '#0D9488',
            borderColor: isDark ? '#2DD4BF' : '#0D9488',
            '&:hover': {
              backgroundColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(13, 148, 136, 0.15)',
            },
          },
        },
      },
    },
  };
};

// ─── Theme Factory ───────────────────────────────────────────────
export const createAppTheme = (mode = 'light') => {
  const colors = mode === 'dark' ? darkColors : lightColors;

  return createTheme({
    palette: {
      mode,
      primary: colors.primary,
      secondary: colors.secondary,
      background: colors.background,
      text: colors.text,
      success: colors.success,
      warning: colors.warning,
      error: colors.error,
      info: colors.info,
      divider: colors.divider,
    },
    typography,
    components: getComponents(mode),
    shape: {
      borderRadius: tokens.radius.sm,
    },
    spacing: 8,
  });
};

export const theme = createAppTheme('light');

export default theme;