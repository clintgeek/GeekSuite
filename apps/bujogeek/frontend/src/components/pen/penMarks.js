/**
 * The pen's marks, as data URIs and constants, so the row, the add box and the
 * tests all agree on them.
 *
 * The strike is one hand-drawn stroke: a slightly uneven line, heavier in the
 * middle, that overshoots the words a hair at each end. It is painted as the
 * BACKGROUND of the inline words span with `box-decoration-break: clone`, so a
 * task that wraps onto two lines gets a stroke through each line, and it is
 * "drawn" by growing `background-size` from 0% to 100% — a left-to-right
 * reveal, like a pen moving. `vector-effect: non-scaling-stroke` keeps the
 * stroke 2.6px thick however long the line is. The words carry 2px of
 * inline padding (cancelled by a negative margin) so the stroke starts a hair
 * before the first letter and runs a hair past the last.
 */
export const STRIKE_MS = 320;

const STRIKE_PATH = 'M0.8 60 C 10 53, 21 63, 33 57 S 55 50, 67 56 S 88 62, 99.2 50';

export function strikeImage(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">`
    + `<path d="${STRIKE_PATH}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** The tick inside the filled square. */
export const TICK_PATH = 'M4.5 10.5 L8.5 14.2 L15.5 5.8';

/** Visually hidden, still read. (In MUI `sx`, width: 1 means 100% — hence px.) */
export const srOnly = {
  position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

/**
 * The redaction bar's width: roughly the words', in steps of eight
 * characters, so the bar reads as "some words" without measuring them out.
 */
export function redactionWidth(text) {
  const n = String(text ?? '').length;
  const stepped = Math.min(Math.max(Math.ceil(n / 8) * 8, 8), 48);
  return `${stepped * 0.5}em`;
}
