/**
 * The ink for GeekSidebar's 12px accent chips (count badge, monogram). It is
 * kept in its own module so the component file exports only components (fast
 * refresh), and so themeContrast.test.js can assert it per theme.
 */
import { alpha } from '@mui/material/styles';
import { readableAcross, flattenOver } from '../color.js';
import { geekInteraction } from '../designTokens.js';

/** The accent tint behind the badge and the monogram chip. */
export const SIDEBAR_CHIP_TINT = 0.14;

/**
 * The accent ink for 12px text on the accent chip tint (count badge, monogram).
 * 12px is normal text, so it owes 4.5:1, and the ground is the tint over
 * whatever surface the panel sits on. For a badge inside a selected row, that
 * is the tint over the row's own selected tint. `primary.main` at 12px on its
 * own 14% tint measured 3.43:1 in bookgeek light (2026-09-25). The ink moves,
 * not the fill, because the ink is the accent and not white. Apps that paint
 * the panel with their own always-dark chrome (not a palette surface) should
 * style these through `badgeProps.sx` / `brand.monogramSx`.
 */
export function sidebarChipInk(theme) {
  const { primary, background } = theme.palette;
  const surfaces = Object.values(background).filter((value) => typeof value === 'string');
  const selectedTint = alpha(primary.main, geekInteraction.activeOpacity);
  const grounds = [...surfaces, ...surfaces.map((surface) => flattenOver(selectedTint, surface))];
  return readableAcross(primary.main, grounds, { tint: alpha(primary.main, SIDEBAR_CHIP_TINT) });
}
