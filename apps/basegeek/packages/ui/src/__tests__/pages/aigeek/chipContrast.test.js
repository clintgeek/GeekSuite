/**
 * chipContrast.test.js — the status chips, measured.
 *
 * The mobile harness failed on 2026-09-16 with `color-contrast (serious)`:
 * the providers block's "listing failed" chip rendered white on the dark
 * theme's `error.main` (#c76b6b) at 3.65:1, against a 4.5:1 floor.
 *
 * The cause is a reasonable-looking default. MUI inks a filled chip with the
 * palette's `contrastText`, which is computed at a 3:1 threshold — right for a
 * button-sized label, wrong here, because these labels are 12px and 12px is
 * plain "normal text" to WCAG. Nothing in the component looked wrong; the
 * threshold was just somebody else's.
 *
 * This measures the ink the block actually uses, in both modes, so the harness
 * is not the first thing to find out. A harness run costs ten minutes and a
 * push; this costs milliseconds.
 */
import { describe, it, expect } from 'vitest';
import { createBaseGeekTheme } from '../../../theme';
import { filledChipSx, contrastRatio, AA_NORMAL } from '../../../pages/aigeek/chipTone';

describe('the aiGeek status chips are readable on their own fill', () => {
  for (const mode of ['dark', 'light']) {
    for (const tone of ['error', 'success', 'warning']) {
      it(`${mode} ${tone} chip clears AA for 12px text`, () => {
        const theme = createBaseGeekTheme(mode);
        const { bgcolor, color } = filledChipSx(theme, tone);
        expect(contrastRatio(color, bgcolor)).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }

  it('leaves a fill alone when the palette already passes', () => {
    // This is a contrast fix, not a restyle: only the tone that actually
    // failed moves. On this palette that is the dark theme's error chip and
    // nothing else.
    const dark = createBaseGeekTheme('dark');
    expect(filledChipSx(dark, 'success').bgcolor).toBe(dark.palette.success.main);
    expect(filledChipSx(dark, 'error').bgcolor).toBe(dark.palette.error.dark);

    const light = createBaseGeekTheme('light');
    expect(filledChipSx(light, 'error').bgcolor).toBe(light.palette.error.main);
  });

  it('reproduces the exact failure the harness reported', () => {
    // White on #c76b6b at 3.65:1 — the number in the 2026-09-16 run. Kept so
    // the next reader can see this test is measuring the same thing axe was.
    expect(contrastRatio('#ffffff', '#c76b6b')).toBeCloseTo(3.65, 1);
  });
});
