/**
 * The generated cover for a game with no art: a slate plate keyed by a hash
 * of its title, so the same game always gets the same plate and a shelf of
 * them reads as a set rather than as missing images.
 *
 * The hues are deliberately low-chroma and dark — ink on slate, not candy —
 * so the amber rule and the cream title carry the identity. Every ground is
 * dark enough that the plate's cream (#F3EBDD) text clears AA on its lightest
 * stop in either theme; the plate does not change with the mode, a box on a
 * shelf does not either.
 */
export const PLATE_INK = '#F3EBDD';
export const PLATE_SUBINK = '#E2D8C6';

export const PLATE_GROUNDS = [
  ['#27344A', '#141B27'], // harbour slate
  ['#2F3D3A', '#161F1D'], // moss slate
  ['#3A2E44', '#1B1522'], // plum
  ['#442C2C', '#211515'], // oxblood
  ['#2B3A4A', '#121A22'], // deep sea
  ['#4A2F24', '#1F1410'], // ember
  ['#2E2F4A', '#151624'], // indigo
  ['#3D3230', '#1E1817'], // umber
  ['#243B3F', '#11201F'], // teal night
  ['#3A3340', '#1A171E'], // graphite violet
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
  const [from, to] = PLATE_GROUNDS[h % PLATE_GROUNDS.length];
  // A second, independent pick for the angle so neighbours with the same
  // ground still differ a little.
  const angle = 150 + ((h >>> 8) % 5) * 10;
  return { from, to, angle, index: h % PLATE_GROUNDS.length };
}

/** Font size for the plate title, stepped by length so long names still fit. */
export function plateTitleSize(title, { compact = false } = {}) {
  const n = (title || '').length;
  const base = n <= 12 ? 1.35 : n <= 22 ? 1.15 : n <= 36 ? 1 : 0.875;
  return `${compact ? Math.max(0.75, base * 0.62) : base}rem`;
}
