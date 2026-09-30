/**
 * Label Maker, measured. Every text/background pair ThingGeek paints, on
 * every ground it lands on, in both modes: the kraft desk (and a fibre line
 * across it), the kraft chrome, card stock, the Dymo tape, the safety-orange
 * fill, the selection tints, the photo overlays. axe cannot see sidebar rows
 * or gradient tape (they come back "incomplete"), so this file is the gate.
 *
 * Text ≥ 4.5:1. Glyphs and component edges (a UI boundary, not copy) ≥ 3:1.
 */
import { describe, expect, it } from 'vitest';
import { alpha, getContrastRatio } from '@mui/material/styles';
import { INK, PLATE, SAFETY, STATUS_TONES, SURFACES, TAPE, TAPE_FILL_ALPHA, TAPE_TONES, createThingTheme } from '../../theme/theme';
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

for (const mode of ['light', 'dark']) {
  const s = SURFACES[mode];
  const t = createThingTheme(mode);
  const ink = INK[mode];
  const safety = SAFETY[mode];
  const fibreDesk = over(s.fibre, s.desk);
  const copy = { desk: s.desk, 'desk under a fibre line': fibreDesk, chrome: s.chrome, paper: s.paper, card: s.card, raised: s.raised };
  const sheets = { paper: s.paper, card: s.card, raised: s.raised };

  // Body and secondary copy land everywhere, the chrome included (the tab bar, the top bar, the sidebar).
  for (const [g, bg] of Object.entries(copy)) {
    add(`${mode} text on ${g}`, s.text, bg);
    add(`${mode} secondary on ${g}`, s.secondary, bg);
  }
  // Muted copy (empty dashes, counts) lands on the desk and on card stock — never on the chrome.
  for (const [g, bg] of Object.entries({ desk: s.desk, 'desk under a fibre line': fibreDesk, ...sheets })) add(`${mode} muted on ${g}`, s.muted, bg);

  // Ink is MUI's primary: links, text buttons, icons — on the desk and card stock.
  for (const [g, bg] of Object.entries({ desk: s.desk, chrome: s.chrome, ...sheets })) add(`${mode} ink (primary.main) on ${g}`, ink.main, bg);
  add(`${mode} contained ink button label`, ink.contrastText, ink.main);
  add(`${mode} contained ink button label, hovered`, ink.contrastText, ink.dark);
  add(`${mode} the theme agrees: primary.contrastText on primary.main`, t.palette.primary.contrastText, t.palette.primary.main);

  // Safety orange: ALWAYS a fill with dark ink on it (Save, Add a thing, the Add tab, attention badges).
  add(`${mode} ink on safety orange`, safety.contrastText, safety.main);
  add(`${mode} ink on safety orange, hovered`, safety.contrastText, safety.dark);
  add(`${mode} the theme agrees: safety.contrastText on safety.main`, t.palette.safety.contrastText, t.palette.safety.main);
  // A dark-ink outline separates the orange fill from light kraft; on the dark shelf the orange stands out by itself.
  add(`${mode} the orange fill's dark outline`, safety.contrastText, safety.main, GLYPH);
  add(`${mode} the orange fill against the chrome it sits on`, mode === 'light' ? safety.contrastText : safety.main, mode === 'light' ? safety.main : s.chrome, GLYPH);
  // The attention dot: orange with an ink ring, on card stock.
  add(`${mode} attention dot ring on paper`, s.text, s.paper, GLYPH);

  // Dymo tape: raised letters on the tape's darkest and lightest bands.
  add(`${mode} tape letters on the tape body`, TAPE.ink, TAPE.ground);
  add(`${mode} tape letters on the tape's top sheen`, TAPE.ink, TAPE.top);
  // Every refill tone (blue containers, red Overdue, green Done, the orange
  // action strip): a struck letter's face — its ink at TAPE_FILL_ALPHA over
  // the tape — on the tone's body and on its top gloss (the lightest ground).
  for (const [name, tone] of Object.entries(TAPE_TONES)) {
    for (const band of ['body', 'top']) add(`${mode} ${name} tape letter face on its ${band}`, over(alpha(tone.ink, TAPE_FILL_ALPHA), tone[band]), tone[band]);
  }
  // On a light desk the tape reads as a shape by itself.
  if (mode === 'light') add(`${mode} tape against the desk (the strip's edge)`, TAPE.top, s.desk, GLYPH);

  // Due-date tones: small text on card stock (DueLine still walks them through readableOn).
  for (const [k, v] of Object.entries(STATUS_TONES[mode])) for (const [g, bg] of Object.entries(sheets)) add(`${mode} status.${k} on ${g}`, v, bg);
  // Error copy (Trash purge line, danger rows) on card stock.
  for (const [g, bg] of Object.entries({ paper: s.paper, card: s.card })) add(`${mode} error on ${g}`, t.palette.error.main, bg);

  // The type plate: a glyph.
  add(`${mode} type-plate glyph`, PLATE[mode].icon, PLATE[mode].ground, GLYPH);

  // Selection and hover tints.
  const chipTint = alpha(t.palette.primary.main, mode === 'dark' ? 0.16 : 0.1);
  for (const [g, bg] of Object.entries(sheets)) add(`${mode} selected chip text on its tint over ${g}`, s.text, over(chipTint, bg));
  // A hovered sidebar row turns its label to text.primary on a 7% ink wash.
  add(`${mode} sidebar row hover: text on the wash over chrome`, s.text, over(alpha(s.text, 0.07), s.chrome));
  add(`${mode} sidebar selected row (a card-stock label)`, s.text, s.paper);
  add(`${mode} sidebar count badge`, s.secondary, s.raised);
  add(`${mode} list row hover`, s.text, over(t.palette.action.hover, s.paper));
  // The tab bar: the current tab's label on chrome, its glyph on a card-stock label.
  add(`${mode} current tab glyph on its card-stock label`, s.text, s.paper, GLYPH);
  add(`${mode} an idle tab's glyph on chrome`, s.secondary, s.chrome, GLYPH);
}

// Grounds outside the palette: photo overlays and the lightbox (a photo can be anything).
add('photo role badge / counter on the overlay over black', OVERLAY_INK, over(OVERLAY_GROUND, '#11100D'));
add('photo role badge / counter on the overlay over a white photo', OVERLAY_INK, over(OVERLAY_GROUND, '#FFFFFF'));
add('lightbox ink', LIGHTBOX_INK, '#0B0A08');
add('lightbox muted', LIGHTBOX_MUTED, '#0B0A08');

describe('Label Maker contrast', () => {
  it.each(pairs)('%s (%s on %s) ≥ %s:1', (label, fg, bg, min) => {
    expect(getContrastRatio(fg, bg), `${label}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
  });

  it('orange is never an ink: no palette text colour is safety orange', () => {
    for (const mode of ['light', 'dark']) {
      const t = createThingTheme(mode);
      const inks = [t.palette.text.primary, t.palette.text.secondary, t.palette.text.muted, t.palette.primary.main, t.palette.secondary.main];
      for (const c of inks) expect([SAFETY.light.main, SAFETY.dark.main]).not.toContain(c);
    }
  });
});
