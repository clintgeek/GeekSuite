/**
 * County Gazette contrast: packages/ui's themeContrast matrix, run here on
 * NewsGeek's theme until NewsGeek is registered in that suite's THEMES list.
 * The pair matrix below is copied verbatim from
 * packages/ui/src/__tests__/themeContrast.test.js (2026-10-10); then the
 * Gazette's own pairs that sit on grounds the palette does not declare
 * (the OFFICIAL badge, health tones).
 */
import { describe, expect, it } from 'vitest';
import { alpha, decomposeColor, getContrastRatio, recomposeColor } from '@mui/material/styles';
import { SIDEBAR_CHIP_TINT, sidebarChipInk } from '../../../../../../packages/ui/src/navigation/sidebarInk.js';
import { geekInteraction } from '../../../../../../packages/ui/src/designTokens.js';
import { createNewsTheme, GAZETTE } from '../../theme/theme';

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

const THEMES = [{ app: 'newsgeek', modes: ['light', 'dark'], build: createNewsTheme }];

/* ── pair matrix ───────────────────────────────────────────────────────── */

function pairsFor(theme) {
  const p = theme.palette;
  const tooltip = theme.components?.MuiTooltip?.styleOverrides?.tooltip;
  const focusedLabel = theme.components?.MuiFormLabel?.styleOverrides?.root?.['&.Mui-focused'];
  // EVERY surface the palette declares, not just the canvas and the cards.
  // The 2026-09-05 axe pass found the muted tiers failing on the *tinted*
  // surfaces an app adds beside those two (flockgeek's sidebar, todogeek's
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

  // A contained button's label on its hover/press fill. The shared override
  // resolves that fill per `color` (it used to paint every colour
  // `primary.dark`), so read it off the built override the way MUI calls it.
  // A tap on a phone is the press state, and the label is still copy: AA.
  const contained = theme.components?.MuiButton?.styleOverrides?.contained;
  for (const tone of ['primary', 'secondary', 'error', 'success', 'warning', 'info']) {
    const style = typeof contained === 'function'
      ? contained({ ownerState: { color: tone, variant: 'contained' }, theme })
      : contained;
    const fill = style?.['&:active']?.backgroundColor ?? style?.['&:hover']?.backgroundColor;
    if (!fill || !p[tone]?.contrastText) continue;
    pairs.push({
      label: `${tone}.contrastText on contained ${tone} press fill`,
      fg: p[tone].contrastText,
      bg: fill,
      min: 4.5,
    });
  }

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

/* ── suite ─────────────────────────────────────────────────────────────── */

const cases = THEMES.flatMap(({ app, modes, build }) => modes.map((mode) => ({ app, mode, theme: build(mode) })));

describe.each(cases)('$app / $mode', ({ theme }) => {
  it.each(pairsFor(theme))('$label >= $min:1', ({ fg, bg, min, under }) => {
    const rounded = Number(ratio(fg, bg, under).toFixed(2));
    expect(rounded, `${fg} on ${bg} measured ${rounded}:1, needs ${min}:1`).toBeGreaterThanOrEqual(min);
  });
});

/* ── Gazette grounds outside the palette ───────────────────────────────── */

const GROUND_PAIRS = ['light', 'dark'].flatMap((mode) => {
  const g = GAZETTE[mode];
  const pairs = [
    // The OFFICIAL badge: 12px spot-colour capitals on the spot tint, and the spot as text on the page.
    [`${mode}: official badge ink on spot tint`, g.spot, g.spotTint],
    [`${mode}: official ink on newsprint`, g.spot, g.newsprint],
    [`${mode}: official ink on stock`, g.spot, g.stock],
    // Muted copy on the shaded band (selected row, section band).
    [`${mode}: text.muted on shade`, g.inkFaint, g.shade],
    [`${mode}: text.secondary on shade`, g.inkSoft, g.shade],
  ];
  // Health labels are 12-13px text in their tone, on the page and on stock.
  for (const [state, tone] of Object.entries(g.tone)) {
    pairs.push([`${mode}: health ${state} on newsprint`, tone, g.newsprint]);
    pairs.push([`${mode}: health ${state} on stock`, tone, g.stock]);
  }
  return pairs;
}).map(([label, fg, bg]) => ({ label, fg, bg, min: 4.5 }));

describe('Gazette grounds outside the palette', () => {
  it.each(GROUND_PAIRS)('$label >= $min:1', ({ fg, bg, min }) => {
    const rounded = Number(ratio(fg, bg).toFixed(2));
    expect(rounded, `${fg} on ${bg} measured ${rounded}:1, needs ${min}:1`).toBeGreaterThanOrEqual(min);
  });
});
