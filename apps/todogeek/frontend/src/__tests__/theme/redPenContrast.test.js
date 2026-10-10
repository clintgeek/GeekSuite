/**
 * Red Pen, measured. Every ink the app paints as text, on every ground it can
 * land on, in both modes — including the 12px cases on a fill, and the night
 * sidebar chrome that packages/ui's suite test (light chrome only) cannot see.
 */
import { describe, it, expect } from 'vitest';
import { getContrastRatio } from '@mui/material/styles';
import { pen } from '../../theme/pen';
import { chrome, chromeDark } from '../../theme/chrome';
import { createTodoTheme } from '../../theme/theme';

const r = (a, b) => Number(getContrastRatio(a, b).toFixed(2));

const pairs = [];
for (const [mode, p] of Object.entries(pen)) {
  const grounds = { paper: p.paper, surface: p.surface, fill: p.fill };
  for (const [g, bg] of Object.entries(grounds)) {
    for (const ink of ['ink', 'grey', 'muted', 'red']) pairs.push([`${mode} ${ink} on ${g}`, p[ink], bg, 4.5]);
    pairs.push([`${mode} checkbox outline on ${g} (graphic)`, p.box, bg, 3]);
  }
  pairs.push([`${mode} tick on the red square`, p.onRed, p.red, 4.5]);
  pairs.push([`${mode} "Done" swipe label on red`, p.onRed, p.red, 4.5]);
  pairs.push([`${mode} "Tomorrow" swipe label on ink`, p.paper, p.ink, 4.5]);
  pairs.push([`${mode} active chip text on ink`, p.paper, p.ink, 4.5]);
}
for (const [mode, c] of [['light', chrome], ['dark', chromeDark]]) {
  pairs.push([`${mode} chrome active row`, c.text, c.active, 4.5]);
  pairs.push([`${mode} chrome inactive row`, c.textMuted, c.bg, 4.5]);
  pairs.push([`${mode} chrome hovered row`, c.textHover, c.bgHover, 4.5]);
  pairs.push([`${mode} chrome caption`, c.caption, c.active, 4.5]);
  pairs.push([`${mode} chrome reminders-on (red, hovered)`, c.accent, c.bgHover, 4.5]);
  pairs.push([`${mode} chrome wordmark`, c.logo, c.bg, 4.5]);
}

describe('Red Pen contrast', () => {
  it.each(pairs)('%s ≥ %s', (label, fg, bg, min) => {
    expect(r(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
  });

  it('the day red clears 4.5:1 on paper, and the night red on night paper', () => {
    expect(r(pen.light.red, pen.light.paper)).toBeGreaterThanOrEqual(5.4);
    expect(r(pen.dark.red, pen.dark.paper)).toBeGreaterThanOrEqual(4.5);
    // …lightened only as far as it had to be: the day red fails on night.
    expect(r(pen.light.red, pen.dark.paper)).toBeLessThan(4.5);
  });

  it('the theme wires the palette through', () => {
    for (const mode of ['light', 'dark']) {
      const t = createTodoTheme(mode);
      expect(t.palette.background.default).toBe(pen[mode].paper);
      expect(t.palette.text.primary).toBe(pen[mode].ink);
      expect(t.palette.error.main).toBe(pen[mode].red);
      expect(t.typography.fontFamily).toMatch(/^"Inter Tight"/);
    }
  });
});
