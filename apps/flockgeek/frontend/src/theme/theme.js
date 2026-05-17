/**
 * FlockGeek Theme: "Field Ledger"
 *
 * Minimalist, nature-inspired palette. Amber accents,
 * serif-heavy headings, and earthy backgrounds.
 *
 * Composes createGeekSuiteTheme with FlockGeek-specific identity overrides.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';

/* ─── Field Ledger palette ─── */
const amber   = { main: "#d4910a", light: "#e8b44a", dark: "#a06e00" };
const forest  = { main: "#3d6b4f", light: "#5a9470", dark: "#264432" };
const rust    = { main: "#c4453c", light: "#d97068", dark: "#8e2e28" };
const slate   = { main: "#64748b", light: "#94a3b8", dark: "#475569" };

const darkPalette = {
  leather: "#0f0f0d",
  wood:    "#1a1a17",
  sidebar: "#131311",
  textPrimary: "#e8e2d4",
  textSecondary: "#9c9685",
  divider: "rgba(232,226,212,0.08)",
};

const lightPalette = {
  parchment: "#f5f0e6",
  paper:     "#faf6ed",
  sidebar:   "#eee9db",
  textPrimary: "#1a1a18",
  textSecondary: "#6b6456",
  divider: "rgba(26,26,24,0.1)",
};

function buildFlockOverrides(mode) {
  const isDark = mode === "dark";
  const bg = isDark ? darkPalette : lightPalette;

  const sansStack = '"IBM Plex Sans", "DM Sans Variable", system-ui, sans-serif';
  const serifStack = '"DM Serif Display", Georgia, serif';

  return {
    palette: {
      background: {
        default: isDark ? bg.leather : bg.parchment,
        paper:   isDark ? bg.wood : bg.paper,
      },
      text: {
        primary:   bg.textPrimary,
        secondary: bg.textSecondary,
      },
      divider: bg.divider,
    },

    typography: {
      fontFamily: sansStack,
      h1: { fontFamily: serifStack, fontSize: "2.75rem", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.15 },
      h2: { fontFamily: serifStack, fontSize: "2rem", fontWeight: 400, letterSpacing: "-0.005em", lineHeight: 1.2 },
      h3: { fontFamily: serifStack, fontSize: "1.625rem", fontWeight: 400, lineHeight: 1.25 },
      h4: { fontFamily: sansStack, fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.35 },
      h5: { fontFamily: sansStack, fontSize: "1.1rem", fontWeight: 600, lineHeight: 1.4 },
      h6: { fontFamily: sansStack, fontSize: "1rem", fontWeight: 600, lineHeight: 1.4 },
    },

    components: {
      MuiAppBar: {
        styleOverrides: {
          root: { borderRadius: 0, backgroundImage: "none" }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            borderColor: isDark ? "rgba(232,226,212,0.08)" : "rgba(26,26,24,0.1)",
            backgroundImage: "none",
          }
        }
      },
    }
  };
}

/**
 * createFlockTheme(mode)
 *
 * Composes shared GeekSuite rules with FlockGeek "Field Ledger" identity.
 */
export function createFlockTheme(mode = "dark") {
  return createGeekSuiteTheme({
    mode,
    accent:    amber,
    overrides: buildFlockOverrides(mode),
  });
}

// Legacy export compatibility
export const buildTheme = (mode = "dark") => createFlockTheme(mode);
export default createFlockTheme("dark");
