import React, { createContext, useCallback, useMemo, useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import { FocusModeProvider } from "@geeksuite/ui";
import { createFlockTheme } from "./theme";

export const ColorModeContext = createContext({ toggleColorMode: () => {} });

export const AppThemeProvider = ({ children }) => {
  const [mode, setMode] = useState("dark");

  const toggleColorMode = useCallback(() => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const theme = useMemo(() => createFlockTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={{ mode, toggleColorMode }}>
      <FocusModeProvider storageKey="flockgeek.focusMode">
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </FocusModeProvider>
    </ColorModeContext.Provider>
  );
};

export const useColorMode = () => React.useContext(ColorModeContext);
