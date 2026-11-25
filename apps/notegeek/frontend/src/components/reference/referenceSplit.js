/**
 * The reference pane's divider (DOCS/REFERENCE_PANE_SPEC.md req 3). Pure.
 *
 * A fraction is how much of the note page's height the reference pane takes,
 * its own bar included.
 */

/** Where the divider comes to rest: a third, and half. */
export const SPLIT_SNAPS = [1 / 3, 1 / 2];

/** The pane opens at a third: two thirds of the screen stay under the pen. */
export const SPLIT_DEFAULT = SPLIT_SNAPS[0];

/** Let go above this and the pane closes ("dragged all the way up"). */
export const SPLIT_CLOSE_BELOW = 0.16;

/** While dragging, the pane never takes more than this. */
export const SPLIT_MAX = 0.6;

/** The pane's bar: the drag handle, and a finger target. */
export const SPLIT_BAR_HEIGHT = 44;

/** The fraction a pointer at `y` asks for, inside a page from `top`, `height` tall. */
export function fractionAt(y, top, height) {
  if (!(height > 0)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(0, (y - top) / height));
}

/**
 * Where a released divider settles: the nearest snap, or `null` when it was
 * let go near the top, which closes the pane.
 */
export function settleFraction(fraction) {
  if (!(fraction >= SPLIT_CLOSE_BELOW)) return null;
  return SPLIT_SNAPS.reduce((best, snap) => (Math.abs(snap - fraction) < Math.abs(best - fraction) ? snap : best), SPLIT_SNAPS[0]);
}

/** The next rest position up or down, for the keyboard. `null` closes. */
export function stepFraction(fraction, direction) {
  const at = SPLIT_SNAPS.findIndex((snap) => Math.abs(snap - fraction) < 0.01);
  const next = (at < 0 ? 0 : at) + (direction > 0 ? 1 : -1);
  if (next < 0) return null;
  return SPLIT_SNAPS[Math.min(next, SPLIT_SNAPS.length - 1)];
}
