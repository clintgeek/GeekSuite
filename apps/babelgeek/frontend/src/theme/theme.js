import { createTheme } from "@mui/material/styles";

// BabelGeek color palette - Cyan theme inspired by fitnessGeek
const basePalette = {
  primary: {
    main: "#06b6d4",      // cyan-500
    light: "#22d3ee",     // cyan-400
    dark: "#0891b2",      // cyan-600
    contrastText: "#ffffff"
  },
  secondary: {
    main: "#64748b",      // slate-500
    light: "#94a3b8",     // slate-400
    dark: "#475569",      // slate-600
    contrastText: "#ffffff"
  },
  success: { main: "#22c55e" },  // green-500
  warning: { main: "#f59e0b" },  // amber-500
  error: { main: "#ef4444" },    // red-500
  info: { main: "#3b82f6" }      // blue-500
};

const typography = {
  fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
  h1: { fontSize: "3rem", fontWeight: 700, letterSpacing: "-0.02em" },
  h2: { fontSize: "2.25rem", fontWeight: 600, letterSpacing: "-0.01em" },
  h3: { fontSize: "1.75rem", fontWeight: 600 },
  h4: { fontSize: "1.5rem", fontWeight: 600 },
  h5: { fontSize: "1.25rem", fontWeight: 600 },
  h6: { fontSize: "1rem", fontWeight: 600 },
  body1: { fontSize: "1.0625rem", fontWeight: 400, lineHeight: 1.6 },
  body2: { fontSize: "0.9375rem", fontWeight: 400, lineHeight: 1.55 },
  subtitle1: { fontSize: "1rem", fontWeight: 600 },
  caption: { fontSize: "0.8125rem", fontWeight: 500, letterSpacing: 0.3 }
};

export const getDesignTokens = (mode = "light") => ({
  palette: {
    mode,
    ...basePalette,
    background: {
      default: mode === "light" ? "#f8fafc" : "#0f172a",  // slate-50 / slate-900
      paper: mode === "light" ? "#ffffff" : "#1e293b"     // white / slate-800
    },
    text: {
      primary: mode === "light" ? "#0f172a" : "#f8fafc",  // slate-900 / slate-50
      secondary: mode === "light" ? "#64748b" : "#94a3b8" // slate-500 / slate-400
    }
  },
  shape: {
    borderRadius: 16
  },
  spacing: 8,
  typography,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundAttachment: "fixed",
          backgroundImage:
            mode === "light"
              ? "linear-gradient(180deg, rgba(6,182,212,0.06) 0%, rgba(100,116,139,0.03) 30%, transparent 100%)"
              : "linear-gradient(180deg, rgba(6,182,212,0.12) 0%, rgba(100,116,139,0.06) 35%, transparent 100%)"
        }
      }
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true
      },
      styleOverrides: {
        root: {
          borderRadius: 999,
          textTransform: "none",
          fontWeight: 600,
          letterSpacing: 0.2,
          paddingInline: 24,
          paddingBlock: 10
        },
        containedPrimary: {
          background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
          "&:hover": {
            background: "linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)"
          }
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 24,
          boxShadow: mode === "light"
            ? "0 24px 48px rgba(15, 23, 42, 0.08)"
            : "0 24px 48px rgba(0, 0, 0, 0.3)"
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 24
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600
        }
      }
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          height: 8,
          backgroundColor: mode === "light" ? "#e2e8f0" : "#334155"
        },
        bar: {
          borderRadius: 999,
          background: "linear-gradient(90deg, #06b6d4 0%, #22d3ee 100%)"
        }
      }
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 12
        }
      }
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 12
        }
      }
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          backgroundColor: mode === "light" ? "#ffffff" : "#1e293b",
          borderTop: mode === "light" ? "1px solid #e2e8f0" : "1px solid #334155"
        }
      }
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          color: mode === "light" ? "#64748b" : "#94a3b8",
          "&.Mui-selected": {
            color: "#06b6d4"
          }
        }
      }
    }
  }
});

export const buildTheme = (mode = "light") => createTheme(getDesignTokens(mode));
