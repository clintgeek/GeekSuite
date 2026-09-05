/**
 * BookGeek Theme: "Midnight Reader"
 *
 * Intellectual, focused aesthetics. Deep slate/blue surfaces,
 * crisp typography, and serif-heavy headings for a classical library feel.
 *
 * Composes createGeekSuiteTheme with BookGeek-specific identity overrides.
 */
import { alpha } from '@mui/material/styles';
import { createGeekSuiteTheme } from '@geeksuite/ui';

/* ─── Midnight Reader palette ─── */
// Sky-500 is a fine accent *fill* on the midnight page, but the accent is also
// link text, active-nav text and icon color — and #0ea5e9 clears only 2.77:1
// on white, under the 3:1 floor for UI graphics. Light mode steps down one
// stop to sky-600 (4.10:1); dark mode keeps the brighter sky.
const skyDark  = { main: "#0ea5e9", light: "#38bdf8", dark: "#0284c7", contrastText: "#0b1220" };
const skyLight = { main: "#0284c7", light: "#0ea5e9", dark: "#0369a1", contrastText: "#0b1220" };

const accentFor = (mode) => (mode === "dark" ? skyDark : skyLight);

const darkColors = {
  page:    "#010409",
  surface: "#0f172a",
  card:    "#151e2f",
  text:    "#f1f5f9",
  muted:   "#64748b",
  border:  "rgba(100, 116, 139, 0.22)",
};

const lightColors = {
  page:    "#e8ecf1",
  surface: "#ffffff",
  card:    "#ffffff",
  text:    "#0f172a",
  muted:   "#64748b",
  border:  "rgba(15, 23, 42, 0.10)",
};

function buildBookOverrides(mode) {
  const isDark = mode === "dark";
  const colors = isDark ? darkColors : lightColors;

  return {
    palette: {
      background: {
        default: colors.page,
        paper:   colors.surface,
      },
      text: {
        primary:   colors.text,
        secondary: isDark ? "#94a3b8" : "#475569",
        muted:     isDark ? "#9aa4b2" : "#5b6472",
      },
      divider: colors.border,
      // Identity tones, not semantics. `progress` is the one amber in the app
      // (reading progress on covers and the detail slider); `shelf` colors the
      // shelf state of a book everywhere it appears. Light mode steps each
      // hue down so it clears 3:1 as a graphic on white.
      progress: {
        main: isDark ? "#f59e0b" : "#b45309",
        contrastText: "#0b1220",
      },
      shelf: isDark
        ? {
            reading: "#f59e0b",
            "on-reader": "#2dd4bf",
            unread: "#94a3b8",
            read: "#38bdf8",
            "want-to-read": "#a78bfa",
            abandoned: "#fb7185",
            "need-to-find": "#fb923c",
            custom: "#94a3b8",
          }
        : {
            reading: "#b45309",
            "on-reader": "#0f766e",
            unread: "#475569",
            read: "#0369a1",
            "want-to-read": "#6d28d9",
            abandoned: "#be123c",
            "need-to-find": "#c2410c",
            custom: "#475569",
          },
    },

    typography: {
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      h1: { fontFamily: '"DM Serif Display", serif', fontSize: "2.5rem", fontWeight: 400 },
      h2: { fontFamily: '"DM Serif Display", serif', fontSize: "2rem", fontWeight: 400 },
      h3: { fontFamily: '"DM Serif Display", serif', fontSize: "1.5rem", fontWeight: 400 },
      h4: { fontWeight: 600 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
    },

    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.8)",
            backdropFilter: "blur(12px)",
            borderBottom: `1px solid ${colors.border}`,
            borderRadius: 0,
            color: colors.text,
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: colors.card,
            border: `1px solid ${colors.border}`,
            boxShadow: isDark ? "0 4px 12px rgba(0,0,0,0.4)" : "0 4px 12px rgba(0,0,0,0.05)",
          }
        }
      },
    }
  };
}

/**
 * createBookTheme(mode)
 *
 * Composes shared GeekSuite rules with BookGeek "Midnight Reader" identity.
 */
export function createBookTheme(mode = "dark") {
  const accent = accentFor(mode);

  const theme = createGeekSuiteTheme({
    mode,
    accent,
    overrides: buildBookOverrides(mode),
  });

  // Failsafe: Ensure theme.palette.glow is always defined even if
  // Vite is serving an outdated, pre-bundled cache of @geeksuite/ui.
  if (!theme.palette.glow) {
    theme.palette.glow = {
      ring: alpha(accent.main, 0.20),
      soft: alpha(accent.main, 0.06),
      medium: alpha(accent.main, 0.10),
      border: alpha(accent.main, 0.30),
    };
  }

  return theme;
}

export default createBookTheme;
