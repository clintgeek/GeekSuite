/**
 * Moving Day, measured. Every text/background pair ThingGeek paints, on
 * every ground it lands on, in both modes: the cardboard desk and box faces
 * (and under the dust texture), printed stock, the black chrome (top bar,
 * tab bar, sidebar, the cab dashboard, a mural's panel, an odometer drum),
 * the dim inside of a storage unit (under its bulb), moving labels, the
 * orange livery fills, the oversize banner, marker lights, selection tints
 * and the photo overlays. axe cannot see generated content, sidebar rows or
 * text over gradients (they come back "incomplete"), so this file is the gate.
 *
 * Text ≥ 4.5:1. Glyphs and component edges (a UI boundary, not copy) ≥ 3:1.
 */
import { describe, expect, it } from 'vitest';
import { alpha, getContrastRatio } from '@mui/material/styles';
import { BOX, CHROME, DUST, LABEL, LIVERY, LOAD, MARKER, OVERSIZE, PRIMARY, STATUS_TONES, SURFACES, UNIT, createThingTheme } from '../../theme/theme';
import { mixOver } from '../../theme/chipStyles';
import { LIGHTBOX_INK, LIGHTBOX_MUTED } from '../../views/detail/Lightbox';
import { OVERLAY_GROUND, OVERLAY_INK } from '../../views/detail/Gallery';

