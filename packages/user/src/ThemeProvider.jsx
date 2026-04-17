import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePreferences } from './useUserStore.js';

const COOKIE_NAME = 'geek_theme';

function cookieDomain() {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split('.');
  if (parts.length < 2) return null;
  return '.' + parts.slice(-2).join('.');
}

function readCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name, value) {
  if (typeof document === 'undefined') return;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'Max-Age=31536000',
    'SameSite=Lax',
  ];
  const domain = cookieDomain();
  if (domain) parts.push(`Domain=${domain}`);
  if (window.location.protocol === 'https:') parts.push('Secure');
  document.cookie = parts.join('; ');
}

function normalize(pref) {
  if (pref === 'system') return 'auto';
  if (pref === 'light' || pref === 'dark' || pref === 'auto') return pref;
  return null;
}

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialPreference(defaultPreference) {
  return normalize(readCookie(COOKIE_NAME)) || defaultPreference;
}

const ThemeContext = createContext({
  theme: 'light',
  themePreference: 'auto',
  setThemePreference: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children, defaultPreference = 'auto' }) {
  const [themePreference, setThemePreference] = useState(() =>
    getInitialPreference(defaultPreference)
  );
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const { preferences, updatePreferences, loaded } = usePreferences();
  // One-shot flag so a remote→local sync doesn't immediately push itself back.
  const syncingFromRemote = useRef(false);

  useEffect(() => {
    if (!loaded) return;
    const remote = normalize(preferences?.theme);
    if (!remote) return;
    setThemePreference((prev) => {
      if (prev === remote) return prev;
      syncingFromRemote.current = true;
      return remote;
    });
  }, [loaded, preferences?.theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const theme = useMemo(
    () => (themePreference === 'auto' ? systemTheme : themePreference),
    [themePreference, systemTheme]
  );

  useEffect(() => {
    writeCookie(COOKIE_NAME, themePreference);

    if (!loaded) return;
    if (syncingFromRemote.current) {
      syncingFromRemote.current = false;
      return;
    }
    // DB stores 'system', we use 'auto' locally — normalize before comparing.
    const remoteVal = themePreference === 'auto' ? 'system' : themePreference;
    const remoteNorm = normalize(preferences?.theme);
    if (remoteNorm !== themePreference) {
      updatePreferences({ theme: remoteVal }).catch((err) => {
        console.error('[geeksuite/user] failed to sync theme', err);
      });
    }
  }, [themePreference, loaded, preferences?.theme, updatePreferences]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemePreference((prev) => {
      if (prev === 'auto') return systemTheme === 'dark' ? 'light' : 'dark';
      return prev === 'dark' ? 'light' : 'dark';
    });
  }, [systemTheme]);

  const value = useMemo(
    () => ({ theme, themePreference, setThemePreference, toggleTheme }),
    [theme, themePreference, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  return useContext(ThemeContext);
}

// Re-export so existing `@geeksuite/user` consumers can still import
// `themePrebootScript` from the package root. New code should prefer
// the Vite plugin (`@geeksuite/user/vite`) which injects it for you.
export { themePrebootScript } from './themePreboot.js';
