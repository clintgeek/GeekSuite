import React, { createContext, useContext, useMemo } from 'react';
import { CssBaseline, GlobalStyles } from '@mui/material';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { ThemeProvider as GeekThemeProvider, useThemeMode as useGeekThemeMode } from '@geeksuite/user';
import { FocusModeProvider } from '@geeksuite/ui';
import { createNoteTheme } from './createAppTheme';

const ThemeModeContext = createContext(null);

/**
 * useThemeMode — exposes { mode, setMode, toggleMode } for backward compatibility.
 * Internally delegates to @geeksuite/user's ThemeProvider (cookie + preferences sync).
 */
export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error('useThemeMode must be used within ThemeModeProvider');
  }
  return ctx;
}

function InnerProvider({ children }) {
  const { theme, setThemePreference, toggleTheme } = useGeekThemeMode();
  const muiTheme = useMemo(() => createNoteTheme(theme), [theme]);

  const value = useMemo(
    () => ({
      mode: theme,
      setMode: (m) => setThemePreference(m === 'dark' ? 'dark' : 'light'),
      toggleMode: toggleTheme,
    }),
    [theme, setThemePreference, toggleTheme],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <FocusModeProvider storageKey="notegeek.focusMode">
        <MuiThemeProvider theme={muiTheme}>
          <CssBaseline />
          <GlobalStyles
            styles={{
              '.MuiInputBase-root, .MuiOutlinedInput-root': {
                minHeight: 'auto !important',
              },
            }}
          />
          {children}
        </MuiThemeProvider>
      </FocusModeProvider>
    </ThemeModeContext.Provider>
  );
}

function ThemeModeProvider({ children }) {
  return (
    <GeekThemeProvider>
      <InnerProvider>{children}</InnerProvider>
    </GeekThemeProvider>
  );
}

export default ThemeModeProvider;
