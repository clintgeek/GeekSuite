import React, { createContext, useMemo } from "react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { FocusModeProvider } from "@geeksuite/ui";
import { ThemeProvider, useThemeMode } from "@geeksuite/user";
import { createFlockTheme } from "./theme";

// Consumers read `{ mode, toggleColorMode }` from this context (TopBar), plus
// `{ themePreference, setThemePreference }` for the Settings page's explicit
// light/dark/system choice. The preference itself lives in the suite-wide
// @geeksuite/user ThemeProvider (geek_theme cookie + user preferences), so the
// mode follows the rest of GeekSuite; `mode` is the *resolved* light/dark.
export const ColorModeContext = createContext({
  mode: "dark",
  toggleColorMode: () => {},
  themePreference: "auto",
  setThemePreference: () => {}
});

const FlockThemeBridge = ({ children }) => {
  const { theme: mode, themePreference, setThemePreference, toggleTheme } = useThemeMode();

  const theme = useMemo(() => createFlockTheme(mode), [mode]);
  const colorMode = useMemo(
    () => ({ mode, toggleColorMode: toggleTheme, themePreference, setThemePreference }),
    [mode, toggleTheme, themePreference, setThemePreference]
  );

  return (
    <ColorModeContext.Provider value={colorMode}>
      <FocusModeProvider storageKey="flockgeek.focusMode">
        <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
      </FocusModeProvider>
    </ColorModeContext.Provider>
  );
};

// `defaultPreference` used to be hardcoded "dark" (DOCS/SUITE_TODO.md
// "flockgeek first-visit flicker"): the theme-preboot inline script
// (@geeksuite/user/vite) has no per-app hook and always assumes 'auto' for a
// cookie-less visitor, resolving via `prefers-color-scheme` before React ever
// mounts. Overriding the *post-mount* default to "dark" meant a light-OS,
// cookie-less visitor got a real light→dark repaint the instant this
// provider read its state — the preboot script and this provider disagreeing
// about what "no preference yet" means. bujogeek and notegeek never override
// this prop (both stay on the shared 'auto' default), which is what keeps
// them flicker-free; flockgeek now matches them.
export const AppThemeProvider = ({ children }) => (
  <ThemeProvider>
    <FlockThemeBridge>{children}</FlockThemeBridge>
  </ThemeProvider>
);

export const useColorMode = () => React.useContext(ColorModeContext);
