/**
 * The Attic's own motif (theme.js STEEL / PADLOCK): a brushed steel swing
 * door — two panels, seams, rivets, three hinges on the left, a hasp on the
 * right with the yard's orange padlock through it, a stencilled plate. Open
 * (`open`), the door stands swung back on the lit interior: the dim room
 * under the bulb, a shelf of document boxes.
 *
 * Entirely decorative (aria-hidden): the page around it carries the words
 * ("The Attic is locked", the unlock buttons). Reduced motion: no swing.
 */
import React from 'react';
import { Box, useTheme } from '@mui/material';
import { BULB, LIVERY, PADLOCK, STENCIL_FONT, UNIT } from '../../theme/theme';

export function Padlock({ size = 44, open = false, sx }) {
  return (
    <Box component="svg" viewBox="0 0 48 56" width={size} height={(size * 56) / 48} aria-hidden="true" focusable="false" data-testid="padlock" data-open={open ? 'true' : 'false'} sx={{ display: 'block', flexShrink: 0, ...sx }}>
      <path
        d={open ? 'M14 26 V15 a10 10 0 0 1 20 0 V9' : 'M14 26 V16 a10 10 0 0 1 20 0 V26'}
        fill="none"
        stroke={PADLOCK.shackle}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect x="5" y="24" width="38" height="29" rx="5" fill={PADLOCK.body} stroke={PADLOCK.keyhole} strokeWidth="2.5" />
      <rect x="5" y="24" width="38" height="6" rx="3" fill="rgba(255,255,255,0.28)" />
      <circle cx="24" cy="37" r="4" fill={PADLOCK.keyhole} />
      <path d="M22 39 h4 l1 8 h-6 z" fill={PADLOCK.keyhole} />
    </Box>
  );
}

function Rivets({ steel, side }) {
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', top: 10, bottom: 10, [side]: 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      {Array.from({ length: 6 }, (_, i) => (
        <Box key={i} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: steel.rivet, boxShadow: `0 1px 0 ${steel.seam}` }} />
      ))}
    </Box>
  );
}

/** The closed door's face (also the door leaf standing open). */
function DoorLeaf({ steel, label, locked }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        borderRadius: '4px',
        bgcolor: steel.door,
        backgroundImage: [
          `linear-gradient(105deg, transparent 0 38%, ${steel.sheen} 46%, transparent 56%)`,
          `repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px)`,
        ].join(', '),
        border: `3px solid ${steel.frame}`,
        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.12), inset 0 -3px 0 rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}
    >
      {/* two raised panels with a seam between */}
      {[{ top: '9%', height: '38%' }, { top: '53%', height: '38%' }].map((p, i) => (
        <Box key={i} sx={{ position: 'absolute', left: '16%', right: '24%', ...p, bgcolor: steel.panel, borderRadius: '3px', border: `2px solid ${steel.seam}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)' }} />
      ))}
      <Rivets steel={steel} side="left" />
      <Rivets steel={steel} side="right" />
      {/* hinges */}
      {['14%', '46%', '78%'].map((top) => (
        <Box key={top} sx={{ position: 'absolute', left: -2, top, width: 12, height: '9%', bgcolor: steel.frame, borderRadius: '0 3px 3px 0' }} />
      ))}
      {/* the stencilled plate */}
      <Box sx={{ position: 'absolute', left: '22%', top: '19%', px: 1, py: 0.25, bgcolor: steel.frame, borderRadius: '2px', fontFamily: STENCIL_FONT, fontSize: '0.875rem', letterSpacing: '0.14em', color: steel.text, lineHeight: 1.4 }}>
        {label}
      </Box>
      {/* the hasp and the padlock */}
      <Box sx={{ position: 'absolute', right: '6%', top: '42%', width: 22, height: 40, bgcolor: steel.rivet, border: `2px solid ${steel.frame}`, borderRadius: '3px' }} />
      {locked ? <Padlock size={40} sx={{ position: 'absolute', right: 'calc(6% - 10px)', top: 'calc(42% + 20px)' }} /> : null}
      {/* yard-orange kick stripe at the foot */}
      <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, backgroundImage: `repeating-linear-gradient(135deg, ${LIVERY.orange} 0 10px, ${steel.frame} 10px 20px)` }} />
    </Box>
  );
}

/**
 * @param {boolean} open   the lit interior, the door swung back
 * @param {number}  height px
 */
export default function AtticDoor({ open = false, height = 200, label = 'ATTIC', sx }) {
  const theme = useTheme();
  const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const steel = theme.palette.steel;
  const unit = UNIT[mode];
  return (
    <Box
      aria-hidden="true"
      data-testid="attic-door"
      data-open={open ? 'true' : 'false'}
      sx={{
        position: 'relative',
        height,
        width: '100%',
        maxWidth: 360,
        mx: 'auto',
        perspective: '900px',
        // The open leaf stays inside its frame (a swung door must not cover the page around it).
        overflow: 'hidden',
        borderRadius: '6px',
        bgcolor: steel.frame,
        p: '6px',
        boxShadow: '0 4px 0 rgba(0,0,0,0.35)',
        ...sx,
      }}
    >
      {/* the interior (always there; the door covers it when shut) */}
      <Box
        sx={{
          position: 'absolute',
          inset: 6,
          borderRadius: '3px',
          bgcolor: unit.interior,
          backgroundImage: `radial-gradient(ellipse at 50% 0%, ${unit.glow} 0, rgba(0,0,0,0) 65%)`,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ position: 'absolute', top: 8, left: '50%', width: 14, height: 14, ml: '-7px', borderRadius: '50%', bgcolor: BULB, boxShadow: `0 0 18px 6px ${BULB}`, opacity: open ? 1 : 0.2 }} />
        {/* shelves of document boxes */}
        {[0.42, 0.74].map((y) => (
          <Box key={y} sx={{ position: 'absolute', left: '10%', right: '10%', top: `${y * 100}%`, height: 6, bgcolor: '#3A2E22', boxShadow: '0 2px 0 rgba(0,0,0,0.5)' }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Box key={i} sx={{ position: 'absolute', bottom: 6, left: `${4 + i * 19}%`, width: '15%', height: 34 - (i % 3) * 5, bgcolor: i % 2 ? '#B48A57' : '#C99A62', border: '1px solid #5B4128', borderRadius: '2px 2px 0 0' }} />
            ))}
          </Box>
        ))}
      </Box>
      {/* the door leaf: shut, or swung back on its hinges */}
      <Box
        className="attic-door-leaf"
        sx={{
          position: 'absolute',
          inset: 6,
          transformOrigin: 'left center',
          transform: open ? 'rotateY(-66deg)' : 'none',
          transition: 'transform 420ms cubic-bezier(.2,.7,.2,1)',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }}
      >
        <DoorLeaf steel={steel} label={label} locked={!open} />
      </Box>
    </Box>
  );
}
