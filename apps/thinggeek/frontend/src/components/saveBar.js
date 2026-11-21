/**
 * The yard's Save bar, one look for Add and Edit: black, the orange livery
 * stripe along its top, two equal buttons. Only the look lives here; each
 * screen pins it its own way (Add: fixed to the window, over the keyboard;
 * Edit: sticky at the foot of the dialog's scrolling body).
 */
import { CHROME, LIVERY } from '../theme/theme';

export const SAVE_BAR_SX = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 1,
  px: 2,
  pt: '14px',
  bgcolor: CHROME.bar,
  // the livery: the orange stripe along the top
  backgroundImage: `linear-gradient(180deg, ${LIVERY.orange} 0 4px, transparent 4px)`,
};

/** The orange Save (and any yard-orange primary): heavy type, a dark outline. */
export const HERO_BUTTON_SX = { fontWeight: 800, border: 2, borderStyle: 'solid', borderColor: 'hero.contrastText' };
