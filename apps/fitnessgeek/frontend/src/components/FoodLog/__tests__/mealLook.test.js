/**
 * Visual review A1: the Food log's meal sections wear the same produce
 * colours as Home's meal cards — tomato, leaf, lemon, plum, with ink on the
 * fill — not the retired Studio Slate gradients with white on amber (2.15:1).
 */
import { describe, expect, it } from 'vitest';
import { createTheme } from '@mui/material/styles';
import { mealLook } from '../mealLook.js';
import { createFitnessTheme, mealColors } from '../../../theme/theme.jsx';

describe('mealLook', () => {
  it.each(['breakfast', 'lunch', 'dinner', 'snack'])('%s is its produce colour, ink on the fill, in both modes', (meal) => {
    for (const mode of ['light', 'dark']) {
      const p = mealColors(meal, mode);
      expect(mealLook(meal, createFitnessTheme(mode))).toEqual({ badge: p.fill, badgeInk: p.ink, headerBg: p.tint, edge: p.fill });
    }
  });

  it('never puts white on the fill, and falls back on a bare MUI theme', () => {
    const look = mealLook('breakfast', createTheme());
    expect(look.badgeInk).not.toMatch(/#fff/i);
    expect(look.badge).toBe(mealColors('breakfast', 'light').fill);
    expect(mealLook('dinner', createTheme({ palette: { mode: 'dark' } })).badge).toBe(mealColors('dinner', 'dark').fill);
  });
});
