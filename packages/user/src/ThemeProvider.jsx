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

const toRemote = (pref) => (pref === 'auto' ? 'system' : pref);

/**
 * Theme preference, synced three ways: the `geek_theme` cookie (read before
 * first paint, shared across *.clintgeek.com), the account preference in
 * basegeek, and the OS scheme when the preference is 'auto'.
 *
 * The account is the source of truth once it has loaded. The two directions
 * have exactly one trigger each, so they cannot chase each other:
 *   - account → local: whenever the loaded account value changes, adopt it.
 *   - local → account: only when THIS page changes the preference (a toggle
 *     or a settings pick), or once at load when the account has no value yet.
 *
 * The old version pushed from an effect keyed on the account value and used a
 * flag set inside a state updater to skip its own echo. React runs updaters
 * lazily, so the push effect ran before the flag was set: a cookie that
 * disagreed with the account PATCHed the stale value, the reply flipped the
 * account value, and the page flickered dark/light forever (2026-09-25).
 */
export function ThemeProvider({ children, defaultPreference = 'auto' }) {
  const [themePreference, setLocalPreference] = useState(() =>
    getInitialPreference(defaultPreference)
  );
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const { preferences, updatePreferences, loaded } = usePreferences();

  // Latest local value, for the one-time "account has none yet" seed.
  const currentRef = useRef(themePreference);
  currentRef.current = themePreference;
  // A value this page is pushing. While it is in flight, an older account
  // value arriving (a stale reply) must not win over the user's newest pick.
  const pendingRef = useRef(null);
  const seededRef = useRef(false);

  const pushRemote = useCallback(
    (pref) => {
      pendingRef.current = pref;
      Promise.resolve(updatePreferences({ theme: toRemote(pref) }))
        .catch((err) => {
          console.error('[geeksuite/user] failed to sync theme', err);
        })
        .finally(() => {
          if (pendingRef.current === pref) pendingRef.current = null;
        });
    },
    [updatePreferences]
  );

  // account → local
  useEffect(() => {
    if (!loaded) return;
    const remote = normalize(preferences?.theme);
    if (!remote) {
      // A fresh account: seed it with what this browser already uses, once.
      if (!seededRef.current) {
        seededRef.current = true;
        pushRemote(currentRef.current);
      }
      return;
    }
    seededRef.current = true;
    if (pendingRef.current && pendingRef.current !== remote) return;
    setLocalPreference(remote);
  }, [loaded, preferences?.theme, pushRemote]);

  // local → account, only for changes made on this page.
  const setThemePreference = useCallback(
    (next) => {
      const resolved = normalize(typeof next === 'function' ? next(currentRef.current) : next);
      if (!resolved) return;
      setLocalPreference(resolved);
      if (loaded && resolved !== normalize(preferences?.theme)) pushRemote(resolved);
    },
    [loaded, preferences?.theme, pushRemote]
  );

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

  // The cookie follows the local value so the next page load (in any suite
  // app) pre-boots into it without a flash. Writing a cookie never syncs.
  useEffect(() => {
    writeCookie(COOKIE_NAME, themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemePreference((prev) => {
      if (prev === 'auto') return systemTheme === 'dark' ? 'light' : 'dark';
      return prev === 'dark' ? 'light' : 'dark';
    });
  }, [systemTheme, setThemePreference]);

  const value = useMemo(
    () => ({ theme, themePreference, setThemePreference, toggleTheme }),
    [theme, themePreference, setThemePreference, toggleTheme]
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
