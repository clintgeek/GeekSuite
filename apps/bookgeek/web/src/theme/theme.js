/**
 * BookGeek Theme: "Midnight Reader"
 *
 * Intellectual, focused aesthetics. Deep slate/blue surfaces,
 * crisp typography, and serif-heavy headings for a classical library feel.
 *
 * Composes createGeekSuiteTheme with BookGeek-specific identity overrides.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';

/* ─── Midnight Reader palette ─── */
const sky = { main: "#0ea5e9", light: "#38bdf8", dark: "#0284c7", contrastText: "#ffffff" };

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
        secondary: colors.muted,
      },
      divider: colors.border,
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
  return createGeekSuiteTheme({
    mode,
    accent:    sky,
    overrides: buildBookOverrides(mode),
  });
}

export default createBookTheme;
