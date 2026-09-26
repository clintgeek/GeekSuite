/**
 * The generated cover for a game with no art: an arcade sticker keyed by a
 * hash of its title, so the same game always gets the same plate and a shelf
 * of them reads as a set rather than as missing images.
 *
 * Each plate is a flat LOUD ground with a second "pop" colour for the stripe,
 * and INK type. Every ground clears 6:1 against the ink (#0C0A12; the lowest
 * is magenta at 6.07:1), and the title only ever sits on the ground itself —
 * never on the stripe or the dots — so the plate reads in either theme. The
 * plate does not change with the mode; a box on a shelf does not either.
 */
import { ARCADE } from '../theme/theme';

export const PLATE_INK = ARCADE.ink;
/** The platform banner: cream on ink, like the black band across a game box. */
export const PLATE_BANNER = { bg: ARCADE.ink, fg: ARCADE.paperInk };

/** [ground, pop] — the pop is the stripe, never behind text. */
export const PLATE_GROUNDS = [
  [ARCADE.magenta, ARCADE.lime],
  [ARCADE.cyan, ARCADE.magenta],
  [ARCADE.lime, ARCADE.violet],
  [ARCADE.orange, ARCADE.cyan],
  [ARCADE.violet, ARCADE.yellow],
  [ARCADE.yellow, ARCADE.magenta],
  [ARCADE.mint, ARCADE.orange],
  [ARCADE.coral, ARCADE.cyan],
];

/** FNV-1a, 32-bit. Stable across sessions and machines. */
export function hashString(value) {
  let h = 0x811c9dc5;
  const s = String(value || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function plateFor(title) {
  const h = hashString((title || '').trim().toLowerCase());
  const index = h % PLATE_GROUNDS.length;
  const [ground, pop] = PLATE_GROUNDS[index];
  // Independent picks so neighbours with the same ground still differ: the
  // stripe's angle, and which way the card leans when it lifts.
  const angle = -18 + ((h >>> 8) % 5) * 6;
  const lean = (h >>> 12) % 2 === 0 ? -1 : 1;
  return { ground, pop, angle, lean, index, from: ground, to: pop };
}

/** Font size for the plate title, stepped by length so long names still fit (Bungee runs wide). */
export function plateTitleSize(title, { compact = false } = {}) {
  const n = (title || '').length;
  const base = n <= 8 ? 1.3 : n <= 14 ? 1.05 : n <= 24 ? 0.9 : 0.78;
  return `${compact ? Math.max(0.75, base * 0.62) : base}rem`;
}