const parse = (c) => {
  if (c.startsWith('#')) {
    const s = c.replace('#', '');
    return [...[0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)), 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
  return [Number(r), Number(g), Number(b), Number(a)];
};
/** `top` (possibly translucent) over an opaque `under` → '#rrggbb'. */
const over = (top, under) => {
  const [r, g, b, a] = parse(top);
  const [R, G, B] = parse(under);
  const mix = (x, y) => Math.round(x * a + y * (1 - a)).toString(16).padStart(2, '0');
  return `#${mix(r, R)}${mix(g, G)}${mix(b, B)}`;
};

const TEXT = 4.5;
const GLYPH = 3;
const pairs = [];
const add = (label, fg, bg, min = TEXT) => pairs.push([label, fg, bg, min]);

// The dashboard's panel runs a gradient from this (its lightest) down to near-black.
const DASH_TOP = '#221D18';
// An odometer drum's lightest band (its rounded top and bottom edge).
const DRUM_EDGE = '#3B3530';

for (const mode of ['light', 'dark']) {
  const s = SURFACES[mode];
  const t = createThingTheme(mode);
  const dust = DUST[mode];
  // Text lands on the desk and on box faces under the dust: the worst speck is the speck colour at full tile alpha.
  const grounds = {
    desk: s.desk,
    'desk under dust': over(dust.speck, s.desk),
    'desk under a scuff': over(dust.streak, s.desk),
    card: s.card,
    'card under dust': over(dust.speck, s.card),
    'card under a scuff': over(dust.streak, s.card),
    paper: s.paper,
    raised: s.raised,
  };

  for (const [g, bg] of Object.entries(grounds)) {
    add(`${mode} text on ${g}`, s.text, bg);
    add(`${mode} secondary on ${g}`, s.secondary, bg);
    add(`${mode} muted on ${g}`, s.muted, bg);
    add(`${mode} primary.main (links, icons, text buttons) on ${g}`, PRIMARY[mode].main, bg);
    // The box markings on a thing's page and the care stamp sit on the desk or a box face.
    add(`${mode} status.overdue (the FRAGILE stamp) on ${g}`, STATUS_TONES[mode].overdue, bg);
  }
  add(`${mode} contained primary label`, PRIMARY[mode].contrastText, PRIMARY[mode].main);
  add(`${mode} contained primary label, hovered`, PRIMARY[mode].contrastText, PRIMARY[mode].dark);
  add(`${mode} the theme agrees: primary.contrastText on primary.main`, t.palette.primary.contrastText, t.palette.primary.main);

  // The heavy rule across a box face / form: a boundary.
  for (const [g, bg] of Object.entries({ desk: s.desk, card: s.card, paper: s.paper })) add(`${mode} the heavy rule against ${g}`, t.palette.rule.main, bg, GLYPH);

  // Due-date tones: small text on box faces and paper (DueLine still walks them through readableOn).
  for (const [k, v] of Object.entries(STATUS_TONES[mode])) for (const g of ['card', 'card under dust', 'paper', 'raised']) add(`${mode} status.${k} on ${g}`, v, grounds[g]);
  for (const g of ['card', 'paper']) add(`${mode} error on ${g}`, t.palette.error.main, grounds[g]);

  // A moving label: printed stock, ink on it; its burnt-orange caption strip, white stencil.
  add(`${mode} moving label name on its stock`, LABEL[mode].ink, LABEL[mode].stock);
  add(`${mode} the label's soft ink on its stock`, LABEL[mode].soft, LABEL[mode].stock);

  // The box illustrations and box faces: the glyph printed on cardboard.
  add(`${mode} box-face glyph on the face`, BOX[mode].print, BOX[mode].face, GLYPH);
  add(`${mode} the hand-hold against the face`, BOX[mode].hole, BOX[mode].face, GLYPH);

  // Marker lights (the attention dot, a status heading): a lit fill with a black ring.
  for (const g of ['card', 'paper', 'desk']) {
    const bg = grounds[g];
    if (mode === 'light') add(`${mode} marker ring on ${g}`, MARKER.ring, bg, GLYPH);
    else for (const [k, fill] of Object.entries({ overdue: MARKER.overdue, soon: MARKER.soon })) add(`${mode} ${k} marker fill on ${g}`, fill, bg, GLYPH);
  }

  // Selection: the chip tint over printed stock, card and wells.
  const chipTint = alpha(t.palette.primary.main, mode === 'dark' ? 0.16 : 0.1);
  for (const g of ['paper', 'card', 'raised']) add(`${mode} selected chip text on its tint over ${g}`, s.text, mixOver(chipTint, grounds[g]));
  add(`${mode} list row hover`, s.text, over(t.palette.action.hover, s.card));

  // The dim inside of a storage unit, under its bulb (rendered under the chrome theme).
  const u = UNIT[mode];
  const lit = over(u.glow, u.interior);
  for (const [g, bg] of Object.entries({ 'unit interior': u.interior, 'unit interior under the bulb': lit })) {
    add(`${mode} chrome text in the ${g}`, CHROME.text, bg);
    add(`${mode} chrome secondary in the ${g}`, CHROME.secondary, bg);
    add(`${mode} orange (the theme's primary there) in the ${g}`, PRIMARY.dark.main, bg);
  }
  // The roll-up door against the frame and the floor it stands on (it's a shape).
  add(`${mode} the door against its black frame`, u.door, u.frame, GLYPH);
}

// ── Both modes: the black chrome and the livery ─────────────────────────────
const chromeGrounds = {
  bar: CHROME.bar,
  'bar under dust': over(DUST.dark.speck, CHROME.bar),
  raised: CHROME.raised,
  'dashboard top': DASH_TOP,
  'dashboard top under dust': over(DUST.dark.speck, DASH_TOP),
};
for (const [g, bg] of Object.entries(chromeGrounds)) {
  add(`chrome text on ${g}`, CHROME.text, bg);
  add(`chrome secondary on ${g}`, CHROME.secondary, bg);
  // Orange stencils on black: WHERE / ROOM over a mural, THE LOADING DOCK, MEMBERS ONLY, the active tab.
  add(`livery orange (stencil text) on ${g}`, LIVERY.orange, bg);
}
const chrome = createThingTheme('light', { chrome: true });
add('the chrome theme agrees: text.primary on its paper', chrome.palette.text.primary, chrome.palette.background.paper);
add('the chrome theme agrees: text.secondary on its default', chrome.palette.text.secondary, chrome.palette.background.default);
add('a hovered sidebar row: text on the wash over the bar', CHROME.text, over(alpha(CHROME.text, 0.08), CHROME.bar));
add('the selected sidebar row: text on raised', CHROME.text, CHROME.raised);
add('the selected sidebar row: its orange glyph', LIVERY.orange, CHROME.raised, GLYPH);
add('an idle tab glyph on the bar', CHROME.secondary, CHROME.bar, GLYPH);
add('the current tab glyph (orange) on the bar', LIVERY.orange, CHROME.bar, GLYPH);
add('odometer numerals on a drum', CHROME.text, CHROME.bar);
add("odometer numerals on a drum's lit edge", CHROME.text, DRUM_EDGE);

// Orange fills always carry BLACK lettering: the Load button, the attention badge, a box's band, the Done stamp.
add('Load lettering on orange', LOAD.contrastText, LOAD.main);
add('Load lettering on orange, hovered/pressed', LOAD.contrastText, LOAD.dark);
add('Load lettering on orange, its light shade', LOAD.contrastText, LOAD.light);
add('the theme agrees: load.contrastText on load.main', createThingTheme('light').palette.load.contrastText, createThingTheme('light').palette.load.main);
add('the orange Load button against the black bar', LOAD.main, CHROME.bar, GLYPH);
// The one orange that carries WHITE: a moving label's caption strip.
add("a label's white caption on the burnt-orange strip", LIVERY.white, LIVERY.burnt);
// The oversize banner: the highway sign's yellow.
add('OVERSIZE lettering on the yellow', OVERSIZE.ink, OVERSIZE.ground);
// The unit plate: chrome text on black.
add('the unit number plate', CHROME.text, CHROME.bar);

// Grounds outside the palette: photo overlays and the lightbox (a photo can be anything).
add('photo role badge / counter on the overlay over black', OVERLAY_INK, over(OVERLAY_GROUND, '#11100D'));
add('photo role badge / counter on the overlay over a white photo', OVERLAY_INK, over(OVERLAY_GROUND, '#FFFFFF'));
add('lightbox ink', LIGHTBOX_INK, '#0B0A08');
add('lightbox muted', LIGHTBOX_MUTED, '#0B0A08');

describe('Moving Day contrast', () => {
  it.each(pairs)('%s (%s on %s) ≥ %s:1', (label, fg, bg, min) => {
    expect(getContrastRatio(fg, bg), `${label}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
  });

  it('orange is never body ink by day: no light-mode text token is a livery orange', () => {
    const t = createThingTheme('light');
    const inks = [t.palette.text.primary, t.palette.text.secondary, t.palette.text.muted, t.palette.primary.main];
    for (const c of inks) expect([LIVERY.orange, LIVERY.deep, LIVERY.burnt]).not.toContain(c);
  });

  it('the black chrome is never a declared page surface (the shared theme would bleach the focused label)', () => {
    for (const mode of ['light', 'dark']) {
      const bg = Object.values(createThingTheme(mode).palette.background);
      expect(bg).not.toContain(CHROME.bar);
    }
  });
});
