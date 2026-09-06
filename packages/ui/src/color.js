/**
 * Color helpers that need the theme's *mode*, not just its palette.
 *
 * Every app that paints a domain color as text — bujogeek's aging inks,
 * storygeek's genre swatches, fitnessgeek's BP categories — hit the same wall
 * on 2026-09-02: a hue tuned for one mode is unreadable in the other, so each
 * site grew its own `isDark ? lighten(c, 0.35) : c` branch. Four of them, four
 * different constants, one shared idea. This is that idea, once.
 */
import {
  darken,
  decomposeColor,
  getContrastRatio,
  getLuminance,
  lighten,
  recomposeColor,
} from '@mui/material/styles';

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

/* ── readableOn ────────────────────────────────────────────────────────── */

/** Memo for `readableOn`: the walk is deterministic and runs inside `sx`. */
const readableCache = new Map();

/**
 * The same idea as `toneForMode`, but measured instead of guessed.
 *
 * `toneForMode` nudges a domain color by a fixed amount and hopes. The
 * 2026-09-05 a11y burn-down showed what that costs: bujogeek's aging inks
 * landed at 2.4–4.0:1 as 12px text, storygeek's gold overlines at 2.5–3.7:1,
 * all of them "adjusted for the mode" and none of them readable. A fixed nudge
 * cannot know what surface the text ends up on — a chip tint is not the paper.
 *
 * So: composite the color over the surface (an `rgba()` ink is only as dark as
 * what shows through), measure, and walk it away from the surface in 2.5%
 * steps until it clears `min`. Direction comes from the surface, not the mode,
 * because a light chip on a dark page is a real thing.
 *
 * A tinted surface is the same problem one layer down. `alpha(ink, 0.12)` on a
 * chip is not a color either — it is a color *and the paper under it*, and on
 * dark paper it composites to something entirely different than on light. Pass
 * that paper as `under` and the surface is flattened before anything is
 * measured against it; the 2026-09-05 pass found fitnessgeek's source chips at
 * 2.56:1 in dark and 4.14:1 in light from one `alpha()` background.
 *
 * @param {string} color   the ink. `rgba()` is flattened over `surface` first.
 * @param {string} surface the background it sits on. A translucent surface
 *                         needs `under`; without one it is composited over
 *                         white, which is a guess and usually a wrong one.
 * @param {{min?: number, under?: string}} [options] `min` defaults to 4.5
 *                         (WCAG AA, normal text) — pass 3 for large text or a
 *                         graphical object. `under` is the opaque color beneath
 *                         `surface`, normally `background.paper`; it defaults
 *                         to white and is ignored when `surface` is opaque.
 * @returns {string} the original color when it already clears `min`, otherwise
 *                   the first step that does; black or white if nothing does.
 */
export function readableOn(color, surface, { min = 4.5, under = '#FFFFFF' } = {}) {
  if (!color || !surface) return color;

  const key = `${color}|${surface}|${min}|${under}`;
  const cached = readableCache.get(key);
  if (cached !== undefined) return cached;

  const result = computeReadable(color, surface, min, under);
  readableCache.set(key, result);
  return result;
}

function computeReadable(color, surface, min, under) {
  let ground;
  let ink;
  try {
    ground = flattenOver(surface, under);
    ink = flattenOver(color, ground);
  } catch {
    // An unparseable color (a CSS variable, `currentColor`) is not something
    // this can reason about. Hand it back rather than guessing.
    return color;
  }

  if (getContrastRatio(ink, ground) >= min) return color;

  const lift = getLuminance(ground) < 0.5;
  for (let step = 1; step <= 40; step += 1) {
    const candidate = lift ? lighten(ink, step / 40) : darken(ink, step / 40);
    if (getContrastRatio(candidate, ground) >= min) return candidate;
  }
  return lift ? '#FFFFFF' : '#000000';
}

/** Composite a possibly-translucent color over an opaque one. */
function flattenOver(color, base) {
  const parts = decomposeColor(color);
  if (parts.values.length < 4) return recomposeColor(parts);

  const alpha = parts.values[3];
  if (alpha >= 1) {
    return recomposeColor({ type: 'rgb', values: parts.values.slice(0, 3) });
  }
  const under = decomposeColor(base).values;
  return recomposeColor({
    type: 'rgb',
    values: parts.values
      .slice(0, 3)
      .map((v, i) => Math.round(v * alpha + under[i] * (1 - alpha))),
  });
}
