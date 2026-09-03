/**
 * Contrast regression suite.
 *
 * Builds every GeekSuite MUI theme in every mode it ships and asserts WCAG
 * contrast on the palette pairs that actually end up on screen. This is the
 * automated form of the 2026-09-02 manual contrast sweep: if someone retunes a
 * palette and drops secondary text below AA, this fails by app + mode + pair
 * name instead of by bug report.
 *
 * Thresholds, and why they are what they are:
 *   4.5  WCAG AA for normal-size body text.
 *   3.0  WCAG AA for graphical objects / UI components — icons, outlined chip
 *        borders, active-nav indicators, large display type.
 *   2.5  Not a WCAG level. A perceptibility floor for `text.disabled`, which
 *        several apps still use for tertiary copy; it must remain visible even
 *        though inert controls are exempt from AA.
 */
import { describe, expect, it } from 'vitest';
import { decomposeColor, getContrastRatio, recomposeColor } from '@mui/material/styles';

import { createGeekSuiteTheme } from '../createGeekSuiteTheme.js';
import { createBuJoTheme } from '../../../../apps/bujogeek/frontend/src/theme/theme.js';
import { createNoteTheme } from '../../../../apps/notegeek/frontend/src/theme/createAppTheme.js';
import { createFitnessTheme } from '../../../../apps/fitnessgeek/frontend/src/theme/theme.jsx';
import { createFlockTheme } from '../../../../apps/flockgeek/frontend/src/theme/theme.js';
import { createStoryTheme } from '../../../../apps/storygeek/frontend/src/theme/theme.js';
import createBookTheme from '../../../../apps/bookgeek/web/src/theme/theme.js';
import { createBaseGeekTheme } from '../../../../apps/basegeek/packages/ui/src/theme.js';

/* ── color helpers ─────────────────────────────────────────────────────── */

/**
 * Flatten a translucent color over its surface so getContrastRatio sees an
 * opaque value. Dividers and glow tints are rgba(); text tokens should not be,
 * but an app can always slip one in.
 */
function flatten(color, surface) {
  const decomposed = decomposeColor(color);
  if (decomposed.values.length < 4) return color;

  const a = decomposed.values[3];
  if (a >= 1) return recomposeColor({ type: 'rgb', values: decomposed.values.slice(0, 3) });

  const base = decomposeColor(surface).values;
  const blended = decomposed.values
    .slice(0, 3)
    .map((v, i) => Math.round(v * a + base[i] * (1 - a)));

  return recomposeColor({ type: 'rgb', values: blended });
}

function ratio(fg, bg) {
  const surface = flatten(bg, '#FFFFFF');
  return getContrastRatio(flatten(fg, surface), surface);
}

/* ── themes under test ─────────────────────────────────────────────────── */

const THEMES = [
  { app: 'suite-default', modes: ['light', 'dark'], build: (mode) => createGeekSuiteTheme({ mode }) },
  { app: 'bujogeek', modes: ['light', 'dark'], build: createBuJoTheme },
  { app: 'notegeek', modes: ['light', 'dark'], build: createNoteTheme },
  { app: 'fitnessgeek', modes: ['light', 'dark'], build: createFitnessTheme },
  { app: 'flockgeek', modes: ['light', 'dark'], build: createFlockTheme },
  { app: 'storygeek', modes: ['light', 'dark'], build: createStoryTheme },
  { app: 'bookgeek', modes: ['light', 'dark'], build: createBookTheme },
  { app: 'basegeek', modes: ['light', 'dark'], build: createBaseGeekTheme },
];

/* ── pair matrix ───────────────────────────────────────────────────────── */

