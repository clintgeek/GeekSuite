import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import { usePreferences } from "@geeksuite/user";
import { buildTheme } from "./theme";

export const ColorModeContext = createContext({ toggleColorMode: () => {}, setMode: () => {} });

export const AppThemeProvider = ({ children }) => {
  const [mode, setMode] = useState(() => localStorage.getItem("babelgeek-theme") || "light");
  const { preferences, loaded } = usePreferences();

  const toggleColorMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("babelgeek-theme", next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (loaded && preferences?.theme) {
      const remote = preferences.theme;
      if (remote === "light" || remote === "dark") {
        setMode(remote);
        localStorage.setItem("babelgeek-theme", remote);
      }
    }
  }, [loaded, preferences]);

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={{ mode, toggleColorMode, setMode }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ColorModeContext.Provider>
  );
};

export const useColorMode = () => React.useContext(ColorModeContext);
