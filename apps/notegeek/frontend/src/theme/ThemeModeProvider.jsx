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
          {/* Desktop-only: undoes the shared theme's 44px input floor so
              NoteGeek's forms stay compact above the phone breakpoint.
              Scoped to `@media (min-width: 600px)` — below that, phones
              need the 44px hit area (MOBILE_UI_PLAN §2, no exceptions),
              and this `!important` was overruling it (TagSelector's
              outlined field, the note-title input). */}
          <GlobalStyles
            styles={{
              '@media (min-width: 600px)': {
                '.MuiInputBase-root, .MuiOutlinedInput-root': {
                  minHeight: 'auto !important',
                },
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
