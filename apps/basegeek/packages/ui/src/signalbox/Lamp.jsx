/**
 * Lamp — one indicator bulb, and the word that says what it means.
 *
 * Colour is never the message on its own. Each state has its own shape as
 * well as its own glass — a round lamp for clear, a triangle for caution, an
 * octagon for a fault, a hollow ring for off, a broken ring while checking —
 * and every caller puts a word beside it (`StatusLamp` does it for you). The
 * glyph itself is `aria-hidden`; the word is the accessible text.
 *
 * Night turn gives lit lamps a glow; day turn does not (a glow on a light
 * panel is just a smudge). A checking lamp slowly turns, unless the viewer
 * asked for reduced motion, in which case it is still.
 */
import { Box, Typography, useTheme } from '@mui/material';
import { keyframes } from '@emotion/react';
import { LAMP } from './readings';
import { useLampTest } from './LampTest';

const spin = keyframes`to { transform: rotate(360deg); }`;
const lampTestCycle = keyframes`
  0%, 100% { fill: var(--lamp-ok); }
  33% { fill: var(--lamp-warn); }
  66% { fill: var(--lamp-fault); }
`;

function Glyph({ state, fill, bezel }) {
  switch (state) {
    case LAMP.OK:
      return <circle cx="8" cy="8" r="6" fill={fill} stroke={bezel} strokeWidth="1.25" />;
    case LAMP.WARN:
      return <path d="M8 1.6 L14.6 13.6 H1.4 Z" fill={fill} stroke={bezel} strokeWidth="1.25" strokeLinejoin="round" />;
    case LAMP.FAULT:
      return (
        <path
          d="M5.4 1.8 H10.6 L14.2 5.4 V10.6 L10.6 14.2 H5.4 L1.8 10.6 V5.4 Z"
          fill={fill}
          stroke={bezel}
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
      );
    case LAMP.OFF:
      return <circle cx="8" cy="8" r="5.5" fill="none" stroke={bezel} strokeWidth="1.5" />;
    default:
      return <circle cx="8" cy="8" r="5.5" fill="none" stroke={bezel} strokeWidth="1.5" strokeDasharray="3 2.4" />;
  }
}

export default function Lamp({ state = LAMP.UNKNOWN, size = 14, sx }) {
  const theme = useTheme();
  const testing = useLampTest();
  const { lamp, bezel } = theme.palette.box;
  const lit = state === LAMP.OK || state === LAMP.WARN || state === LAMP.FAULT;
  const fill = lamp[state] || lamp.off;
  const glow = lamp.glow > 0 && lit && !testing ? `drop-shadow(0 0 ${Math.round(size / 3)}px ${fill})` : 'none';
  // Under the lamp test, a dark lamp lights too — that is the point of it.
  const shown = testing ? LAMP.OK : state;

  return (
    <Box
      component="svg"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      data-lamp={state}
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'inline-block',
        verticalAlign: 'middle',
        overflow: 'visible',
        filter: glow,
        '--lamp-ok': lamp.ok,
        '--lamp-warn': lamp.warn,
        '--lamp-fault': lamp.fault,
        ...(state === LAMP.UNKNOWN && !testing && { animation: `${spin} 2.4s linear infinite` }),
        ...(testing && { '& circle, & path': { animation: `${lampTestCycle} 0.9s steps(1, end) infinite` } }),
        ...sx,
      }}
    >
      <Glyph state={shown} fill={testing ? lamp.ok : fill} bezel={bezel} />
    </Box>
  );
}

/**
 * A lamp with its label and its word — the unit most panels are built from.
 * `label` is the thing (MongoDB), `word` the reading (42ms / offline).
 */
export function StatusLamp({ state, label, word, size = 14, dense = false, sx }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, ...sx }}>
      <Lamp state={state} size={size} />
      <Box sx={{ minWidth: 0 }}>
        {label && (
          <Typography
            component="span"
            sx={{ display: 'block', fontWeight: 700, fontSize: dense ? '0.75rem' : '0.8125rem', lineHeight: 1.25, color: 'text.primary' }}
            noWrap
          >
            {label}
          </Typography>
        )}
        {word && (
          <Typography
            component="span"
            sx={{ display: 'block', fontFamily: 'fontFamilyMono', fontSize: '0.75rem', lineHeight: 1.3, color: 'text.secondary' }}
            noWrap
          >
            {word}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
