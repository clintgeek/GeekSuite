import React from 'react';
import { Box } from '@mui/material';
import { useTheme, keyframes } from '@mui/material/styles';
import { trackColor } from '../../theme/theme.jsx';

/**
 * A progress ring with something in its middle (Home's calorie budget).
 *
 * The ring is decoration for a sighted glance: it is `aria-hidden`, and the
 * words beside it must say the same thing. `value` is a percent; anything
 * over 100 draws a full ring (say "over" in words, and pass `color` if the
 * ring should change with it).
 *
 * The arc sweeps in once when it appears and eases to a new value after;
 * neither happens for someone who asked for reduced motion.
 */
export default function Ring({ value = 0, size = 132, stroke = 12, color, children, sx }) {
  const theme = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0, ...sx }}>
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor(theme)} strokeWidth={stroke} />
        {pct > 0 && (
          <Box
            component="circle"
            sx={{
              animation: `${keyframes`from { stroke-dasharray: 0 ${c}; }`} 700ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
              transition: 'stroke-dasharray 500ms cubic-bezier(0.2, 0.8, 0.2, 1), stroke 200ms',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none', transition: 'none' },
            }}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color || theme.palette.primary.main}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 1.5 }}>
        {children}
      </Box>
    </Box>
  );
}
