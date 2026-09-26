/**
 * ThingGeek's contrast ratchet: every text pair the app paints, measured on
 * every surface it lands on. axe cannot see sidebar rows (they come back
 * "incomplete"), so those pairs are asserted here — this file is the gate.
 */
import { describe, expect, it } from 'vitest';
import { alpha, getContrastRatio } from '@mui/material/styles';
import { createThingTheme } from '../../theme/theme';
import { LIGHTBOX_INK, LIGHTBOX_MUTED } from '../../views/detail/Lightbox';
import { OVERLAY_GROUND, OVERLAY_INK } from '../../views/detail/Gallery';

const hex = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const parse = (c) => {
  if (c.startsWith('#')) return [...hex(c), 1];
  const m = c.match(/rgba?\(([^)]+)\)/);
  const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
  return [Number(r), Number(g), Number(b), Number(a)];
};
/** `top` (possibly translucent) composited over opaque `under` → '#rrggbb'. */
const over = (top, under) => {
  const [r, g, b, a] = parse(top);
  const [R, G, B] = parse(under);
  const mix = (x, y) => Math.round(x * a + y * (1 - a)).toString(16).padStart(2, '0');
  return `#${mix(r, R)}${mix(g, G)}${mix(b, B)}`;
};

for (const mode of ['light', 'dark']) {
  describe(`${mode} palette`, () => {
    const t = createThingTheme(mode);
    const { background, text, primary, status } = t.palette;
    const surfaces = ['default', 'paper', 'card', 'raised'].map((k) => [k, background[k]]);
    const inks = [
      ['text.primary', text.primary],
      ['text.secondary', text.secondary],
      ['text.muted', text.muted],
      ['primary.main', primary.main],
      ...Object.entries(status).map(([k, v]) => [`status.${k}`, v]),
    ];

    for (const [inkName, ink] of inks) {
      for (const [surfaceName, surface] of surfaces) {
        it(`${inkName} on background.${surfaceName} ≥ 4.5`, () => {
          expect(getContrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    it('filled accent carries its label', () => {
      expect(getContrastRatio(primary.contrastText, primary.main)).toBeGreaterThanOrEqual(4.5);
    });

    it('error text on the card (Trash purge line, danger rows)', () => {
      expect(getContrastRatio(t.palette.error.main, background.card)).toBeGreaterThanOrEqual(4.5);
    });

    it('sidebar badge: text.secondary on background.raised', () => {
      expect(getContrastRatio(text.secondary, background.raised)).toBeGreaterThanOrEqual(4.5);
    });

    it('sidebar selected row: text.primary on the 12% accent tint over paper', () => {
      const ground = over(alpha(primary.main, 0.12), background.paper);
      expect(getContrastRatio(text.primary, ground)).toBeGreaterThanOrEqual(4.5);
      // and the badge inside a selected row sits on raised, not the tint
      expect(getContrastRatio(text.secondary, ground)).toBeGreaterThanOrEqual(4.5);
    });

    it('selected chip: text.primary on its accent tint over every surface', () => {
      const tint = alpha(primary.main, mode === 'dark' ? 0.16 : 0.1);
      for (const [, surface] of surfaces) expect(getContrastRatio(text.primary, over(tint, surface))).toBeGreaterThanOrEqual(4.5);
    });
  });
}

describe('grounds outside the palette', () => {
  it('lightbox inks on its black', () => {
    expect(getContrastRatio(LIGHTBOX_INK, '#0B0A08')).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(LIGHTBOX_MUTED, '#0B0A08')).toBeGreaterThanOrEqual(4.5);
  });

  it('photo role badge and counter: overlay ink on the overlay ground', () => {
    expect(getContrastRatio(OVERLAY_INK, over(OVERLAY_GROUND, '#11100D'))).toBeGreaterThanOrEqual(4.5);
    // worst case: the badge over a white photo
    expect(getContrastRatio(OVERLAY_INK, over(OVERLAY_GROUND, '#FFFFFF'))).toBeGreaterThanOrEqual(4.5);
  });
});
