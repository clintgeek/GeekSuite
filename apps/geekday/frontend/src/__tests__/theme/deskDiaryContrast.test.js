/**
 * Desk Diary contrast: every text-on-surface pair the app paints, both modes.
 * A ratio belongs to a PAIR (DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md, "Colour on a
 * surface"), so each ink is measured on the surfaces it really lands on.
 */
import { describe, expect, it } from 'vitest';
import createDayTheme, { DOCK, INK, RIBBON, SURFACES } from '../../theme/theme.js';

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe.each(['light', 'dark'])('Desk Diary, %s', (mode) => {
  const s = SURFACES[mode];
  const surfaces = { desk: s.desk, page: s.page, raised: s.raised };

  it.each(Object.entries(surfaces))('body, secondary and muted text clear 4.5:1 on the %s', (_name, surface) => {
    expect(ratio(s.text, surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(s.secondary, surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(s.muted, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(surfaces))('the ribbon (today, overdue) and the ink accent are readable as text on the %s', (_name, surface) => {
    expect(ratio(RIBBON[mode].main, surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(INK[mode].main, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('button labels clear 4.5:1 on their fills', () => {
    expect(ratio(INK[mode].contrastText, INK[mode].main)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(RIBBON[mode].contrastText, RIBBON[mode].main)).toBeGreaterThanOrEqual(4.5);
  });

  it('the built theme carries these surfaces', () => {
    const theme = createDayTheme(mode);
    expect(theme.palette.background.default).toBe(s.desk);
    expect(theme.palette.day.page).toBe(s.page);
    expect(theme.palette.text.primary).toBe(s.text);
    expect(theme.palette.secondary.main).toBe(RIBBON[mode].main);
  });
});

describe('the docked clock face', () => {
  it('is readable on its own dark ground in either mode', () => {
    expect(ratio(DOCK.text, DOCK.ground)).toBeGreaterThanOrEqual(7);
    expect(ratio(DOCK.secondary, DOCK.ground)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(DOCK.ribbon, DOCK.ground)).toBeGreaterThanOrEqual(4.5);
  });
});
