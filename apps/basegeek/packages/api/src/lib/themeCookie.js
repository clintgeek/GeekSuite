// Shared `geek_theme` cookie — tells every GeekSuite app's pre-React
// preboot <script> which theme to paint before React mounts, so the
// first load doesn't flicker between system default and the user's
// stored preference.
//
// Written by the server on login / register / bootstrap / preferences
// update. Mirrored client-side by @geeksuite/user's ThemeProvider when
// the user toggles in-app. Read by the inline preboot snippet injected
// via @geeksuite/user's Vite plugin.
//
// NOT HttpOnly — the preboot runs in JS and has to read document.cookie.

const COOKIE_NAME = 'geek_theme';

const COOKIE_DOMAIN =
  process.env.SSO_COOKIE_DOMAIN ||
  (process.env.NODE_ENV === 'production' ? '.clintgeek.com' : undefined);

const COOKIE_SECURE = process.env.NODE_ENV === 'production';

/**
 * @param {import('express').Response} res
 * @param {string | undefined} theme — one of 'light' | 'dark' | 'auto' | 'system'
 *   (accept 'system' as well; preboot normalizes it to 'auto').
 */
export function setThemeCookie(res, theme) {
  if (!theme) return;
  const opts = {
    path: '/',
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    httpOnly: false, // MUST be JS-readable
    secure: COOKIE_SECURE,
    sameSite: 'lax',
  };
  if (COOKIE_DOMAIN) opts.domain = COOKIE_DOMAIN;
  res.cookie(COOKIE_NAME, theme, opts);
}
