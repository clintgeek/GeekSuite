import React, { createContext, useMemo } from "react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { FocusModeProvider } from "@geeksuite/ui";
import { ThemeProvider, useThemeMode } from "@geeksuite/user";
import { createFlockTheme } from "./theme";

// Kept for backward compatibility: consumers (e.g. Sidebar) read
// `{ mode, toggleColorMode }` from this context. The actual preference now
// lives in the suite-wide @geeksuite/user ThemeProvider (geek_theme cookie +
// user preferences), so the mode follows the rest of GeekSuite.
export const ColorModeContext = createContext({ mode: "dark", toggleColorMode: () => {} });

const FlockThemeBridge = ({ children }) => {
  const { theme: mode, toggleTheme } = useThemeMode();

  const theme = useMemo(() => createFlockTheme(mode), [mode]);
  const colorMode = useMemo(
    () => ({ mode, toggleColorMode: toggleTheme }),
    [mode, toggleTheme]
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
