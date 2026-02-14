import { createTheme } from "@mui/material/styles";

/* ─── Field Ledger palette ─── */
const amber   = { main: "#d4910a", light: "#e8b44a", dark: "#a06e00" };
const forest  = { main: "#3d6b4f", light: "#5a9470", dark: "#264432" };
const rust    = { main: "#c4453c", light: "#d97068", dark: "#8e2e28" };
const slate   = { main: "#64748b", light: "#94a3b8", dark: "#475569" };

const typography = {
  fontFamily: '"IBM Plex Sans", "DM Sans Variable", system-ui, sans-serif',
  h1: { fontFamily: '"DM Serif Display", Georgia, serif', fontSize: "2.75rem", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.15 },
  h2: { fontFamily: '"DM Serif Display", Georgia, serif', fontSize: "2rem", fontWeight: 400, letterSpacing: "-0.005em", lineHeight: 1.2 },
  h3: { fontFamily: '"DM Serif Display", Georgia, serif', fontSize: "1.625rem", fontWeight: 400, lineHeight: 1.25 },
  h4: { fontFamily: '"IBM Plex Sans", sans-serif', fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.35 },
  h5: { fontFamily: '"IBM Plex Sans", sans-serif', fontSize: "1.1rem", fontWeight: 600, lineHeight: 1.4 },
  h6: { fontFamily: '"IBM Plex Sans", sans-serif', fontSize: "1rem", fontWeight: 600, lineHeight: 1.4 },
  body1: { fontSize: "0.9375rem", fontWeight: 400, lineHeight: 1.65 },
  body2: { fontSize: "0.8125rem", fontWeight: 400, lineHeight: 1.6 },
  subtitle1: { fontSize: "0.9375rem", fontWeight: 600, letterSpacing: 0.1 },
  subtitle2: { fontSize: "0.8125rem", fontWeight: 600, letterSpacing: 0.1 },
  caption: { fontSize: "0.75rem", fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase" },
  overline: { fontSize: "0.6875rem", fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" },
  button: { fontWeight: 600, letterSpacing: 0.3, textTransform: "none" }
};

export const getDesignTokens = (mode = "dark") => {
  const dark = mode === "dark";
  return {
    palette: {
      mode,
      primary: amber,
      secondary: forest,
      error: rust,
      warning: { main: "#e8a735", light: "#f0c36a", dark: "#b07d1a" },
      info: slate,
      success: forest,
      background: {
        default: dark ? "#0f0f0d" : "#f5f0e6",
        paper: dark ? "#1a1a17" : "#faf6ed",
        sidebar: dark ? "#131311" : "#eee9db"
      },
      text: {
        primary: dark ? "#e8e2d4" : "#1a1a18",
        secondary: dark ? "#9c9685" : "#6b6456",
        disabled: dark ? "#5c574a" : "#b5ad9e"
      },
      divider: dark ? "rgba(232,226,212,0.08)" : "rgba(26,26,24,0.1)",
      action: {
        hover: dark ? "rgba(212,145,10,0.08)" : "rgba(212,145,10,0.06)",
        selected: dark ? "rgba(212,145,10,0.14)" : "rgba(212,145,10,0.1)",
        focus: dark ? "rgba(212,145,10,0.18)" : "rgba(212,145,10,0.14)"
      }
    },
    shape: { borderRadius: 8 },
    spacing: 8,
    typography,
    shadows: [
      "none",
      dark ? "0 1px 3px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.08)",
      dark ? "0 2px 6px rgba(0,0,0,0.45)" : "0 2px 6px rgba(0,0,0,0.1)",
      dark ? "0 4px 12px rgba(0,0,0,0.5)" : "0 4px 12px rgba(0,0,0,0.12)",
      ...Array(21).fill(dark ? "0 6px 20px rgba(0,0,0,0.5)" : "0 6px 20px rgba(0,0,0,0.12)")
    ],
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "*, *::before, *::after": { boxSizing: "border-box" },
          body: {
            backgroundAttachment: "fixed"
          },
          "::-webkit-scrollbar": { width: 6 },
          "::-webkit-scrollbar-track": { background: "transparent" },
          "::-webkit-scrollbar-thumb": {
            background: dark ? "rgba(232,226,212,0.12)" : "rgba(26,26,24,0.15)",
            borderRadius: 3
          }
        }
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 6,
            textTransform: "none",
            fontWeight: 600,
            letterSpacing: 0.3,
            paddingInline: 18,
            paddingBlock: 7
          },
          containedPrimary: {
            color: "#1a1a18",
            fontWeight: 700,
            boxShadow: `0 0 0 1px ${amber.main}, 0 2px 12px rgba(212,145,10,0.25)`,
            transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
            "&:hover": {
              backgroundColor: amber.light,
              boxShadow: `0 0 0 1px ${amber.light}, 0 4px 20px rgba(212,145,10,0.35)`,
              transform: "translateY(-1px)"
            },
            "&:active": {
              transform: "translateY(0) scale(0.98)",
              transition: "transform 0.1s ease"
            }
          },
          outlinedInherit: {
            borderColor: dark ? "rgba(232,226,212,0.15)" : "rgba(26,26,24,0.2)"
          }
        }
      },
      MuiCard: {
        defaultProps: { variant: "outlined" },
        styleOverrides: {
          root: {
            borderRadius: 10,
            borderColor: dark ? "rgba(232,226,212,0.08)" : "rgba(26,26,24,0.1)",
            backgroundImage: "none",
            transition: "border-color 0.2s ease, box-shadow 0.25s ease, transform 0.25s ease",
            "&:hover": {
              transform: "translateY(-2px)",
              borderColor: dark ? "rgba(232,226,212,0.14)" : "rgba(26,26,24,0.18)",
              boxShadow: dark ? "0 4px 16px rgba(0,0,0,0.35)" : "0 4px 16px rgba(0,0,0,0.08)"
            }
          }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            backgroundImage: "none",
            transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease"
          },
          outlined: {
            borderColor: dark ? "rgba(232,226,212,0.08)" : "rgba(26,26,24,0.1)",
            "&:hover": {
              borderColor: dark ? "rgba(232,226,212,0.14)" : "rgba(26,26,24,0.18)",
              boxShadow: dark ? "0 2px 8px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.06)"
            }
          }
        }
      },
      MuiAppBar: {
        styleOverrides: {
          root: { borderRadius: 0, backgroundImage: "none" }
        }
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 6, fontWeight: 600, height: 28 }
        }
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            transition: "background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease"
          }
        }
      },
      MuiMenuItem: {
        styleOverrides: {
          root: { borderRadius: 6 }
        }
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: dark ? "rgba(232,226,212,0.06)" : "rgba(26,26,24,0.08)"
          },
          head: {
            fontWeight: 700,
            fontSize: "0.75rem",
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: dark ? "#9c9685" : "#6b6456"
          }
        }
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 12 }
        }
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 4,
            fontSize: "0.75rem",
            fontWeight: 500
          }
        }
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            borderRadius: "10px !important",
            "&::before": { display: "none" }
          }
        }
      }
    }
  };
};

export const buildTheme = (mode = "dark") => createTheme(getDesignTokens(mode));
