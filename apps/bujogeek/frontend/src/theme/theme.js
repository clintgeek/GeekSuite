import { createTheme } from '@mui/material';
import { colors, darkColors, lightColors } from './colors';

const getComponents = (mode) => {
  const isDark = mode === 'dark';
  const surface = isDark ? darkColors : lightColors;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        // Paper grain texture — static analog overlay. No animation: grain doesn't move.
        'body::before': {
          content: '""',
          position: 'fixed',
          top:    0,
          left:   0,
          width:  '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 9999,
          opacity: isDark ? 0.03 : 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23g)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize:   '200px 200px',
        },
        body: {
          backgroundColor: surface.background.default,
          color: surface.text.primary,
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            width: '6px',
            height: '6px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: isDark ? colors.dark[400] : colors.ink[300],
            borderRadius: '3px',
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
          backgroundColor: isDark ? colors.dark[200] : colors.parchment.paper,
          borderBottom: `1px solid ${surface.divider}`,
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontFamily: '"Source Sans 3", sans-serif',
          fontWeight: 500,
          borderRadius: 6,
          padding: '7px 16px',
          letterSpacing: '0.005em',
          transition: 'all 0.18s ease',
          '&:hover': {
            transform: 'translateY(-1px)',
          },
        },
        contained: {
          boxShadow: isDark
            ? `0 1px 3px ${colors.dark[0]}60, inset 0 1px 0 rgba(255,255,255,0.06)`
            : `0 1px 3px ${colors.ink[300]}60, 0 1px 2px ${colors.ink[200]}`,
          '&:hover': {
            boxShadow: isDark
              ? `0 6px 20px ${colors.dark[0]}80, inset 0 1px 0 rgba(255,255,255,0.06)`
              : `0 4px 12px ${colors.ink[300]}80`,
          },
        },
        outlined: {
          borderColor: surface.border,
          '&:hover': {
            borderColor: colors.primary[400],
            backgroundColor: isDark ? colors.dark[300] : colors.primary[50],
          },
        },
        text: {
          '&:hover': {
            backgroundColor: isDark ? colors.dark[300] : colors.ink[100],
            transform: 'none',
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
          borderRadius: 10,
          border: `1px solid ${surface.border}`,
          // Warm shadow — not cold gray
          boxShadow: isDark
            ? `0 2px 8px ${colors.dark[0]}60`
            : `0 1px 4px ${colors.ink[200]}60`,
          transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
          backgroundColor: surface.background.paper,
          backgroundImage: 'none',
          '&:hover': {
            boxShadow: isDark
              ? `0 8px 28px ${colors.dark[0]}80`
              : `0 4px 16px ${colors.ink[300]}50`,
            borderColor: isDark ? colors.dark[500] : colors.ink[300],
          },
        },
      },
    },

    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 7,
            fontFamily: '"Source Sans 3", sans-serif',
            backgroundColor: surface.background.paper,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.primary[400],
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.primary[500],
              borderWidth: '1.5px',
            },
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: surface.border,
          },
          '& .MuiInputLabel-root': {
            fontFamily: '"Source Sans 3", sans-serif',
          },
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          width: 240,
          backgroundColor: isDark ? colors.dark[150] : '#2E2B28',
          borderRight: 'none',
          boxShadow: isDark
            ? `2px 0 20px ${colors.dark[0]}80`
            : `2px 0 20px rgba(0,0,0,0.18)`,
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: '"Source Sans 3", sans-serif',
          fontWeight: 500,
          fontSize: '0.6875rem',
          height: 22,
          backgroundColor: isDark ? colors.dark[300] : colors.ink[100],
          color: isDark ? colors.dark[800] : colors.ink[600],
          border: `1px solid ${surface.border}`,
          borderRadius: 4,
          '&:hover': {
            backgroundColor: isDark ? colors.dark[400] : colors.ink[200],
          },
        },
        deleteIcon: {
          color: isDark ? colors.dark[700] : colors.ink[400],
          '&:hover': {
            color: isDark ? colors.dark[900] : colors.ink[600],
          },
        },
        label: {
          paddingLeft: 7,
          paddingRight: 7,
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          transition: 'background-color 0.14s ease, color 0.14s ease',
          '&:hover': {
            backgroundColor: isDark ? colors.dark[300] : colors.ink[100],
          },
        },
      },
    },

    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          height: 64,
          backgroundColor: isDark ? colors.dark[200] : colors.parchment.paper,
          borderTop: `1px solid ${surface.divider}`,
        },
      },
    },

    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          color: isDark ? colors.dark[600] : colors.ink[500],
          minWidth: 'auto',
          padding: '6px 12px',
          '&.Mui-selected': {
            color: colors.primary[500],
          },
          '& .MuiBottomNavigationAction-label': {
            fontFamily: '"Source Sans 3", sans-serif',
            fontSize: '0.6875rem',
            '&.Mui-selected': {
              fontSize: '0.6875rem',
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
          backgroundColor: isDark ? colors.dark[200] : colors.parchment.paper,
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 14,
          border: `1px solid ${surface.border}`,
          boxShadow: isDark
            ? `0 32px 64px ${colors.dark[0]}90`
            : `0 24px 48px ${colors.ink[400]}30`,
          backgroundColor: isDark ? colors.dark[200] : colors.parchment.paper,
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontFamily: '"Fraunces", Georgia, serif',
          fontSize: '1.25rem',
          fontWeight: 500,
          letterSpacing: '-0.01em',
        },
      },
    },

    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          '&:hover': {
            backgroundColor: isDark ? colors.dark[300] : colors.ink[100],
          },
          '&.Mui-selected': {
            backgroundColor: isDark ? colors.dark[300] : colors.primary[50],
            '&:hover': {
              backgroundColor: isDark ? colors.dark[400] : colors.primary[100],
            },
          },
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: isDark ? colors.dark[400] : colors.ink[800],
          color: isDark ? colors.dark[900] : '#FFF',
          fontSize: '0.75rem',
          fontFamily: '"Source Sans 3", sans-serif',
          fontWeight: 500,
          borderRadius: 5,
          padding: '5px 10px',
          boxShadow: isDark
            ? `0 4px 12px ${colors.dark[0]}80`
            : `0 4px 12px ${colors.ink[900]}30`,
        },
        arrow: {
          color: isDark ? colors.dark[400] : colors.ink[800],
        },
      },
      defaultProps: {
        arrow: true,
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: surface.divider,
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
        main:         isDark ? colors.primary[400] : colors.primary[500],
        light:        colors.primary[300],
        dark:         colors.primary[700],
        contrastText: isDark ? colors.dark[100] : '#FFFFFF',
      },
      secondary: {
        main:         colors.primary[600],
        light:        colors.primary[400],
        dark:         colors.primary[800],
        contrastText: '#FFFFFF',
      },
      background: {
        default: surface.background.default,
        paper:   surface.background.paper,
      },
      error: {
        main:  colors.status.error,
        light: colors.status.errorBg,
      },
      success: {
        main:  colors.status.success,
        light: colors.status.successBg,
      },
      warning: {
        main:  colors.status.warning,
        light: colors.status.warningBg,
      },
      info: {
        main:  colors.status.info,
        light: colors.status.infoBg,
      },
      text: {
        primary:   surface.text.primary,
        secondary: surface.text.secondary,
        disabled:  surface.text.disabled,
      },
      divider: surface.divider,
    },

    typography: {
      fontFamily: '"Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      h1: {
        fontFamily:        '"Fraunces", Georgia, serif',
        fontSize:          '2.25rem',
        fontWeight:        500,
        letterSpacing:     '-0.025em',
        lineHeight:        1.1,
        fontOpticalSizing: 'auto',
      },
      h2: {
        fontFamily:        '"Fraunces", Georgia, serif',
        fontSize:          '1.75rem',
        fontWeight:        500,
        letterSpacing:     '-0.02em',
        lineHeight:        1.15,
        fontOpticalSizing: 'auto',
      },
      h3: {
        fontFamily:    '"Fraunces", Georgia, serif',
        fontSize:      '1.375rem',
        fontWeight:    500,
        letterSpacing: '-0.015em',
        lineHeight:    1.2,
      },
      h4: {
        fontFamily:    '"Source Sans 3", sans-serif',
        fontSize:      '1.0625rem',
        fontWeight:    600,
        letterSpacing: '-0.005em',
        lineHeight:    1.3,
      },
      h5: {
        fontFamily: '"Source Sans 3", sans-serif',
        fontSize:   '0.9375rem',
        fontWeight: 600,
        lineHeight: 1.3,
      },
      h6: {
        fontFamily:    '"Source Sans 3", sans-serif',
        fontSize:      '0.6875rem',
        fontWeight:    700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        lineHeight:    1,
      },
      body1: {
        fontFamily: '"Source Sans 3", sans-serif',
        fontSize:   '0.9375rem',
        lineHeight: 1.6,
      },
      body2: {
        fontFamily: '"Source Sans 3", sans-serif',
        fontSize:   '0.8125rem',
        lineHeight: 1.5,
      },
      caption: {
        fontFamily: '"Source Sans 3", sans-serif',
        fontSize:   '0.75rem',
        color:      surface.text.secondary,
        lineHeight: 1.4,
      },
      button: {
        fontFamily:    '"Source Sans 3", sans-serif',
        fontWeight:    500,
        letterSpacing: '0.005em',
      },
      // Extra variant — editorial mono metadata
      mono: {
        fontFamily:    '"IBM Plex Mono", monospace',
        fontSize:      '0.75rem',
        letterSpacing: '0.01em',
        lineHeight:    1.4,
      },
    },

    spacing: 8,
    shape: {
      borderRadius: 8,
    },
    components: getComponents(mode),
    breakpoints: {
      values: {
        xs:  0,
        sm:  600,
        md:  900,
        lg:  1200,
        xl:  1536,
      },
    },
  });
};

const theme = createAppTheme('light');

export default theme;
