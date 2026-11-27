import React from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { trackColor } from '../../theme/theme.jsx';

/**
 * A progress ring with something in its middle (Home's calorie budget).
 *
 * The ring is decoration for a sighted glance: it is `aria-hidden`, and the
 * words beside it must say the same thing. `value` is a percent; anything
 * over 100 draws a full ring (say "over" in words, and pass `color` if the
 * ring should change with it).
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
          <circle
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
