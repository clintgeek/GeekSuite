/**
 * Color helpers that need the theme's *mode*, not just its palette.
 *
 * Every app that paints a domain color as text — bujogeek's aging inks,
 * storygeek's genre swatches, fitnessgeek's BP categories — hit the same wall
 * on 2026-09-02: a hue tuned for one mode is unreadable in the other, so each
 * site grew its own `isDark ? lighten(c, 0.35) : c` branch. Four of them, four
 * different constants, one shared idea. This is that idea, once.
 */
import { darken, lighten } from '@mui/material/styles';

/**
 * A domain color, nudged so it stays readable in the current mode.
 *
 * Dark mode lifts the color toward white; light mode pushes it toward black.
 * The defaults are the values the ad hoc branches converged on. Pass `0` for
 * either side to leave that mode's color untouched — several call sites only
 * ever needed the dark lift, because their palette was authored for light.
 *
 * @param {string} color        Any CSS color MUI's `lighten`/`darken` accept.
 * @param {object|string} theme A theme (`theme.palette.mode` is read) or a
 *                              bare `'light'` / `'dark'` string.
 * @param {{lightenBy?: number, darkenBy?: number}} [options]
 * @returns {string} The adjusted color, or `color` unchanged when there is
 *                   nothing to adjust.
 */
export function toneForMode(color, theme, { lightenBy = 0.35, darkenBy = 0.3 } = {}) {
  if (!color) return color;

  const mode = typeof theme === 'string' ? theme : theme?.palette?.mode;
  const amount = mode === 'dark' ? lightenBy : darkenBy;
  if (!amount) return color;

  return mode === 'dark' ? lighten(color, lightenBy) : darken(color, darkenBy);
}
