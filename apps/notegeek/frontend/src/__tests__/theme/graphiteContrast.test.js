/**
 * Graphite, measured. Every ink the app paints as text, on every ground it
 * can land on, in both modes — the desk, the chrome paper, the writing sheet,
 * the highlighter fill and the loud save status's tint. packages/ui's suite
 * test covers the MUI palette pairs; this covers the ones only NoteGeek
 * paints (highlighter fills, the save alert, the tag/filter selections).
 */
import { describe, it, expect } from 'vitest';
import { alpha, getContrastRatio } from '@mui/material/styles';
import { graphite, SANS, MONO } from '../../theme/graphite';
import { createNoteTheme } from '../../theme/createAppTheme';

const r = (a, b) => Number(getContrastRatio(a, b).toFixed(2));

/** An rgba() over an opaque ground, as a hex MUI can measure. */
function over(color, ground) {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return color;
  const [cr, cg, cb, a = 1] = m[1].split(',').map((v) => Number(v.trim()));
  const g = ground.replace('#', '');
  const base = [0, 2, 4].map((i) => parseInt(g.slice(i, i + 2), 16));
  const mix = [cr, cg, cb].map((v, i) => Math.round(v * a + base[i] * (1 - a)));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const pairs = [];
for (const [mode, p] of Object.entries(graphite)) {
  const grounds = { desk: p.desk, paper: p.paper, sheet: p.sheet };
  for (const [gName, bg] of Object.entries(grounds)) {
    // Body, metadata and third-tier copy on every ground.
    for (const ink of ['ink', 'ink2', 'muted']) pairs.push([`${mode} ${ink} on ${gName}`, p[ink], bg, 4.5]);
    // The error ink is copy too ("not saved" in the status line).
    pairs.push([`${mode} error on ${gName}`, p.error, bg, 4.5]);
    // Links, focus rings and active icons are graphite primary.
    pairs.push([`${mode} primary.main on ${gName}`, p.primary.main, bg, 4.5]);
    // Type glyphs, mind-map edges: graphics.
    pairs.push([`${mode} lead (graphics) on ${gName}`, p.lead, bg, 3]);
    // The grid never pushes copy under AA: ink2 over a grid line.
    pairs.push([`${mode} ink2 on a grid line over ${gName}`, p.ink2, over(p.grid, bg), 4.5]);
    // Hovered rows and filter chips: a 5% wash of ink.
    pairs.push([`${mode} ink2 on hover wash over ${gName}`, p.ink2, over(alpha(p.ink, 0.05), bg), 4.5]);
  }
  // The highlighter: ink on it, never it on paper.
  pairs.push([`${mode} onHl on highlighter (nav row, filter, primary button, selection)`, p.onHl, p.hl, 4.5]);
  // By day the page ink sits on it too (search hits in titles, the brand).
  if (mode === 'light') pairs.push([`${mode} ink on highlighter`, p.ink, p.hl, 4.5]);
  pairs.push([`${mode} ink on soft highlighter`, p.ink, p.hlSoft, 4.5]);
  // The loud save status: error ink on its tint.
  pairs.push([`${mode} error on errorFill (save alert)`, p.error, p.errorFill, 4.5]);
  // Primary button label (theme contrastText) on graphite primary.
  pairs.push([`${mode} primary.contrastText on primary.main`, p.primary.contrastText, p.primary.main, 4.5]);
  // Inert controls keep a perceptibility floor.
  pairs.push([`${mode} disabled on paper (floor)`, p.disabled, p.paper, 2.5]);
}

describe('Graphite contrast', () => {
  it.each(pairs)('%s (%s on %s) ≥ %s:1', (label, fg, bg, min) => {
    expect(r(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
  });

  it('the highlighter is a fill, not an ink: it fails as text on every ground', () => {
    // By day it is barely there as a colour on paper — which is exactly why
    // nothing may be set in it.
    const p = graphite.light;
    for (const bg of [p.desk, p.paper, p.sheet]) expect(r(p.hl, bg)).toBeLessThan(3);
  });

  it('the ink is graphite, never pure black or pure white', () => {
    expect(graphite.light.ink.toUpperCase()).not.toBe('#000000');
    expect(graphite.dark.ink.toUpperCase()).not.toBe('#FFFFFF');
  });

  it('the theme wires the palette through', () => {
    for (const mode of ['light', 'dark']) {
      const t = createNoteTheme(mode);
      const p = graphite[mode];
      expect(t.palette.background.default).toBe(p.desk);
      expect(t.palette.background.paper).toBe(p.paper);
      expect(t.palette.text.primary).toBe(p.ink);
      expect(t.palette.text.secondary).toBe(p.ink2);
      expect(t.palette.error.main).toBe(p.error);
      expect(t.palette.primary.main).toBe(p.primary.main);
      expect(t.typography.fontFamily).toBe(SANS);
      expect(t.typography.fontFamilyMono).toBe(MONO);
      // Selected rows and contained primary buttons wear the highlighter.
      const sel = t.components.MuiListItemButton.styleOverrides.root['&.Mui-selected'];
      expect(sel.backgroundColor).toBe(p.hl);
      expect(sel.color).toBe(p.onHl);
      const btn = t.components.MuiButton.styleOverrides.containedPrimary;
      expect(btn.backgroundColor).toBe(p.hl);
      expect(btn.color).toBe(p.onHl);
      // Headings and captions are never uppercased.
      expect(t.typography.h6.textTransform).toBe('none');
      expect(t.typography.overline.textTransform).toBe('none');
    }
  });
});
