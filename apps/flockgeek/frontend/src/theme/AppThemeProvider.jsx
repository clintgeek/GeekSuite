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
  themePreference: "dark",
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

export const AppThemeProvider = ({ children }) => (
  <ThemeProvider defaultPreference="dark">
    <FlockThemeBridge>{children}</FlockThemeBridge>
  </ThemeProvider>
);

export const useColorMode = () => React.useContext(ColorModeContext);