function pairsFor(theme) {
  const p = theme.palette;
  const tooltip = theme.components?.MuiTooltip?.styleOverrides?.tooltip;
  const surfaces = [
    ['background.default', p.background.default],
    ['background.paper', p.background.paper],
  ];

  const pairs = [];
  const add = (label, fg, bgLabel, bg, min) =>
    pairs.push({ label: `${label} on ${bgLabel}`, fg, bg, min });

  // Body copy: AA on both the canvas and the cards sitting on it.
  for (const tier of ['primary', 'secondary', 'muted']) {
    // `muted` is the third text tier; not every theme declares one yet.
    if (!p.text[tier]) continue;
    for (const [bgLabel, bg] of surfaces) {
      add(`text.${tier}`, p.text[tier], bgLabel, bg, 4.5);
    }
  }

  // Inert controls are AA-exempt, but apps lean on this token for tertiary
  // copy, so hold a perceptibility floor rather than nothing.
  if (p.text.disabled) {
    add('text.disabled', p.text.disabled, 'background.paper', p.background.paper, 2.5);
  }

  // The accent doubles as link text, active-nav text and icon color.
  add('primary.main', p.primary.main, 'background.paper', p.background.paper, 3.0);

  // Contained-button label sitting on the accent fill.
  pairs.push({
    label: 'primary.contrastText on primary.main',
    fg: p.primary.contrastText,
    bg: p.primary.main,
    min: 4.5,
  });

  // Semantic colors are foregrounds far more often than fills: status icons,
  // outlined chips, helper text.
  for (const tone of ['error', 'success', 'warning', 'info']) {
    add(`${tone}.main`, p[tone].main, 'background.paper', p.background.paper, 3.0);
  }

  // Error copy is real text ("Password is required"), so it owes AA too.
  add('error.main (as text)', p.error.main, 'background.paper', p.background.paper, 4.5);

  // Tooltips are palette-derived (TODO_ORDER #19): dark mode lifts the app's
  // paper and keeps `text.primary` on it, light mode inverts paper and ink. The
  // values are read off the built component override, so an app that retunes
  // its own MuiTooltip is held to the same bar as the factory default. Tooltip
  // copy is copy — AA, not the 3:1 graphics floor.
  if (tooltip?.backgroundColor && tooltip?.color) {
    pairs.push({
      label: 'MuiTooltip color on MuiTooltip backgroundColor',
      fg: tooltip.color,
      bg: tooltip.backgroundColor,
      min: 4.5,
    });
  }

  return pairs;
}

/* ── known gaps ────────────────────────────────────────────────────────── */

/**
 * Pairs that do not clear their threshold yet, recorded at the ratio measured
 * when this suite landed (2026-09-02). No threshold above is relaxed for them:
 * each entry is a RATCHET. The pair must stay at or above its recorded ratio,
 * so a palette edit that makes it worse still fails — and when a pair is
 * finally fixed the test fails too, telling you to delete the entry.
 *
 * Every one of these needs a decision, not a tweak, which is why they are
 * recorded rather than silently patched:
 *
 *   `primary.contrastText on primary.main` — the suite blue (formerly #6098CC, now #4B7AA3) (and
 *   bujogeek, which uses the same ramp) and fitnessgeek's teal both take a
 *   white label at ~3:1–3.75:1. Fixing it means darkening a brand accent or
 *   flipping to a dark label. TODO_ORDER #7 owns this.
 *
 *   `error.main (as text)` on warm dark papers — semanticDark.error #EF5350 is
 *   tuned for the suite's #1E1E1E paper; bujogeek, fitnessgeek and storygeek
 *   all sit on warmer, lighter dark surfaces where it lands at 4.07–4.36:1.
 *   The fix is a token change in designTokens.js affecting every dark theme.
 *
 *   `text.secondary` / `text.disabled` — suite-default's #757575 on the grey
 *   canvas, bujogeek's dark warm greys, and bookgeek reusing slate-500 for
 *   secondary in BOTH modes (its mode-tuned `muted` slot is more legible than
 *   its secondary). Part of the TODO_ORDER #3 text-tier sweep.
 */
const KNOWN_GAPS = {
};

/* ── suite ─────────────────────────────────────────────────────────────── */

const cases = THEMES.flatMap(({ app, modes, build }) =>
  modes.map((mode) => ({ app, mode, theme: build(mode) }))
);

describe.each(cases)('$app / $mode', ({ app, mode, theme }) => {
  const pairs = pairsFor(theme).map((pair) => {
    const floor = KNOWN_GAPS[`${app}/${mode}/${pair.label}`];
    return { ...pair, floor, name: floor ? `KNOWN GAP: ${pair.label}` : pair.label };
  });

  it.each(pairs)('$name >= $min:1', ({ label, fg, bg, min, floor }) => {
    const measured = ratio(fg, bg);
    const rounded = Number(measured.toFixed(2));

    if (floor === undefined) {
      expect(
        rounded,
        `${fg} on ${bg} measured ${rounded}:1, needs ${min}:1`
      ).toBeGreaterThanOrEqual(min);
      return;
    }

    // Ratchet: must not slip below the recorded ratio...
    expect(
      rounded,
      `${label}: ${fg} on ${bg} regressed to ${rounded}:1, ` +
        `below the recorded known gap of ${floor}:1 (target ${min}:1)`
    ).toBeGreaterThanOrEqual(floor);

    // ...and once it clears the real threshold, the entry has to go.
    expect(
      rounded,
      `${label}: ${fg} on ${bg} now measures ${rounded}:1 and clears ${min}:1 — ` +
        `remove "${app}/${mode}/${label}" from KNOWN_GAPS`
    ).toBeLessThan(min);
  });
});
