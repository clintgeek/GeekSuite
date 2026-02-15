import { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
  const { preferences, loaded } = usePreferences();

  // Sync theme from baseGeek global preferences once loaded
  useEffect(() => {
    if (loaded && preferences?.theme) {
      const remote = preferences.theme;
      if (remote === 'light' || remote === 'dark') {
        setThemePreference(remote);
      }
    }
  }, [loaded, preferences]);

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
    if (themePreference === 'auto') return systemTheme;
    return themePreference;
  }, [themePreference, systemTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, themePreference);
  }, [themePreference]);

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
