import { createTheme } from '@mui/material';
import { colors, darkColors, lightColors } from './colors';

const getComponents = (mode) => {
  const isDark = mode === 'dark';
  const surface = isDark ? darkColors : lightColors;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: surface.background.default,
          color: surface.text.primary,
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: isDark ? colors.ink[700] : colors.ink[300],
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: 'transparent',
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
          height: 56,
          backgroundColor: isDark ? surface.background.paper : colors.parchment.paper,
          borderBottom: `1px solid ${surface.divider}`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
          padding: '8px 16px',
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'translateY(-1px)',
          },
        },
        contained: {
          boxShadow: isDark ? `0 1px 2px ${colors.ink[900]}80` : `0 1px 2px ${colors.ink[300]}`,
          '&:hover': {
            boxShadow: isDark ? `0 8px 24px ${colors.ink[900]}80` : `0 4px 8px ${colors.ink[300]}`,
          },
        },
        outlined: {
          borderColor: isDark ? colors.ink[700] : colors.ink[300],
          '&:hover': {
            borderColor: colors.primary[500],
            backgroundColor: isDark ? colors.ink[800] : colors.primary[50],
          },
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: `1px solid ${isDark ? colors.ink[800] : colors.ink[200]}`,
          boxShadow: isDark ? `0 10px 30px ${colors.ink[900]}80` : `0 1px 3px ${colors.ink[200]}`,
          transition: 'all 0.2s ease',
          backgroundColor: surface.background.paper,
          '&:hover': {
            boxShadow: isDark ? `0 18px 48px ${colors.ink[900]}90` : `0 4px 12px ${colors.ink[300]}`,
            borderColor: isDark ? colors.ink[700] : colors.ink[300],
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: surface.background.paper,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.primary[400],
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.primary[500],
              borderWidth: 2,
            },
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: isDark ? colors.ink[700] : colors.ink[300],
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          width: 260,
          backgroundColor: surface.background.paper,
          borderRight: `1px solid ${surface.divider}`,
          boxShadow: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          fontSize: '0.75rem',
          height: 24,
          backgroundColor: isDark ? colors.ink[800] : colors.ink[100],
          color: isDark ? colors.ink[100] : colors.ink[700],
          border: `1px solid ${isDark ? colors.ink[700] : colors.ink[200]}`,
          '&:hover': {
            backgroundColor: isDark ? colors.ink[700] : colors.ink[200],
          },
        },
        deleteIcon: {
          color: isDark ? colors.ink[400] : colors.ink[400],
          '&:hover': {
            color: isDark ? colors.ink[200] : colors.ink[600],
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'all 0.15s ease',
          '&:hover': {
            backgroundColor: isDark ? colors.ink[800] : colors.ink[100],
          },
        },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          height: 64,
          backgroundColor: surface.background.paper,
          borderTop: `1px solid ${surface.divider}`,
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          color: isDark ? colors.ink[400] : colors.ink[500],
          minWidth: 'auto',
          padding: '6px 12px',
          '&.Mui-selected': {
            color: colors.primary[500],
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: '0.7rem',
            '&.Mui-selected': {
              fontSize: '0.7rem',
            },
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
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          boxShadow: isDark ? `0 24px 48px ${colors.ink[900]}90` : `0 24px 48px ${colors.ink[400]}40`,
          backgroundColor: surface.background.paper,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontFamily: '"Fraunces", Georgia, serif',
          fontSize: '1.25rem',
          fontWeight: 500,
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&:hover': {
            backgroundColor: isDark ? colors.ink[800] : colors.ink[100],
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&:hover': {
            backgroundColor: isDark ? colors.ink[800] : colors.ink[100],
          },
          '&.Mui-selected': {
            backgroundColor: isDark ? colors.ink[800] : colors.primary[50],
            '&:hover': {
              backgroundColor: isDark ? colors.ink[700] : colors.primary[100],
            },
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: isDark ? colors.ink[700] : colors.ink[800],
          fontSize: '0.75rem',
          fontWeight: 500,
          borderRadius: 6,
          padding: '6px 12px',
        },
      },
    },
  };
};

export const createAppTheme = (mode = 'light') => {
  const isDark = mode === 'dark';
  const surface = isDark ? darkColors : lightColors;

  return createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? colors.primary[400] : colors.primary[500],
        light: colors.primary[300],
        dark: colors.primary[700],
        contrastText: isDark ? colors.ink[900] : '#FFFFFF',
      },
      secondary: {
        main: colors.primary[600],
        light: colors.primary[400],
        dark: colors.primary[800],
        contrastText: '#FFFFFF',
      },
      background: {
        default: surface.background.default,
        paper: surface.background.paper,
      },
      error: {
        main: colors.status.error,
        light: colors.status.errorBg,
      },
      success: {
        main: colors.status.success,
        light: colors.status.successBg,
      },
      warning: {
        main: colors.status.warning,
        light: colors.status.warningBg,
      },
      info: {
        main: colors.status.info,
        light: colors.status.infoBg,
      },
      text: {
        primary: surface.text.primary,
        secondary: surface.text.secondary,
        disabled: surface.text.disabled,
      },
      divider: surface.divider,
    },
    typography: {
      fontFamily: '"Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      h1: {
        fontFamily: '"Fraunces", Georgia, serif',
        fontSize: '2.25rem',
        fontWeight: 500,
        letterSpacing: '-0.02em',
        fontOpticalSizing: 'auto',
      },
      h2: {
        fontFamily: '"Fraunces", Georgia, serif',
        fontSize: '1.75rem',
        fontWeight: 500,
        letterSpacing: '-0.02em',
        fontOpticalSizing: 'auto',
      },
      h3: {
        fontFamily: '"Fraunces", Georgia, serif',
        fontSize: '1.375rem',
        fontWeight: 500,
        letterSpacing: '-0.01em',
      },
      h4: {
        fontSize: '1.125rem',
        fontWeight: 600,
      },
      h5: {
        fontSize: '1rem',
        fontWeight: 600,
      },
      h6: {
        fontSize: '0.8125rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      },
      body1: {
        fontSize: '0.9375rem',
        lineHeight: 1.6,
      },
      body2: {
        fontSize: '0.8125rem',
        lineHeight: 1.5,
      },
      caption: {
        fontSize: '0.75rem',
        color: surface.text.secondary,
      },
      button: {
        fontWeight: 500,
        letterSpacing: '0.01em',
      },
    },
    spacing: 8,
    shape: {
      borderRadius: 8,
    },
    components: getComponents(mode),
    breakpoints: {
      values: {
        xs: 0,
        sm: 600,
        md: 900,
        lg: 1200,
        xl: 1536,
      },
    },
  });
};

const theme = createAppTheme('light');

export default theme;