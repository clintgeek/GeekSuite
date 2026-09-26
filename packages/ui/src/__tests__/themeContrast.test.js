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
import { alpha, decomposeColor, getContrastRatio, recomposeColor } from '@mui/material/styles';

import { createGeekSuiteTheme } from '../createGeekSuiteTheme.js';
import { createBuJoTheme } from '../../../../apps/bujogeek/frontend/src/theme/theme.js';
import { createNoteTheme } from '../../../../apps/notegeek/frontend/src/theme/createAppTheme.js';
import { createFitnessTheme } from '../../../../apps/fitnessgeek/frontend/src/theme/theme.jsx';
import { createFlockTheme } from '../../../../apps/flockgeek/frontend/src/theme/theme.js';
import { createStoryTheme } from '../../../../apps/storygeek/frontend/src/theme/theme.js';
import createBookTheme from '../../../../apps/bookgeek/web/src/theme/theme.js';
import { createBaseGeekTheme } from '../../../../apps/basegeek/packages/ui/src/theme.js';
import { SIDEBAR_CHIP_TINT, sidebarChipInk } from '../navigation/sidebarInk.js';
import { geekInteraction } from '../designTokens.js';
import { chrome as bujoChrome } from '../../../../apps/bujogeek/frontend/src/theme/chrome.js';
import * as fitnessChrome from '../../../../apps/fitnessgeek/frontend/src/components/Layout/chrome.js';

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

