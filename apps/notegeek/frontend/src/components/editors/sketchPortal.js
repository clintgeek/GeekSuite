/**
 * sketchPortal.js — where the sketch's pickers and tooltips render, and which
 * way they open (review 2.2, 2.4).
 *
 * MUI portals a Popover or Tooltip to `document.body` by default. In
 * fullscreen only the sketch's container is on screen, so every picker opened
 * invisibly while its backdrop sat on top eating taps. They now portal into
 * the container itself, fullscreen or not. And the bar can sit on any edge,
 * so a picker opens away from it.
 */
import { createContext, useContext } from 'react';

export const SketchPortalContext = createContext({ container: undefined, position: 'bottom' });

export const useSketchPortal = () => useContext(SketchPortalContext);

/** Popover origins for a bar on this edge: the picker opens toward the page. */
export function popoverOrigins(position = 'bottom') {
  switch (position) {
    case 'top':
      return { anchorOrigin: { vertical: 'bottom', horizontal: 'center' }, transformOrigin: { vertical: 'top', horizontal: 'center' }, gap: { mt: 2 } };
    case 'left':
      return { anchorOrigin: { vertical: 'center', horizontal: 'right' }, transformOrigin: { vertical: 'center', horizontal: 'left' }, gap: { ml: 2 } };
    case 'right':
      return { anchorOrigin: { vertical: 'center', horizontal: 'left' }, transformOrigin: { vertical: 'center', horizontal: 'right' }, gap: { mr: 2 } };
    default:
      return { anchorOrigin: { vertical: 'top', horizontal: 'center' }, transformOrigin: { vertical: 'bottom', horizontal: 'center' }, gap: { mb: 2 } };
  }
}

/** A tooltip's placement for a bar on this edge. */
export const tooltipPlacement = (position = 'bottom') => ({ top: 'bottom', left: 'right', right: 'left' }[position] || 'top');
