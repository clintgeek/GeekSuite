/**
 * The truck-side mural: a wide band across the top of a place's page and
 * the Where page — the black side of the truck with the place's name in big
 * leaning slab lettering on the left, three orange speed stripes, and a
 * painted scene on the right (sky, hills, the road to the horizon, and a
 * motif for what the place is: a garage, a kitchen, a boat at the dock… —
 * utils/mural.js). The sky is picked per place, deterministically, with a
 * night twin for dark mode.
 *
 * The name is real text on a solid panel (it is the page's heading when
 * `headingProps` says so); the scene and stripes are aria-hidden SVG/CSS.
 */
import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { CHROME, DISPLAY_FONT, LIVERY, STENCIL_FONT, dustImage } from '../theme/theme';
import { muralMotif, muralSky } from '../utils/mural';

const INK = '#1A140F';

/** Each motif: shapes standing on the ground line (y 96) in the right half of a 240×120 scene. */
const MOTIFS = {
  garage: (a) => (
    <g>
      <path d="M150 96 V62 L178 46 L206 62 V96 Z" fill={INK} />
      <rect x="160" y="68" width="36" height="28" fill={a} />
      {[72, 77, 82, 87, 92].map((y) => <rect key={y} x="160" y={y} width="36" height="1.4" fill={INK} opacity="0.5" />)}
      <path d="M206 96 v-9 q2 -8 10 -8 h10 l6 8 h4 v9 z" fill={INK} />
      <circle cx="213" cy="96" r="3.5" fill="#3A332C" /><circle cx="231" cy="96" r="3.5" fill="#3A332C" />
    </g>
  ),
  workshop: (a) => (
    <g>
      <rect x="152" y="74" width="74" height="6" fill={INK} />
      <path d="M158 80 l-5 16 h4 l5 -16 z M220 80 l5 16 h-4 l-5 -16 z" fill={INK} />
      <path d="M170 74 l18 -20 l4 4 l-18 20 z" fill={INK} />
      <rect x="185" y="48" width="14" height="8" rx="1" transform="rotate(-48 192 52)" fill={a} />
      <path d="M200 74 l14 -18 m-3 -4 a5 5 0 1 0 7 7" stroke={INK} strokeWidth="4" fill="none" />
    </g>
  ),
  kitchen: (a) => (
    <g>
      <rect x="150" y="76" width="80" height="20" fill={INK} />
      <rect x="150" y="73" width="80" height="4" fill={a} />
      <path d="M164 72 q0 -14 14 -14 q14 0 14 14 z" fill={INK} />
      <rect x="175" y="54" width="6" height="4" fill={INK} />
      <path d="M192 64 l8 -4" stroke={INK} strokeWidth="3" />
      <rect x="204" y="60" width="20" height="13" rx="2" fill={INK} />
      <path d="M208 56 q2 -4 0 -8 M214 56 q2 -4 0 -8 M220 56 q2 -4 0 -8" stroke={a} strokeWidth="1.5" fill="none" />
    </g>
  ),
  bedroom: (a) => (
    <g>
      <rect x="152" y="58" width="6" height="38" fill={INK} />
      <rect x="152" y="76" width="74" height="12" fill={INK} />
      <rect x="158" y="70" width="18" height="7" rx="3" fill={a} />
      <rect x="176" y="72" width="50" height="5" fill={INK} opacity="0.8" />
      <rect x="224" y="80" width="4" height="16" fill={INK} />
      <rect x="156" y="88" width="4" height="8" fill={INK} />
    </g>
  ),
  office: (a) => (
    <g>
      <rect x="152" y="74" width="62" height="5" fill={INK} />
      <rect x="156" y="79" width="4" height="17" fill={INK} /><rect x="206" y="79" width="4" height="17" fill={INK} />
      <rect x="166" y="52" width="32" height="20" rx="2" fill={INK} />
      <rect x="169" y="55" width="26" height="14" fill={a} />
      <rect x="180" y="72" width="4" height="3" fill={INK} />
      <path d="M216 96 v-10 h12 v-14 h4 v24 z" fill={INK} />
    </g>
  ),
  boat: (a) => (
    <g>
      <rect x="140" y="90" width="100" height="10" fill="#2D4A5E" opacity="0.85" />
      <path d="M156 86 h66 l-8 8 h-50 z" fill={INK} />
      <rect x="156" y="84" width="66" height="2.5" fill={a} />
      <rect x="186" y="50" width="2.5" height="34" fill={INK} />
      <path d="M190 52 l24 28 h-24 z" fill="#F2E8D8" opacity="0.9" />
      <path d="M184 56 l-18 24 h18 z" fill="#F2E8D8" opacity="0.7" />
    </g>
  ),
  attic: (a) => (
    <g>
      <path d="M148 64 L189 38 L230 64 Z" fill={INK} />
      {[[156, 80, 26], [182, 80, 22], [168, 64, 22], [204, 84, 18]].map(([x, y, s]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width={s} height={96 - y} fill="#B98A55" stroke={INK} strokeWidth="1.2" />
          <rect x={x} y={y + (96 - y) * 0.55} width={s} height="4" fill={a} />
        </g>
      ))}
    </g>
  ),
  closet: (a) => (
    <g>
      <rect x="150" y="54" width="80" height="3" fill={INK} />
      {[160, 176, 192, 208].map((x, i) => (
        <g key={x}>
          <path d={`M${x + 6} 57 v4 l-8 6 h16 z`} fill="none" stroke={INK} strokeWidth="1.6" />
          <path d={`M${x - 2} 67 h16 l3 ${i % 2 ? 22 : 28} h-22 z`} fill={i === 1 ? a : INK} />
        </g>
      ))}
    </g>
  ),
  bath: (a) => (
    <g>
      <path d="M152 74 h76 v6 q0 14 -16 14 h-44 q-16 0 -16 -14 z" fill={INK} />
      <rect x="150" y="72" width="80" height="4" fill={a} />
      <path d="M160 72 v-16 q0 -6 6 -6 q6 0 6 6" stroke={INK} strokeWidth="3" fill="none" />
      <rect x="160" y="92" width="4" height="4" fill={INK} /><rect x="216" y="92" width="4" height="4" fill={INK} />
    </g>
  ),
  living: (a) => (
    <g>
      <rect x="154" y="70" width="60" height="14" rx="4" fill={INK} />
      <rect x="150" y="76" width="68" height="14" rx="4" fill={INK} />
      <rect x="160" y="74" width="22" height="6" rx="2" fill={a} />
      <rect x="156" y="90" width="4" height="6" fill={INK} /><rect x="208" y="90" width="4" height="6" fill={INK} />
      <rect x="225" y="58" width="2.5" height="38" fill={INK} />
      <path d="M218 58 h16 l-4 -10 h-8 z" fill={a} />
    </g>
  ),
  yard: (a) => (
    <g>
      <rect x="158" y="72" width="6" height="24" fill={INK} />
      <circle cx="161" cy="62" r="16" fill="#3E5A33" />
      <circle cx="152" cy="68" r="9" fill="#35502C" />
      <path d="M190 96 V70 L208 58 L226 70 V96 Z" fill={INK} />
      <rect x="202" y="76" width="12" height="20" fill={a} />
    </g>
  ),
  vehicle: (a) => (
    <g>
      <path d="M150 92 v-26 q0 -6 6 -6 h44 l16 14 h10 q4 0 4 4 v14 z" fill={INK} />
      <path d="M204 63 l11 11 h-11 z" fill="#9FB8CA" opacity="0.8" />
      <rect x="150" y="78" width="54" height="5" fill={a} />
      <circle cx="166" cy="93" r="6" fill="#2A241E" stroke={INK} strokeWidth="2" /><circle cx="214" cy="93" r="6" fill="#2A241E" stroke={INK} strokeWidth="2" />
    </g>
  ),
  safe: (a) => (
    <g>
      <rect x="166" y="50" width="46" height="46" rx="3" fill={INK} />
      <circle cx="189" cy="72" r="10" fill="none" stroke={a} strokeWidth="3" />
      <path d="M189 72 l6 -5" stroke={a} strokeWidth="2.5" />
      <rect x="203" y="66" width="4" height="14" rx="1.5" fill={a} />
    </g>
  ),
  house: (a) => (
    <g>
      <path d="M152 96 V66 L188 42 L224 66 V96 Z" fill={INK} />
      <rect x="182" y="76" width="12" height="20" fill={a} />
      <rect x="160" y="70" width="12" height="10" fill="#F2D68A" opacity="0.8" />
      <rect x="204" y="70" width="12" height="10" fill="#F2D68A" opacity="0.8" />
      <rect x="208" y="46" width="6" height="12" fill={INK} />
    </g>
  ),
  road: (a) => (
    <g>
      <rect x="206" y="58" width="3" height="38" fill={INK} />
      <rect x="196" y="50" width="24" height="14" rx="2" fill="#1F5A3A" stroke="#F2E8D8" strokeWidth="1.2" />
      <path d="M201 57 h14 m-4 -3 l4 3 l-4 3" stroke="#F2E8D8" strokeWidth="1.4" fill="none" />
      <path d="M150 96 l12 -10 l10 10 z" fill={a} opacity="0.9" />
    </g>
  ),
};

