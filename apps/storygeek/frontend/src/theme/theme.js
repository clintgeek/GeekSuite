import { createTheme, alpha } from '@mui/material';

// --- Arcane Codex Color Tokens ---
const codex = {
  gold:       '#c9a84c',
  goldLight:  '#e0c872',
  goldDark:   '#9a7b2e',
  burgundy:   '#8b2635',
  burgundyLight: '#b03848',
  emerald:    '#2d6a4f',
  crimson:    '#9b2226',
  amber:      '#d4a036',
};

const darkPalette = {
  leather:    '#1a1614',
  wood:       '#2a2420',
  woodLight:  '#352e28',
  woodLighter:'#403830',
  parchment:  '#e8dcc8',
  parchDim:   '#b8a890',
  inkFaint:   '#786a5a',
};

const lightPalette = {
  parchment:   '#f4ece1',
  parchLight:  '#fff8ef',
  parchDark:   '#e8dcc8',
  ink:         '#2c1810',
  inkSecondary:'#5a4636',
  inkFaint:    '#8a7662',
  woodAccent:  '#3d2b1f',
};

// --- Shared Typography ---
const sharedTypography = {
  fontFamily: '"Crimson Pro", "Georgia", serif',
  h1: {
    fontFamily: '"Cinzel Decorative", "Cinzel", serif',
    fontWeight: 700,
    fontSize: '2.25rem',
    letterSpacing: '0.04em',
    lineHeight: 1.2,
  },
  h2: {
    fontFamily: '"Cinzel", serif',
    fontWeight: 600,
    fontSize: '1.625rem',
    letterSpacing: '0.03em',
    lineHeight: 1.3,
  },
  h3: {
    fontFamily: '"Cinzel", serif',
    fontWeight: 600,
    fontSize: '1.375rem',
    letterSpacing: '0.02em',
  },
  h4: {
    fontFamily: '"Cinzel", serif',
    fontWeight: 500,
    fontSize: '1.2rem',
    letterSpacing: '0.02em',
  },
  h5: {
    fontFamily: '"Cinzel", serif',
    fontWeight: 500,
    fontSize: '1.05rem',
    letterSpacing: '0.015em',
  },
  h6: {
    fontFamily: '"Cinzel", serif',
    fontWeight: 500,
    fontSize: '0.925rem',
    letterSpacing: '0.015em',
  },
  body1: {
    fontSize: '1rem',
    lineHeight: 1.7,
    letterSpacing: '0.01em',
  },
  body2: {
    fontSize: '0.875rem',
    lineHeight: 1.6,
  },
  caption: {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '0.75rem',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  overline: {
    fontFamily: '"Cinzel", serif',
    fontSize: '0.7rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  button: {
    fontFamily: '"Cinzel", serif',
    fontWeight: 600,
    fontSize: '0.85rem',
    letterSpacing: '0.06em',
    textTransform: 'none',
  },
};

// --- Shared Component Overrides ---
const sharedComponents = (mode) => {
  const isDark = mode === 'dark';
  const gold = codex.gold;
  const goldAlpha = (a) => alpha(gold, a);
  const bg = isDark ? darkPalette : lightPalette;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: isDark
            ? `radial-gradient(ellipse at 20% 0%, ${alpha(codex.burgundy, 0.08)} 0%, transparent 50%),
               radial-gradient(ellipse at 80% 100%, ${alpha(codex.gold, 0.04)} 0%, transparent 50%)`
            : `radial-gradient(ellipse at 20% 0%, ${alpha(codex.gold, 0.06)} 0%, transparent 50%),
               radial-gradient(ellipse at 80% 100%, ${alpha(codex.burgundy, 0.03)} 0%, transparent 50%)`,
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${goldAlpha(isDark ? 0.15 : 0.2)}`,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 6,
          padding: '8px 20px',
          transition: 'all 0.2s ease',
        },
        contained: {
          background: isDark
            ? `linear-gradient(135deg, ${codex.gold} 0%, ${codex.goldDark} 100%)`
            : `linear-gradient(135deg, ${codex.burgundy} 0%, ${alpha(codex.burgundy, 0.85)} 100%)`,
          color: isDark ? darkPalette.leather : '#fff',
          '&:hover': {
            background: isDark
              ? `linear-gradient(135deg, ${codex.goldLight} 0%, ${codex.gold} 100%)`
              : `linear-gradient(135deg, ${codex.burgundyLight} 0%, ${codex.burgundy} 100%)`,
            transform: 'translateY(-1px)',
            boxShadow: `0 4px 12px ${goldAlpha(0.25)}`,
          },
        },
        outlined: {
          borderColor: goldAlpha(0.35),
          color: isDark ? codex.gold : codex.burgundy,
          '&:hover': {
            borderColor: isDark ? codex.gold : codex.burgundy,
            backgroundColor: goldAlpha(0.06),
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          border: `1px solid ${goldAlpha(isDark ? 0.12 : 0.18)}`,
          backgroundImage: isDark
            ? `linear-gradient(160deg, ${darkPalette.wood} 0%, ${darkPalette.leather} 100%)`
            : 'none',
          boxShadow: isDark
            ? `0 2px 8px ${alpha('#000', 0.3)}, inset 0 1px 0 ${goldAlpha(0.06)}`
            : `0 1px 4px ${alpha('#000', 0.06)}`,
          transition: 'all 0.25s ease',
          '&:hover': {
            borderColor: goldAlpha(isDark ? 0.25 : 0.3),
            boxShadow: isDark
              ? `0 4px 16px ${alpha('#000', 0.4)}, 0 0 0 1px ${goldAlpha(0.1)}`
              : `0 4px 12px ${alpha('#000', 0.08)}`,
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 6,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 6,
            '& fieldset': {
              borderColor: goldAlpha(isDark ? 0.2 : 0.25),
            },
            '&:hover fieldset': {
              borderColor: goldAlpha(isDark ? 0.4 : 0.45),
            },
            '&.Mui-focused fieldset': {
              borderColor: isDark ? codex.gold : codex.burgundy,
              borderWidth: 1.5,
            },
          },
          '& .MuiInputLabel-root.Mui-focused': {
            color: isDark ? codex.gold : codex.burgundy,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.7rem',
          letterSpacing: '0.03em',
          fontWeight: 500,
          borderRadius: 4,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: isDark
            ? `linear-gradient(180deg, ${darkPalette.wood} 0%, ${darkPalette.leather} 100%)`
            : `linear-gradient(180deg, ${lightPalette.parchLight} 0%, ${lightPalette.parchment} 100%)`,
          borderRight: `1px solid ${goldAlpha(0.15)}`,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: `1px solid ${goldAlpha(0.2)}`,
          borderRadius: 8,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: goldAlpha(isDark ? 0.1 : 0.15),
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontFamily: '"Crimson Pro", serif',
          fontSize: '0.8rem',
          backgroundColor: isDark ? darkPalette.woodLight : lightPalette.ink,
          border: `1px solid ${goldAlpha(0.2)}`,
        },
      },
    },
  };
};

// ============== DARK THEME ==============
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: codex.gold,
      light: codex.goldLight,
      dark: codex.goldDark,
      contrastText: darkPalette.leather,
    },
    secondary: {
      main: codex.burgundy,
      light: codex.burgundyLight,
      contrastText: '#fff',
    },
    background: {
      default: darkPalette.leather,
      paper: darkPalette.wood,
    },
    text: {
      primary: darkPalette.parchment,
      secondary: darkPalette.parchDim,
      disabled: darkPalette.inkFaint,
    },
    error: { main: codex.crimson },
    success: { main: codex.emerald },
    warning: { main: codex.amber },
    info: { main: codex.gold },
    divider: alpha(codex.gold, 0.1),
    codex,
  },
  typography: sharedTypography,
  shape: { borderRadius: 6 },
  components: sharedComponents('dark'),
});

// ============== LIGHT THEME ==============
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: codex.burgundy,
      light: codex.burgundyLight,
      dark: '#6d1f2b',
      contrastText: '#fff',
    },
    secondary: {
      main: codex.gold,
      light: codex.goldLight,
      dark: codex.goldDark,
      contrastText: lightPalette.ink,
    },
    background: {
      default: lightPalette.parchment,
      paper: lightPalette.parchLight,
    },
    text: {
      primary: lightPalette.ink,
      secondary: lightPalette.inkSecondary,
      disabled: lightPalette.inkFaint,
    },
    error: { main: codex.crimson },
    success: { main: codex.emerald },
    warning: { main: codex.amber },
    info: { main: codex.goldDark },
    divider: alpha(codex.gold, 0.15),
    codex,
  },
  typography: sharedTypography,
  shape: { borderRadius: 6 },
  components: sharedComponents('light'),
});

export { lightTheme, darkTheme };
export default lightTheme;
