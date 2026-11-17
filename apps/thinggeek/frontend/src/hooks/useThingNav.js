/**
 * Which navigation ThingGeek draws: 'bottom' (the phone's tab bar), 'rail'
 * or 'sidebar'.
 *
 * ThingGeek is a desktop app with a phone view; the tablet gets a middle
 * ground, not a redesign (Chef, 2026-11-17). So only a TOUCH tablet takes the
 * rail (`useFormFactor`: a coarse pointer whose short side is 600+, either
 * grip). Everything with a mouse is as it always was, by width: the tab bar
 * below `md` (900), the sidebar from there up.
 */
import { useMediaQuery, useTheme } from '@mui/material';
import { useFormFactor } from '@geeksuite/ui';

export function thingNavFor(ff, narrow) {
  if (ff.coarse && ff.tablet) return 'rail';
  return narrow ? 'bottom' : 'sidebar';
}

export default function useThingNav() {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('md'));
  return thingNavFor(useFormFactor(), narrow);
}