export function MuralScene({ name, typeName, mode = 'light' }) {
  const motif = muralMotif(name, typeName);
  const [top, horizon, hills, road] = muralSky(name, mode);
  const night = mode === 'dark';
  const id = `mural-${motif}-${mode}`;
  return (
    <svg viewBox="0 0 240 120" preserveAspectRatio="xMaxYMax slice" width="100%" height="100%" aria-hidden="true" focusable="false" data-motif={motif}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={horizon} />
        </linearGradient>
      </defs>
      <rect width="240" height="120" fill={`url(#${id}-sky)`} />
      {night ? <circle cx="64" cy="26" r="9" fill="#F2E3B8" opacity="0.85" /> : <circle cx="70" cy="40" r="16" fill="#FFF1C9" opacity="0.8" />}
      <path d="M0 80 Q40 58 80 74 T160 66 T240 72 V120 H0 Z" fill={hills} opacity="0.85" />
      <rect y="94" width="240" height="26" fill={hills} />
      {/* the road, running off to the horizon */}
      <path d="M60 120 L112 82 H122 L150 120 Z" fill={road} />
      <path d="M104 120 L116 84 L118 84 L110 120 Z" fill="#F6C619" opacity="0.8" />
      {MOTIFS[motif](LIVERY.orange)}
      {night ? <rect width="240" height="120" fill="#000" opacity="0.18" /> : null}
    </svg>
  );
}

