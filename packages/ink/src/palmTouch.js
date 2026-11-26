/**
 * palmTouch.js — is a touch on the toolbar a resting palm?
 *
 * Used by both toolbars: NoteGeek's DrawingToolbar and GeekDay's InkToolbar.
 *
 * A touch on the bar in pen mode is a palm when a pen was near a moment ago
 * (resting the hand to write), or the contact is wide. A deliberate fingertip
 * with the pen put down still works, so the bar is never locked out.
 */
export const PALM_PEN_RECENT_MS = 1500;
export const PALM_CONTACT_PX = 24;

export function isPalmTouch(e, { penMode, lastPenAt, now = Date.now() }) {
  if (!penMode || e.pointerType !== 'touch') return false;
  if (now - (lastPenAt || 0) < PALM_PEN_RECENT_MS) return true;
  return (e.width || 0) >= PALM_CONTACT_PX || (e.height || 0) >= PALM_CONTACT_PX;
}
