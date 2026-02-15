import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CssBaseline, GlobalStyles } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { usePreferences } from '@geeksuite/user';
import { createAppTheme } from './createAppTheme';

const ThemeModeContext = createContext(null);

const STORAGE_KEY = 'notegeek.themeMode';

function getInitialMode() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;

  if (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches) {
    return 'dark';
  }

  return 'light';
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error('useThemeMode must be used within ThemeModeProvider');
  }
  return ctx;
}

function ThemeModeProvider({ children }) {
  const [mode, setMode] = useState(getInitialMode);
  const { preferences, loaded } = usePreferences();

  // Sync mode from BaseGeek global preferences once loaded
  useEffect(() => {
    if (loaded && preferences?.theme) {
      const remote = preferences.theme;
      if (remote === 'light' || remote === 'dark') {
        setMode(remote);
      }
    }
  }, [loaded, preferences?.theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      toggleMode: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')),
    }),
    [mode]
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles
          styles={{
            '.MuiInputBase-root, .MuiOutlinedInput-root, .css-y0i3t, [class*="css-"]': {
              minHeight: 'auto !important',
            },
          }}
        />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export default ThemeModeProvider;
