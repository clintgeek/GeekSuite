import React, { createContext, useContext, useMemo } from 'react';
import { CssBaseline, GlobalStyles } from '@mui/material';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { ThemeProvider as GeekThemeProvider, useThemeMode as useGeekThemeMode } from '@geeksuite/user';
import { FocusModeProvider, GeekUpdateIndicator } from '@geeksuite/ui';
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
          {/* PWA_STANDARD rule 9: "Updating…" during the post-deploy reload. */}
          <GeekUpdateIndicator />
          {/* Mouse-only: undoes the shared theme's 44px input floor so
              NoteGeek's forms stay compact with a mouse. Scoped to
              `(min-width: 600px) and (pointer: fine)` — a phone needs the
              44px hit area (MOBILE_UI_PLAN §2, no exceptions), and so does
              a finger on a tablet at any width (tablet wave 2026-11-16:
              this `!important` held the note title and tags at 26–31 px on
              the 800 and 1280 px tablet). */}
          <GlobalStyles
            styles={{
              '@media (min-width: 600px) and (pointer: fine)': {
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
