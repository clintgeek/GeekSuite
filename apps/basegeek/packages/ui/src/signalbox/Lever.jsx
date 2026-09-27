/**
 * Lever — a lever in the frame, for one real action.
 *
 * Throwing it (click, tap, Enter or Space — it is a `<button>`) swings the
 * lever over, runs the action, and holds it over for as long as the action is
 * in flight, then lets it fall back. A lever that is `busy` from outside (the
 * catalog job already running) stays over and cannot be thrown again; a
 * `locked` lever cannot be thrown at all and says why, the way a real frame's
 * interlocking refuses a lever that would set a conflicting route.
 *
 * Levers are only ever given non-destructive jobs. Anything that deletes,
 * revokes or resets stays behind its confirmation dialog elsewhere.
 *
 * Colour follows the railway convention (black points, yellow distant, blue
 * lock) and is decoration: the plate carries the name, the state is a word.
 */
import { useState } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { clunk } from './sound';

const LEVER_COLOURS = {
  black: { rod: '#1b1d20', grip: '#2e3238' },
  yellow: { rod: '#d8a51c', grip: '#b8860b' },
  blue: { rod: '#2c5aa0', grip: '#1f447c' },
  red: { rod: '#b3261e', grip: '#8c1c13' },
};

export default function Lever({
  number,
  label,
  description,
  colour = 'black',
  onPull,
  busy = false,
  locked = false,
  lockedReason,
  busyWord = 'working',
}) {
  const [pulling, setPulling] = useState(false);
  const over = pulling || busy;
  const disabled = locked || over;
  const c = LEVER_COLOURS[colour] || LEVER_COLOURS.black;
  const state = locked ? 'locked' : over ? busyWord : 'normal';

  const handle = async () => {
    if (disabled) return;
    setPulling(true);
    clunk();
    const started = Date.now();
    try {
      await onPull?.();
    } finally {
      // Hold the lever over long enough to see it move, even for a fast job.
      const wait = Math.max(0, 650 - (Date.now() - started));
      setTimeout(() => setPulling(false), wait);
    }
  };

  const descId = `lever-${number}-desc`;

  return (
    <ButtonBase
      onClick={handle}
      disabled={disabled}
      aria-describedby={descId}
      aria-label={`Lever ${number}: ${label}`}
      focusRipple
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        width: '100%',
        minHeight: 44,
        p: 1.5,
        borderRadius: 1,
        textAlign: 'center',
        border: `1px solid ${theme.palette.line.panel}`,
        bgcolor: theme.palette.surfaces.elevated,
        '&.Mui-disabled': { opacity: locked ? 0.7 : 1 },
        '&.Mui-focusVisible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
        '@media (hover: hover)': {
          '&:hover:not(.Mui-disabled) .lever-rod': { transform: 'rotate(-10deg)' },
        },
      })}
    >
      {/* The quadrant: a slot in the frame, the lever pivoting at its foot. */}
      <Box
        aria-hidden="true"
        sx={(theme) => ({
          position: 'relative',
          width: 72,
          height: 104,
          borderRadius: '36px 36px 6px 6px',
          bgcolor: theme.palette.box.tape.black,
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.8)',
          overflow: 'hidden',
          '&::before': {
            // The slot the lever travels in.
            content: '""',
            position: 'absolute',
            left: '50%',
            top: 12,
            width: 8,
            height: 78,
            transform: 'translateX(-50%)',
            borderRadius: 4,
            bgcolor: '#000',
          },
        })}
      >
        <Box
          className="lever-rod"
          sx={{
            position: 'absolute',
            left: '50%',
            bottom: 8,
            width: 10,
            height: 84,
            ml: '-5px',
            transformOrigin: '50% 100%',
            transform: over ? 'rotate(22deg)' : 'rotate(-18deg)',
            transition: 'transform 320ms cubic-bezier(.3,1.5,.5,1)',
          }}
        >
          <Box sx={{ position: 'absolute', inset: 0, borderRadius: 5, bgcolor: c.rod, boxShadow: 'inset 2px 0 0 rgba(255,255,255,0.25)' }} />
          {/* The catch handle and the grip. */}
          <Box sx={{ position: 'absolute', top: -6, left: -6, width: 22, height: 18, borderRadius: '6px', bgcolor: c.grip, boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.6)' }} />
        </Box>
        <Box sx={(theme) => ({ position: 'absolute', left: '50%', bottom: 2, width: 20, height: 12, ml: '-10px', borderRadius: '10px 10px 2px 2px', bgcolor: theme.palette.box.plate.edge })} />
      </Box>

      {/* The lever plate: number and name, engraved. */}
      <Box
        sx={(theme) => ({
          width: '100%',
          px: 1,
          py: 0.5,
          borderRadius: '3px',
          background: theme.palette.accent.gradient,
          color: theme.palette.box.plate.ink,
          border: `1px solid ${theme.palette.box.plate.edge}`,
        })}
      >
        <Typography component="span" sx={{ display: 'block', fontFamily: 'fontFamilyMono', fontWeight: 700, fontSize: '0.75rem', lineHeight: 1.2 }}>
          {number}
        </Typography>
        <Typography component="span" sx={{ display: 'block', fontFamily: 'fontFamilyPlate', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.1 }}>
          {label}
        </Typography>
      </Box>

      <Typography id={descId} component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.35 }}>
        <Box component="span" sx={{ display: 'block', fontFamily: 'fontFamilyMono', fontWeight: 700, color: 'text.primary', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {state}
        </Box>
        {locked && lockedReason ? lockedReason : description}
      </Typography>
    </ButtonBase>
  );
}
