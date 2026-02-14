import { createContext, useContext, useEffect, useState, useMemo } from 'react';

const ThemeContext = createContext({
  theme: 'light',           // Effective theme (light or dark)
  themePreference: 'light',  // User preference (auto, light, dark)
  setThemePreference: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = 'fitnessgeek_theme';

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredPreference() {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'auto') {
    return stored;
  }
  return 'light';
}

export function ThemeProvider({ children }) {
  const [themePreference, setThemePreference] = useState(getStoredPreference);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  // Listen for system preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Calculate effective theme
  const theme = useMemo(() => {
    if (themePreference === 'auto') {
      return systemTheme;
    }
    return themePreference;
  }, [themePreference, systemTheme]);

  // Update localStorage and document when preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, themePreference);
  }, [themePreference]);

  // Update document theme attribute when effective theme changes
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => {
    setThemePreference((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // For backwards compatibility, setTheme sets the preference
  const setTheme = setThemePreference;

  return (
    <ThemeContext.Provider value={{ theme, themePreference, setTheme, setThemePreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
