/**
 * BuJoGeek theme — composes createGeekSuiteTheme with app-specific overrides.
 *
 * What lives here: bujogeek identity — fonts, colors, textures.
 * What does NOT live here: button sizing, spacing scale, focus rings,
 * interaction tokens. Those are owned by the shared system.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';
import { colors, darkColors, lightColors } from './colors';

// BuJoGeek accent — GeekSuite blue, expressed in this app's full ramp
const bujoAccent = {
  main:         colors.primary[500],
  light:        colors.primary[300],
  dark:         colors.primary[700],
  contrastText: '#FFFFFF',
};

function buildBujoOverrides(mode) {
  const isDark   = mode === 'dark';
  const surface  = isDark ? darkColors : lightColors;

  return {
    // App-specific typography identity — Fraunces for editorial headers
    typography: {
      // Override just the font family; the scale comes from the shared system
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
        lineHeight: 1.4,
      },
      button: {
        fontFamily:    '"Source Sans 3", sans-serif',
        fontWeight:    500,
        letterSpacing: '0.005em',
      },
    },

    // App-specific component overrides — identity layer only.
    // Shared rules (sizing, focus, radius) are NOT re-declared here.
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Paper grain texture — BuJoGeek's analog soul.
          // Decorative, not structural: does not affect any shared rule.
          'body::before': {
            content:         '""',
            position:        'fixed',
            top:             0,
            left:            0,
            width:           '100%',
            height:          '100%',
            pointerEvents:   'none',
            zIndex:          9999,
            opacity:         isDark ? 0.03 : 0.04,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23g)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
            backgroundSize:   '200px 200px',
          },
          body: {
            backgroundColor: surface.background.default,
            color:           surface.text.primary,
            // Warm, thin scrollbar — analog feel
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar':       { width: '6px', height: '6px' },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: isDark ? colors.dark[400] : colors.ink[300],
              borderRadius:    '3px',
            },
            '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
          },
        },
      },

      // AppBar gets the warm background treatment
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? colors.dark[200] : colors.parchment.paper,
            borderBottom:    `1px solid ${surface.divider}`,
          },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: surface.background.paper,
            backgroundImage: 'none',
            border:          `1px solid ${surface.border}`,
            boxShadow: isDark
              ? `0 2px 8px ${colors.dark[0]}60`
              : `0 1px 4px ${colors.ink[200]}60`,
            '&:hover': {
              boxShadow: isDark
                ? `0 8px 28px ${colors.dark[0]}80`
                : `0 4px 16px ${colors.ink[300]}50`,
              borderColor: isDark ? colors.dark[500] : colors.ink[300],
            },
          },
        },
      },

      MuiPaper: {
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
            fontFamily:    '"Fraunces", Georgia, serif',
            fontSize:      '1.25rem',
            fontWeight:    500,
            letterSpacing: '-0.01em',
          },
        },
      },

      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? '#272420' : '#3B3632',
            borderRight: 'none',
            boxShadow: isDark
              ? `2px 0 20px ${colors.dark[0]}80`
              : `2px 0 20px rgba(0,0,0,0.18)`,
          },
        },
      },

      // Mobile bottom nav — bujogeek-specific component
      MuiBottomNavigation: {
        styleOverrides: {
          root: {
            height:          64,
            backgroundColor: isDark ? colors.dark[200] : colors.parchment.paper,
            borderTop:       `1px solid ${surface.divider}`,
          },
        },
      },

      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            color:    isDark ? colors.dark[600] : colors.ink[500],
            minWidth: 'auto',
            padding:  '6px 12px',
            '&.Mui-selected': { color: colors.primary[500] },
            '& .MuiBottomNavigationAction-label': {
              fontFamily: '"Source Sans 3", sans-serif',
              fontSize:   '0.6875rem',
              '&.Mui-selected': { fontSize: '0.6875rem' },
            },
          },
        },
      },

      MuiDivider: {
        styleOverrides: {
          root: { borderColor: surface.divider },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? colors.dark[400] : colors.ink[800],
            color:           isDark ? colors.dark[900] : '#FFF',
            fontFamily:      '"Source Sans 3", sans-serif',
            boxShadow: isDark
              ? `0 4px 12px ${colors.dark[0]}80`
              : `0 4px 12px ${colors.ink[900]}30`,
          },
          arrow: {
            color: isDark ? colors.dark[400] : colors.ink[800],
          },
        },
      },
    },
  };
}

/**
 * createBuJoTheme(mode)
 *
 * Composes the shared GeekSuite theme with BuJoGeek overrides.
 * Shared rules win unless explicitly overridden here.
 */
export function createBuJoTheme(mode = 'light') {
  return createGeekSuiteTheme({
    mode,
    accent:    bujoAccent,
    overrides: buildBujoOverrides(mode),
  });
}

// Legacy default export for any remaining direct imports
export default createBuJoTheme('light');
