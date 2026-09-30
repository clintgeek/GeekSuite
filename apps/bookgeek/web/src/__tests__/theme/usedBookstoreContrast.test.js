/**
 * Used Bookstore, measured: the pairs BookGeek paints that the suite's
 * themeContrast gate can't see — lettering on the green signboard, the
 * yellow action and avatar on it, the price stickers, the shelf talkers'
 * handwriting (the bargain-bin sign uses the same card and ink), and the
 * aisle signs' selected state.
 *
 * Text ≥ 4.5:1. A selected state against the unselected one ≥ 3:1.
 */
import { describe, expect, it } from 'vitest';
import { getContrastRatio } from '@mui/material/styles';
import { SIGN, SIGN_YELLOW, STICKER, TALKER } from '../../theme/theme';

const pairs = [];
const add = (label, fg, bg, min = 4.5) => pairs.push([label, fg, bg, min]);

for (const mode of ['light', 'dark']) {
  const sign = SIGN[mode];
  add(`${mode} sign lettering on the board`, sign.ink, sign.board);
  add(`${mode} sign count (soft ink) on the board`, sign.inkSoft, sign.board);
  add(`${mode} sticker-yellow action/avatar ink`, SIGN_YELLOW.ink, SIGN_YELLOW.ground);
  add(`${mode} the yellow action against the green board`, SIGN_YELLOW.ground, sign.board, 3);
  // An aisle sign is a tab: its lettering (above) must read, and the shelf
  // you're on (a yellow board) must stand apart from the rest (green). The
  // board against the dark floor is NOT gated — the lettering identifies the
  // control — and the plank is decoration.
  add(`${mode} the selected aisle sign against an unselected one`, SIGN_YELLOW.ground, sign.board, 3);
}
for (const [shelf, tone] of Object.entries(STICKER)) add(`${shelf} sticker ink`, tone.ink, tone.ground);
add('talker handwriting on its card', TALKER.ink, TALKER.card, 7); // handwriting gets a higher bar

describe('Used Bookstore contrast', () => {
  it.each(pairs)('%s (%s on %s) ≥ %s:1', (label, fg, bg, min) => {
    expect(getContrastRatio(fg, bg), `${label}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
  });
});