function ratio(fg, bg, under = '#FFFFFF') {
  const surface = flatten(bg, under);
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
  const focusedLabel = theme.components?.MuiFormLabel?.styleOverrides?.root?.['&.Mui-focused'];
  // EVERY surface the palette declares, not just the canvas and the cards.
  // The 2026-09-05 axe pass found the muted tiers failing on the *tinted*
  // surfaces an app adds beside those two (flockgeek's sidebar, bujogeek's
  // warm/cream section grounds) — exactly the pairs a two-surface sweep could
  // not see. Anything non-string under `palette.background` (MUI's own
  // augmentations) is skipped.
  const surfaces = Object.entries(p.background)
    .filter(([, value]) => typeof value === 'string')
    .map(([name, value]) => [`background.${name}`, value])
    .sort(([a], [b]) => a.localeCompare(b));

  const pairs = [];
  const add = (label, fg, bgLabel, bg, min, under) =>
    pairs.push({ label: `${label} on ${bgLabel}`, fg, bg, min, under });

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
  // A focused form label is painted with the accent and is real copy, so it
  // owes AA rather than the 3:1 graphics floor. The suite theme runs the accent
  // through `readableOn` for exactly this; reading the built override holds an
  // app that retunes `MuiFormLabel` to the same bar.
  if (focusedLabel?.color) {
    for (const [bgLabel, bg] of surfaces) {
      add('MuiFormLabel Mui-focused color', focusedLabel.color, bgLabel, bg, 4.5);
    }
  }

  // A selected list row (the sidebar's active nav item) is accent text on an
  // accent tint over whichever surface the list sits on. It is copy, so it owes
  // AA. bookgeek's measured 3.52:1 in light mode on 2026-09-25, found only
  // because axe files every sidebar row as "incomplete". Read off the built
  // override, like the focused label.
  const selectedRow = theme.components?.MuiListItemButton?.styleOverrides?.root?.['&.Mui-selected'];
  if (selectedRow?.color && selectedRow?.backgroundColor) {
    for (const [bgLabel, bg] of surfaces) {
      add('MuiListItemButton Mui-selected color', selectedRow.color, `selected tint over ${bgLabel}`, selectedRow.backgroundColor, 4.5, bg);
    }
  }

  // GeekSidebar's count badge and monogram: 12px accent text on a 14% accent
  // tint, both bare and inside a selected row (3.43:1 in bookgeek light,
  // 2026-09-25).
  const chipInk = sidebarChipInk(theme);
  const chipTint = alpha(p.primary.main, SIDEBAR_CHIP_TINT);
  const rowTint = alpha(p.primary.main, geekInteraction.activeOpacity);
  for (const [bgLabel, bg] of surfaces) {
    add('GeekSidebar badge ink', chipInk, `chip tint over ${bgLabel}`, chipTint, 4.5, bg);
    add('GeekSidebar badge ink', chipInk, `chip tint over selected row over ${bgLabel}`, chipTint, 4.5, flatten(rowTint, bg));
  }

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

  it.each(pairs)('$name >= $min:1', ({ label, fg, bg, min, floor, under }) => {
    const measured = ratio(fg, bg, under);
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

/* ── grounds that are not palette surfaces ─────────────────────────────── */

/**
 * Some text sits on a ground the palette never declares, so the matrix above
 * cannot see it. Examples: an always-dark sidebar chrome that ignores the app
 * mode, or a component's own tint. The 2026-09-25 desktop harness pass found
 * five of these (FitnessGeek's section captions, BuJoGeek's nav rows, section
 * captions, quick-add prompt and out-of-month day numbers). The chrome inks
 * are imported from the modules the sidebars paint with, so retuning one
 * re-runs its pair here.
 */
const bujoLight = createBuJoTheme('light');
const bujoDark = createBuJoTheme('dark');

const GROUND_PAIRS = [
  // BuJoGeek sidebar: dark tobacco in both app modes.
  ['bujogeek chrome: active row title', bujoChrome.text, bujoChrome.active, 4.5],
  ['bujogeek chrome: hovered row title', bujoChrome.textHover, bujoChrome.bgHover, 4.5],
  ['bujogeek chrome: inactive row title', bujoChrome.textMuted, bujoChrome.bg, 4.5],
  ['bujogeek chrome: row description', bujoChrome.caption, bujoChrome.bg, 4.5],
  ['bujogeek chrome: row description (hovered)', bujoChrome.caption, bujoChrome.bgHover, 4.5],
  ['bujogeek chrome: row description (active)', bujoChrome.caption, bujoChrome.active, 4.5],
  ['bujogeek chrome: section caption', bujoChrome.textDisabled, bujoChrome.bg, 4.5],
  ['bujogeek chrome: wordmark', bujoChrome.logo, bujoChrome.bg, 4.5],
  ['bujogeek chrome: "BJ" mark / accent (12px)', bujoChrome.logoAccent, bujoChrome.bg, 4.5],
  ['bujogeek chrome: reminders-on toggle (hovered)', bujoChrome.accent, flatten(bujoChrome.accentBg, bujoChrome.bgHover), 4.5],
  // FitnessGeek sidebar: #0C0A09 in both app modes.
  ['fitnessgeek chrome: row / section caption', fitnessChrome.MUTED, fitnessChrome.CHROME_BG, 4.5],
  ['fitnessgeek chrome: hovered row', fitnessChrome.INK, flatten('rgba(255, 255, 255, 0.04)', fitnessChrome.CHROME_BG), 4.5],
  ['fitnessgeek chrome: active row', fitnessChrome.INK, flatten('rgba(45, 212, 191, 0.12)', fitnessChrome.CHROME_BG), 4.5],
  // BuJoGeek components on their own grounds.
  ['bujogeek/light quick-add prompt: text.muted on parchment.warm', bujoLight.palette.text.muted, '#F4EFE8', 4.5],
  ['bujogeek/dark quick-add prompt: text.muted on 2% white over background.default', bujoDark.palette.text.muted, flatten('rgba(255,255,255,0.02)', bujoDark.palette.background.default), 4.5],
  ['bujogeek/light month grid, outside day: text.muted on 1.5% black over background.default', bujoLight.palette.text.muted, flatten('rgba(0,0,0,0.015)', bujoLight.palette.background.default), 4.5],
  ['bujogeek/dark month grid, outside day: text.muted on 15% black over background.default', bujoDark.palette.text.muted, flatten('rgba(0,0,0,0.15)', bujoDark.palette.background.default), 4.5],
].map(([label, fg, bg, min]) => ({ label, fg, bg, min }));

describe('grounds outside the palette', () => {
  it.each(GROUND_PAIRS)('$label >= $min:1', ({ fg, bg, min }) => {
    const rounded = Number(ratio(fg, bg).toFixed(2));
    expect(rounded, `${fg} on ${bg} measured ${rounded}:1, needs ${min}:1`).toBeGreaterThanOrEqual(min);
  });
});
