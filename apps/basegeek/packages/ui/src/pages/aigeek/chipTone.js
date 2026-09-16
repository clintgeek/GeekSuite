/**
 * chipTone — a filled status chip that is readable on its own fill.
 *
 * The mobile harness failed on 2026-09-16 with `color-contrast (serious)`: the
 * providers block's "listing failed" chip drew white on the dark theme's
 * `error.main` (#c76b6b) at 3.65:1, under the 4.5:1 floor.
 *
 * The default that produced it is a reasonable one. MUI inks a filled chip
 * with the palette's `contrastText`, computed at a 3:1 threshold — correct for
 * a button-sized label, wrong for these, because they are 12px and 12px is
 * plain "normal text" to WCAG. Nothing in the component looked wrong; the
 * threshold was simply somebody else's.
 *
 * `readableOn` is the usual tool and is the wrong one here: it walks the *ink*
 * away from the surface, and the ink is already white. Measured on this
 * palette, white on `error.main` cannot be rescued (3.66) — but white on
 * `error.dark` clears comfortably (5.35 dark, 9.39 light). So the fill moves
 * and the ink stays, which also keeps a filled red chip looking like one.
 *
 * Rather than hard-code "error uses .dark", this measures: `main` if it
 * passes, otherwise `dark`. A palette change cannot silently reintroduce the
 * bug, and `chipContrast.test.js` asserts the result for every tone in both
 * modes, so the harness is not the first thing to find out.
 */

/** WCAG relative luminance of a `#rgb` / `#rrggbb` / `rgb()` colour. */
function luminance(colour) {
  let r; let g; let b;
  if (colour.startsWith('#')) {
    const hex = colour.length === 4
      ? [...colour.slice(1)].map(ch => ch + ch).join('')
      : colour.slice(1);
    [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  } else {
    [r, g, b] = colour.match(/[\d.]+/g).slice(0, 3).map(n => Number(n) / 255);
  }
  const channel = (x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  const [lr, lg, lb] = [r, g, b].map(channel);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio between two colours. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 12px is normal text to WCAG, so these labels answer to AA-normal. */
export const AA_NORMAL = 4.5;

/**
 * `{ bgcolor, color }` for a filled status chip of `tone`.
 *
 * Returns the palette's own `main` untouched wherever it already passes — this
 * is a contrast fix, not a restyle, and on this palette only the dark theme's
 * error chip actually moves.
 */
export function filledChipSx(theme, tone) {
  const palette = theme.palette[tone];
  const ink = palette.contrastText;
  const fill = contrastRatio(ink, palette.main) >= AA_NORMAL ? palette.main : palette.dark;
  return { bgcolor: fill, color: ink };
}

export default { filledChipSx, contrastRatio, AA_NORMAL };
