/**
 * Pointer-sized targets (plan 2.6, tablet baseline "Fix first" 8).
 *
 * A control sized by the INPUT, not the width: 44 px (the suite minimum,
 * `geekLayout.minClickTarget`) for a finger at any width — a 1280 px tablet in
 * landscape is still a finger — and compact only where the primary pointer is
 * fine (a mouse or trackpad). Opt-in: nothing in this package uses it by
 * default, so no existing control changes size until an app spreads it.
 *
 * The 44 px is the BASE and the compact size sits under `geekMedia.fine`, not
 * the other way round, so a device that answers neither pointer query gets
 * the safe size.
 *
 *   // NoteGeek's sidebar tag toggle: 24 px with a mouse, 44 px on the tablet.
 *   <IconButton sx={{ ...geekTarget({ fine: 24, both: true }) }} />
 *
 *   // A filter row: 34 px tall on desktop, 44 px on touch.
 *   <ListItemButton sx={{ ...geekTarget({ fine: 34 }), px: 2 }} />
 *
 * Spread it FIRST in an sx block if the component sets its own min-height
 * elsewhere in that block, or last to win over it — sx keys merge in order.
 */
import { geekLayout } from '../designTokens.js';
import { geekMedia } from '../hooks/useFormFactor.js';

/** Target on a coarse pointer (a finger, a pen held as a finger). */
export const GEEK_COARSE_TARGET = geekLayout.minClickTarget;
/** Default compact target on a fine pointer. */
export const GEEK_FINE_TARGET = 32;

/**
 * @param {object} [options]
 * @param {number} [options.fine=32]   min size where the primary pointer is fine.
 * @param {number} [options.coarse=44] min size everywhere else.
 * @param {boolean} [options.both=false] size the width too (icon buttons);
 *   default is height only (rows, chips, inputs).
 * @returns {object} an sx fragment.
 */
export function geekTarget({ fine = GEEK_FINE_TARGET, coarse = GEEK_COARSE_TARGET, both = false } = {}) {
  const box = (size) => (both ? { minHeight: size, minWidth: size } : { minHeight: size });
  return { ...box(coarse), [geekMedia.fine]: box(fine) };
}
