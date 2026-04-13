import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '@geeksuite/user';

const ThemeContext = createContext({
  theme: 'light',
  themePreference: 'auto',
  setThemePreference: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = 'bujogeek_theme';

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredPreference() {
  if (typeof window === 'undefined') return 'auto';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'auto') {
    return stored;
  }
  return 'auto';
}

export function ThemeProvider({ children }) {
  const [themePreference, setThemePreference] = useState(getStoredPreference);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const { preferences, updatePreferences, loaded } = usePreferences();
  // Suppress remote-push for one cycle after a remote→local sync, so the two
  // effects don't fight each other (was causing dark/light flicker on boot).
  const syncingFromRemote = useRef(false);

  // Sync theme from baseGeek global preferences once loaded
  useEffect(() => {
    if (!loaded || !preferences?.theme) return;
    const remote = preferences.theme;
    if (remote === 'light' || remote === 'dark' || remote === 'system' || remote === 'auto') {
      const mapped = remote === 'system' ? 'auto' : remote;
      setThemePreference(prev => {
        if (prev === mapped) return prev;
        syncingFromRemote.current = true;
        return mapped;
      });
    }
  }, [loaded, preferences?.theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const theme = useMemo(() => {
    if (themePreference === 'auto' || themePreference === 'system') return systemTheme;
    return themePreference;
  }, [themePreference, systemTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, themePreference);

    if (!loaded) return;

    // Local just changed because we synced from remote — skip the push-back.
    if (syncingFromRemote.current) {
      syncingFromRemote.current = false;
      return;
    }

    // Normalize before comparing: DB stores 'system', local stores 'auto' — they're equivalent.
    const remoteVal    = themePreference === 'auto' ? 'system' : themePreference;
    const storedRemote = preferences?.theme;
    const remoteNorm   = storedRemote === 'system' ? 'auto' : storedRemote;

    if (remoteNorm !== themePreference) {
      updatePreferences({ theme: remoteVal }).catch(err => {
        console.error('Failed to update global theme preference', err);
      });
    }
  }, [themePreference, loaded, updatePreferences, preferences?.theme]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => {
    setThemePreference((prev) => {
      if (prev === 'auto') {
        return systemTheme === 'dark' ? 'light' : 'dark';
      }
      return prev === 'dark' ? 'light' : 'dark';
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, themePreference, setThemePreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  return useContext(ThemeContext);
}
