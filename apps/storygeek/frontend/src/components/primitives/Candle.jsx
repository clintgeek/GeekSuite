import { Box } from '@mui/material';

/**
 * Candle — the streaming ("the Game Master is writing") mark. The flame
 * flickers through the `sg-flicker` keyframes in index.css, which are
 * switched off under `prefers-reduced-motion: reduce`: a still flame, same
 * meaning.
 */
export default function Candle({ size = 28, wax = '#efe3c8', flame = '#e8a94a', sx }) {
  return (
    <Box component="svg" viewBox="0 0 24 32" width={size * 0.75} height={size} aria-hidden="true" focusable="false"
      sx={{ display: 'block', flexShrink: 0, overflow: 'visible', ...sx }}>
      <ellipse className="sg-candle-halo" cx="12" cy="8" rx="9" ry="9" fill={flame} opacity="0.16" />
      <path className="sg-candle-flame" d="M12 2.2c2.4 3 3.3 5 3.3 6.6A3.3 3.3 0 0 1 12 12.1 3.3 3.3 0 0 1 8.7 8.8c0-1.6.9-3.6 3.3-6.6Z" fill={flame} />
      <path d="M12 6.8c.9 1.3 1.3 2.1 1.3 2.8a1.3 1.3 0 0 1-2.6 0c0-.7.4-1.5 1.3-2.8Z" fill="#fff4d6" opacity="0.85" />
      <path d="M12 12.1v1.6" stroke="#3a2a20" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M7.5 14.2c0-.6.5-.9 1-.9h7c.5 0 1 .3 1 .9V29H7.5Z" fill={wax} />
      <path d="M9.4 13.3v4.4c0 .6.8.6.8 0v-4.4" fill={wax} opacity="0.7" />
      <path d="M5 29.2h14c.6 0 1 .4 1 1v.6H4v-.6c0-.6.4-1 1-1Z" fill="#8a6a3a" />
    </Box>
  );
}
