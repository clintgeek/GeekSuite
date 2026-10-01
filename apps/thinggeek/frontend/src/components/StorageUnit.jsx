/**
 * The self-storage yard (Where): every place is a unit behind a corrugated
 * roll-up door — orange slats, scuffed, a handle at the foot, a unit number
 * on a plate — and behind it a dim room under one bulb.
 *
 *   UnitDoor      a closed door (the phone's aisle of units, a door tile)
 *   UnitInterior  the room behind the door: dark, a pool of warm light at
 *                 the top, the contents listed on it. On mount the door
 *                 rolls up out of the way (~320 ms, transform only);
 *                 prefers-reduced-motion opens it at once (styles.css).
 *   MiniDoor      a 28px door glyph for a toggle: rolled up when open
 *   UnitPlate     the unit number ("C-14"), stencilled, derived from the name
 *
 * The door, the plate and the slats are decoration (aria-hidden); the label
 * and the counts on them are real text, and the link around a door carries
 * the accessible name.
 */
import React from 'react';
import { Box, useTheme } from '@mui/material';
import { CHROME, STENCIL_FONT, dustImage } from '../theme/theme';
import { unitNumber } from '../utils/mural';

const unitTokens = (theme) => theme.palette.unit;

/** The door's corrugation + scuffs, as background layers. */
export function doorBackground(theme) {
  const u = unitTokens(theme);
  const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  return {
    backgroundColor: u.door,
    backgroundImage: [
      dustImage(mode),
      // a soft fall-off of light from the top, as if from the bulb over the aisle
      'linear-gradient(180deg, rgba(255,240,210,0.16) 0, rgba(255,240,210,0) 45%, rgba(0,0,0,0.18) 100%)',
      // the slats: a lit ridge, the face, a groove
      `repeating-linear-gradient(180deg, ${u.ridge} 0 2px, ${u.door} 2px 9px, ${u.groove} 9px 11px, ${u.door} 11px 12px)`,
    ].join(', '),
  };
}

export function UnitPlate({ name, sx }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-unit={unitNumber(name)}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: '6px',
        height: 20,
        borderRadius: '2px',
        bgcolor: CHROME.bar,
        color: CHROME.text,
        border: `1px solid ${CHROME.border}`,
        '&::before': { content: 'attr(data-unit)', fontFamily: STENCIL_FONT, fontSize: '0.75rem', letterSpacing: '0.08em', lineHeight: 1 },
        ...sx,
      }}
    />
  );
}

/** A closed roll-up door, its children (the label, the counts) stuck on it. */
export function UnitDoor({ name, children, minHeight = 132, sx }) {
  const theme = useTheme();
  return (
    <Box
      data-testid="unit-door"
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight,
        borderRadius: '3px 3px 2px 2px',
        overflow: 'hidden',
        // the frame: the black steel around the opening, the roll housing on top
        border: `3px solid ${unitTokens(theme).frame}`,
        borderTopWidth: 10,
        boxShadow: theme.palette.mode === 'dark' ? '0 3px 0 rgba(0,0,0,0.6)' : '0 3px 0 rgba(40,25,10,0.35)',
        ...doorBackground(theme),
        ...sx,
      }}
    >
      <UnitPlate name={name} sx={{ position: 'absolute', top: 6, left: 6 }} />
      {/* the handle at the foot of the door */}
      <Box aria-hidden="true" sx={{ position: 'absolute', bottom: 7, left: '50%', width: 34, height: 6, ml: '-17px', borderRadius: '3px', bgcolor: unitTokens(theme).frame, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }} />
      <Box sx={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 0.75, px: 1.5, pt: 3.5, pb: 3 }}>{children}</Box>
    </Box>
  );
}

/**
 * The room behind the door. `name` numbers the plate; children are the
 * contents. The rolling door is an aria-hidden overlay that animates up and
 * away once, on mount.
 */
export function UnitInterior({ name, children, roll = true, sx, testId = 'unit-interior' }) {
  const theme = useTheme();
  const u = unitTokens(theme);
  return (
    <Box
      data-testid={testId}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '3px',
        border: `3px solid ${u.frame}`,
        borderTopWidth: 10,
        bgcolor: u.interior,
        // the bulb: a pool of warm light from the top centre, fading into the dark
        backgroundImage: `radial-gradient(ellipse 70% 120px at 50% 0, ${u.glow}, transparent 100%)`,
        color: u.text,
        ...sx,
      }}
    >
      {/* the bulb itself, hanging from the housing */}
      <Box aria-hidden="true" sx={{ position: 'absolute', top: 0, left: '50%', width: 10, height: 6, ml: '-5px', borderRadius: '0 0 5px 5px', bgcolor: '#FFE2A8', boxShadow: '0 0 12px 4px rgba(255, 210, 138, 0.45)' }} />
      {children}
      {roll ? (
        <Box
          aria-hidden="true"
          data-testid="unit-door-rolling"
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            ...doorBackground(theme),
            animation: 'tg-door-up 320ms cubic-bezier(.5,0,.75,0) 60ms forwards',
          }}
        >
          <UnitPlate name={name} sx={{ position: 'absolute', top: 6, left: 6 }} />
        </Box>
      ) : null}
    </Box>
  );
}

/** A small door for a toggle: shut, or rolled up over a dark opening. */
export function MiniDoor({ open = false, size = 26, sx }) {
  const theme = useTheme();
  const u = unitTokens(theme);
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-open={open ? 'true' : 'false'}
      sx={{
        position: 'relative',
        display: 'inline-block',
        width: size,
        height: size * 0.82,
        borderRadius: '2px',
        border: `2px solid ${u.frame}`,
        borderTopWidth: 4,
        bgcolor: u.interior,
        // the bulb's pool of light, seen once the door is up
        backgroundImage: `radial-gradient(ellipse 80% 70% at 50% 0, ${u.glow}, transparent 100%)`,
        overflow: 'hidden',
        flexShrink: 0,
        ...sx,
      }}
    >
      <Box
        component="span"
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundColor: u.door,
          backgroundImage: `repeating-linear-gradient(180deg, ${u.ridge} 0 1px, ${u.door} 1px 3px, ${u.groove} 3px 4px)`,
          transform: open ? 'translateY(-78%)' : 'none',
          transition: 'transform 300ms ease',
        }}
      />
    </Box>
  );
}