export default function TruckMural({ name, typeName, caption = 'ROOM', sub, headingProps, actions, sx }) {
  const theme = useTheme();
  const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const { component: headingComponent = 'p', ...restHeading } = headingProps ?? {};
  return (
    <Box
      data-testid="truck-mural"
      data-motif={muralMotif(name, typeName)}
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1.25fr) minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1fr)' },
        minHeight: { xs: 132, md: 168 },
        borderRadius: { xs: 0, md: '4px' },
        overflow: 'hidden',
        bgcolor: CHROME.bar,
        color: CHROME.text,
        // the rocker stripe along the foot of the truck's side
        borderBottom: `4px solid ${LIVERY.orange}`,
        boxShadow: mode === 'dark' ? '0 3px 0 rgba(0,0,0,0.6)' : '0 3px 0 rgba(40,25,10,0.3)',
        ...sx,
      }}
    >
      {/* The panel: the truck's black flank, a little road dust on it. */}
      <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.75, py: { xs: 2, md: 2.5 }, pl: { xs: 2, md: 3 }, pr: { xs: 10, md: 16 }, minWidth: 0, backgroundImage: dustImage('dark') }}>
        <Box component="span" aria-hidden="true" data-caption={caption} sx={{ '&::before': { content: 'attr(data-caption)' }, fontFamily: STENCIL_FONT, fontSize: '0.75rem', letterSpacing: '0.14em', color: LIVERY.orange, lineHeight: 1 }} />
        <Typography
          component={headingComponent}
          {...restHeading}
          sx={{
            fontFamily: DISPLAY_FONT,
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: { xs: name.length > 14 ? '1.625rem' : '2rem', md: name.length > 18 ? '2.25rem' : '2.75rem' },
            lineHeight: 1.02,
            letterSpacing: '-0.01em',
            color: CHROME.text,
            overflowWrap: 'anywhere',
            textShadow: '0 2px 0 rgba(0,0,0,0.5)',
            m: 0,
          }}
        >
          {name}
        </Typography>
        {sub ? <Box sx={{ fontSize: '0.8125rem', color: CHROME.secondary, lineHeight: 1.4 }}>{sub}</Box> : null}
        {actions}
      </Box>
      {/* The scene, cut on the diagonal, with the speed stripes along the cut. */}
      <Box aria-hidden="true" sx={{ position: 'relative', minWidth: 0, clipPath: 'polygon(22% 0, 100% 0, 100% 100%, 0 100%)', ml: { xs: -3, md: -6 } }}>
        <MuralScene name={name} typeName={typeName} mode={mode} />
      </Box>
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          zIndex: 2,
          // Sits on the seam: three bars leaning the same way as the cut.
          left: { xs: 'calc(55.5% - 30px)', sm: 'calc(50% - 30px)' },
          width: 44,
          pointerEvents: 'none',
          backgroundImage: `linear-gradient(103deg, transparent 0 30%, ${LIVERY.orange} 30% 46%, transparent 46% 54%, ${LIVERY.burnt} 54% 62%, transparent 62% 70%, ${LIVERY.orange} 70% 76%, transparent 76%)`,
        }}
      />
    </Box>
  );
}
